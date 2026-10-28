import { describe, expect, it } from "vitest";
import { loadActor, SEED } from "@accordiq/auth";
import { signSandboxWebhook } from "@accordiq/esign";
import { MINIMAL_PDF } from "@accordiq/storage";
import { CLM_SEED } from "./seed";
import { createClmHarness, sandboxClmOptions, TEST_ESIGN_SECRET } from "./harness";

const PASSWORD = "Dev-only-passw0rd!";
const ORIGIN = "http://localhost:3000";

function cookieHeader(response: Response): Headers {
  const headers = new Headers({ origin: ORIGIN });
  const setCookie =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const fallback = response.headers.get("set-cookie");
  const parts = setCookie.length > 0 ? setCookie : fallback ? [fallback] : [];
  const pairs = parts
    .map((entry) => entry.split(";")[0]?.trim())
    .filter((pair): pair is string => Boolean(pair));
  if (pairs.length) headers.set("cookie", pairs.join("; "));
  return headers;
}

async function signIn(auth: Awaited<ReturnType<typeof createClmHarness>>["auth"], email: string) {
  const response = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    headers: new Headers({ origin: ORIGIN }),
    asResponse: true,
  });
  if (!response.ok) throw new Error(`Sign-in failed for ${email}`);
  return cookieHeader(response);
}

async function actorFor(harness: Awaited<ReturnType<typeof createClmHarness>>, email: string) {
  const headers = await signIn(harness.auth, email);
  const payload = await harness.auth.api.getSession({ headers });
  return loadActor(harness.db, payload!);
}

async function approvedContract(harness: Awaited<ReturnType<typeof createClmHarness>>) {
  const legal = await actorFor(harness, SEED.users.northwindLegal.email);
  const finance = await actorFor(harness, SEED.users.northwindFinance.email);
  const created = await harness.clm.createContract(legal, {
    title: "Signature MSA",
    value: "150000.00",
    category: "MSA",
    department: "FINANCE",
  });
  await harness.clm.uploadDocument(legal, created.contract.id, {
    bytes: MINIMAL_PDF,
    fileName: "msa.pdf",
    contentType: "application/pdf",
  });
  const started = await harness.clm.startApproval(legal, created.contract.id, {
    templateId: CLM_SEED.workflows.northwindLegalFinance.id,
  });
  await harness.clm.decideApproval(legal, started.request.id, { decision: "APPROVED" });
  await harness.clm.decideApproval(finance, started.request.id, { decision: "APPROVED" });
  return { legal, finance, contractId: created.contract.id, versionId: created.version.id };
}

function webhook(input: {
  clm: Awaited<ReturnType<typeof createClmHarness>>["clm"];
  providerEnvelopeId: string;
  type: string;
  eventId: string;
  signerEmail?: string;
  signerId?: string;
  reason?: string;
  timestamp?: number;
}) {
  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify({
    providerEnvelopeId: input.providerEnvelopeId,
    type: input.type,
    signerEmail: input.signerEmail,
    signerId: input.signerId,
    reason: input.reason,
  });
  return input.clm.processSignatureWebhook({
    rawBody,
    headers: {
      signature: signSandboxWebhook({
        secret: TEST_ESIGN_SECRET,
        timestamp,
        eventId: input.eventId,
        rawBody,
      }),
      timestamp,
      eventId: input.eventId,
      contentType: "application/json",
    },
  });
}

describe("e-signature", { timeout: 20_000 }, () => {
  it("refuses signing until the current version is approved", async () => {
    const harness = await createClmHarness(PASSWORD, sandboxClmOptions());
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, { title: "Draft only" });
    await harness.clm.uploadDocument(legal, created.contract.id, {
      bytes: MINIMAL_PDF,
      fileName: "draft.pdf",
      contentType: "application/pdf",
    });
    await expect(
      harness.clm.sendEnvelope(legal, created.contract.id, {
        signers: [{ name: "A", email: "a@example.com", routingOrder: 1 }],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const ready = await approvedContract(harness);
    await harness.clm.createContractVersion(ready.legal, ready.contractId, { summary: "v2" });
    await expect(
      harness.clm.sendEnvelope(ready.legal, ready.contractId, {
        signers: [{ name: "A", email: "a@example.com", routingOrder: 1 }],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lets legal send after approval and refuses a viewer", async () => {
    const harness = await createClmHarness(PASSWORD, sandboxClmOptions());
    const ready = await approvedContract(harness);
    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    await expect(
      harness.clm.sendEnvelope(viewer, ready.contractId, {
        signers: [{ name: "A", email: "a@example.com", routingOrder: 1 }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const envelope = await harness.clm.sendEnvelope(ready.legal, ready.contractId, {
      signers: [
        { name: "Legal signer", email: "legal.signer@example.com", routingOrder: 1 },
        { name: "Counterparty", email: "counterparty@example.com", routingOrder: 2 },
      ],
    });
    expect(envelope.status).toBe("SENT");
    expect(envelope.testMode).toBe(true);
    expect(envelope.versionId).toBe(ready.versionId);
    expect(envelope.signers.map((signer) => signer.status)).toEqual(["SENT", "PENDING"]);
    const { contract: after } = await harness.clm.getContract(ready.legal, ready.contractId);
    expect(after.status).toBe("PENDING_SIGNATURE");
    const patched = await harness.clm.updateContract(ready.legal, ready.contractId, {
      status: "SIGNED",
      title: after.title,
    });
    expect(patched.status).toBe("PENDING_SIGNATURE");
  });

  it("enforces signing order and retries an out-of-turn webhook after the earlier signer finishes", async () => {
    const harness = await createClmHarness(PASSWORD, sandboxClmOptions());
    const ready = await approvedContract(harness);
    const envelope = await harness.clm.sendEnvelope(ready.legal, ready.contractId, {
      signers: [
        { name: "First", email: "first@example.com", routingOrder: 1 },
        { name: "Second", email: "second@example.com", routingOrder: 2 },
      ],
    });
    await expect(
      webhook({
        clm: harness.clm,
        providerEnvelopeId: envelope.providerEnvelopeId!,
        type: "signer.signed",
        eventId: "evt-second-early",
        signerEmail: "second@example.com",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const first = await webhook({
      clm: harness.clm,
      providerEnvelopeId: envelope.providerEnvelopeId!,
      type: "signer.signed",
      eventId: "evt-first",
      signerEmail: "first@example.com",
    });
    expect(first.duplicate).toBe(false);
    expect(first.status).toBe("IN_PROGRESS");

    const retried = await webhook({
      clm: harness.clm,
      providerEnvelopeId: envelope.providerEnvelopeId!,
      type: "signer.signed",
      eventId: "evt-second-early",
      signerEmail: "second@example.com",
    });
    expect(retried.duplicate).toBe(false);
    expect(retried.status).toBe("COMPLETED");
    const replay = await webhook({
      clm: harness.clm,
      providerEnvelopeId: envelope.providerEnvelopeId!,
      type: "signer.signed",
      eventId: "evt-second-early",
      signerEmail: "second@example.com",
    });
    expect(replay.duplicate).toBe(true);
  });

  it("does not execute the contract when a signer declines", async () => {
    const harness = await createClmHarness(PASSWORD, sandboxClmOptions());
    const ready = await approvedContract(harness);
    const envelope = await harness.clm.sendEnvelope(ready.legal, ready.contractId, {
      signers: [{ name: "Only", email: "only@example.com", routingOrder: 1 }],
    });
    const declined = await webhook({
      clm: harness.clm,
      providerEnvelopeId: envelope.providerEnvelopeId!,
      type: "signer.declined",
      eventId: "evt-decline",
      signerEmail: "only@example.com",
      reason: "Terms rejected",
    });
    expect(declined.status).toBe("DECLINED");
    const loaded = await harness.clm.getEnvelope(ready.legal, envelope.id);
    expect(loaded.executedDocumentId).toBeNull();
    const { contract: after } = await harness.clm.getContract(ready.legal, ready.contractId);
    expect(after.status).toBe("APPROVED");
  });

  it("stores executed document and certificate linked to the approved version", async () => {
    const harness = await createClmHarness(PASSWORD, sandboxClmOptions());
    const ready = await approvedContract(harness);
    const envelope = await harness.clm.sendEnvelope(ready.legal, ready.contractId, {
      signers: [{ name: "Only", email: "only@example.com", routingOrder: 1 }],
    });
    await webhook({
      clm: harness.clm,
      providerEnvelopeId: envelope.providerEnvelopeId!,
      type: "signer.viewed",
      eventId: "evt-view",
      signerEmail: "only@example.com",
    });
    const completed = await webhook({
      clm: harness.clm,
      providerEnvelopeId: envelope.providerEnvelopeId!,
      type: "signer.signed",
      eventId: "evt-sign",
      signerEmail: "only@example.com",
    });
    expect(completed.status).toBe("COMPLETED");
    const loaded = await harness.clm.getEnvelope(ready.legal, envelope.id);
    expect(loaded.versionId).toBe(ready.versionId);
    expect(loaded.executedDocumentId).toBeTruthy();
    expect(loaded.certificateDocumentId).toBeTruthy();
    expect(loaded.signers[0]?.signedAt).toBeTruthy();
    const executed = await harness.clm.getDocumentFile(ready.legal, loaded.executedDocumentId!);
    expect(executed.fileName).toContain("sandbox-not-executed");
    const certificate = await harness.clm.getDocumentFile(
      ready.legal,
      loaded.certificateDocumentId!,
    );
    expect(new TextDecoder().decode(certificate.bytes)).toContain("NOT A LEGALLY BINDING");
    const { contract: after } = await harness.clm.getContract(ready.legal, ready.contractId);
    expect(after.status).toBe("ACTIVE");
  });

  it("does not connect a provider in the default harness", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    expect(harness.clm.getEsignStatus(legal).available).toBe(false);
  });
});
