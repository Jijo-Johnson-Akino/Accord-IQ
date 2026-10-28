import { describe, expect, it } from "vitest";
import { DEV_AUTH_SECRET, loadConfig } from "./config";
import { AppError, isAppError, toErrorPayload } from "./errors";

describe("loadConfig", () => {
  it("applies safe defaults for an empty environment", () => {
    const config = loadConfig({});
    expect(config.NODE_ENV).toBe("development");
    expect(config.APP_URL).toBe("http://localhost:3000");
    expect(config.STORAGE_DRIVER).toBe("local");
    expect(config.LLM_PROVIDER).toBe("none");
    expect(config.ESIGN_PROVIDER).toBe("none");
    expect(config.DATABASE_URL).toBe("file:.data/accordiq.sqlite");
    expect(config.EMAIL_DRIVER).toBe("console");
    expect(config.AUTH_SECRET).toBe(DEV_AUTH_SECRET);
  });

  it("rejects an invalid APP_URL", () => {
    expect(() => loadConfig({ APP_URL: "not-a-url" })).toThrow(/APP_URL/);
  });

  it("requires an API key for live LLM providers, not for fixture", () => {
    expect(() => loadConfig({ LLM_PROVIDER: "openai" })).toThrow(/LLM_API_KEY/);
    expect(loadConfig({ LLM_PROVIDER: "openai", LLM_API_KEY: "placeholder" }).LLM_PROVIDER).toBe(
      "openai",
    );
    expect(loadConfig({ LLM_PROVIDER: "fixture" }).LLM_PROVIDER).toBe("fixture");
  });

  it("requires a webhook secret for sandbox and an API key for Dropbox Sign", () => {
    expect(() => loadConfig({ ESIGN_PROVIDER: "sandbox" })).toThrow(/ESIGN_WEBHOOK_SECRET/);
    expect(() => loadConfig({ ESIGN_PROVIDER: "dropbox_sign" })).toThrow(/ESIGN_API_KEY/);
    expect(
      loadConfig({
        ESIGN_PROVIDER: "sandbox",
        ESIGN_WEBHOOK_SECRET: "local-webhook-secret",
      }).ESIGN_PROVIDER,
    ).toBe("sandbox");
  });

  it("forbids the synthetic fixture provider in production", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        AUTH_SECRET: "p".repeat(32),
        EMAIL_DRIVER: "resend",
        RESEND_API_KEY: "placeholder",
        LLM_PROVIDER: "fixture",
      }),
    ).toThrow(/LLM_PROVIDER/);
  });

  it("forbids the sandbox e-signature provider in production", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        AUTH_SECRET: "p".repeat(32),
        EMAIL_DRIVER: "resend",
        RESEND_API_KEY: "placeholder",
        ESIGN_PROVIDER: "sandbox",
        ESIGN_WEBHOOK_SECRET: "local-webhook-secret",
      }),
    ).toThrow(/ESIGN_PROVIDER/);
  });

  it("requires AUTH_SECRET in production and rejects the development placeholder", () => {
    expect(() => loadConfig({ NODE_ENV: "production", EMAIL_DRIVER: "resend" })).toThrow(
      /AUTH_SECRET/,
    );
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        AUTH_SECRET: DEV_AUTH_SECRET,
        EMAIL_DRIVER: "resend",
        RESEND_API_KEY: "placeholder",
      }),
    ).toThrow(/AUTH_SECRET/);
  });

  it("forbids the console mailer in production", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        AUTH_SECRET: "p".repeat(32),
        EMAIL_DRIVER: "console",
      }),
    ).toThrow(/EMAIL_DRIVER/);
  });

  it("allows a production compile without runtime mailer secrets", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      NEXT_PHASE: "phase-production-build",
    });
    expect(config.AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(config.AUTH_SECRET).not.toBe(DEV_AUTH_SECRET);
  });

  it("refuses SQLite in production runtime", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        AUTH_SECRET: "p".repeat(32),
        EMAIL_DRIVER: "resend",
        RESEND_API_KEY: "placeholder",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("refuses S3 until that driver is wired", () => {
    expect(() => loadConfig({ STORAGE_DRIVER: "s3" })).toThrow(/STORAGE_DRIVER/);
  });

  it("refuses PostgreSQL URLs until that driver is wired and does not echo the URL", () => {
    expect(() => loadConfig({ DATABASE_URL: "postgres://localhost/accordiq" })).toThrow(
      /DATABASE_URL/,
    );
    let message = "";
    try {
      loadConfig({ DATABASE_URL: "postgresql://user:hunter2@localhost/accordiq" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("postgresql://");
  });

  it("does not leak values in validation errors", () => {
    let message = "";
    try {
      loadConfig({ STORAGE_DRIVER: "super-secret-value" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/STORAGE_DRIVER/);
    expect(message).not.toContain("super-secret-value");
  });
});

describe("AppError", () => {
  it("maps codes to HTTP statuses", () => {
    const error = new AppError("FORBIDDEN", "nope");
    expect(error.status).toBe(403);
    expect(isAppError(error)).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
  });

  it("recognizes AppError instances from another copy of the module", () => {
    const foreign = new Error("You do not have permission to do that.");
    foreign.name = "AppError";
    Object.assign(foreign, { code: "FORBIDDEN", status: 403 });
    expect(isAppError(foreign)).toBe(true);
    expect(toErrorPayload(foreign)).toEqual({
      error: "You do not have permission to do that.",
      code: "FORBIDDEN",
      status: 403,
    });
  });
});

describe("toErrorPayload", () => {
  it("hides unexpected errors", () => {
    const payload = toErrorPayload(new Error("secret stack"));
    expect(payload).toEqual({ error: "Something went wrong.", code: "INTERNAL", status: 500 });
  });
});
