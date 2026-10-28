import type { BadgeTone } from "@accordiq/ui";
import {
  CONTRACT_CATEGORIES,
  CONTRACT_DEPARTMENTS,
  CONTRACT_STATUSES,
  CURRENCIES,
  DOCUMENT_STATUSES,
  RELATION_TYPES,
} from "@accordiq/clm/enums";

export const CATEGORY_LABELS: Record<(typeof CONTRACT_CATEGORIES)[number], string> = {
  MSA: "Master services",
  NDA: "Non-disclosure",
  SOW: "Statement of work",
  AMENDMENT: "Amendment",
  RENEWAL: "Renewal",
  LICENSE: "License",
  DPA: "Data processing",
  OTHER: "Other",
};

export const RELATION_LABELS: Record<(typeof RELATION_TYPES)[number], string> = {
  AMENDMENT: "Amendment",
  RENEWAL: "Renewal",
  RELATED: "Related agreement",
  SUPERSEDES: "Supersedes",
};

export const LIFECYCLE_LABELS: Record<(typeof CONTRACT_STATUSES)[number], string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  NEGOTIATION: "Negotiation",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  PENDING_SIGNATURE: "Pending signature",
  SIGNED: "Signed",
  ACTIVE: "Active",
  EXPIRED: "Expired",
  TERMINATED: "Terminated",
};

export const PROCESSING_LABELS: Record<(typeof DOCUMENT_STATUSES)[number], string> = {
  UPLOADING: "Uploading",
  QUEUED: "Queued",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export function processingTone(status: string): BadgeTone {
  if (status === "COMPLETED") return "success";
  if (status === "FAILED") return "error";
  if (status === "PROCESSING" || status === "UPLOADING") return "info";
  return "warning";
}

export const DEPARTMENT_LABELS: Record<(typeof CONTRACT_DEPARTMENTS)[number], string> = {
  LEGAL: "Legal",
  FINANCE: "Finance",
  PROCUREMENT: "Procurement",
  OPERATIONS: "Operations",
  OTHER: "Other",
};

export const CATEGORY_OPTIONS = CONTRACT_CATEGORIES;
export const DEPARTMENT_OPTIONS = CONTRACT_DEPARTMENTS;
export const STATUS_OPTIONS = CONTRACT_STATUSES;
export const CURRENCY_OPTIONS = CURRENCIES;
export const RELATION_OPTIONS = RELATION_TYPES;
export const DOCUMENT_STATUS_OPTIONS = DOCUMENT_STATUSES;

export function formatWhen(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function minorDigits(currency: string | null | undefined): number {
  return currency === "JPY" ? 0 : 2;
}

export function minorToMajorInput(
  valueMinor: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (valueMinor == null) return "";
  const digits = minorDigits(currency);
  return (valueMinor / 10 ** digits).toFixed(digits);
}

export function formatMinorAmount(
  valueMinor: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (valueMinor == null) return "—";
  const code = currency && currency.length === 3 ? currency : "USD";
  const major = valueMinor / 10 ** minorDigits(code);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(major);
  } catch {
    return `${major.toFixed(minorDigits(code))} ${code}`;
  }
}
