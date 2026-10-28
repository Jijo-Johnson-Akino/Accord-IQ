const AUTH_PREFIXES = ["/login", "/signup", "/forgot-password", "/reset-password"];

/**
 * Only same-origin relative paths. Rejects protocol-relative URLs and auth routes so a crafted
 * `next` query cannot bounce users off-site or into a login loop.
 */
export function safeNextPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.includes("://")) return fallback;
  if (AUTH_PREFIXES.some((prefix) => value === prefix || value.startsWith(`${prefix}?`))) {
    return fallback;
  }
  return value;
}
