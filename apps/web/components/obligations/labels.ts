import type { BadgeTone } from "@accordiq/ui";
import {
  OBLIGATION_FREQUENCIES,
  OBLIGATION_PRIORITIES,
  OBLIGATION_STATUSES,
  RENEWAL_DECISIONS,
  RENEWAL_WATCH_STATUSES,
} from "@accordiq/clm/enums";

export const OBLIGATION_STATUS_LABELS: Record<(typeof OBLIGATION_STATUSES)[number], string> = {
  OPEN: "Open",
  DONE: "Done",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

export const PRIORITY_LABELS: Record<(typeof OBLIGATION_PRIORITIES)[number], string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export const FREQUENCY_LABELS: Record<(typeof OBLIGATION_FREQUENCIES)[number], string> = {
  ONCE: "Once",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

export const RENEWAL_STATUS_LABELS: Record<(typeof RENEWAL_WATCH_STATUSES)[number], string> = {
  WATCHING: "Watching",
  NOTICE_DUE: "Notice due",
  DECISION_PENDING: "Decision pending",
  RENEWED: "Renewed",
  TERMINATED: "Terminated",
  LAPSED: "Lapsed",
  CANCELLED: "Cancelled",
};

export const RENEWAL_DECISION_LABELS: Record<(typeof RENEWAL_DECISIONS)[number], string> = {
  RENEW: "Renew",
  TERMINATE: "Terminate",
};

export const OBLIGATION_STATUS_OPTIONS = OBLIGATION_STATUSES;
export const PRIORITY_OPTIONS = OBLIGATION_PRIORITIES;
export const FREQUENCY_OPTIONS = OBLIGATION_FREQUENCIES;
export const RENEWAL_STATUS_OPTIONS = RENEWAL_WATCH_STATUSES;
export const RENEWAL_DECISION_OPTIONS = RENEWAL_DECISIONS;

export function obligationTone(status: string): BadgeTone {
  if (status === "DONE") return "success";
  if (status === "OVERDUE") return "error";
  if (status === "CANCELLED") return "neutral";
  return "info";
}

export function priorityTone(priority: string): BadgeTone {
  if (priority === "HIGH") return "error";
  if (priority === "LOW") return "neutral";
  return "warning";
}

export function renewalTone(status: string): BadgeTone {
  if (status === "TERMINATED" || status === "CANCELLED") return "neutral";
  if (status === "LAPSED") return "error";
  if (status === "NOTICE_DUE" || status === "DECISION_PENDING") return "warning";
  if (status === "RENEWED") return "success";
  return "info";
}

export const TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;
