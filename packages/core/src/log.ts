/** Patterns that must never appear in process logs. */
const SECRETISH =
  /Bearer\s+\S+|sk-[A-Za-z0-9_-]{8,}|re_[A-Za-z0-9_-]{8,}|whsec_[A-Za-z0-9_-]{8,}/gi;

/** Truncate and redact tokens. Safe to print. Never include stacks or request bodies. */
export function sanitizeLogText(message: string): string {
  return message.replace(SECRETISH, "[redacted]").replace(/\s+/g, " ").trim().slice(0, 400);
}

/**
 * Production-safe internal error log. Callers must not pass document text, API keys, or cookies.
 * The sanitizer is a backstop, not a license to log secrets.
 */
export function logInternalError(error: unknown): void {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
  console.error("[accordiq]", sanitizeLogText(raw));
}
