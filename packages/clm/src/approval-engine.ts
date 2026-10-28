import { parseInput } from "@accordiq/core";
import { z } from "zod";
import { CONTRACT_CATEGORIES, CONTRACT_DEPARTMENTS, SEVERITIES } from "./enums";
import type { Decision, StageStatus } from "./enums";

export const stageConditionSchema = z.object({
  match: z.enum(["ALL", "ANY"]).default("ALL"),
  predicates: z
    .array(
      z.discriminatedUnion("field", [
        z.object({
          field: z.literal("VALUE_MINOR"),
          op: z.enum(["GTE", "GT", "LTE", "LT"]),
          amount: z.number().int().nonnegative().max(99_999_999_999),
        }),
        z.object({
          field: z.literal("CATEGORY"),
          op: z.literal("IN"),
          values: z.array(z.enum(CONTRACT_CATEGORIES)).min(1).max(8),
        }),
        z.object({
          field: z.literal("DEPARTMENT"),
          op: z.literal("IN"),
          values: z.array(z.enum(CONTRACT_DEPARTMENTS)).min(1).max(8),
        }),
        z.object({
          field: z.literal("RISK"),
          op: z.literal("IN"),
          values: z.array(z.enum(SEVERITIES)).min(1).max(3),
        }),
      ]),
    )
    .max(8),
});

export type StageCondition = z.infer<typeof stageConditionSchema>;

export interface ApprovalFacts {
  valueMinor: number | null;
  category: string | null;
  department: string | null;
  vendorId: string | null;
  overallSeverity: string | null;
  versionId: string | null;
}

export interface EvaluableStage {
  id: string;
  step: number;
  status: StageStatus;
  requiredRole: string;
  delegatedToUserId: string | null;
  escalateToRole: string | null;
  escalatedAt: Date | null;
}

export function parseCondition(raw: unknown): StageCondition {
  if (raw == null || raw === "") {
    return { match: "ALL", predicates: [] };
  }
  const value = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  return parseInput(stageConditionSchema, value);
}

function compareAmount(left: number, op: "GTE" | "GT" | "LTE" | "LT", right: number): boolean {
  if (op === "GTE") return left >= right;
  if (op === "GT") return left > right;
  if (op === "LTE") return left <= right;
  return left < right;
}

export function evaluateCondition(facts: ApprovalFacts, condition: StageCondition): boolean {
  if (condition.predicates.length === 0) return true;
  const results = condition.predicates.map((predicate) => {
    if (predicate.field === "VALUE_MINOR") {
      if (facts.valueMinor == null) return false;
      return compareAmount(facts.valueMinor, predicate.op, predicate.amount);
    }
    if (predicate.field === "CATEGORY") {
      return Boolean(facts.category && predicate.values.includes(facts.category as never));
    }
    if (predicate.field === "DEPARTMENT") {
      return Boolean(facts.department && predicate.values.includes(facts.department as never));
    }
    return Boolean(
      facts.overallSeverity && predicate.values.includes(facts.overallSeverity as never),
    );
  });
  return condition.match === "ANY" ? results.some(Boolean) : results.every(Boolean);
}

export function materialSnapshot(facts: ApprovalFacts): string {
  return JSON.stringify({
    valueMinor: facts.valueMinor,
    category: facts.category,
    department: facts.department,
    vendorId: facts.vendorId,
    overallSeverity: facts.overallSeverity,
    versionId: facts.versionId,
  });
}

export function snapshotsDiffer(left: string | null | undefined, right: string): boolean {
  if (!left) return true;
  try {
    return materialSnapshot(JSON.parse(left) as ApprovalFacts) !== right;
  } catch {
    return true;
  }
}

export function currentStep(stages: EvaluableStage[]): number | null {
  const open = stages.filter(
    (stage) => stage.status === "PENDING" || stage.status === "CHANGES_REQUESTED",
  );
  if (open.length === 0) return null;
  return Math.min(...open.map((stage) => stage.step));
}

export function requestIsFrozen(stages: EvaluableStage[]): boolean {
  return stages.some((stage) => stage.status === "CHANGES_REQUESTED");
}

/** Stages the server will accept a decision on. Never trust a client-only list. */
export function actionableStageIds(
  stages: EvaluableStage[],
  request: { status: string; stale: boolean },
): string[] {
  if (request.status !== "IN_PROGRESS" || request.stale) return [];
  if (requestIsFrozen(stages)) return [];
  const step = currentStep(stages);
  if (step == null) return [];
  return stages
    .filter((stage) => stage.step === step && stage.status === "PENDING")
    .map((stage) => stage.id);
}

export function canActorDecide(
  actor: {
    userId: string;
    platformRole: string | null;
    organizationRole: string | null;
  },
  stage: EvaluableStage,
): boolean {
  if (actor.platformRole === "SUPERADMIN") return true;
  if (actor.organizationRole === "ORGANIZATION_ADMIN") return true;
  if (stage.delegatedToUserId && stage.delegatedToUserId === actor.userId) return true;
  if (
    stage.escalatedAt &&
    stage.escalateToRole &&
    actor.organizationRole === stage.escalateToRole
  ) {
    return true;
  }
  return actor.organizationRole === stage.requiredRole;
}

export function nextRequestStatus(
  stages: EvaluableStage[],
  decision: Decision,
): "IN_PROGRESS" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" {
  if (decision === "REJECTED") return "REJECTED";
  if (decision === "CHANGES_REQUESTED") return "CHANGES_REQUESTED";
  const remaining = stages.filter(
    (stage) => stage.status === "PENDING" || stage.status === "CHANGES_REQUESTED",
  );
  return remaining.length === 0 ? "APPROVED" : "IN_PROGRESS";
}

export function dueAtFromDays(from: Date, dueInDays: number): Date {
  return new Date(from.getTime() + dueInDays * 86_400_000);
}

export function isOverdue(dueAt: Date | null | undefined, now: Date): boolean {
  return Boolean(dueAt && dueAt.getTime() < now.getTime());
}

export function reminderDue(
  dueAt: Date | null | undefined,
  reminderHoursBefore: number | null | undefined,
  reminderSentAt: Date | null | undefined,
  now: Date,
): boolean {
  if (!dueAt || !reminderHoursBefore || reminderSentAt) return false;
  const windowStart = dueAt.getTime() - reminderHoursBefore * 3_600_000;
  return now.getTime() >= windowStart;
}
