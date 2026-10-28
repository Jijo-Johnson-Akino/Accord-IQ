# ADR 0006: Contract risk engine and clause library

- Status: Accepted (Phase 8)
- Date: 2026-10-27

## Context

Phase 7 stored AI suggestions separately from verified contract facts. Risk scoring must not be
invented by a model, must be testable, and must not present unofficial numbers as a certified
rating. Organizations also need versioned, approved standard clauses that only authorized roles
can change.

## Decision

- Evaluate rules in a pure engine (`packages/clm/src/risk-engine.ts`). Numeric score is
  `SUM_WEIGHTS_CAPPED_100`: the sum of fired rule weights, capped at 100. Overall HIGH/MEDIUM/LOW
  uses organization thresholds. Finding severity is the rule label, not a function of the rollup.
- Ship **proposed defaults** (`highMin` 70, `mediumMin` 40, expiry 30/90 days, auto-renew notice 60
  days, max term 1825 days, and the 12-rule catalog). These are starting points, not an official
  AccordIQ or regulatory scale. Organizations replace them. Invalid or contradictory configs are
  rejected.
- Persist each run as a new `risk_assessment` with `assessment_number`. Do not rewrite historical
  scores. Rule or policy changes mark prior rows `stale` and bump `risk_rule.version_number`.
- Feed the engine contract columns plus **VERIFIED/CORRECTED** extraction fields and source text.
  Suggested AI fields never affect the number. `ai_explanation` is unused by the engine.
- TEXT_* predicates skip when source text is empty so metadata-only contracts do not get false
  positives.
- Reviewers with `risk:review` (LEGAL, ORGANIZATION_ADMIN, SUPERADMIN) resolve or dismiss findings
  with a required note and an audit event. Running an assessment requires `contracts:write`.
- Store approved clause templates with versions, alternatives, deprecation, jurisdiction and
  contract-type metadata, and usage links. `clauses:manage` is required to change standard clauses.
  Approved body text is not edited in place; a new version is approved and the previous current
  version becomes SUPERSEDED.

## Consequences

- Existing databases gain policy, finding, and clause tables via additive `0005_risk_and_clauses`.
  Seed assessments without `engine_version` are labeled as predating the engine.
- Scores are comparable only within an organization that kept the same policy and rule versions.
- Connecting a live LLM still cannot change risk math. Explanations, if added later, stay beside
  the deterministic result.
