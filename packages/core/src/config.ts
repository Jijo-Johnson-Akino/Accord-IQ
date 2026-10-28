import { z } from "zod";

/** Obvious development placeholder. Production refuses this value. */
export const DEV_AUTH_SECRET = "dev-only-insecure-secret-not-for-production-use";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("file:.data/accordiq.sqlite"),
  AUTH_SECRET: z.string().min(32).optional(),
  EMAIL_DRIVER: z.enum(["console", "resend"]).default("console"),
  EMAIL_FROM: z.string().min(3).default("AccordIQ <noreply@localhost>"),
  RESEND_API_KEY: z.string().min(1).optional(),
  AUTH_SEED_PASSWORD: z.string().min(10).optional(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().min(1).default(".data/uploads"),
  LLM_PROVIDER: z.enum(["none", "fixture", "openai", "anthropic"]).default("none"),
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().trim().min(1).max(80).optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
  ESIGN_PROVIDER: z.enum(["none", "sandbox", "dropbox_sign"]).default("none"),
  ESIGN_API_KEY: z.string().min(1).optional(),
  ESIGN_WEBHOOK_SECRET: z.string().min(16).optional(),
  ESIGN_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  ESIGN_TEST_MODE: z.enum(["true", "false"]).default("true"),
});

export type AppConfig = z.infer<typeof envSchema> & { AUTH_SECRET: string };

/**
 * Parse and validate environment variables. Fails fast with a readable message that lists
 * the offending variable names but never echoes their values (they may be secrets).
 */
const BUILD_AUTH_SECRET = "production-build-placeholder-not-for-runtime-use";

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const compiling = env.NEXT_PHASE === "phase-production-build";
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration — ${problems}`);
  }
  const parsed = result.data;
  const liveLlm = parsed.LLM_PROVIDER === "openai" || parsed.LLM_PROVIDER === "anthropic";
  if (liveLlm && !parsed.LLM_API_KEY && !compiling) {
    throw new Error(
      "Invalid environment configuration — LLM_API_KEY: required when LLM_PROVIDER is openai or anthropic",
    );
  }

  const production = parsed.NODE_ENV === "production";
  let authSecret = parsed.AUTH_SECRET;
  if (production && !compiling) {
    if (!authSecret) {
      throw new Error("Invalid environment configuration — AUTH_SECRET: required in production");
    }
    if (authSecret === DEV_AUTH_SECRET) {
      throw new Error(
        "Invalid environment configuration — AUTH_SECRET: development placeholder is not allowed in production",
      );
    }
    if (parsed.EMAIL_DRIVER === "console") {
      throw new Error(
        "Invalid environment configuration — EMAIL_DRIVER: console is not allowed in production",
      );
    }
    if (parsed.LLM_PROVIDER === "fixture") {
      throw new Error(
        "Invalid environment configuration — LLM_PROVIDER: fixture is not allowed in production",
      );
    }
    if (parsed.ESIGN_PROVIDER === "sandbox") {
      throw new Error(
        "Invalid environment configuration — ESIGN_PROVIDER: sandbox is not allowed in production",
      );
    }
  } else if (!authSecret) {
    authSecret = compiling ? BUILD_AUTH_SECRET : DEV_AUTH_SECRET;
  }

  if (/^postgres(ql)?:/i.test(parsed.DATABASE_URL)) {
    throw new Error(
      "Invalid environment configuration — DATABASE_URL: PostgreSQL is the production target but is not wired in this release. Use a SQLite file URL locally.",
    );
  }

  if (!compiling && parsed.STORAGE_DRIVER === "s3") {
    throw new Error(
      "Invalid environment configuration — STORAGE_DRIVER: S3 is not wired in this release. Use local disk in development.",
    );
  }

  if (production && !compiling) {
    if (parsed.DATABASE_URL.startsWith("file:") || parsed.DATABASE_URL === ":memory:") {
      throw new Error(
        "Invalid environment configuration — DATABASE_URL: SQLite is not allowed in production. PostgreSQL is the target but is not wired in this release.",
      );
    }
    if (parsed.STORAGE_DRIVER === "local") {
      throw new Error(
        "Invalid environment configuration — STORAGE_DRIVER: local disk is not allowed in production. S3 is not wired in this release.",
      );
    }
  }

  if (parsed.EMAIL_DRIVER === "resend" && !parsed.RESEND_API_KEY) {
    throw new Error(
      "Invalid environment configuration — RESEND_API_KEY: required when EMAIL_DRIVER is resend",
    );
  }

  const liveEsign = parsed.ESIGN_PROVIDER === "dropbox_sign";
  if (liveEsign && !parsed.ESIGN_API_KEY && !compiling) {
    throw new Error(
      "Invalid environment configuration — ESIGN_API_KEY: required when ESIGN_PROVIDER is dropbox_sign",
    );
  }
  if (
    (parsed.ESIGN_PROVIDER === "sandbox" || liveEsign) &&
    !parsed.ESIGN_WEBHOOK_SECRET &&
    !compiling
  ) {
    throw new Error(
      "Invalid environment configuration — ESIGN_WEBHOOK_SECRET: required when ESIGN_PROVIDER is sandbox or dropbox_sign",
    );
  }

  return { ...parsed, AUTH_SECRET: authSecret };
}
