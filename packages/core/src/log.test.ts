import { afterEach, describe, expect, it, vi } from "vitest";
import { logInternalError, sanitizeLogText } from "./log";

describe("sanitizeLogText", () => {
  it("redacts bearer tokens and provider-looking keys", () => {
    const text = sanitizeLogText(
      "Failed Bearer sk-live-not-for-logs and re_abc12345whsec extra whsec_live_secret_value",
    );
    expect(text).not.toContain("sk-live-not-for-logs");
    expect(text).not.toContain("Bearer sk-");
    expect(text).toContain("[redacted]");
  });
});

describe("logInternalError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not print stacks or secret-looking values", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("upstream Bearer sk-live-not-for-logs failed");
    error.stack = "Error: secret stack\n    at leak.js:1:1";
    logInternalError(error);
    const printed = spy.mock.calls.map((call) => call.map(String).join(" ")).join(" ");
    expect(printed).toContain("[accordiq]");
    expect(printed).not.toContain("sk-live-not-for-logs");
    expect(printed).not.toContain("secret stack");
    expect(printed).not.toContain("leak.js");
  });
});
