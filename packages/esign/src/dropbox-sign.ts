import { AppError } from "@accordiq/core";
import { textToMinimalPdf } from "./pdf";
import type {
  CreateEnvelopeInput,
  CreateEnvelopeResult,
  CompletionFiles,
  EsignAdapter,
  EsignStatus,
} from "./types";

const API = "https://api.hellosign.com/v3";

export const DROPBOX_SETUP = [
  "Create a Dropbox Sign API app and copy the API key. Do not put it in the browser.",
  "Set ESIGN_PROVIDER=dropbox_sign, ESIGN_API_KEY, and ESIGN_WEBHOOK_SECRET.",
  "Configure the Dropbox Sign callback URL to POST /api/webhooks/esign.",
  "Keep ESIGN_TEST_MODE=true until you are ready for live requests. Test mode is not legally binding.",
];

export interface DropboxSignOptions {
  apiKey: string;
  testMode: boolean;
  fetchImpl?: typeof fetch;
}

export function dropboxStatus(): EsignStatus {
  return {
    provider: "dropbox_sign",
    available: true,
    testOnly: false,
    setup: DROPBOX_SETUP,
  };
}

function basicAuth(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

function providerError(status: number): AppError {
  if (status === 401 || status === 403) {
    return new AppError("VALIDATION", "The e-signature provider rejected the credentials.");
  }
  if (status === 429) {
    return new AppError("VALIDATION", "The e-signature provider rate-limited this request.");
  }
  if (status >= 500) {
    return new AppError("VALIDATION", "The e-signature provider is unavailable.");
  }
  return new AppError("VALIDATION", `Dropbox Sign returned HTTP ${status}.`);
}

async function dropboxFetch(
  options: DropboxSignOptions,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: basicAuth(options.apiKey),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new AppError("VALIDATION", "The e-signature provider could not be reached.");
  }
  if (!response.ok) throw providerError(response.status);
  return response;
}

export function createDropboxSignAdapter(options: DropboxSignOptions): EsignAdapter {
  const status: EsignStatus = {
    ...dropboxStatus(),
    testOnly: options.testMode,
  };

  return {
    status: () => status,
    async createEnvelope(input: CreateEnvelopeInput): Promise<CreateEnvelopeResult> {
      const form = new FormData();
      form.set("title", input.title);
      if (input.message) form.set("subject", input.message);
      form.set("test_mode", options.testMode ? "1" : "0");
      form.set("metadata[accordiq_envelope_id]", input.metadata.envelopeId);
      form.set("metadata[accordiq_contract_id]", input.metadata.contractId);
      form.set("metadata[accordiq_version_id]", input.metadata.versionId);
      const fileBytes = new ArrayBuffer(input.document.bytes.byteLength);
      new Uint8Array(fileBytes).set(input.document.bytes);
      form.set(
        "file[0]",
        new Blob([fileBytes], { type: input.document.contentType }),
        input.document.fileName,
      );
      input.signers.forEach((signer, index) => {
        form.set(`signers[${index}][name]`, signer.name);
        form.set(`signers[${index}][email_address]`, signer.email);
        form.set(`signers[${index}][order]`, String(signer.routingOrder));
      });
      const response = await dropboxFetch(options, "/signature_request/send", {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as {
        signature_request?: {
          signature_request_id?: string;
          signatures?: Array<{ signature_id?: string; signer_email_address?: string }>;
        };
      };
      const request = body.signature_request;
      const providerEnvelopeId = request?.signature_request_id;
      if (!providerEnvelopeId) {
        throw new AppError("VALIDATION", "Dropbox Sign did not return a signature request id.");
      }
      const byEmail = new Map(
        (request.signatures ?? []).map((row) => [
          (row.signer_email_address ?? "").toLowerCase(),
          row.signature_id ?? "",
        ]),
      );
      return {
        providerEnvelopeId,
        signers: input.signers.map((signer) => ({
          id: signer.id,
          providerSignerId: byEmail.get(signer.email.toLowerCase()) || `ds_${signer.id}`,
        })),
      };
    },
    async cancelEnvelope(providerEnvelopeId: string): Promise<void> {
      await dropboxFetch(options, `/signature_request/cancel/${providerEnvelopeId}`, {
        method: "POST",
      });
    },
    async downloadCompletion(providerEnvelopeId: string): Promise<CompletionFiles> {
      const fileResponse = await dropboxFetch(
        options,
        `/signature_request/files/${providerEnvelopeId}?file_type=pdf`,
        { method: "GET" },
      );
      const executed = new Uint8Array(await fileResponse.arrayBuffer());
      const metaResponse = await dropboxFetch(options, `/signature_request/${providerEnvelopeId}`, {
        method: "GET",
      });
      const meta = (await metaResponse.json()) as {
        signature_request?: {
          signature_request_id?: string;
          is_complete?: boolean;
          signatures?: Array<{
            signer_name?: string;
            signer_email_address?: string;
            signed_at?: number | null;
            status_code?: string;
          }>;
        };
      };
      const request = meta.signature_request;
      if (!request?.is_complete) {
        throw new AppError("CONFLICT", "The signature request is not complete.");
      }
      const lines = [
        `DROPBOX SIGN COMPLETION RECORD ${request.signature_request_id ?? providerEnvelopeId}`,
        ...(request.signatures ?? []).map(
          (signer) =>
            `${signer.signer_name ?? ""} <${signer.signer_email_address ?? ""}> ${signer.status_code ?? ""} ${signer.signed_at ?? ""}`,
        ),
      ];
      return {
        executed: {
          fileName: `executed-${providerEnvelopeId}.pdf`,
          contentType: "application/pdf",
          bytes: executed,
        },
        certificate: {
          fileName: `dropbox-sign-completion-${providerEnvelopeId}.pdf`,
          contentType: "application/pdf",
          bytes: textToMinimalPdf(lines.join(" | ")),
        },
      };
    },
  };
}
