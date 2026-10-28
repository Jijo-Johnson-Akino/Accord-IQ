import { AppError } from "@accordiq/core";
import { sandboxCertificatePdf } from "./pdf";
import type {
  CreateEnvelopeInput,
  CreateEnvelopeResult,
  CompletionFiles,
  EsignAdapter,
  EsignStatus,
} from "./types";

export const SANDBOX_SETUP = [
  "ESIGN_PROVIDER=sandbox is test-only. It does not email signers or create a legally binding signature.",
  "Drive signer.viewed, signer.signed, signer.declined, and envelope.expired through POST /api/webhooks/esign.",
  "Sign the raw JSON body with HMAC-SHA256 using ESIGN_WEBHOOK_SECRET.",
  "Headers: X-AccordIQ-Timestamp (unix seconds), X-AccordIQ-Event-Id (unique), X-AccordIQ-Signature (v1=<hex>).",
  "Canonical string: timestamp.eventId.rawBody. Replay of the same event id is ignored.",
];

export function sandboxStatus(): EsignStatus {
  return {
    provider: "sandbox",
    available: true,
    testOnly: true,
    setup: SANDBOX_SETUP,
  };
}

interface StoredSandboxEnvelope {
  title: string;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
  cancelled: boolean;
  metadata: CreateEnvelopeInput["metadata"];
  signers: CreateEnvelopeInput["signers"];
}

export function createSandboxAdapter(): EsignAdapter {
  const envelopes = new Map<string, StoredSandboxEnvelope>();
  const status = sandboxStatus();

  return {
    status: () => status,
    async createEnvelope(input: CreateEnvelopeInput): Promise<CreateEnvelopeResult> {
      const providerEnvelopeId = `sandbox_${input.metadata.envelopeId}`;
      envelopes.set(providerEnvelopeId, {
        title: input.title,
        fileName: input.document.fileName,
        contentType: input.document.contentType,
        bytes: input.document.bytes,
        cancelled: false,
        metadata: input.metadata,
        signers: input.signers,
      });
      return {
        providerEnvelopeId,
        signers: input.signers.map((signer) => ({
          id: signer.id,
          providerSignerId: `sandbox_signer_${signer.id}`,
        })),
      };
    },
    async cancelEnvelope(providerEnvelopeId: string): Promise<void> {
      const row = envelopes.get(providerEnvelopeId);
      if (!row) throw new AppError("NOT_FOUND", "Signature request not found.");
      row.cancelled = true;
    },
    async downloadCompletion(providerEnvelopeId: string): Promise<CompletionFiles> {
      const row = envelopes.get(providerEnvelopeId);
      if (!row) throw new AppError("NOT_FOUND", "Signature request not found.");
      if (row.cancelled) {
        throw new AppError("CONFLICT", "This signature request was cancelled.");
      }
      return {
        executed: {
          fileName: `sandbox-not-executed-${row.fileName}`,
          contentType: row.contentType,
          bytes: row.bytes,
        },
        certificate: {
          fileName: "sandbox-completion-evidence-not-legally-binding.pdf",
          contentType: "application/pdf",
          bytes: sandboxCertificatePdf({
            envelopeId: row.metadata.envelopeId,
            providerEnvelopeId,
            contractId: row.metadata.contractId,
            versionId: row.metadata.versionId,
            signers: row.signers.map((signer) => ({ name: signer.name, email: signer.email })),
          }),
        },
      };
    },
  };
}
