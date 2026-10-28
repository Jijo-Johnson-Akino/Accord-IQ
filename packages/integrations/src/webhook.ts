import { AppError } from "@accordiq/core";
import { hmacSha256Hex, integrationSigningPayload, parseV1Signature, safeEqualHex } from "./hmac";

export interface IntegrationWebhookHeaders {
  signature: string | null;
  timestamp: string | null;
  eventId: string | null;
  organizationSlug: string | null;
}

export function verifyIntegrationWebhook(input: {
  secret: string;
  rawBody: string;
  headers: IntegrationWebhookHeaders;
  now?: Date;
  toleranceSeconds?: number;
}): { eventId: string; timestamp: string } {
  const timestamp = input.headers.timestamp?.trim() ?? "";
  const eventId = input.headers.eventId?.trim() ?? "";
  if (!timestamp || !eventId) {
    throw new AppError("UNAUTHENTICATED", "Webhook signature headers are missing.");
  }
  const provided = parseV1Signature(input.headers.signature);
  if (!provided) {
    throw new AppError("UNAUTHENTICATED", "Webhook signature is missing.");
  }
  const expected = hmacSha256Hex(
    input.secret,
    integrationSigningPayload(timestamp, eventId, input.rawBody),
  );
  if (!safeEqualHex(provided, expected)) {
    throw new AppError("UNAUTHENTICATED", "Webhook signature is invalid.");
  }
  const now = input.now ?? new Date();
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new AppError("VALIDATION", "Webhook timestamp is invalid.");
  }
  const skew = Math.abs(Math.floor(now.getTime() / 1000) - seconds);
  const tolerance = input.toleranceSeconds ?? 300;
  if (skew > tolerance) {
    throw new AppError("VALIDATION", "Webhook timestamp is outside the allowed window.");
  }
  return { eventId, timestamp };
}
