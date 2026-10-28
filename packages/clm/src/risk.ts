import { and, count, desc, eq, like, max } from "drizzle-orm";
import { extractPlainText } from "@accordiq/ai";
import {
  AppError,
  isAppError,
  likeContains,
  pageResult,
  parseInput,
  type PageQuery,
} from "@accordiq/core";
import type { Actor } from "@accordiq/auth";
import {
  extractedField,
  extractionRun,
  riskAssessment,
  riskFinding,
  riskPolicy,
  riskRule,
  type contract,
  type Database,
} from "@accordiq/db";
import { id, notFound, requirePermission, writeAudit } from "./helpers";
import {
  ENGINE_VERSION,
  SCORE_METHOD,
  evaluateRisk,
  parsePolicy,
  PROPOSED_DEFAULT_POLICY,
  riskPredicateSchema,
  type EvaluableRule,
  type RiskFacts,
  type RiskPolicyValues,
} from "./risk-engine";
import type { ClmOptions, PublicDocument } from "./repository";
import {
  assessContractSchema,
  createRiskRuleSchema,
  reviewFindingSchema,
  updateRiskPolicySchema,
  updateRiskRuleSchema,
} from "./validation";

function now(): Date {
  return new Date();
}

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function todayIso(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function toEvaluable(row: typeof riskRule.$inferSelect): EvaluableRule | null {
  if (!row.category || !row.predicateJson) return null;
  let predicate: unknown;
  try {
    predicate = JSON.parse(row.predicateJson);
  } catch {
    return null;
  }
  const status = row.status === "ACTIVE" ? "ACTIVE" : "DISABLED";
  if (status === "ACTIVE" && (!row.explanationTemplate || !row.remediation)) return null;
  try {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category as EvaluableRule["category"],
      severity: row.severity as EvaluableRule["severity"],
      weight: row.weight,
      status,
      versionNumber: row.versionNumber,
      predicate: parseInput(riskPredicateSchema, predicate),
      explanationTemplate: row.explanationTemplate ?? "Triggered.",
      remediation: row.remediation ?? "Review.",
    };
  } catch {
    return null;
  }
}

export function createRiskAccess(
  db: Database,
  _options: ClmOptions,
  helpers: {
    scopedContract: (
      organizationId: string,
      contractId: string,
    ) => Promise<typeof contract.$inferSelect>;
    getDocumentFile: (
      actor: Actor,
      documentId: string,
    ) => Promise<{ bytes: Uint8Array; contentType: string; fileName: string; byteSize: number }>;
    listDocuments: (actor: Actor, contractId: string) => Promise<PublicDocument[]>;
  },
) {
  async function loadPolicy(organizationId: string): Promise<RiskPolicyValues> {
    const row = await db.query.riskPolicy.findFirst({
      where: eq(riskPolicy.organizationId, organizationId),
    });
    if (!row) return { ...PROPOSED_DEFAULT_POLICY };
    return parsePolicy({
      highMin: row.highMin,
      mediumMin: row.mediumMin,
      expiryUrgentDays: row.expiryUrgentDays,
      expiryWarnDays: row.expiryWarnDays,
      autoRenewNoticeDaysMin: row.autoRenewNoticeDaysMin,
      maxTermDays: row.maxTermDays,
      source: row.source === "organization" ? "organization" : "proposed_default",
    });
  }

  async function ensurePolicy(organizationId: string, actor: Actor): Promise<RiskPolicyValues> {
    const existing = await db.query.riskPolicy.findFirst({
      where: eq(riskPolicy.organizationId, organizationId),
    });
    if (existing) return loadPolicy(organizationId);
    const createdAt = now();
    await db.insert(riskPolicy).values({
      id: id(),
      organizationId,
      ...PROPOSED_DEFAULT_POLICY,
      updatedByUserId: actor.userId,
      createdAt,
      updatedAt: createdAt,
    });
    return { ...PROPOSED_DEFAULT_POLICY };
  }

  async function markAssessmentsStale(organizationId: string): Promise<void> {
    await db
      .update(riskAssessment)
      .set({ stale: true, updatedAt: now() })
      .where(
        and(eq(riskAssessment.organizationId, organizationId), eq(riskAssessment.stale, false)),
      );
  }

  async function verifiedFields(organizationId: string, contractId: string) {
    const [run] = await db
      .select()
      .from(extractionRun)
      .where(
        and(
          eq(extractionRun.contractId, contractId),
          eq(extractionRun.organizationId, organizationId),
          eq(extractionRun.status, "COMPLETED"),
        ),
      )
      .orderBy(desc(extractionRun.createdAt))
      .limit(1);
    if (!run) return new Map<string, string>();
    const rows = await db
      .select()
      .from(extractedField)
      .where(
        and(eq(extractedField.runId, run.id), eq(extractedField.organizationId, organizationId)),
      );
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.verification !== "VERIFIED" && row.verification !== "CORRECTED") continue;
      const value = row.verification === "CORRECTED" ? row.correctedValue : row.valueText;
      if (value) map.set(row.fieldKey, value);
    }
    return map;
  }

  async function loadSource(
    actor: Actor,
    contractId: string,
    documentId?: string,
  ): Promise<string> {
    const docs = await helpers.listDocuments(actor, contractId);
    const chosen = documentId
      ? docs.find((row) => row.id === documentId)
      : docs.find((row) => row.status === "COMPLETED" && row.hasFile);
    if (!chosen?.hasFile) return "";
    try {
      const file = await helpers.getDocumentFile(actor, chosen.id);
      return extractPlainText(file.bytes, file.contentType);
    } catch (error) {
      if (isAppError(error) && error.code === "FORBIDDEN") throw error;
      return "";
    }
  }

  async function loadFacts(
    actor: Actor,
    row: typeof contract.$inferSelect,
    asOf: Date,
    documentId?: string,
  ): Promise<RiskFacts> {
    const verified = await verifiedFields(row.organizationId, row.id);
    return {
      asOf,
      title: row.title,
      category: row.category,
      effectiveOn: verified.get("START_DATE") ?? row.effectiveOn,
      expiresOn: verified.get("END_DATE") ?? row.expiresOn,
      governingLaw: verified.get("GOVERNING_LAW") ?? null,
      jurisdiction: verified.get("JURISDICTION") ?? null,
      renewalTerms: verified.get("RENEWAL_TERMS") ?? null,
      sourceText: await loadSource(actor, row.id, documentId),
    };
  }

  return {
    async getRiskPolicy(actor: Actor) {
      const organizationId = requirePermission(actor, "contracts:read");
      const policy = await loadPolicy(organizationId);
      return {
        ...policy,
        proposedDefault: PROPOSED_DEFAULT_POLICY,
        official: false,
        note: "These thresholds are proposed defaults, not an official scoring standard.",
      };
    },

    async updateRiskPolicy(actor: Actor, raw: unknown) {
      const organizationId = requirePermission(actor, "risk:review");
      const input = parsePolicy({
        ...parseInput(updateRiskPolicySchema, raw),
        source: "organization",
      });
      const existing = await db.query.riskPolicy.findFirst({
        where: eq(riskPolicy.organizationId, organizationId),
      });
      const stamp = now();
      if (!existing) {
        await db.insert(riskPolicy).values({
          id: id(),
          organizationId,
          ...input,
          source: "organization",
          updatedByUserId: actor.userId,
          createdAt: stamp,
          updatedAt: stamp,
        });
      } else {
        await db
          .update(riskPolicy)
          .set({
            ...input,
            source: "organization",
            updatedByUserId: actor.userId,
            updatedAt: stamp,
          })
          .where(eq(riskPolicy.id, existing.id));
      }
      await markAssessmentsStale(organizationId);
      await writeAudit(db, actor, "risk_policy.update", "risk_policy", organizationId, {
        highMin: input.highMin,
        mediumMin: input.mediumMin,
      });
      const policy = await loadPolicy(organizationId);
      return {
        ...policy,
        proposedDefault: PROPOSED_DEFAULT_POLICY,
        official: false,
        note: "These thresholds are proposed defaults, not an official scoring standard.",
      };
    },

    async listRiskRules(actor: Actor, page: PageQuery) {
      const organizationId = requirePermission(actor, "contracts:read");
      const conditions = [eq(riskRule.organizationId, organizationId)];
      if (page.q) conditions.push(like(riskRule.name, likeContains(page.q)));
      const where = and(...conditions);
      const [items, totalRow] = await Promise.all([
        db
          .select()
          .from(riskRule)
          .where(where)
          .orderBy(riskRule.code)
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(riskRule).where(where),
      ]);
      return pageResult(items, Number(totalRow[0]?.total ?? 0), page);
    },

    async createRiskRule(actor: Actor, raw: unknown) {
      const organizationId = requirePermission(actor, "risk:review");
      const input = parseInput(createRiskRuleSchema, raw);
      const existing = await db.query.riskRule.findFirst({
        where: and(eq(riskRule.organizationId, organizationId), eq(riskRule.code, input.code)),
      });
      if (existing) throw new AppError("CONFLICT", "A risk rule with that code already exists.");
      const row = {
        id: id(),
        organizationId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        severity: input.severity,
        status: input.status ?? "ACTIVE",
        category: input.category,
        predicateJson: JSON.stringify(input.predicate),
        weight: input.weight,
        remediation: input.remediation,
        explanationTemplate: input.explanationTemplate,
        versionNumber: 1,
        createdByUserId: actor.userId,
        createdAt: now(),
        updatedAt: now(),
      };
      await db.insert(riskRule).values(row);
      await markAssessmentsStale(organizationId);
      await writeAudit(db, actor, "risk_rule.create", "risk_rule", row.id, { code: row.code });
      return row;
    },

    async updateRiskRule(actor: Actor, ruleId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "risk:review");
      const input = parseInput(updateRiskRuleSchema, raw);
      const existing = await db.query.riskRule.findFirst({
        where: and(eq(riskRule.id, ruleId), eq(riskRule.organizationId, organizationId)),
      });
      if (!existing) notFound();
      const nextPredicate =
        input.predicate ?? (existing.predicateJson ? JSON.parse(existing.predicateJson) : null);
      if (input.predicate) parseInput(riskPredicateSchema, input.predicate);
      const changed =
        input.predicate !== undefined ||
        input.weight !== undefined ||
        input.severity !== undefined ||
        input.status !== undefined ||
        input.category !== undefined;
      await db
        .update(riskRule)
        .set({
          name: input.name ?? existing.name,
          description: input.description === undefined ? existing.description : input.description,
          severity: input.severity ?? existing.severity,
          status: input.status ?? existing.status,
          category: input.category ?? existing.category,
          predicateJson: nextPredicate ? JSON.stringify(nextPredicate) : existing.predicateJson,
          weight: input.weight ?? existing.weight,
          remediation: input.remediation ?? existing.remediation,
          explanationTemplate: input.explanationTemplate ?? existing.explanationTemplate,
          versionNumber: changed ? existing.versionNumber + 1 : existing.versionNumber,
          updatedAt: now(),
        })
        .where(and(eq(riskRule.id, ruleId), eq(riskRule.organizationId, organizationId)));
      if (changed) await markAssessmentsStale(organizationId);
      await writeAudit(db, actor, "risk_rule.update", "risk_rule", ruleId, { code: existing.code });
      const updated = await db.query.riskRule.findFirst({
        where: and(eq(riskRule.id, ruleId), eq(riskRule.organizationId, organizationId)),
      });
      if (!updated) notFound();
      return updated;
    },

    async getRiskRule(actor: Actor, ruleId: string) {
      const organizationId = requirePermission(actor, "contracts:read");
      const row = await db.query.riskRule.findFirst({
        where: and(eq(riskRule.id, ruleId), eq(riskRule.organizationId, organizationId)),
      });
      if (!row) notFound();
      return row;
    },

    async listRiskAssessments(actor: Actor, contractId: string) {
      const organizationId = requirePermission(actor, "contracts:read");
      await helpers.scopedContract(organizationId, contractId);
      return db
        .select()
        .from(riskAssessment)
        .where(
          and(
            eq(riskAssessment.contractId, contractId),
            eq(riskAssessment.organizationId, organizationId),
          ),
        )
        .orderBy(desc(riskAssessment.assessmentNumber));
    },

    async getRiskAssessment(actor: Actor, assessmentId: string) {
      const organizationId = requirePermission(actor, "contracts:read");
      const assessment = await db.query.riskAssessment.findFirst({
        where: and(
          eq(riskAssessment.id, assessmentId),
          eq(riskAssessment.organizationId, organizationId),
        ),
      });
      if (!assessment) notFound();
      const findings = await db
        .select()
        .from(riskFinding)
        .where(
          and(
            eq(riskFinding.assessmentId, assessment.id),
            eq(riskFinding.organizationId, organizationId),
          ),
        );
      return { assessment, findings };
    },

    async assessContract(actor: Actor, contractId: string, raw: unknown = {}) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(assessContractSchema, raw ?? {});
      const parent = await helpers.scopedContract(organizationId, contractId);
      const policy = await ensurePolicy(organizationId, actor);
      const rules = (
        await db.select().from(riskRule).where(eq(riskRule.organizationId, organizationId))
      )
        .map(toEvaluable)
        .filter((row): row is EvaluableRule => Boolean(row));
      const asOf = utcDate(input.asOf ?? todayIso());
      const facts = await loadFacts(actor, parent, asOf, input.documentId);
      const result = evaluateRisk(facts, rules, policy);
      const [latest] = await db
        .select({ n: max(riskAssessment.assessmentNumber) })
        .from(riskAssessment)
        .where(
          and(
            eq(riskAssessment.contractId, contractId),
            eq(riskAssessment.organizationId, organizationId),
          ),
        );
      const assessmentNumber = Number(latest?.n ?? 0) + 1;
      const assessmentId = id();
      const createdAt = now();
      const summary =
        result.findings.length === 0
          ? "No proposed-default rules fired on the available contract record and source text."
          : `${result.findings.length} finding(s). Score ${result.score} uses proposed default rollup ${SCORE_METHOD}, not an official rating.`;
      await db.insert(riskAssessment).values({
        id: assessmentId,
        organizationId,
        contractId,
        versionId: parent.currentVersionId,
        overallSeverity: result.overallSeverity,
        status: "COMPLETE",
        summary,
        assessmentNumber,
        score: result.score,
        scoreMethod: result.scoreMethod,
        policyJson: JSON.stringify(policy),
        ruleSetHash: result.ruleSetHash,
        stale: false,
        engineVersion: result.engineVersion,
        createdByUserId: actor.userId,
        createdAt,
        updatedAt: createdAt,
      });
      if (result.findings.length) {
        await db.insert(riskFinding).values(
          result.findings.map((finding) => ({
            id: id(),
            organizationId,
            assessmentId,
            contractId,
            ruleId: finding.ruleId,
            ruleCode: finding.ruleCode,
            ruleVersion: finding.ruleVersion,
            category: finding.category,
            severity: finding.severity,
            weight: finding.weight,
            contractText: finding.contractText,
            explanation: finding.explanation,
            aiExplanation: null,
            remediation: finding.remediation,
            reviewStatus: "OPEN" as const,
            reviewedByUserId: null,
            reviewedAt: null,
            reviewNote: null,
            createdAt,
          })),
        );
      }
      await writeAudit(db, actor, "risk_assessment.create", "risk_assessment", assessmentId, {
        contractId,
        score: result.score,
        assessmentNumber,
      });
      const findings = await db
        .select()
        .from(riskFinding)
        .where(
          and(
            eq(riskFinding.assessmentId, assessmentId),
            eq(riskFinding.organizationId, organizationId),
          ),
        );
      const assessment = await db.query.riskAssessment.findFirst({
        where: and(
          eq(riskAssessment.id, assessmentId),
          eq(riskAssessment.organizationId, organizationId),
        ),
      });
      if (!assessment) notFound();
      return { assessment, findings };
    },

    async reviewRiskFinding(actor: Actor, findingId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "risk:review");
      const input = parseInput(reviewFindingSchema, raw);
      const finding = await db.query.riskFinding.findFirst({
        where: and(eq(riskFinding.id, findingId), eq(riskFinding.organizationId, organizationId)),
      });
      if (!finding) notFound();
      const reviewedAt = now();
      await db
        .update(riskFinding)
        .set({
          reviewStatus: input.reviewStatus,
          reviewNote: input.reviewNote,
          reviewedByUserId: actor.userId,
          reviewedAt,
        })
        .where(and(eq(riskFinding.id, findingId), eq(riskFinding.organizationId, organizationId)));
      await writeAudit(db, actor, "risk_finding.review", "risk_finding", findingId, {
        reviewStatus: input.reviewStatus,
      });
      const updated = await db.query.riskFinding.findFirst({
        where: and(eq(riskFinding.id, findingId), eq(riskFinding.organizationId, organizationId)),
      });
      if (!updated) notFound();
      return updated;
    },
  };
}

export { ENGINE_VERSION };
