import type { AppConfig } from "@accordiq/core";

export type EsignProviderName = AppConfig["ESIGN_PROVIDER"];

export const WEBHOOK_EVENT_TYPES = [
  "envelope.sent",
  "signer.viewed",
  "signer.signed",
  "signer.declined",
  "envelope.expired",
  "envelope.completed",
  "envelope.failed",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface EsignStatus {
  provider: EsignProviderName;
  available: boolean;
  testOnly: boolean;
  setup: string[];
}

export interface EnvelopeSignerInput {
  id: string;
  name: string;
  email: string;
  routingOrder: number;
}

export interface CreateEnvelopeInput {
  title: string;
  message?: string;
  document: { fileName: string; contentType: string; bytes: Uint8Array };
  signers: EnvelopeSignerInput[];
  metadata: {
    organizationId: string;
    envelopeId: string;
    contractId: string;
    versionId: string;
  };
}

export interface CreateEnvelopeResult {
  providerEnvelopeId: string;
  signers: Array<{ id: string; providerSignerId: string }>;
}

export interface CompletionFile {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface CompletionFiles {
  executed: CompletionFile;
  certificate: CompletionFile;
}

export interface EsignAdapter {
  status(): EsignStatus;
  createEnvelope(input: CreateEnvelopeInput): Promise<CreateEnvelopeResult>;
  cancelEnvelope(providerEnvelopeId: string): Promise<void>;
  downloadCompletion(providerEnvelopeId: string): Promise<CompletionFiles>;
}

export interface NormalizedWebhookEvent {
  provider: EsignProviderName;
  providerEventId: string;
  providerEnvelopeId: string;
  type: WebhookEventType;
  signerEmail?: string;
  signerId?: string;
  occurredAt: Date;
  reason?: string;
}

export interface WebhookVerifyInput {
  rawBody: string;
  signatureHeader?: string | null;
  timestampHeader?: string | null;
  eventIdHeader?: string | null;
  contentType?: string | null;
  now?: Date;
  toleranceSeconds: number;
  secret: string;
  apiKey?: string;
  provider: EsignProviderName;
}
