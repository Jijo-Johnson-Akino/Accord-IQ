import { and, count, desc, eq, inArray, like, max } from "drizzle-orm";
import { AppError, likeContains, pageResult, parseInput, type PageQuery } from "@accordiq/core";
import type { Actor } from "@accordiq/auth";
import {
  clauseAlternative,
  clauseTemplate,
  clauseUsage,
  clauseVersion,
  contract,
  type Database,
} from "@accordiq/db";
import { CLAUSE_TEMPLATE_STATUSES } from "./enums";
import { id, notFound, optionalFilter, requirePermission, writeAudit } from "./helpers";
import {
  addClauseAlternativeSchema,
  addClauseUsageSchema,
  createClauseSchema,
  createClauseVersionSchema,
  updateClauseSchema,
} from "./validation";

function now(): Date {
  return new Date();
}

function parseTypes(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function publicTemplate(row: typeof clauseTemplate.$inferSelect) {
  return { ...row, contractTypes: parseTypes(row.contractTypes) };
}

function isUniqueFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("unique") || message.includes("constraint");
}

export function createClauseAccess(
  db: Database,
  helpers: {
    scopedContract: (
      organizationId: string,
      contractId: string,
    ) => Promise<typeof contract.$inferSelect>;
  },
) {
  async function scopedTemplate(organizationId: string, templateId: string) {
    const row = await db.query.clauseTemplate.findFirst({
      where: and(
        eq(clauseTemplate.id, templateId),
        eq(clauseTemplate.organizationId, organizationId),
      ),
    });
    if (!row) notFound();
    return row;
  }

  async function loadClause(organizationId: string, templateId: string) {
    const template = await scopedTemplate(organizationId, templateId);
    const [versions, alternatives, usages] = await Promise.all([
      db
        .select()
        .from(clauseVersion)
        .where(
          and(
            eq(clauseVersion.templateId, templateId),
            eq(clauseVersion.organizationId, organizationId),
          ),
        )
        .orderBy(desc(clauseVersion.versionNumber)),
      db
        .select()
        .from(clauseAlternative)
        .where(
          and(
            eq(clauseAlternative.templateId, templateId),
            eq(clauseAlternative.organizationId, organizationId),
          ),
        ),
      db
        .select({
          usage: clauseUsage,
          contractTitle: contract.title,
        })
        .from(clauseUsage)
        .innerJoin(
          contract,
          and(eq(clauseUsage.contractId, contract.id), eq(contract.organizationId, organizationId)),
        )
        .where(
          and(
            eq(clauseUsage.templateId, templateId),
            eq(clauseUsage.organizationId, organizationId),
          ),
        ),
    ]);
    const alternativeIds = alternatives.map((row) => row.alternativeTemplateId);
    const alternativeRows =
      alternativeIds.length === 0
        ? []
        : await db
            .select()
            .from(clauseTemplate)
            .where(
              and(
                eq(clauseTemplate.organizationId, organizationId),
                inArray(clauseTemplate.id, alternativeIds),
              ),
            );
    return {
      template: publicTemplate(template),
      versions,
      alternatives: alternatives.flatMap((row) => {
        const alternative = alternativeRows.find((item) => item.id === row.alternativeTemplateId);
        if (!alternative) return [];
        return [{ ...row, alternative: publicTemplate(alternative) }];
      }),
      usages: usages.map((row) => ({
        ...row.usage,
        contractTitle: row.contractTitle,
      })),
    };
  }

  return {
    async listClauses(actor: Actor, page: PageQuery, filters: { status?: string | null } = {}) {
      const organizationId = requirePermission(actor, "contracts:read");
      const status = optionalFilter(filters.status, CLAUSE_TEMPLATE_STATUSES);
      const conditions = [eq(clauseTemplate.organizationId, organizationId)];
      if (status) conditions.push(eq(clauseTemplate.status, status));
      if (page.q) conditions.push(like(clauseTemplate.title, likeContains(page.q)));
      const where = and(...conditions);
      const [items, totalRow] = await Promise.all([
        db
          .select()
          .from(clauseTemplate)
          .where(where)
          .orderBy(clauseTemplate.title)
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(clauseTemplate).where(where),
      ]);
      return pageResult(items.map(publicTemplate), Number(totalRow[0]?.total ?? 0), page);
    },

    async getClause(actor: Actor, templateId: string) {
      const organizationId = requirePermission(actor, "contracts:read");
      return loadClause(organizationId, templateId);
    },

    async createClause(actor: Actor, raw: unknown) {
      const organizationId = requirePermission(actor, "clauses:manage");
      const input = parseInput(createClauseSchema, raw);
      const existing = await db.query.clauseTemplate.findFirst({
        where: and(
          eq(clauseTemplate.organizationId, organizationId),
          eq(clauseTemplate.code, input.code),
        ),
      });
      if (existing) throw new AppError("CONFLICT", "A clause with that code already exists.");
      const templateId = id();
      const versionId = id();
      const createdAt = now();
      await db.insert(clauseTemplate).values({
        id: templateId,
        organizationId,
        code: input.code,
        title: input.title,
        category: input.category,
        jurisdiction: input.jurisdiction ?? null,
        contractTypes: input.contractTypes ? JSON.stringify(input.contractTypes) : null,
        status: "DRAFT",
        currentVersionId: versionId,
        createdByUserId: actor.userId,
        createdAt,
        updatedAt: createdAt,
      });
      await db.insert(clauseVersion).values({
        id: versionId,
        organizationId,
        templateId,
        versionNumber: 1,
        body: input.body,
        changeSummary: input.changeSummary ?? "Initial draft",
        status: "DRAFT",
        approvedByUserId: null,
        approvedAt: null,
        createdByUserId: actor.userId,
        createdAt,
      });
      await writeAudit(db, actor, "clause.create", "clause_template", templateId, {
        code: input.code,
      });
      return loadClause(organizationId, templateId);
    },

    async updateClause(actor: Actor, templateId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "clauses:manage");
      const input = parseInput(updateClauseSchema, raw);
      const existing = await scopedTemplate(organizationId, templateId);
      if (existing.status === "DEPRECATED") {
        throw new AppError("CONFLICT", "Deprecated clauses cannot be edited. Create a successor.");
      }
      await db
        .update(clauseTemplate)
        .set({
          title: input.title ?? existing.title,
          category: input.category ?? existing.category,
          jurisdiction:
            input.jurisdiction === undefined ? existing.jurisdiction : input.jurisdiction,
          contractTypes:
            input.contractTypes === undefined
              ? existing.contractTypes
              : input.contractTypes
                ? JSON.stringify(input.contractTypes)
                : null,
          updatedAt: now(),
        })
        .where(
          and(eq(clauseTemplate.id, templateId), eq(clauseTemplate.organizationId, organizationId)),
        );
      await writeAudit(db, actor, "clause.update", "clause_template", templateId, {
        code: existing.code,
      });
      return publicTemplate(await scopedTemplate(organizationId, templateId));
    },

    async addClauseVersion(actor: Actor, templateId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "clauses:manage");
      const input = parseInput(createClauseVersionSchema, raw);
      const template = await scopedTemplate(organizationId, templateId);
      if (template.status === "DEPRECATED") {
        throw new AppError("CONFLICT", "Deprecated clauses cannot receive new versions.");
      }
      const [latest] = await db
        .select({ n: max(clauseVersion.versionNumber) })
        .from(clauseVersion)
        .where(
          and(
            eq(clauseVersion.templateId, templateId),
            eq(clauseVersion.organizationId, organizationId),
          ),
        );
      const versionNumber = Number(latest?.n ?? 0) + 1;
      const row = {
        id: id(),
        organizationId,
        templateId,
        versionNumber,
        body: input.body,
        changeSummary: input.changeSummary ?? null,
        status: "DRAFT" as const,
        approvedByUserId: null as string | null,
        approvedAt: null as Date | null,
        createdByUserId: actor.userId,
        createdAt: now(),
      };
      await db.insert(clauseVersion).values(row);
      await writeAudit(db, actor, "clause.version.create", "clause_version", row.id, {
        templateId,
        versionNumber,
      });
      return row;
    },

    async approveClause(actor: Actor, templateId: string, versionId?: string) {
      const organizationId = requirePermission(actor, "clauses:manage");
      const template = await scopedTemplate(organizationId, templateId);
      if (template.status === "DEPRECATED") {
        throw new AppError("CONFLICT", "Deprecated clauses cannot be approved.");
      }
      const versions = await db
        .select()
        .from(clauseVersion)
        .where(
          and(
            eq(clauseVersion.templateId, templateId),
            eq(clauseVersion.organizationId, organizationId),
          ),
        )
        .orderBy(desc(clauseVersion.versionNumber));
      const target = versionId
        ? versions.find((row) => row.id === versionId)
        : (versions.find((row) => row.status === "DRAFT") ?? versions[0]);
      if (!target) notFound();
      if (target.status === "SUPERSEDED") {
        throw new AppError("CONFLICT", "A superseded version cannot be re-approved.");
      }
      const approvedAt = now();
      for (const row of versions) {
        if (row.id === target.id) continue;
        if (row.status === "APPROVED") {
          await db
            .update(clauseVersion)
            .set({ status: "SUPERSEDED" })
            .where(eq(clauseVersion.id, row.id));
        }
      }
      await db
        .update(clauseVersion)
        .set({
          status: "APPROVED",
          approvedByUserId: actor.userId,
          approvedAt,
        })
        .where(eq(clauseVersion.id, target.id));
      await db
        .update(clauseTemplate)
        .set({
          status: "APPROVED",
          currentVersionId: target.id,
          updatedAt: approvedAt,
        })
        .where(eq(clauseTemplate.id, templateId));
      await writeAudit(db, actor, "clause.approve", "clause_template", templateId, {
        versionId: target.id,
        versionNumber: target.versionNumber,
      });
      return publicTemplate(await scopedTemplate(organizationId, templateId));
    },

    async deprecateClause(actor: Actor, templateId: string) {
      const organizationId = requirePermission(actor, "clauses:manage");
      const template = await scopedTemplate(organizationId, templateId);
      await db
        .update(clauseTemplate)
        .set({ status: "DEPRECATED", updatedAt: now() })
        .where(eq(clauseTemplate.id, templateId));
      await writeAudit(db, actor, "clause.deprecate", "clause_template", templateId, {
        code: template.code,
      });
      return publicTemplate(await scopedTemplate(organizationId, templateId));
    },

    async addClauseAlternative(actor: Actor, templateId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "clauses:manage");
      const input = parseInput(addClauseAlternativeSchema, raw);
      if (input.alternativeTemplateId === templateId) {
        throw new AppError("VALIDATION", "Choose a different clause as the alternative.");
      }
      await scopedTemplate(organizationId, templateId);
      await scopedTemplate(organizationId, input.alternativeTemplateId);
      const row = {
        id: id(),
        organizationId,
        templateId,
        alternativeTemplateId: input.alternativeTemplateId,
        note: input.note ?? null,
        createdByUserId: actor.userId,
        createdAt: now(),
      };
      try {
        await db.insert(clauseAlternative).values(row);
      } catch (error) {
        if (isUniqueFailure(error)) {
          throw new AppError("CONFLICT", "That alternative is already linked.");
        }
        throw error;
      }
      await writeAudit(db, actor, "clause.alternative.add", "clause_alternative", row.id, {
        templateId,
      });
      return row;
    },

    async addClauseUsage(actor: Actor, templateId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "clauses:manage");
      const input = parseInput(addClauseUsageSchema, raw);
      const template = await scopedTemplate(organizationId, templateId);
      await helpers.scopedContract(organizationId, input.contractId);
      const versionId = input.versionId ?? template.currentVersionId;
      if (!versionId) throw new AppError("VALIDATION", "This clause has no version to attach.");
      const version = await db.query.clauseVersion.findFirst({
        where: and(
          eq(clauseVersion.id, versionId),
          eq(clauseVersion.templateId, templateId),
          eq(clauseVersion.organizationId, organizationId),
        ),
      });
      if (!version) notFound();
      const row = {
        id: id(),
        organizationId,
        templateId,
        versionId: version.id,
        contractId: input.contractId,
        createdByUserId: actor.userId,
        createdAt: now(),
      };
      try {
        await db.insert(clauseUsage).values(row);
      } catch (error) {
        if (isUniqueFailure(error)) {
          throw new AppError("CONFLICT", "That contract is already linked to this clause.");
        }
        throw error;
      }
      await writeAudit(db, actor, "clause.usage.add", "clause_usage", row.id, {
        contractId: input.contractId,
      });
      return row;
    },
  };
}
