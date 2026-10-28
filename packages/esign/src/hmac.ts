import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqualHex(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function sandboxSigningPayload(timestamp: string, eventId: string, rawBody: string): string {
  return `${timestamp}.${eventId}.${rawBody}`;
}

export function signSandboxWebhook(input: {
  secret: string;
  timestamp: string;
  eventId: string;
  rawBody: string;
}): string {
  return `v1=${hmacSha256Hex(input.secret, sandboxSigningPayload(input.timestamp, input.eventId, input.rawBody))}`;
}

export function parseV1Signature(header: string | null | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  const prefixed = /^v1=([0-9a-f]+)$/i.exec(trimmed);
  if (prefixed?.[1]) return prefixed[1].toLowerCase();
  const sha = /^sha256=([0-9a-f]+)$/i.exec(trimmed);
  if (sha?.[1]) return sha[1].toLowerCase();
  if (/^[0-9a-f]+$/i.test(trimmed)) return trimmed.toLowerCase();
  return null;
}
