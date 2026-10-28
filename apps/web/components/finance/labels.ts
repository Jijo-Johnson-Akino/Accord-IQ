import type { BadgeTone } from "@accordiq/ui";
import {
  ESCALATION_SOURCES,
  FINANCIAL_SOURCES,
  FINANCE_STATUS_GROUPS,
  MILESTONE_STATUSES,
  SAVINGS_KINDS,
  SAVINGS_STATUSES,
} from "@accordiq/clm/enums";

export const MILESTONE_STATUS_LABELS: Record<(typeof MILESTONE_STATUSES)[number], string> = {
  PLANNED: "Planned",
  DUE: "Due",
  PAID: "Paid",
  WAIVED: "Waived",
  CANCELLED: "Cancelled",
};

export const SOURCE_LABELS: Record<(typeof FINANCIAL_SOURCES)[number], string> = {
  CONTRACT_STATED: "Contract-stated",
  IMPORTED: "Imported",
};

export const ESCALATION_SOURCE_LABELS: Record<(typeof ESCALATION_SOURCES)[number], string> = {
  CONTRACT_CLAUSE: "Contract clause",
  ESTIMATE: "Estimate",
};

export const SAVINGS_STATUS_LABELS: Record<(typeof SAVINGS_STATUSES)[number], string> = {
  ESTIMATE: "Estimate",
  VERIFIED: "Verified",
  DISMISSED: "Dismissed",
};

export const SAVINGS_KIND_LABELS: Record<(typeof SAVINGS_KINDS)[number], string> = {
  PRICE_REDUCTION: "Price reduction",
  VOLUME: "Volume",
  TERM: "Term",
  AUTO_RENEW_REVIEW: "Auto-renew review",
  OTHER: "Other",
};

export const STATUS_GROUP_LABELS: Record<(typeof FINANCE_STATUS_GROUPS)[number], string> = {
  all: "All statuses",
  committed: "Committed",
  pipeline: "Pipeline",
  closed: "Closed",
};

export const MILESTONE_STATUS_OPTIONS = MILESTONE_STATUSES;
export const SOURCE_OPTIONS = FINANCIAL_SOURCES;
export const ESCALATION_SOURCE_OPTIONS = ESCALATION_SOURCES;
export const SAVINGS_KIND_OPTIONS = SAVINGS_KINDS;
export const STATUS_GROUP_OPTIONS = FINANCE_STATUS_GROUPS;

export function savingsTone(status: string): BadgeTone {
  if (status === "VERIFIED") return "success";
  if (status === "DISMISSED") return "neutral";
  return "warning";
}

export function sourceTone(source: string): BadgeTone {
  return source === "IMPORTED" || source === "ESTIMATE" ? "warning" : "info";
}
