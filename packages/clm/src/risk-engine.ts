import { createHash } from "node:crypto";
import { parseInput } from "@accordiq/core";
import { z } from "zod";
import { RISK_CATEGORIES, SEVERITIES, type RiskCategory, type Severity } from "./enums";

export const ENGINE_VERSION = "accordiq-risk-v1";
export const SCORE_METHOD = "SUM_WEIGHTS_CAPPED_100";

/**
 * Proposed default thresholds. These are not an official rating standard, regulator scale,
 * or AccordIQ “certified” score. Organizations must review and can replace every value.
 */
export const PROPOSED_DEFAULT_POLICY = {
  source: "proposed_default" as const,
  highMin: 70,
  mediumMin: 40,
  expiryUrgentDays: 30,
  expiryWarnDays: 90,
  autoRenewNoticeDaysMin: 60,
  maxTermDays: 1825,
};

export type RiskPolicyValues = {
  highMin: number;
  mediumMin: number;
  expiryUrgentDays: number;
  expiryWarnDays: number;
  autoRenewNoticeDaysMin: number;
  maxTermDays: number;
  source: "proposed_default" | "organization";
};

const riskPolicyFields = {
  highMin: z.number().int().min(1).max(100),
  mediumMin: z.number().int().min(0).max(99),
  expiryUrgentDays: z.number().int().min(1).max(3650),
  expiryWarnDays: z.number().int().min(1).max(3650),
  autoRenewNoticeDaysMin: z.number().int().min(1).max(365),
  maxTermDays: z.number().int().min(30).max(36500),
};

function refineRiskPolicy(
  value: { mediumMin: number; highMin: number; expiryUrgentDays: number; expiryWarnDays: number },
  ctx: z.RefinementCtx,
) {
  if (value.mediumMin >= value.highMin) {
    ctx.addIssue({
      code: "custom",
      message: "mediumMin must be lower than highMin.",
      path: ["mediumMin"],
    });
  }
  if (value.expiryUrgentDays >= value.expiryWarnDays) {
    ctx.addIssue({
      code: "custom",
      message: "expiryUrgentDays must be lower than expiryWarnDays.",
      path: ["expiryUrgentDays"],
    });
  }
}

export const riskPolicySchema = z
  .object({
    ...riskPolicyFields,
    source: z.enum(["proposed_default", "organization"]).optional(),
  })
  .superRefine(refineRiskPolicy);

export const updateRiskPolicySchema = z.object(riskPolicyFields).superRefine(refineRiskPolicy);

const needle = z.string().trim().min(3).max(80);

export const riskPredicateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("MISSING_FIELD"),
    field: z.enum(["GOVERNING_LAW", "END_DATE", "START_DATE", "RENEWAL_TERMS"]),
  }),
  z.object({
    type: z.literal("TEXT_MISSING_ANY"),
    needles: z.array(needle).min(1).max(8),
  }),
  z.object({
    type: z.literal("TEXT_HAS_ANY"),
    needles: z.array(needle).min(1).max(8),
  }),
  z.object({
    type: z.literal("EXPIRY_DAYS_LTE"),
    policyKey: z.enum(["expiryUrgentDays", "expiryWarnDays"]),
    abovePolicyKey: z.enum(["expiryUrgentDays"]).optional(),
  }),
  z.object({
    type: z.literal("TERM_DAYS_GT"),
    policyKey: z.literal("maxTermDays"),
  }),
  z.object({
    type: z.literal("AUTO_RENEW_NOTICE_LT"),
    policyKey: z.literal("autoRenewNoticeDaysMin"),
  }),
]);

export type RiskPredicate = z.infer<typeof riskPredicateSchema>;

export const evaluableRuleSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(2).max(40),
  name: z.string().min(1).max(200),
  category: z.enum(RISK_CATEGORIES),
  severity: z.enum(SEVERITIES),
  weight: z.number().int().min(1).max(100),
  status: z.enum(["ACTIVE", "DISABLED"]),
  versionNumber: z.number().int().positive(),
  predicate: riskPredicateSchema,
  explanationTemplate: z.string().trim().min(1).max(2000),
  remediation: z.string().trim().min(1).max(2000),
});

export type EvaluableRule = z.infer<typeof evaluableRuleSchema>;

export interface RiskFacts {
  asOf: Date;
  title: string;
  category: string | null;
  effectiveOn: string | null;
  expiresOn: string | null;
  governingLaw: string | null;
  jurisdiction: string | null;
  renewalTerms: string | null;
  sourceText: string;
}

export interface EngineFinding {
  ruleId: string;
  ruleCode: string;
  ruleVersion: number;
  category: RiskCategory;
  severity: Severity;
  weight: number;
  contractText: string | null;
  explanation: string;
  aiExplanation: null;
  remediation: string;
}

export interface EngineResult {
  findings: EngineFinding[];
  score: number;
  overallSeverity: Severity;
  ruleSetHash: string;
  engineVersion: typeof ENGINE_VERSION;
  scoreMethod: typeof SCORE_METHOD;
}

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseIsoDay(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

export function daysUntil(iso: string, asOf: Date): number | null {
  const end = parseIsoDay(iso);
  if (end == null) return null;
  return Math.round((end - utcDay(asOf)) / 86_400_000);
}

export function daysBetween(startIso: string, endIso: string): number | null {
  const start = parseIsoDay(startIso);
  const end = parseIsoDay(endIso);
  if (start == null || end == null) return null;
  return Math.round((end - start) / 86_400_000);
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function haystack(facts: RiskFacts): string {
  return normalize(
    [facts.sourceText, facts.renewalTerms, facts.governingLaw, facts.jurisdiction, facts.title]
      .filter(Boolean)
      .join("\n"),
  );
}

function snippet(source: string, needleText: string): string | null {
  const lower = source.toLowerCase();
  const index = lower.indexOf(needleText.toLowerCase());
  if (index < 0) return null;
  const start = Math.max(0, index - 40);
  const end = Math.min(source.length, index + needleText.length + 80);
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}

function firstHit(source: string, needles: string[]): string | null {
  for (const item of needles) {
    const found = snippet(source, item);
    if (found) return found;
  }
  return null;
}

export function parseNoticeDays(text: string): number | null {
  const match =
    /(\d{1,4})\s*days?['’]?\s*(?:prior|written notice|notice)|(?:notice|notify)[^\d]{0,48}(\d{1,4})\s*days?/i.exec(
      text,
    );
  if (!match) return null;
  const value = Number(match[1] ?? match[2]);
  return Number.isFinite(value) ? value : null;
}

const AUTO_RENEW_NEEDLES = ["automatically renew", "automatic renewal", "auto-renew"];

export function parsePolicy(raw: unknown): RiskPolicyValues {
  const parsed = parseInput(riskPolicySchema, raw);
  return { ...parsed, source: parsed.source ?? "organization" };
}

export function severityFromScore(score: number, policy: RiskPolicyValues): Severity {
  if (score >= policy.highMin) return "HIGH";
  if (score >= policy.mediumMin) return "MEDIUM";
  return "LOW";
}

export function scoreFromWeights(weights: number[]): number {
  return Math.min(
    100,
    weights.reduce((sum, weight) => sum + weight, 0),
  );
}

export function ruleSetHash(rules: EvaluableRule[]): string {
  const canonical = [...rules]
    .filter((rule) => rule.status === "ACTIVE")
    .map(
      (rule) =>
        `${rule.code}|${rule.versionNumber}|${rule.weight}|${rule.severity}|${JSON.stringify(rule.predicate)}`,
    )
    .sort()
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (_, key: string) => values[key] ?? "");
}

function fieldValue(
  facts: RiskFacts,
  field: "GOVERNING_LAW" | "END_DATE" | "START_DATE" | "RENEWAL_TERMS",
) {
  if (field === "GOVERNING_LAW") return facts.governingLaw;
  if (field === "END_DATE") return facts.expiresOn;
  if (field === "START_DATE") return facts.effectiveOn;
  return facts.renewalTerms;
}

function evaluatePredicate(
  predicate: RiskPredicate,
  facts: RiskFacts,
  policy: RiskPolicyValues,
): { fired: boolean; contractText: string | null; tokens: Record<string, string> } {
  const text = haystack(facts);
  const rawText = [facts.sourceText, facts.renewalTerms].filter(Boolean).join("\n");
  const hasSource = facts.sourceText.trim().length > 0;

  if (predicate.type === "MISSING_FIELD") {
    const value = fieldValue(facts, predicate.field);
    return {
      fired: !value,
      contractText: value,
      tokens: { field: predicate.field },
    };
  }

  if (predicate.type === "TEXT_MISSING_ANY") {
    if (!hasSource) return { fired: false, contractText: null, tokens: {} };
    const hit = firstHit(facts.sourceText, predicate.needles);
    return {
      fired: !hit,
      contractText: null,
      tokens: { needles: predicate.needles.join(", ") },
    };
  }

  if (predicate.type === "TEXT_HAS_ANY") {
    if (!hasSource && !facts.renewalTerms) return { fired: false, contractText: null, tokens: {} };
    const hit = firstHit(rawText, predicate.needles);
    return {
      fired: Boolean(hit),
      contractText: hit,
      tokens: { needles: predicate.needles.join(", ") },
    };
  }

  if (predicate.type === "EXPIRY_DAYS_LTE") {
    if (!facts.expiresOn) return { fired: false, contractText: null, tokens: {} };
    const days = daysUntil(facts.expiresOn, facts.asOf);
    if (days == null) return { fired: false, contractText: null, tokens: {} };
    const ceiling = policy[predicate.policyKey];
    const floor = predicate.abovePolicyKey ? policy[predicate.abovePolicyKey] : null;
    const fired = days <= ceiling && (floor == null || days > floor);
    return {
      fired,
      contractText: `Expires on ${facts.expiresOn}`,
      tokens: { days: String(days), expiresOn: facts.expiresOn },
    };
  }

  if (predicate.type === "TERM_DAYS_GT") {
    if (!facts.effectiveOn || !facts.expiresOn)
      return { fired: false, contractText: null, tokens: {} };
    const length = daysBetween(facts.effectiveOn, facts.expiresOn);
    if (length == null) return { fired: false, contractText: null, tokens: {} };
    return {
      fired: length > policy.maxTermDays,
      contractText: `${facts.effectiveOn} through ${facts.expiresOn}`,
      tokens: { days: String(length) },
    };
  }

  const auto = AUTO_RENEW_NEEDLES.some((needleText) => text.includes(needleText));
  if (!auto) return { fired: false, contractText: null, tokens: {} };
  const notice = parseNoticeDays(rawText);
  const hit = firstHit(rawText, AUTO_RENEW_NEEDLES);
  const fired = notice == null || notice < policy.autoRenewNoticeDaysMin;
  return {
    fired,
    contractText: hit,
    tokens: {
      notice: notice == null ? "not stated" : String(notice),
      minimum: String(policy.autoRenewNoticeDaysMin),
    },
  };
}

export function evaluateRisk(
  facts: RiskFacts,
  rules: EvaluableRule[],
  policy: RiskPolicyValues,
): EngineResult {
  const parsedPolicy = parsePolicy(policy);
  const active = rules.filter((rule) => rule.status === "ACTIVE");
  const findings: EngineFinding[] = [];
  for (const rule of active) {
    const parsed = parseInput(evaluableRuleSchema, rule);
    const result = evaluatePredicate(parsed.predicate, facts, parsedPolicy);
    if (!result.fired) continue;
    findings.push({
      ruleId: parsed.id,
      ruleCode: parsed.code,
      ruleVersion: parsed.versionNumber,
      category: parsed.category,
      severity: parsed.severity,
      weight: parsed.weight,
      contractText: result.contractText,
      explanation: fillTemplate(parsed.explanationTemplate, result.tokens),
      aiExplanation: null,
      remediation: parsed.remediation,
    });
  }
  const score = scoreFromWeights(findings.map((row) => row.weight));
  return {
    findings,
    score,
    overallSeverity: severityFromScore(score, parsedPolicy),
    ruleSetHash: ruleSetHash(active),
    engineVersion: ENGINE_VERSION,
    scoreMethod: SCORE_METHOD,
  };
}
