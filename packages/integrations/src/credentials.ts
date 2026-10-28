import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const CONTEXT = "accordiq-integration-credentials-v1";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(`${CONTEXT}:${secret}`).digest();
}

export function encryptSecret(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string, secret: string): string {
  const buf = Buffer.from(payload, "base64");
  if (buf.length < 28) {
    throw new Error("Stored credentials are not readable.");
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyOrThrow(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function keyOrThrow(secret: string): Buffer {
  if (!secret) {
    throw new Error("Credential encryption is not configured.");
  }
  return deriveKey(secret);
}

export interface StoredIntegrationSecrets {
  apiKey: string;
  webhookSecret: string | null;
}

export function serializeIntegrationSecrets(input: StoredIntegrationSecrets): string {
  return JSON.stringify({
    apiKey: input.apiKey,
    webhookSecret: input.webhookSecret,
  });
}

export function parseIntegrationSecrets(plaintext: string): StoredIntegrationSecrets {
  const parsed = JSON.parse(plaintext) as { apiKey?: unknown; webhookSecret?: unknown };
  if (typeof parsed.apiKey !== "string" || parsed.apiKey.length < 8) {
    throw new Error("Stored credentials are not readable.");
  }
  return {
    apiKey: parsed.apiKey,
    webhookSecret: typeof parsed.webhookSecret === "string" ? parsed.webhookSecret : null,
  };
}

export function publicConnectionView(input: {
  kind: string;
  provider: string;
  status: string;
  ciphertext: string | null;
  updatedAt: Date;
  revokedAt: Date | null;
}) {
  return {
    kind: input.kind,
    provider: input.provider,
    status: input.status,
    credentialConfigured: Boolean(input.ciphertext),
    updatedAt: input.updatedAt,
    revokedAt: input.revokedAt,
  };
}
