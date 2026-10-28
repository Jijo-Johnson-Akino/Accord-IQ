import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  parseIntegrationSecrets,
  publicConnectionView,
  serializeIntegrationSecrets,
} from "./credentials";

const SECRET = "t".repeat(32);
const API_KEY = "sk-live-not-for-browser";

describe("integration credentials", () => {
  it("round-trips encrypted secrets", () => {
    const plaintext = serializeIntegrationSecrets({
      apiKey: API_KEY,
      webhookSecret: "webhook-secret-16+",
    });
    const cipher = encryptSecret(plaintext, SECRET);
    expect(cipher).not.toContain(API_KEY);
    const parsed = parseIntegrationSecrets(decryptSecret(cipher, SECRET));
    expect(parsed.apiKey).toBe(API_KEY);
    expect(parsed.webhookSecret).toBe("webhook-secret-16+");
  });

  it("refuses to decrypt with the wrong key", () => {
    const cipher = encryptSecret("payload-secret-value", SECRET);
    expect(() => decryptSecret(cipher, "u".repeat(32))).toThrow();
  });

  it("never puts ciphertext or api keys on the public connection view", () => {
    const view = publicConnectionView({
      kind: "CRM",
      provider: "hubspot",
      status: "STORED",
      ciphertext: encryptSecret(API_KEY, SECRET),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      revokedAt: null,
    });
    const json = JSON.stringify(view);
    expect(view.credentialConfigured).toBe(true);
    expect(json).not.toContain(API_KEY);
    expect(json).not.toContain("ciphertext");
    expect(view).not.toHaveProperty("apiKey");
  });
});
