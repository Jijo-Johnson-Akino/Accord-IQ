import { describe, expect, it } from "vitest";
import { AppError } from "@accordiq/core";
import { PROPOSED_DEFAULT_RULES } from "./risk-defaults";
import {
  daysUntil,
  evaluateRisk,
  parseNoticeDays,
  parsePolicy,
  PROPOSED_DEFAULT_POLICY,
  scoreFromWeights,
  severityFromScore,
  type EvaluableRule,
  type RiskFacts,
} from "./risk-engine";

const asOf = new Date("2026-10-27T12:00:00Z");

function facts(overrides: Partial<RiskFacts> = {}): RiskFacts {
  return {
    asOf,
    title: "Sample",
    category: "MSA",
    effectiveOn: "2026-01-01",
    expiresOn: "2027-12-31",
    governingLaw: "Delaware",
    jurisdiction: "Delaware courts",
    renewalTerms: null,
    sourceText: "",
    ...overrides,
  };
}

function rule(
  partial: Partial<EvaluableRule> & Pick<EvaluableRule, "code" | "predicate">,
): EvaluableRule {
  return {
    id: partial.id ?? `rule_${partial.code}`,
    name: partial.name ?? partial.code,
    category: partial.category ?? "COMPLIANCE",
    severity: partial.severity ?? "MEDIUM",
    weight: partial.weight ?? 10,
    status: partial.status ?? "ACTIVE",
    versionNumber: partial.versionNumber ?? 1,
    explanationTemplate: partial.explanationTemplate ?? "Triggered {days}",
    remediation: partial.remediation ?? "Review.",
    ...partial,
  };
}

describe("proposed default policy", () => {
  it("rejects contradictory thresholds", () => {
    expect(() => parsePolicy({ ...PROPOSED_DEFAULT_POLICY, mediumMin: 80, highMin: 70 })).toThrow(
      AppError,
    );
    expect(() =>
      parsePolicy({ ...PROPOSED_DEFAULT_POLICY, expiryUrgentDays: 90, expiryWarnDays: 30 }),
    ).toThrow(/expiryUrgentDays/);
  });

  it("maps score boundaries with the proposed defaults", () => {
    expect(severityFromScore(0, PROPOSED_DEFAULT_POLICY)).toBe("LOW");
    expect(severityFromScore(39, PROPOSED_DEFAULT_POLICY)).toBe("LOW");
    expect(severityFromScore(40, PROPOSED_DEFAULT_POLICY)).toBe("MEDIUM");
    expect(severityFromScore(69, PROPOSED_DEFAULT_POLICY)).toBe("MEDIUM");
    expect(severityFromScore(70, PROPOSED_DEFAULT_POLICY)).toBe("HIGH");
    expect(severityFromScore(100, PROPOSED_DEFAULT_POLICY)).toBe("HIGH");
    expect(scoreFromWeights([70, 40])).toBe(100);
  });
});

describe("evaluateRisk", () => {
  it("does not invent a score when nothing fires", () => {
    const result = evaluateRisk(
      facts({ expiresOn: "2028-01-01", governingLaw: "Delaware" }),
      [
        rule({
          code: "EXPIRY_URGENT",
          category: "EXPIRY_URGENCY",
          severity: "HIGH",
          weight: 25,
          predicate: { type: "EXPIRY_DAYS_LTE", policyKey: "expiryUrgentDays" },
        }),
      ],
      PROPOSED_DEFAULT_POLICY,
    );
    expect(result.score).toBe(0);
    expect(result.overallSeverity).toBe("LOW");
    expect(result.findings).toEqual([]);
    expect(result.findings.every((row) => row.aiExplanation === null)).toBe(true);
  });

  it("fires expiry urgency on the inclusive urgent boundary and not the day after", () => {
    const urgentRule = rule({
      code: "EXPIRY_URGENT",
      category: "EXPIRY_URGENCY",
      severity: "HIGH",
      weight: 25,
      predicate: { type: "EXPIRY_DAYS_LTE", policyKey: "expiryUrgentDays" },
      explanationTemplate: "{days} days to {expiresOn}",
    });
    const onBoundary = evaluateRisk(
      facts({ expiresOn: "2026-11-26" }),
      [urgentRule],
      PROPOSED_DEFAULT_POLICY,
    );
    expect(daysUntil("2026-11-26", asOf)).toBe(30);
    expect(onBoundary.findings).toHaveLength(1);
    expect(onBoundary.score).toBe(25);
    const after = evaluateRisk(
      facts({ expiresOn: "2026-11-27" }),
      [urgentRule],
      PROPOSED_DEFAULT_POLICY,
    );
    expect(after.findings).toHaveLength(0);
  });

  it("does not double-count warn and urgent windows", () => {
    const rules: EvaluableRule[] = [
      rule({
        code: "EXPIRY_URGENT",
        category: "EXPIRY_URGENCY",
        severity: "HIGH",
        weight: 25,
        predicate: { type: "EXPIRY_DAYS_LTE", policyKey: "expiryUrgentDays" },
      }),
      rule({
        code: "EXPIRY_WARN",
        category: "EXPIRY_URGENCY",
        severity: "MEDIUM",
        weight: 10,
        predicate: {
          type: "EXPIRY_DAYS_LTE",
          policyKey: "expiryWarnDays",
          abovePolicyKey: "expiryUrgentDays",
        },
      }),
    ];
    const urgent = evaluateRisk(facts({ expiresOn: "2026-11-10" }), rules, PROPOSED_DEFAULT_POLICY);
    expect(urgent.findings.map((row) => row.ruleCode)).toEqual(["EXPIRY_URGENT"]);
    const warn = evaluateRisk(facts({ expiresOn: "2026-12-31" }), rules, PROPOSED_DEFAULT_POLICY);
    expect(warn.findings.map((row) => row.ruleCode)).toEqual(["EXPIRY_WARN"]);
  });

  it("skips text predicates when there is no source text", () => {
    const result = evaluateRisk(
      facts({ sourceText: "" }),
      [
        rule({
          code: "INDEMNIFICATION",
          category: "INDEMNIFICATION",
          severity: "HIGH",
          weight: 15,
          predicate: { type: "TEXT_MISSING_ANY", needles: ["indemnif"] },
        }),
      ],
      PROPOSED_DEFAULT_POLICY,
    );
    expect(result.findings).toEqual([]);
  });

  it("flags missing indemnification only from source text, not from an AI guess", () => {
    const missing = evaluateRisk(
      facts({ sourceText: "This agreement has a term and fees. Payment is net 30." }),
      [
        rule({
          code: "INDEMNIFICATION",
          category: "INDEMNIFICATION",
          severity: "HIGH",
          weight: 15,
          predicate: { type: "TEXT_MISSING_ANY", needles: ["indemnif", "hold harmless"] },
        }),
      ],
      PROPOSED_DEFAULT_POLICY,
    );
    expect(missing.findings).toHaveLength(1);
    expect(missing.findings[0]?.aiExplanation).toBeNull();
    const present = evaluateRisk(
      facts({ sourceText: "Supplier shall indemnify Customer against third-party claims." }),
      [
        rule({
          code: "INDEMNIFICATION",
          category: "INDEMNIFICATION",
          severity: "HIGH",
          weight: 15,
          predicate: { type: "TEXT_MISSING_ANY", needles: ["indemnif", "hold harmless"] },
        }),
      ],
      PROPOSED_DEFAULT_POLICY,
    );
    expect(present.findings).toEqual([]);
  });

  it("flags auto-renew when notice is below the proposed minimum, not at the boundary", () => {
    const auto = rule({
      code: "AUTO_RENEW",
      category: "AUTO_RENEWAL",
      severity: "MEDIUM",
      weight: 15,
      predicate: { type: "AUTO_RENEW_NOTICE_LT", policyKey: "autoRenewNoticeDaysMin" },
      explanationTemplate: "notice {notice} minimum {minimum}",
    });
    expect(parseNoticeDays("unless either party gives 60 days' written notice")).toBe(60);
    const ok = evaluateRisk(
      facts({
        sourceText:
          "This Agreement automatically renews unless either party gives 60 days' written notice.",
      }),
      [auto],
      PROPOSED_DEFAULT_POLICY,
    );
    expect(ok.findings).toHaveLength(0);
    const short = evaluateRisk(
      facts({
        sourceText:
          "This Agreement automatically renews unless either party gives 30 days' written notice.",
      }),
      [auto],
      PROPOSED_DEFAULT_POLICY,
    );
    expect(short.findings).toHaveLength(1);
    expect(short.findings[0]?.contractText).toMatch(/automatically renews/i);
  });

  it("ignores disabled rules", () => {
    const result = evaluateRisk(
      facts({ governingLaw: null }),
      [
        rule({
          code: "GOVERNING_LAW",
          category: "GOVERNING_LAW",
          status: "DISABLED",
          predicate: { type: "MISSING_FIELD", field: "GOVERNING_LAW" },
        }),
      ],
      PROPOSED_DEFAULT_POLICY,
    );
    expect(result.findings).toEqual([]);
  });

  it("uses organization thresholds instead of proposed defaults when provided", () => {
    const policy = parsePolicy({
      ...PROPOSED_DEFAULT_POLICY,
      mediumMin: 50,
      highMin: 80,
      source: "organization",
    });
    expect(severityFromScore(40, policy)).toBe("LOW");
    expect(severityFromScore(50, policy)).toBe("MEDIUM");
    expect(severityFromScore(80, policy)).toBe("HIGH");
  });

  it("parses every proposed default rule", () => {
    const result = evaluateRisk(
      facts({ governingLaw: null, expiresOn: "2028-01-01" }),
      [],
      PROPOSED_DEFAULT_POLICY,
    );
    expect(result.engineVersion).toBe("accordiq-risk-v1");
    expect(PROPOSED_DEFAULT_RULES).toHaveLength(12);
    expect(new Set(PROPOSED_DEFAULT_RULES.map((row) => row.category)).size).toBe(10);
  });
});
