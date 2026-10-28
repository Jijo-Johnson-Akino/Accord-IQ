/** Backoff after the 1st, 2nd, 3rd, then 4th+ failed attempt. */
export const BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000] as const;

export const DEFAULT_MAX_ATTEMPTS = 5;

export function nextRetryAt(attemptsAfterFailure: number, now: Date): Date {
  const index = Math.min(Math.max(attemptsAfterFailure, 1) - 1, BACKOFF_MS.length - 1);
  return new Date(now.getTime() + BACKOFF_MS[index]!);
}

export function shouldRetry(attempts: number, maxAttempts: number): boolean {
  return attempts < maxAttempts;
}

export function sanitizeLogText(message: string, secrets: readonly string[] = []): string {
  let out = message.replace(/\s+/g, " ").trim().slice(0, 300);
  for (const secret of secrets) {
    if (secret.length >= 8) {
      out = out.split(secret).join("[redacted]");
    }
  }
  return out.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}
