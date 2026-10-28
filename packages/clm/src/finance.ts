import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { AppError, pageResult, parseInput, type PageQuery } from "@accordiq/core";
import { can, type Actor } from "@accordiq/auth";
import {
  contract,
  extractedField,
  financialTransaction,
  organization,
  paymentMilestone,
  priceEscalation,
  savingsOpportunity,
  vendor,
  type Database,
} from "@accordiq/db";
import { calendarDate, resolveTimeZone } from "./calendar";
import {
  CURRENCIES,
  FINANCE_STATUS_GROUPS,
  type CurrencyCode,
  type FinanceStatusGroup,
} from "./enums";
import {
  buildFinanceReport,
  toInsightsCsv,
  toTransactionsCsv,
  type ExtractedMoneyHint,
  type FinanceContractInput,
  type FinanceReport,
} from "./finance-engine";
import { id, notFound, optionalFilter, requirePermission, writeAudit } from "./helpers";
import { moneyToMinor } from "./money";
import type { ClmOptions } from "./repository";
import {
  createFinancialTransactionSchema,
  createPaymentMilestoneSchema,
  createPriceEscalationSchema,
  createSavingsOpportunitySchema,
  financeExportSchema,
} from "./validation";

type ScopedContract = (
  organizationId: string,
  contractId: string,
) => Promise<typeof contract.$inferSelect>;
type ScopedVendor = (
  organizationId: string,
  vendorId: string,
) => Promise<typeof vendor.$inferSelect>;

function requireContractOrFinanceWrite(actor: Actor): string {
  const organizationId = requirePermission(actor, "finance:read");
  if (!can(actor, "contracts:write") && !can(actor, "finance:write")) {
    throw new AppError("FORBIDDEN", "You do not have permission to do that.");
  }
  return organizationId;
}

function requireSourcePermission(actor: Actor, source: "CONTRACT_STATED" | "IMPORTED"): string {
  if (source === "CONTRACT_STATED") return requirePermission(actor, "contracts:write");
  return requirePermission(actor, "finance:write");
}

function requireEscalationPermission(actor: Actor, source: "CONTRACT_CLAUSE" | "ESTIMATE"): string {
  if (source === "CONTRACT_CLAUSE") return requirePermission(actor, "contracts:write");
  return requireContractOrFinanceWrite(actor);
}

export function createFinanceAccess(
  db: Database,
  options: ClmOptions,
  helpers: { scopedContract: ScopedContract; scopedVendor: ScopedVendor },
) {
  const now = () => options.clock?.() ?? new Date();

  async function orgContext(organizationId: string) {
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
    });
    if (!org) notFound();
    const timezone = resolveTimeZone(org.timezone);
    const instant = now();
    return { org, timezone, instant, today: calendarDate(instant, timezone) };
  }

  async function loadContracts(
    organizationId: string,
    contractId?: string | null,
  ): Promise<FinanceContractInput[]> {
    const conditions: SQL[] = [eq(contract.organizationId, organizationId)];
    if (contractId) conditions.push(eq(contract.id, contractId));
    const rows = await db
      .select({
        id: contract.id,
        title: contract.title,
        status: contract.status,
        vendorId: contract.vendorId,
        vendorName: vendor.name,
        currency: contract.currency,
        valueMinor: contract.valueMinor,
        expiresOn: contract.expiresOn,
        autoRenew: contract.autoRenew,
      })
      .from(contract)
      .leftJoin(vendor, eq(vendor.id, contract.vendorId))
      .where(and(...conditions));
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      vendorId: row.vendorId,
      vendorName: row.vendorName ?? null,
      currency: row.currency,
      valueMinor: row.valueMinor,
      expiresOn: row.expiresOn,
      autoRenew: row.autoRenew,
    }));
  }

  async function loadExtractedHints(
    organizationId: string,
    contractId?: string | null,
  ): Promise<ExtractedMoneyHint[]> {
    const conditions: SQL[] = [eq(extractedField.organizationId, organizationId)];
    if (contractId) conditions.push(eq(extractedField.contractId, contractId));
    const rows = await db
      .select({
        contractId: extractedField.contractId,
        fieldKey: extractedField.fieldKey,
        valueText: extractedField.valueText,
        correctedValue: extractedField.correctedValue,
        verification: extractedField.verification,
        createdAt: extractedField.createdAt,
      })
      .from(extractedField)
      .where(and(...conditions))
      .orderBy(extractedField.createdAt);
    return rows
      .filter((row) => row.fieldKey === "VALUE" || row.fieldKey === "CURRENCY")
      .map((row) => ({
        contractId: row.contractId,
        fieldKey: row.fieldKey as "VALUE" | "CURRENCY",
        valueText: row.correctedValue ?? row.valueText,
        verification: row.verification,
      }));
  }

  async function resolveAmount(
    input: { amount?: string; amountMinor?: number; currency?: string | null },
    fallbackCurrency: string | null,
  ): Promise<{ amountMinor: number; currency: string }> {
    const currency = input.currency ?? fallbackCurrency;
    if (!currency) {
      throw new AppError("VALIDATION", "Choose a currency.");
    }
    const amountMinor = moneyToMinor({
      value: input.amount,
      valueMinor: input.amountMinor,
      currency,
    });
    if (amountMinor == null) {
      throw new AppError("VALIDATION", "Enter an amount.");
    }
    return { amountMinor, currency };
  }

  async function buildReport(
    actor: Actor,
    filters: {
      currency?: string | null;
      vendorId?: string | null;
      statusGroup?: string | null;
      contractId?: string | null;
    } = {},
  ): Promise<{ organizationId: string; report: FinanceReport }> {
    const organizationId = requirePermission(actor, "finance:read");
    const currency = optionalFilter(filters.currency, CURRENCIES) as CurrencyCode | undefined;
    const statusGroup = optionalFilter(filters.statusGroup, FINANCE_STATUS_GROUPS) as
      FinanceStatusGroup | undefined;
    if (filters.vendorId) await helpers.scopedVendor(organizationId, filters.vendorId);
    if (filters.contractId) await helpers.scopedContract(organizationId, filters.contractId);
    const { timezone, today } = await orgContext(organizationId);
    const [contracts, milestones, transactions, escalations, savings, extractedHints] =
      await Promise.all([
        loadContracts(organizationId, filters.contractId),
        db
          .select()
          .from(paymentMilestone)
          .where(
            filters.contractId
              ? and(
                  eq(paymentMilestone.organizationId, organizationId),
                  eq(paymentMilestone.contractId, filters.contractId),
                )
              : eq(paymentMilestone.organizationId, organizationId),
          ),
        db
          .select()
          .from(financialTransaction)
          .where(
            filters.contractId
              ? and(
                  eq(financialTransaction.organizationId, organizationId),
                  eq(financialTransaction.contractId, filters.contractId),
                )
              : eq(financialTransaction.organizationId, organizationId),
          ),
        db
          .select()
          .from(priceEscalation)
          .where(
            filters.contractId
              ? and(
                  eq(priceEscalation.organizationId, organizationId),
                  eq(priceEscalation.contractId, filters.contractId),
                )
              : eq(priceEscalation.organizationId, organizationId),
          ),
        db
          .select()
          .from(savingsOpportunity)
          .where(
            filters.contractId
              ? and(
                  eq(savingsOpportunity.organizationId, organizationId),
                  eq(savingsOpportunity.contractId, filters.contractId),
                )
              : eq(savingsOpportunity.organizationId, organizationId),
          ),
        loadExtractedHints(organizationId, filters.contractId),
      ]);
    return {
      organizationId,
      report: buildFinanceReport({
        asOf: today,
        timezone,
        filters: {
          currency: currency ?? null,
          vendorId: filters.vendorId ?? null,
          statusGroup: statusGroup ?? "all",
          contractId: filters.contractId ?? null,
        },
        contracts,
        milestones,
        transactions,
        escalations,
        savings,
        extractedHints,
      }),
    };
  }

  return {
    async getFinanceInsights(
      actor: Actor,
      filters: {
        currency?: string | null;
        vendorId?: string | null;
        statusGroup?: string | null;
        contractId?: string | null;
      } = {},
    ) {
      const { report } = await buildReport(actor, filters);
      return report;
    },

    async getContractFinance(actor: Actor, contractId: string) {
      const organizationId = requirePermission(actor, "finance:read");
      const row = await helpers.scopedContract(organizationId, contractId);
      const { report } = await buildReport(actor, { contractId });
      const [milestones, transactions, escalations, savings] = await Promise.all([
        db
          .select()
          .from(paymentMilestone)
          .where(
            and(
              eq(paymentMilestone.organizationId, organizationId),
              eq(paymentMilestone.contractId, contractId),
            ),
          )
          .orderBy(paymentMilestone.dueOn),
        db
          .select()
          .from(financialTransaction)
          .where(
            and(
              eq(financialTransaction.organizationId, organizationId),
              eq(financialTransaction.contractId, contractId),
            ),
          )
          .orderBy(desc(financialTransaction.occurredOn)),
        db
          .select()
          .from(priceEscalation)
          .where(
            and(
              eq(priceEscalation.organizationId, organizationId),
              eq(priceEscalation.contractId, contractId),
            ),
          )
          .orderBy(desc(priceEscalation.createdAt)),
        db
          .select()
          .from(savingsOpportunity)
          .where(
            and(
              eq(savingsOpportunity.organizationId, organizationId),
              eq(savingsOpportunity.contractId, contractId),
            ),
          )
          .orderBy(desc(savingsOpportunity.createdAt)),
      ]);
      return {
        contract: {
          id: row.id,
          title: row.title,
          status: row.status,
          currency: row.currency,
          valueMinor: row.valueMinor,
          expiresOn: row.expiresOn,
          autoRenew: row.autoRenew,
          vendorId: row.vendorId,
        },
        report,
        milestones,
        transactions,
        escalations,
        savings,
      };
    },

    async listPaymentMilestones(actor: Actor, page: PageQuery, contractId?: string | null) {
      const organizationId = requirePermission(actor, "finance:read");
      if (contractId) await helpers.scopedContract(organizationId, contractId);
      const conditions: SQL[] = [eq(paymentMilestone.organizationId, organizationId)];
      if (contractId) conditions.push(eq(paymentMilestone.contractId, contractId));
      const where = and(...conditions);
      const [items, totalRow] = await Promise.all([
        db
          .select()
          .from(paymentMilestone)
          .where(where)
          .orderBy(paymentMilestone.dueOn)
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(paymentMilestone).where(where),
      ]);
      return pageResult(items, Number(totalRow[0]?.total ?? 0), page);
    },

    async createPaymentMilestone(actor: Actor, raw: unknown) {
      const input = parseInput(createPaymentMilestoneSchema, raw);
      const organizationId = requireSourcePermission(actor, input.source);
      const row = await helpers.scopedContract(organizationId, input.contractId);
      const { amountMinor, currency } = await resolveAmount(input, row.currency);
      const created = {
        id: id(),
        organizationId,
        contractId: row.id,
        title: input.title,
        amountMinor,
        currency,
        dueOn: input.dueOn ?? null,
        paidOn: input.paidOn ?? null,
        status: input.status ?? "PLANNED",
        source: input.source,
        note: input.note ?? null,
        createdByUserId: actor.userId,
        createdAt: now(),
        updatedAt: now(),
      };
      await db.insert(paymentMilestone).values(created);
      await writeAudit(db, actor, "finance.milestone.create", "payment_milestone", created.id, {
        contractId: row.id,
        source: input.source,
      });
      return created;
    },

    async listFinancialTransactions(
      actor: Actor,
      page: PageQuery,
      filters: {
        contractId?: string | null;
        vendorId?: string | null;
        currency?: string | null;
      } = {},
    ) {
      const organizationId = requirePermission(actor, "finance:read");
      if (filters.contractId) await helpers.scopedContract(organizationId, filters.contractId);
      if (filters.vendorId) await helpers.scopedVendor(organizationId, filters.vendorId);
      const currency = optionalFilter(filters.currency, CURRENCIES);
      const conditions: SQL[] = [eq(financialTransaction.organizationId, organizationId)];
      if (filters.contractId)
        conditions.push(eq(financialTransaction.contractId, filters.contractId));
      if (filters.vendorId) conditions.push(eq(financialTransaction.vendorId, filters.vendorId));
      if (currency) conditions.push(eq(financialTransaction.currency, currency));
      const where = and(...conditions);
      const [items, totalRow] = await Promise.all([
        db
          .select()
          .from(financialTransaction)
          .where(where)
          .orderBy(desc(financialTransaction.occurredOn))
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(financialTransaction).where(where),
      ]);
      return pageResult(items, Number(totalRow[0]?.total ?? 0), page);
    },

    async createFinancialTransaction(actor: Actor, raw: unknown) {
      const organizationId = requirePermission(actor, "finance:write");
      const input = parseInput(createFinancialTransactionSchema, raw);
      let vendorId = input.vendorId ?? null;
      const contractId = input.contractId ?? null;
      if (contractId) {
        const row = await helpers.scopedContract(organizationId, contractId);
        if (!vendorId) vendorId = row.vendorId;
      }
      if (vendorId) await helpers.scopedVendor(organizationId, vendorId);
      const { amountMinor, currency } = await resolveAmount(input, input.currency);
      const created = {
        id: id(),
        organizationId,
        contractId,
        vendorId,
        amountMinor,
        currency,
        occurredOn: input.occurredOn,
        reference: input.reference ?? null,
        note: input.note ?? null,
        source: "IMPORTED" as const,
        createdByUserId: actor.userId,
        createdAt: now(),
      };
      await db.insert(financialTransaction).values(created);
      await writeAudit(
        db,
        actor,
        "finance.transaction.create",
        "financial_transaction",
        created.id,
        {
          contractId: contractId ?? "",
          currency,
        },
      );
      return created;
    },

    async listPriceEscalations(actor: Actor, page: PageQuery, contractId?: string | null) {
      const organizationId = requirePermission(actor, "finance:read");
      if (contractId) await helpers.scopedContract(organizationId, contractId);
      const conditions: SQL[] = [eq(priceEscalation.organizationId, organizationId)];
      if (contractId) conditions.push(eq(priceEscalation.contractId, contractId));
      const where = and(...conditions);
      const [items, totalRow] = await Promise.all([
        db
          .select()
          .from(priceEscalation)
          .where(where)
          .orderBy(desc(priceEscalation.createdAt))
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(priceEscalation).where(where),
      ]);
      return pageResult(items, Number(totalRow[0]?.total ?? 0), page);
    },

    async createPriceEscalation(actor: Actor, raw: unknown) {
      const input = parseInput(createPriceEscalationSchema, raw);
      const organizationId = requireEscalationPermission(actor, input.source);
      const row = await helpers.scopedContract(organizationId, input.contractId);
      const created = {
        id: id(),
        organizationId,
        contractId: row.id,
        percentBps: input.percentBps,
        effectiveOn: input.effectiveOn ?? null,
        source: input.source,
        note: input.note ?? null,
        createdByUserId: actor.userId,
        createdAt: now(),
      };
      await db.insert(priceEscalation).values(created);
      await writeAudit(db, actor, "finance.escalation.create", "price_escalation", created.id, {
        contractId: row.id,
        source: input.source,
        percentBps: input.percentBps,
      });
      return created;
    },

    async listSavingsOpportunities(
      actor: Actor,
      page: PageQuery,
      filters: { contractId?: string | null; status?: string | null } = {},
    ) {
      const organizationId = requirePermission(actor, "finance:read");
      if (filters.contractId) await helpers.scopedContract(organizationId, filters.contractId);
      const conditions: SQL[] = [eq(savingsOpportunity.organizationId, organizationId)];
      if (filters.contractId)
        conditions.push(eq(savingsOpportunity.contractId, filters.contractId));
      if (filters.status) conditions.push(eq(savingsOpportunity.status, filters.status));
      const where = and(...conditions);
      const [items, totalRow] = await Promise.all([
        db
          .select()
          .from(savingsOpportunity)
          .where(where)
          .orderBy(desc(savingsOpportunity.createdAt))
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(savingsOpportunity).where(where),
      ]);
      return pageResult(items, Number(totalRow[0]?.total ?? 0), page);
    },

    async createSavingsOpportunity(actor: Actor, raw: unknown) {
      const organizationId = requireContractOrFinanceWrite(actor);
      const input = parseInput(createSavingsOpportunitySchema, raw);
      if (input.contractId) await helpers.scopedContract(organizationId, input.contractId);
      if (input.vendorId) await helpers.scopedVendor(organizationId, input.vendorId);
      let amountMinor: number | null = null;
      let currency: string | null = input.currency ?? null;
      if (input.amount || input.amountMinor != null) {
        const resolved = await resolveAmount(input, currency);
        amountMinor = resolved.amountMinor;
        currency = resolved.currency;
      }
      const created = {
        id: id(),
        organizationId,
        contractId: input.contractId ?? null,
        vendorId: input.vendorId ?? null,
        kind: input.kind,
        title: input.title,
        amountMinor,
        currency,
        status: "ESTIMATE" as const,
        explanation: input.explanation,
        verifiedByUserId: null as string | null,
        verifiedAt: null as Date | null,
        createdByUserId: actor.userId,
        createdAt: now(),
        updatedAt: now(),
      };
      await db.insert(savingsOpportunity).values(created);
      await writeAudit(db, actor, "finance.savings.create", "savings_opportunity", created.id, {
        status: "ESTIMATE",
      });
      return created;
    },

    async verifySavingsOpportunity(actor: Actor, opportunityId: string) {
      const organizationId = requirePermission(actor, "finance:write");
      const row = await db.query.savingsOpportunity.findFirst({
        where: and(
          eq(savingsOpportunity.id, opportunityId),
          eq(savingsOpportunity.organizationId, organizationId),
        ),
      });
      if (!row) notFound();
      if (row.status === "DISMISSED") {
        throw new AppError("CONFLICT", "A dismissed opportunity cannot be verified.");
      }
      if (row.amountMinor == null || !row.currency) {
        throw new AppError("VALIDATION", "Verified savings need an amount and a currency.");
      }
      const verifiedAt = now();
      await db
        .update(savingsOpportunity)
        .set({
          status: "VERIFIED",
          verifiedByUserId: actor.userId,
          verifiedAt,
          updatedAt: verifiedAt,
        })
        .where(
          and(
            eq(savingsOpportunity.id, row.id),
            eq(savingsOpportunity.organizationId, organizationId),
          ),
        );
      await writeAudit(db, actor, "finance.savings.verify", "savings_opportunity", row.id, {
        amountMinor: row.amountMinor,
        currency: row.currency,
      });
      return { ...row, status: "VERIFIED" as const, verifiedByUserId: actor.userId, verifiedAt };
    },

    async dismissSavingsOpportunity(actor: Actor, opportunityId: string) {
      const organizationId = requirePermission(actor, "finance:write");
      const row = await db.query.savingsOpportunity.findFirst({
        where: and(
          eq(savingsOpportunity.id, opportunityId),
          eq(savingsOpportunity.organizationId, organizationId),
        ),
      });
      if (!row) notFound();
      const updatedAt = now();
      await db
        .update(savingsOpportunity)
        .set({ status: "DISMISSED", updatedAt })
        .where(
          and(
            eq(savingsOpportunity.id, row.id),
            eq(savingsOpportunity.organizationId, organizationId),
          ),
        );
      await writeAudit(db, actor, "finance.savings.dismiss", "savings_opportunity", row.id);
      return { ...row, status: "DISMISSED" as const, updatedAt };
    },

    async exportFinance(
      actor: Actor,
      raw: unknown,
      filters: {
        currency?: string | null;
        vendorId?: string | null;
        statusGroup?: string | null;
        contractId?: string | null;
      } = {},
    ) {
      const input = parseInput(financeExportSchema, raw);
      if (input.kind === "transactions") {
        const organizationId = requirePermission(actor, "finance:write");
        if (filters.contractId) await helpers.scopedContract(organizationId, filters.contractId);
        if (filters.vendorId) await helpers.scopedVendor(organizationId, filters.vendorId);
        const currency = optionalFilter(filters.currency, CURRENCIES);
        const conditions: SQL[] = [eq(financialTransaction.organizationId, organizationId)];
        if (filters.contractId) {
          conditions.push(eq(financialTransaction.contractId, filters.contractId));
        }
        if (filters.vendorId) conditions.push(eq(financialTransaction.vendorId, filters.vendorId));
        if (currency) conditions.push(eq(financialTransaction.currency, currency));
        const rows = await db
          .select()
          .from(financialTransaction)
          .where(and(...conditions))
          .orderBy(desc(financialTransaction.occurredOn));
        const csv = toTransactionsCsv(rows);
        return {
          fileName: "accordiq-transactions.csv",
          contentType: "text/csv; charset=utf-8",
          bytes: new TextEncoder().encode(csv),
        };
      }
      const { report } = await buildReport(actor, filters);
      const csv = toInsightsCsv(report);
      return {
        fileName: "accordiq-finance.csv",
        contentType: "text/csv; charset=utf-8",
        bytes: new TextEncoder().encode(csv),
      };
    },
  };
}
