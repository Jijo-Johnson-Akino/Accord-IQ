import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { AppError } from "@accordiq/core";
import { signSandboxWebhook } from "./hmac";
import { createNoneAdapter } from "./none";
import { createSandboxAdapter } from "./sandbox";
import { createDropboxSignAdapter } from "./dropbox-sign";
import { createEsign } from "./provider";
import { verifyWebhook } from "./webhook";

const SECRET = "test-webhook-secret-32chars!!";
const API_KEY = "dropbox-test-key";

function sandboxHeaders(
  rawBody: string,
  eventId = "evt_1",
  timestamp = String(Math.floor(Date.now() / 1000)),
) {
  return {
    rawBody,
    timestamp,
    eventId,
    signature: signSandboxWebhook({ secret: SECRET, timestamp, eventId, rawBody }),
  };
}

describe("sandbox webhook authenticity", () => {
  it("accepts a fresh HMAC-signed event and rejects a bad signature", () => {
    const rawBody = JSON.stringify({
      providerEnvelopeId: "sandbox_1",
      type: "signer.signed",
      signerEmail: "a@example.com",
    });
    const headers = sandboxHeaders(rawBody);
    const event = verifyWebhook({
      provider: "sandbox",
      secret: SECRET,
      toleranceSeconds: 300,
      rawBody,
      signatureHeader: headers.signature,
      timestampHeader: headers.timestamp,
      eventIdHeader: headers.eventId,
    });
    expect(event.providerEventId).toBe("evt_1");
    expect(event.type).toBe("signer.signed");
    expect(() =>
      verifyWebhook({
        provider: "sandbox",
        secret: SECRET,
        toleranceSeconds: 300,
        rawBody,
        signatureHeader: "v1=deadbeef",
        timestampHeader: headers.timestamp,
        eventIdHeader: headers.eventId,
      }),
    ).toThrow(AppError);
  });

  it("rejects a timestamp outside the replay window", () => {
    const rawBody = JSON.stringify({
      providerEnvelopeId: "sandbox_1",
      type: "signer.viewed",
    });
    const timestamp = String(Math.floor(Date.now() / 1000) - 10_000);
    const eventId = "evt_old";
    const signature = signSandboxWebhook({ secret: SECRET, timestamp, eventId, rawBody });
    expect(() =>
      verifyWebhook({
        provider: "sandbox",
        secret: SECRET,
        toleranceSeconds: 300,
        rawBody,
        signatureHeader: signature,
        timestampHeader: timestamp,
        eventIdHeader: eventId,
      }),
    ).toThrow(/window/);
  });
});

describe("Dropbox Sign event hash", () => {
  it("accepts the documented SHA256(event_time + event_type + api_key) hash", () => {
    const eventTime = String(Math.floor(Date.now() / 1000));
    const eventType = "signature_request_signed";
    const eventHash = createHash("sha256")
      .update(`${eventTime}${eventType}${API_KEY}`)
      .digest("hex");
    const rawBody = JSON.stringify({
      event: {
        event_time: eventTime,
        event_type: eventType,
        event_hash: eventHash,
        event_metadata: { related_signature_id: "sig_1" },
      },
      signature_request: {
        signature_request_id: "req_1",
        signatures: [{ signature_id: "sig_1", signer_email_address: "a@example.com" }],
      },
    });
    const event = verifyWebhook({
      provider: "dropbox_sign",
      secret: SECRET,
      apiKey: API_KEY,
      toleranceSeconds: 300,
      rawBody,
    });
    expect(event.type).toBe("signer.signed");
    expect(event.signerEmail).toBe("a@example.com");
    expect(event.providerEnvelopeId).toBe("req_1");
  });
});

describe("adapters", () => {
  it("refuses work on the none adapter", async () => {
    const adapter = createNoneAdapter();
    expect(adapter.status().available).toBe(false);
    await expect(
      adapter.createEnvelope({
        title: "x",
        document: { fileName: "a.pdf", contentType: "application/pdf", bytes: new Uint8Array([1]) },
        signers: [{ id: "s1", name: "A", email: "a@example.com", routingOrder: 1 }],
        metadata: { organizationId: "o", envelopeId: "e", contractId: "c", versionId: "v" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("stores sandbox files and returns labeled non-binding evidence", async () => {
    const adapter = createSandboxAdapter();
    expect(adapter.status().testOnly).toBe(true);
    const created = await adapter.createEnvelope({
      title: "MSA",
      document: {
        fileName: "msa.pdf",
        contentType: "application/pdf",
        bytes: new TextEncoder().encode("%PDF-1.1 sandbox"),
      },
      signers: [{ id: "s1", name: "A", email: "a@example.com", routingOrder: 1 }],
      metadata: { organizationId: "o", envelopeId: "e1", contractId: "c", versionId: "v" },
    });
    const files = await adapter.downloadCompletion(created.providerEnvelopeId);
    expect(new TextDecoder().decode(files.certificate.bytes)).toContain("NOT A LEGALLY BINDING");
    expect(files.executed.fileName).toContain("sandbox-not-executed");
  });

  it("selects adapters from config", () => {
    expect(createEsign({ ESIGN_PROVIDER: "none" }).status().provider).toBe("none");
    expect(createEsign({ ESIGN_PROVIDER: "sandbox" }).status().testOnly).toBe(true);
  });

  it("sends Dropbox Sign requests with server-side credentials", async () => {
    const calls: string[] = [];
    const adapter = createDropboxSignAdapter({
      apiKey: API_KEY,
      testMode: true,
      fetchImpl: async (url, init) => {
        calls.push(`${init?.method} ${String(url)}`);
        return new Response(
          JSON.stringify({
            signature_request: {
              signature_request_id: "req_live",
              signatures: [{ signature_id: "sig_a", signer_email_address: "a@example.com" }],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });
    const created = await adapter.createEnvelope({
      title: "NDA",
      document: {
        fileName: "nda.pdf",
        contentType: "application/pdf",
        bytes: new TextEncoder().encode("%PDF-1.1"),
      },
      signers: [{ id: "s1", name: "A", email: "a@example.com", routingOrder: 1 }],
      metadata: { organizationId: "o", envelopeId: "e", contractId: "c", versionId: "v" },
    });
    expect(created.providerEnvelopeId).toBe("req_live");
    expect(calls[0]).toContain("/signature_request/send");
  });
});
