import { and, count, desc, eq, gte, like, lte, max, or, type SQL } from "drizzle-orm";
import {
  AppError,
  isoDateSchema,
  likeContains,
  pageResult,
  parseInput,
  type PageQuery,
  type PageResult,
} from "@accordiq/core";
import type { Actor } from "@accordiq/auth";
import {
  auditEvent,
  contract,
  contractParty,
  contractVersion,
  notification,
  vendor,
  type Database,
} from "@accordiq/db";
import { CONTRACT_CATEGORIES, CONTRACT_STATUSES } from "./enums";
import type { ContractCategory, ContractStatus } from "./enums";
import { id, notFound, optionalFilter, orgId, requirePermission, writeAudit } from "./helpers";
import { createAssistantAccess } from "./assistant";
import { createFinanceAccess } from "./finance";
import { createIntegrationAccess } from "./integrations";
import { createNotifyAccess } from "./notify";
import { moneyToMinor } from "./money";
import { createApprovalAccess } from "./approvals";
import { createClauseAccess } from "./clauses";
import { createIntelligenceAccess } from "./intelligence";
import { createObligationAccess } from "./obligations";
import { createDocumentAccess, type ClmOptions } from "./repository";
import { createRiskAccess } from "./risk";
import { createSignatureAccess } from "./signatures";
import {
  addPartySchema,
  createContractSchema,
  createVendorSchema,
  createVersionSchema,
  updateContractSchema,
} from "./validation";

function optionalIsoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return parseInput(isoDateSchema, value);
}

export type ContractListItem = typeof contract.$inferSelect & { vendorName: string | null };

export function createClm(db: Database, options: ClmOptions = {}) {
  const now = () => options.clock?.() ?? new Date();
  async function scopedVendor(organizationId: string, vendorId: string) {
    const row = await db.query.vendor.findFirst({
      where: and(eq(vendor.id, vendorId), eq(vendor.organizationId, organizationId)),
    });
    if (!row) notFound();
    return row;
  }

  async function scopedContract(organizationId: string, contractId: string) {
    const row = await db.query.contract.findFirst({
      where: and(eq(contract.id, contractId), eq(contract.organizationId, organizationId)),
    });
    if (!row) notFound();
    return row;
  }

  const documentAccess = createDocumentAccess(db, options, { scopedContract });
  const fileHelpers = {
    scopedContract,
    getDocumentFile: (
      actor: Parameters<typeof documentAccess.getDocumentFile>[0],
      documentId: string,
    ) => documentAccess.getDocumentFile(actor, documentId),
    listDocuments: (
      actor: Parameters<typeof documentAccess.listDocuments>[0],
      contractId: string,
    ) => documentAccess.listDocuments(actor, contractId),
  };
  const intelligenceAccess = createIntelligenceAccess(db, options, fileHelpers);
  const riskAccess = createRiskAccess(db, options, fileHelpers);
  const clauseAccess = createClauseAccess(db, { scopedContract });
  const approvalAccess = createApprovalAccess(db, { scopedContract, clock: now, options });
  const notifyAccess = createNotifyAccess(db, options);
  const integrationAccess = createIntegrationAccess(db, options);
  const signatureAccess = createSignatureAccess(db, options, fileHelpers);
  const obligationAccess = createObligationAccess(db, options, {
    scopedContract,
    startApproval: (actor, contractId, raw) => approvalAccess.startApproval(actor, contractId, raw),
  });
  const financeAccess = createFinanceAccess(db, options, { scopedContract, scopedVendor });
  const assistantAccess = createAssistantAccess(db, options, fileHelpers);

  return {
    async listVendors(
      actor: Actor,
      page: PageQuery,
    ): Promise<PageResult<typeof vendor.$inferSelect>> {
      const organizationId = requirePermission(actor, "contracts:read");
      const conditions: SQL[] = [eq(vendor.organizationId, organizationId)];
      if (page.q) conditions.push(like(vendor.name, likeContains(page.q)));
      const where = and(...conditions);
      const [items, totalRow] = await Promise.all([
        db
          .select()
          .from(vendor)
          .where(where)
          .orderBy(vendor.name)
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(vendor).where(where),
      ]);
      return pageResult(items, Number(totalRow[0]?.total ?? 0), page);
    },

    async getVendor(actor: Actor, vendorId: string) {
      const organizationId = requirePermission(actor, "contracts:read");
      return scopedVendor(organizationId, vendorId);
    },

    async createVendor(actor: Actor, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(createVendorSchema, raw);
      const existing = await db.query.vendor.findFirst({
        where: and(eq(vendor.organizationId, organizationId), eq(vendor.name, input.name)),
      });
      if (existing) throw new AppError("CONFLICT", "A vendor with that name already exists.");
      const row = {
        id: id(),
        organizationId,
        name: input.name,
        website: input.website ?? null,
        status: input.status ?? "ACTIVE",
        createdByUserId: actor.userId,
        createdAt: now(),
        updatedAt: now(),
      };
      await db.transaction(async (tx) => {
        await tx.insert(vendor).values(row);
        await writeAudit(tx, actor, "vendor.create", "vendor", row.id, { name: row.name });
      });
      return row;
    },

    async listContracts(
      actor: Actor,
      page: PageQuery,
      filters: {
        status?: string | null;
        category?: string | null;
        vendorId?: string | null;
        expiresAfter?: string | null;
        expiresBefore?: string | null;
      } = {},
    ): Promise<PageResult<ContractListItem>> {
      const organizationId = requirePermission(actor, "contracts:read");
      const status = optionalFilter<ContractStatus>(filters.status, CONTRACT_STATUSES);
      const category = optionalFilter<ContractCategory>(filters.category, CONTRACT_CATEGORIES);
      const expiresAfter = optionalIsoDate(filters.expiresAfter);
      const expiresBefore = optionalIsoDate(filters.expiresBefore);
      const conditions: SQL[] = [eq(contract.organizationId, organizationId)];
      if (status) conditions.push(eq(contract.status, status));
      if (category) conditions.push(eq(contract.category, category));
      if (filters.vendorId) conditions.push(eq(contract.vendorId, filters.vendorId));
      if (expiresAfter) conditions.push(gte(contract.expiresOn, expiresAfter));
      if (expiresBefore) conditions.push(lte(contract.expiresOn, expiresBefore));
      if (page.q) {
        const pattern = likeContains(page.q);
        const match = or(like(contract.title, pattern), like(vendor.name, pattern));
        if (match) conditions.push(match);
      }
      const where = and(...conditions);
      const [rows, totalRow] = await Promise.all([
        db
          .select({ contract, vendorName: vendor.name })
          .from(contract)
          .leftJoin(
            vendor,
            and(eq(contract.vendorId, vendor.id), eq(vendor.organizationId, organizationId)),
          )
          .where(where)
          .orderBy(desc(contract.updatedAt))
          .limit(page.limit)
          .offset(page.offset),
        db
          .select({ total: count() })
          .from(contract)
          .leftJoin(
            vendor,
            and(eq(contract.vendorId, vendor.id), eq(vendor.organizationId, organizationId)),
          )
          .where(where),
      ]);
      const items = rows.map((row) => ({ ...row.contract, vendorName: row.vendorName ?? null }));
      return pageResult(items, Number(totalRow[0]?.total ?? 0), page);
    },

    async getContract(actor: Actor, contractId: string) {
      const organizationId = requirePermission(actor, "contracts:read");
      const row = await scopedContract(organizationId, contractId);
      const vendorRow = row.vendorId
        ? await db.query.vendor.findFirst({
            where: and(eq(vendor.id, row.vendorId), eq(vendor.organizationId, organizationId)),
          })
        : null;
      const [versions, parties, documents, relations] = await Promise.all([
        db
          .select()
          .from(contractVersion)
          .where(
            and(
              eq(contractVersion.contractId, row.id),
              eq(contractVersion.organizationId, organizationId),
            ),
          )
          .orderBy(desc(contractVersion.versionNumber)),
        db
          .select()
          .from(contractParty)
          .where(
            and(
              eq(contractParty.contractId, row.id),
              eq(contractParty.organizationId, organizationId),
            ),
          ),
        documentAccess.listDocuments(actor, contractId),
        documentAccess.listRelations(actor, contractId),
      ]);
      return {
        contract: { ...row, vendorName: vendorRow?.name ?? null },
        versions,
        parties,
        documents,
        relations,
      };
    },

    async createContract(actor: Actor, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(createContractSchema, raw);
      if (input.vendorId) await scopedVendor(organizationId, input.vendorId);
      const contractId = id();
      const versionId = id();
      const valueMinor = moneyToMinor({
        value: input.value,
        valueMinor: input.valueMinor,
        currency: input.currency,
      });
      const contractRow = {
        id: contractId,
        organizationId,
        title: input.title,
        status: "DRAFT" as const,
        vendorId: input.vendorId ?? null,
        ownerUserId: actor.userId,
        currentVersionId: versionId,
        effectiveOn: input.effectiveOn ?? null,
        expiresOn: input.expiresOn ?? null,
        category: input.category ?? null,
        currency: input.currency ?? (valueMinor != null ? "USD" : null),
        valueMinor,
        department: input.department ?? null,
        noticeDays: null,
        autoRenew: false,
        createdByUserId: actor.userId,
        createdAt: now(),
        updatedAt: now(),
      };
      const versionRow = {
        id: versionId,
        organizationId,
        contractId,
        versionNumber: 1,
        status: "DRAFT" as const,
        summary: null as string | null,
        createdByUserId: actor.userId,
        createdAt: now(),
      };
      await db.transaction(async (tx) => {
        await tx.insert(contract).values(contractRow);
        await tx.insert(contractVersion).values(versionRow);
        await writeAudit(tx, actor, "contract.create", "contract", contractId, {
          title: input.title,
        });
      });
      return { contract: contractRow, version: versionRow };
    },

    async updateContract(actor: Actor, contractId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(updateContractSchema, raw);
      const existing = await scopedContract(organizationId, contractId);
      if (input.vendorId) await scopedVendor(organizationId, input.vendorId);
      let valueMinor = existing.valueMinor;
      if (input.valueMinor !== undefined) {
        valueMinor = input.valueMinor;
      } else if (input.value !== undefined) {
        valueMinor = input.value
          ? moneyToMinor({
              value: input.value,
              currency: input.currency === undefined ? existing.currency : input.currency,
            })
          : null;
      }
      const patch = {
        title: input.title ?? existing.title,
        vendorId: input.vendorId === undefined ? existing.vendorId : input.vendorId,
        category: input.category === undefined ? existing.category : input.category,
        currency: input.currency === undefined ? existing.currency : input.currency,
        valueMinor,
        department: input.department === undefined ? existing.department : input.department,
        effectiveOn: input.effectiveOn === undefined ? existing.effectiveOn : input.effectiveOn,
        expiresOn: input.expiresOn === undefined ? existing.expiresOn : input.expiresOn,
        noticeDays: input.noticeDays === undefined ? existing.noticeDays : input.noticeDays,
        autoRenew: input.autoRenew === undefined ? existing.autoRenew : input.autoRenew,
        updatedAt: now(),
      };
      await db
        .update(contract)
        .set(patch)
        .where(and(eq(contract.id, contractId), eq(contract.organizationId, organizationId)));
      await writeAudit(db, actor, "contract.update", "contract", contractId, {
        title: patch.title,
      });
      await approvalAccess.syncMaterialChange(actor, contractId);
      await obligationAccess.syncContractWatch(organizationId, contractId);
      return scopedContract(organizationId, contractId);
    },

    async createContractVersion(actor: Actor, contractId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(createVersionSchema, raw ?? {});
      await scopedContract(organizationId, contractId);
      const [latest] = await db
        .select({ n: max(contractVersion.versionNumber) })
        .from(contractVersion)
        .where(
          and(
            eq(contractVersion.contractId, contractId),
            eq(contractVersion.organizationId, organizationId),
          ),
        );
      const versionNumber = Number(latest?.n ?? 0) + 1;
      const versionRow = {
        id: id(),
        organizationId,
        contractId,
        versionNumber,
        status: input.status ?? "DRAFT",
        summary: input.summary ?? null,
        createdByUserId: actor.userId,
        createdAt: now(),
      };
      await db.transaction(async (tx) => {
        await tx.insert(contractVersion).values(versionRow);
        await tx
          .update(contract)
          .set({ currentVersionId: versionRow.id, updatedAt: now() })
          .where(and(eq(contract.id, contractId), eq(contract.organizationId, organizationId)));
        await writeAudit(tx, actor, "contract.version.create", "contract_version", versionRow.id, {
          contractId,
          versionNumber,
        });
      });
      await approvalAccess.syncMaterialChange(actor, contractId);
      return versionRow;
    },

    async listParties(actor: Actor, contractId: string) {
      const organizationId = requirePermission(actor, "contracts:read");
      await scopedContract(organizationId, contractId);
      return db
        .select()
        .from(contractParty)
        .where(
          and(
            eq(contractParty.contractId, contractId),
            eq(contractParty.organizationId, organizationId),
          ),
        );
    },

    async addParty(actor: Actor, contractId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(addPartySchema, raw);
      await scopedContract(organizationId, contractId);
      if (input.vendorId) await scopedVendor(organizationId, input.vendorId);
      const row = {
        id: id(),
        organizationId,
        contractId,
        vendorId: input.vendorId ?? null,
        name: input.name,
        role: input.role,
        email: input.email ?? null,
        createdAt: now(),
      };
      await db.transaction(async (tx) => {
        await tx.insert(contractParty).values(row);
        await writeAudit(tx, actor, "contract.party.add", "contract_party", row.id, { contractId });
      });
      return row;
    },

    ...documentAccess,
    ...intelligenceAccess,
    ...riskAccess,
    ...clauseAccess,
    ...approvalAccess,
    ...signatureAccess,
    ...obligationAccess,
    ...financeAccess,

    async listNotifications(actor: Actor, page: PageQuery) {
      const organizationId = orgId(actor);
      const where = and(
        eq(notification.organizationId, organizationId),
        eq(notification.userId, actor.userId),
      );
      const [items, totalRow] = await Promise.all([
        db
          .select()
          .from(notification)
          .where(where)
          .orderBy(desc(notification.createdAt))
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(notification).where(where),
      ]);
      return pageResult(items, Number(totalRow[0]?.total ?? 0), page);
    },

    async markNotificationRead(actor: Actor, notificationId: string) {
      const organizationId = orgId(actor);
      const row = await db.query.notification.findFirst({
        where: and(
          eq(notification.id, notificationId),
          eq(notification.organizationId, organizationId),
          eq(notification.userId, actor.userId),
        ),
      });
      if (!row) notFound();
      const readAt = now();
      await db
        .update(notification)
        .set({ status: "READ", readAt })
        .where(eq(notification.id, row.id));
      return { ...row, status: "READ" as const, readAt };
    },

    ...assistantAccess,
    ...notifyAccess,
    ...integrationAccess,

    async listAudit(
      actor: Actor,
      page: PageQuery,
      filters: { entityType?: string | null; entityId?: string | null } = {},
    ) {
      const organizationId = requirePermission(actor, "audit:read");
      const conditions: SQL[] = [eq(auditEvent.organizationId, organizationId)];
      if (filters.entityType) conditions.push(eq(auditEvent.entityType, filters.entityType));
      if (filters.entityId) conditions.push(eq(auditEvent.entityId, filters.entityId));
      const where = and(...conditions);
      const [items, totalRow] = await Promise.all([
        db
          .select()
          .from(auditEvent)
          .where(where)
          .orderBy(desc(auditEvent.createdAt))
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(auditEvent).where(where),
      ]);
      return pageResult(items, Number(totalRow[0]?.total ?? 0), page);
    },
  };
}

export type Clm = ReturnType<typeof createClm>;
