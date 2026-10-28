import { AppError } from "@accordiq/core";

const SAFE_NAME = /[^\w.\- ()]/g;

/** Path-safe file name. Strips directories and characters that are not safe to store. */
export function sanitizeFileName(name: string): string {
  const base = name.replaceAll("\\", "/").split("/").pop()?.trim() || "document";
  const cleaned = base.replace(SAFE_NAME, "_").replace(/^\.+/u, "").slice(0, 180);
  return cleaned || "document";
}

export function buildStorageKey(
  organizationId: string,
  documentId: string,
  fileName: string,
): string {
  const org = sanitizeFileName(organizationId);
  const doc = sanitizeFileName(documentId);
  const file = sanitizeFileName(fileName);
  return `${org}/${doc}/${file}`;
}

/** Reject keys that try to escape the storage root. */
export function assertSafeStorageKey(storageKey: string): string {
  const trimmed = storageKey.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.startsWith("/") || trimmed.includes("\\")) {
    throw new AppError("VALIDATION", "Invalid storage key.");
  }
  const parts = trimmed.split("/");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new AppError("VALIDATION", "Invalid storage key.");
  }
  return trimmed;
}
