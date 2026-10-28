import type { BadgeTone } from "@accordiq/ui";
import {
  CLAUSE_CATEGORIES,
  CLAUSE_TEMPLATE_STATUSES,
  FINDING_REVIEW_STATUSES,
  RISK_CATEGORIES,
  SEVERITIES,
} from "@accordiq/clm/enums";

export const RISK_CATEGORY_LABELS: Record<(typeof RISK_CATEGORIES)[number], string> = {
  DATA_PROTECTION: "Data protection",
  LIABILITY: "Liability limits",
  INDEMNIFICATION: "Indemnification",
  CONFIDENTIALITY: "Confidentiality",
  GOVERNING_LAW: "Governing law",
  DISPUTE_RESOLUTION: "Dispute resolution",
  FORCE_MAJEURE: "Force majeure",
  COMPLIANCE: "Compliance requirements",
  AUTO_RENEWAL: "Automatic renewal",
  EXPIRY_URGENCY: "Expiry urgency",
};

export const CLAUSE_CATEGORY_LABELS: Record<(typeof CLAUSE_CATEGORIES)[number], string> = {
  ...RISK_CATEGORY_LABELS,
  PAYMENT: "Payment",
  TERM: "Term",
  IP: "Intellectual property",
  TERMINATION: "Termination",
  OTHER: "Other",
};

export const CLAUSE_STATUS_LABELS: Record<(typeof CLAUSE_TEMPLATE_STATUSES)[number], string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  DEPRECATED: "Deprecated",
};

export const REVIEW_LABELS: Record<(typeof FINDING_REVIEW_STATUSES)[number], string> = {
  OPEN: "Open",
  RESOLVED: "Resolved",
  DISMISSED: "Dismissed",
};

export function severityTone(severity: string): BadgeTone {
  if (severity === "HIGH") return "error";
  if (severity === "MEDIUM") return "warning";
  return "info";
}

export function clauseStatusTone(status: string): BadgeTone {
  if (status === "APPROVED") return "success";
  if (status === "DEPRECATED") return "neutral";
  return "warning";
}

export function reviewTone(status: string): BadgeTone {
  if (status === "RESOLVED") return "success";
  if (status === "DISMISSED") return "neutral";
  return "warning";
}

export const CLAUSE_CATEGORY_OPTIONS = CLAUSE_CATEGORIES;
export const CLAUSE_STATUS_OPTIONS = CLAUSE_TEMPLATE_STATUSES;
export const SEVERITY_OPTIONS = SEVERITIES;
