import { createAuthHarness } from "@accordiq/auth";
import { createSandboxAdapter } from "@accordiq/esign";
import { createMemoryStorage } from "@accordiq/storage";
import { createClm } from "./access";
import type { ClmOptions } from "./repository";
import { seedClm } from "./seed";

export const TEST_ESIGN_SECRET = "test-webhook-secret-32chars!!";

export function sandboxClmOptions(): Pick<ClmOptions, "esign" | "esignWebhook"> {
  return {
    esign: createSandboxAdapter(),
    esignWebhook: {
      provider: "sandbox",
      secret: TEST_ESIGN_SECRET,
      toleranceSeconds: 300,
    },
  };
}

export async function createClmHarness(password?: string, options: ClmOptions = {}) {
  const harness = await createAuthHarness(password);
  await seedClm(harness.db);
  return {
    ...harness,
    clm: createClm(harness.db, {
      storage: createMemoryStorage(),
      mailer: harness.mailer,
      credentialSecret: harness.config.AUTH_SECRET,
      config: harness.config,
      ...options,
    }),
  };
}
