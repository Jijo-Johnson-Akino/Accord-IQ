import type { BadgeTone } from "@accordiq/ui";
import {
  APPROVAL_STATUSES,
  CONTRACT_CATEGORIES,
  CONTRACT_DEPARTMENTS,
  DECISIONS,
  SEVERITIES,
  STAGE_STATUSES,
} from "@accordiq/clm/enums";

const ORG_ROLES = [
  "ORGANIZATION_ADMIN",
  "LEGAL",
  "FINANCE",
  "PROCUREMENT",
  "DEPARTMENT_MANAGER",
  "VIEWER",
] as const;

export const ROLE_LABELS: Record<(typeof ORG_ROLES)[number], string> = {
  ORGANIZATION_ADMIN: "Organization admin",
  LEGAL: "Legal",
  FINANCE: "Finance",
  PROCUREMENT: "Procurement",
  DEPARTMENT_MANAGER: "Department manager",
  VIEWER: "Viewer",
};

export const APPROVAL_STATUS_LABELS: Record<(typeof APPROVAL_STATUSES)[number], string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CHANGES_REQUESTED: "Changes requested",
  CANCELLED: "Cancelled",
};

export const STAGE_STATUS_LABELS: Record<(typeof STAGE_STATUSES)[number], string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SKIPPED: "Skipped",
  CHANGES_REQUESTED: "Changes requested",
};

export const DECISION_LABELS: Record<(typeof DECISIONS)[number], string> = {
  APPROVED: "Approve",
  REJECTED: "Reject",
  CHANGES_REQUESTED: "Request changes",
};

export const EVENT_LABELS: Record<string, string> = {
  START: "Started",
  DECIDE: "Decision",
  COMMENT: "Comment",
  DELEGATE: "Delegated",
  RESUBMIT: "Resubmitted",
  INVALIDATE: "Invalidated",
  SKIP: "Skipped",
  ESCALATE: "Escalated",
  REMIND: "Reminder",
};

export function approvalTone(status: string): BadgeTone {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "error";
  if (status === "CHANGES_REQUESTED") return "warning";
  if (status === "IN_PROGRESS" || status === "PENDING") return "info";
  return "neutral";
}

export function formatWhen(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export const ROLE_OPTIONS = ORG_ROLES.filter((role) => role !== "VIEWER");
export const CATEGORY_OPTIONS = CONTRACT_CATEGORIES;
export const DEPARTMENT_OPTIONS = CONTRACT_DEPARTMENTS;
export const SEVERITY_OPTIONS = SEVERITIES;
export const APPROVAL_STATUS_OPTIONS = APPROVAL_STATUSES;
