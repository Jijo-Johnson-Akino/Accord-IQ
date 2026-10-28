import { createHash } from "node:crypto";
import { AppError, parseInput } from "@accordiq/core";
import { z } from "zod";
import { hmacSha256Hex, parseV1Signature, safeEqualHex, sandboxSigningPayload } from "./hmac";
import {
  WEBHOOK_EVENT_TYPES,
  type NormalizedWebhookEvent,
  type WebhookEventType,
  type WebhookVerifyInput,
} from "./types";

const sandboxBodySchema = z.object({
  providerEnvelopeId: z.string().trim().min(1).max(200),
  type: z.enum(WEBHOOK_EVENT_TYPES),
  signerEmail: z.string().trim().email().optional(),
  signerId: z.string().trim().min(1).max(200).optional(),
  occurredAt: z.string().trim().min(1).max(40).optional(),
  reason: z.string().trim().max(2000).optional(),
});

const DROPBOX_EVENT_MAP: Record<string, WebhookEventType> = {
  signature_request_sent: "envelope.sent",
  signature_request_viewed: "signer.viewed",
  signature_request_signed: "signer.signed",
  signature_request_declined: "signer.declined",
  signature_request_all_signed: "envelope.completed",
  signature_request_expired: "envelope.expired",
  signature_request_invalid: "envelope.failed",
  signature_request_canceled: "envelope.failed",
};

function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function assertFreshTimestamp(timestampHeader: string, now: Date, toleranceSeconds: number): Date {
  const seconds = Number(timestampHeader);
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new AppError("VALIDATION", "Webhook timestamp is invalid.");
  }
  const occurred = new Date(seconds * 1000);
  const skew = Math.abs(unixSeconds(now) - seconds);
  if (skew > toleranceSeconds) {
    throw new AppError("VALIDATION", "Webhook timestamp is outside the allowed window.");
  }
  return occurred;
}

function verifySandbox(input: WebhookVerifyInput): NormalizedWebhookEvent {
  const timestamp = input.timestampHeader?.trim() ?? "";
  const eventId = input.eventIdHeader?.trim() ?? "";
  if (!timestamp || !eventId) {
    throw new AppError("UNAUTHENTICATED", "Webhook signature headers are missing.");
  }
  const provided = parseV1Signature(input.signatureHeader);
  if (!provided) {
    throw new AppError("UNAUTHENTICATED", "Webhook signature is missing.");
  }
  const expected = hmacSha256Hex(
    input.secret,
    sandboxSigningPayload(timestamp, eventId, input.rawBody),
  );
  if (!safeEqualHex(provided, expected)) {
    throw new AppError("UNAUTHENTICATED", "Webhook signature is invalid.");
  }
  const now = input.now ?? new Date();
  assertFreshTimestamp(timestamp, now, input.toleranceSeconds);
  let json: unknown;
  try {
    json = JSON.parse(input.rawBody) as unknown;
  } catch {
    throw new AppError("VALIDATION", "Webhook body is not JSON.");
  }
  const body = parseInput(sandboxBodySchema, json);
  return {
    provider: "sandbox",
    providerEventId: eventId,
    providerEnvelopeId: body.providerEnvelopeId,
    type: body.type,
    signerEmail: body.signerEmail,
    signerId: body.signerId,
    occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(Number(timestamp) * 1000),
    reason: body.reason,
  };
}

function dropboxJson(rawBody: string, contentType: string | null | undefined): unknown {
  const type = contentType?.toLowerCase() ?? "";
  if (type.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    const encoded = params.get("json");
    if (!encoded) throw new AppError("VALIDATION", "Dropbox Sign webhook is missing json.");
    try {
      return JSON.parse(encoded) as unknown;
    } catch {
      throw new AppError("VALIDATION", "Dropbox Sign webhook json is invalid.");
    }
  }
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new AppError("VALIDATION", "Webhook body is not JSON.");
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function verifyDropboxSign(input: WebhookVerifyInput): NormalizedWebhookEvent {
  const apiKey = input.apiKey ?? "";
  if (!apiKey) {
    throw new AppError("VALIDATION", "Dropbox Sign is not configured.");
  }
  const payload = asRecord(dropboxJson(input.rawBody, input.contentType));
  const event = asRecord(payload?.event);
  const request = asRecord(payload?.signature_request);
  if (!event || !request) {
    throw new AppError("VALIDATION", "Dropbox Sign webhook is missing event data.");
  }
  const eventTime = String(event.event_time ?? "");
  const eventType = String(event.event_type ?? "");
  const eventHash = String(event.event_hash ?? "").toLowerCase();
  const expected = createHash("sha256").update(`${eventTime}${eventType}${apiKey}`).digest("hex");
  if (!eventHash || !safeEqualHex(eventHash, expected)) {
    throw new AppError("UNAUTHENTICATED", "Webhook signature is invalid.");
  }
  const occurredSeconds = Number(eventTime);
  if (!Number.isFinite(occurredSeconds) || occurredSeconds <= 0) {
    throw new AppError("VALIDATION", "Webhook timestamp is invalid.");
  }
  const now = input.now ?? new Date();
  const skew = Math.abs(unixSeconds(now) - occurredSeconds);
  if (skew > input.toleranceSeconds) {
    throw new AppError("VALIDATION", "Webhook timestamp is outside the allowed window.");
  }
  const mapped = DROPBOX_EVENT_MAP[eventType];
  if (!mapped) {
    throw new AppError("VALIDATION", "Unsupported Dropbox Sign event type.");
  }
  const related = asRecord(event.event_metadata);
  const signatures = Array.isArray(request.signatures) ? request.signatures : [];
  const relatedId =
    typeof related?.related_signature_id === "string" ? related.related_signature_id : undefined;
  const matched = signatures.find((row) => {
    const item = asRecord(row);
    return item && item.signature_id === relatedId;
  });
  const signer = asRecord(matched);
  const providerEnvelopeId = String(request.signature_request_id ?? "");
  if (!providerEnvelopeId) {
    throw new AppError("VALIDATION", "Dropbox Sign webhook is missing the signature request id.");
  }
  const eventTimeKey = `${eventTime}:${eventType}:${relatedId ?? providerEnvelopeId}`;
  return {
    provider: "dropbox_sign",
    providerEventId: eventTimeKey,
    providerEnvelopeId,
    type: mapped,
    signerEmail:
      typeof signer?.signer_email_address === "string" ? signer.signer_email_address : undefined,
    signerId: relatedId,
    occurredAt: new Date(occurredSeconds * 1000),
    reason: typeof signer?.decline_reason === "string" ? signer.decline_reason : undefined,
  };
}

export function verifyWebhook(input: WebhookVerifyInput): NormalizedWebhookEvent {
  if (input.provider === "none") {
    throw new AppError("VALIDATION", "E-signature is not connected.");
  }
  if (input.provider === "sandbox") {
    if (!input.secret) {
      throw new AppError("VALIDATION", "ESIGN_WEBHOOK_SECRET is not configured.");
    }
    return verifySandbox(input);
  }
  return verifyDropboxSign(input);
}
