import { describe, expect, it } from "vitest";
import { nextRetryAt, sanitizeLogText, shouldRetry } from "./retry";

describe("delivery retry", () => {
  it("backs off after each failed attempt", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(nextRetryAt(1, now).toISOString()).toBe("2026-01-01T00:01:00.000Z");
    expect(nextRetryAt(2, now).toISOString()).toBe("2026-01-01T00:05:00.000Z");
    expect(nextRetryAt(3, now).toISOString()).toBe("2026-01-01T00:15:00.000Z");
    expect(shouldRetry(1, 5)).toBe(true);
    expect(shouldRetry(5, 5)).toBe(false);
  });

  it("redacts secrets and bearer tokens from log text", () => {
    const text = sanitizeLogText(
      "Failed Bearer sk-live-not-for-browser with sk-live-not-for-browser",
      ["sk-live-not-for-browser"],
    );
    expect(text).not.toContain("sk-live-not-for-browser");
    expect(text).toContain("[redacted]");
    expect(text).toContain("Bearer [redacted]");
  });
});
