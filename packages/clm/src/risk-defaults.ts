import type { EvaluableRule } from "./risk-engine";

type CatalogRule = Omit<EvaluableRule, "id" | "status" | "versionNumber">;

/** Proposed default rule catalog. Weights are starting points, not an official scale. */
export const PROPOSED_DEFAULT_RULES: CatalogRule[] = [
  {
    code: "DATA_PROTECTION",
    name: "Data protection language",
    category: "DATA_PROTECTION",
    severity: "MEDIUM",
    weight: 15,
    predicate: {
      type: "TEXT_MISSING_ANY",
      needles: ["data protection", "personal data", "gdpr", "ccpa"],
    },
    explanationTemplate: "No data-protection language ({needles}) was found in the source text.",
    remediation:
      "Add processing, security, and breach-notice terms, or record why they do not apply.",
  },
  {
    code: "LIABILITY_CAP",
    name: "Limitation of liability",
    category: "LIABILITY",
    severity: "HIGH",
    weight: 20,
    predicate: {
      type: "TEXT_MISSING_ANY",
      needles: ["limitation of liability", "liability shall not exceed", "aggregate liability"],
    },
    explanationTemplate: "No liability cap language ({needles}) was found in the source text.",
    remediation: "Negotiate a cap and carve-outs, then record the agreed ceiling on the contract.",
  },
  {
    code: "INDEMNIFICATION",
    name: "Indemnification",
    category: "INDEMNIFICATION",
    severity: "HIGH",
    weight: 15,
    predicate: {
      type: "TEXT_MISSING_ANY",
      needles: ["indemnif", "hold harmless"],
    },
    explanationTemplate: "No indemnification language ({needles}) was found in the source text.",
    remediation: "Add an indemnity that matches the playbook, or document an accepted exception.",
  },
  {
    code: "CONFIDENTIALITY",
    name: "Confidentiality",
    category: "CONFIDENTIALITY",
    severity: "MEDIUM",
    weight: 10,
    predicate: {
      type: "TEXT_MISSING_ANY",
      needles: ["confidential"],
    },
    explanationTemplate: "No confidentiality language was found in the source text.",
    remediation: "Insert the approved confidentiality clause or link an NDA.",
  },
  {
    code: "GOVERNING_LAW",
    name: "Governing law",
    category: "GOVERNING_LAW",
    severity: "MEDIUM",
    weight: 15,
    predicate: { type: "MISSING_FIELD", field: "GOVERNING_LAW" },
    explanationTemplate: "Governing law is not recorded on the contract.",
    remediation: "Record the governing law from the executed document, or flag the gap for legal.",
  },
  {
    code: "DISPUTE_RESOLUTION",
    name: "Dispute resolution",
    category: "DISPUTE_RESOLUTION",
    severity: "LOW",
    weight: 10,
    predicate: {
      type: "TEXT_MISSING_ANY",
      needles: ["arbitration", "jurisdiction", "venue", "dispute resolution"],
    },
    explanationTemplate: "No dispute-resolution language ({needles}) was found in the source text.",
    remediation: "Specify venue, forum, or arbitration using an approved clause.",
  },
  {
    code: "FORCE_MAJEURE",
    name: "Force majeure",
    category: "FORCE_MAJEURE",
    severity: "LOW",
    weight: 5,
    predicate: {
      type: "TEXT_MISSING_ANY",
      needles: ["force majeure", "act of god"],
    },
    explanationTemplate: "No force majeure language was found in the source text.",
    remediation: "Add the approved force majeure clause if the playbook requires it.",
  },
  {
    code: "COMPLIANCE",
    name: "Compliance requirements",
    category: "COMPLIANCE",
    severity: "MEDIUM",
    weight: 10,
    predicate: {
      type: "TEXT_MISSING_ANY",
      needles: ["anti-bribery", "sanctions", "applicable law"],
    },
    explanationTemplate: "No compliance language ({needles}) was found in the source text.",
    remediation: "Add anti-bribery, sanctions, or applicable-law terms from the clause library.",
  },
  {
    code: "AUTO_RENEW",
    name: "Automatic renewal notice",
    category: "AUTO_RENEWAL",
    severity: "MEDIUM",
    weight: 15,
    predicate: { type: "AUTO_RENEW_NOTICE_LT", policyKey: "autoRenewNoticeDaysMin" },
    explanationTemplate:
      "The contract auto-renews and the notice period is {notice} days (proposed minimum {minimum}).",
    remediation: "Increase the opt-out notice period, or disable automatic renewal.",
  },
  {
    code: "EXPIRY_URGENT",
    name: "Expiry urgency",
    category: "EXPIRY_URGENCY",
    severity: "HIGH",
    weight: 25,
    predicate: { type: "EXPIRY_DAYS_LTE", policyKey: "expiryUrgentDays" },
    explanationTemplate:
      "The contract expires on {expiresOn} ({days} days from the assessment date).",
    remediation: "Start renewal or termination in time for the proposed urgent window.",
  },
  {
    code: "EXPIRY_WARN",
    name: "Upcoming expiry",
    category: "EXPIRY_URGENCY",
    severity: "MEDIUM",
    weight: 10,
    predicate: {
      type: "EXPIRY_DAYS_LTE",
      policyKey: "expiryWarnDays",
      abovePolicyKey: "expiryUrgentDays",
    },
    explanationTemplate:
      "The contract expires on {expiresOn} ({days} days from the assessment date).",
    remediation: "Put a renewal owner on the calendar before the urgent window.",
  },
  {
    code: "TERM_LENGTH",
    name: "Unusual term length",
    category: "COMPLIANCE",
    severity: "MEDIUM",
    weight: 10,
    predicate: { type: "TERM_DAYS_GT", policyKey: "maxTermDays" },
    explanationTemplate: "The stated term is {days} days, above the proposed maximum.",
    remediation: "Confirm the term is intentional, or renegotiate a shorter period.",
  },
];
