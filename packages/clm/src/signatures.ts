import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { can, type Actor } from "@accordiq/auth";
import { AppError, isAppError, parseInput } from "@accordiq/core";
import {
  approvalRequest,
  contract,
  contractParty,
  document,
  signatureEnvelope,
  signatureEvent,
  signatureSigner,
  type Database,
} from "@accordiq/db";
import {
  createNoneAdapter,
  verifyWebhook,
  type EsignAdapter,
  type EsignStatus,
  type NormalizedWebhookEvent,
} from "@accordiq/esign";
import {
  createBasicProcessor,
  type DocumentProcessor,
  type StorageAdapter,
} from "@accordiq/storage";
import type { EnvelopeStatus, SignerStatus } from "./enums";
import { id, notFound, requirePermission, writeAudit } from "./helpers";
import { dispatchNotification } from "./notify";
import type { ClmOptions, PublicDocument } from "./repository";
import { sendEnvelopeSchema } from "./validation";

const OPEN_ENVELOPE: EnvelopeStatus[] = ["SENT", "IN_PROGRESS"];
const TERMINAL_ENVELOPE: EnvelopeStatus[] = [
  "COMPLETED",
  "DECLINED",
  "EXPIRED",
  "FAILED",
  "CANCELLED",
];

function now(): Date {
  return new Date();
}

function isUniqueFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("unique") || message.includes("constraint");
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function snapshotVersionId(snapshotJson: string | null | undefined): string | null {
  if (!snapshotJson) return null;
  try {
    const parsed = JSON.parse(snapshotJson) as { versionId?: unknown };
    return typeof parsed.versionId === "string" ? parsed.versionId : null;
  } catch {
    return null;
  }
}

function requireStorage(storage: StorageAdapter | undefined): StorageAdapter {
  if (!storage) throw new AppError("INTERNAL", "Document storage is not configured.");
  return storage;
}

function webhookActor(envelope: typeof signatureEnvelope.$inferSelect): Actor {
  return {
    userId: envelope.createdByUserId,
    email: "webhook@accordiq.internal",
    name: "E-signature webhook",
    platformRole: null,
    organizationId: envelope.organizationId,
    organizationName: null,
    organizationRole: null,
  };
}

export type EnvelopeView = typeof signatureEnvelope.$inferSelect & {
  signers: (typeof signatureSigner.$inferSelect)[];
  events: (typeof signatureEvent.$inferSelect)[];
};

export type SignatureContext = {
  status: EsignStatus;
  canSend: boolean;
  eligible: boolean;
  blocker: string | null;
  versionId: string | null;
  documentId: string | null;
  openEnvelopeId: string | null;
};

export function createSignatureAccess(
  db: Database,
  options: ClmOptions,
  helpers: {
    scopedContract: (
      organizationId: string,
      contractId: string,
    ) => Promise<typeof contract.$inferSelect>;
    getDocumentFile: (
      actor: Actor,
      documentId: string,
    ) => Promise<{ bytes: Uint8Array; contentType: string; fileName: string; byteSize: number }>;
    listDocuments: (actor: Actor, contractId: string) => Promise<PublicDocument[]>;
  },
) {
  const esign: EsignAdapter = options.esign ?? createNoneAdapter();
  const processor: DocumentProcessor = options.processor ?? createBasicProcessor();

  async function scopedEnvelope(organizationId: string, envelopeId: string) {
    const row = await db.query.signatureEnvelope.findFirst({
      where: and(
        eq(signatureEnvelope.id, envelopeId),
        eq(signatureEnvelope.organizationId, organizationId),
      ),
    });
    if (!row) notFound();
    return row;
  }

  async function loadView(
    organizationId: string,
    envelope: typeof signatureEnvelope.$inferSelect,
  ): Promise<EnvelopeView> {
    const [signers, events] = await Promise.all([
      db
        .select()
        .from(signatureSigner)
        .where(
          and(
            eq(signatureSigner.envelopeId, envelope.id),
            eq(signatureSigner.organizationId, organizationId),
          ),
        ),
      db
        .select()
        .from(signatureEvent)
        .where(
          and(
            eq(signatureEvent.envelopeId, envelope.id),
            eq(signatureEvent.organizationId, organizationId),
          ),
        )
        .orderBy(signatureEvent.receivedAt),
    ]);
    const ordered = [...signers].sort(
      (a, b) => a.routingOrder - b.routingOrder || a.createdAt.getTime() - b.createdAt.getTime(),
    );
    return { ...envelope, signers: ordered, events };
  }

  async function latestApprovedVersion(
    organizationId: string,
    contractId: string,
  ): Promise<string | null> {
    const [row] = await db
      .select()
      .from(approvalRequest)
      .where(
        and(
          eq(approvalRequest.organizationId, organizationId),
          eq(approvalRequest.contractId, contractId),
          eq(approvalRequest.status, "APPROVED"),
          eq(approvalRequest.stale, false),
        ),
      )
      .orderBy(desc(approvalRequest.updatedAt))
      .limit(1);
    return snapshotVersionId(row?.snapshotJson);
  }

  async function openEnvelope(
    organizationId: string,
    contractId: string,
  ): Promise<typeof signatureEnvelope.$inferSelect | undefined> {
    const [row] = await db
      .select()
      .from(signatureEnvelope)
      .where(
        and(
          eq(signatureEnvelope.organizationId, organizationId),
          eq(signatureEnvelope.contractId, contractId),
          inArray(signatureEnvelope.status, OPEN_ENVELOPE),
        ),
      )
      .orderBy(desc(signatureEnvelope.createdAt))
      .limit(1);
    return row;
  }

  async function pickSourceDocument(
    actor: Actor,
    contractId: string,
    versionId: string,
    documentId: string | undefined,
  ): Promise<PublicDocument> {
    const documents = await helpers.listDocuments(actor, contractId);
    const completed = documents.filter(
      (row) =>
        row.status === "COMPLETED" &&
        row.hasFile &&
        (row.versionId === versionId || !row.versionId),
    );
    const chosen = documentId
      ? completed.find((row) => row.id === documentId)
      : (completed.find((row) => row.versionId === versionId) ?? completed[0]);
    if (!chosen) {
      throw new AppError(
        "VALIDATION",
        "Upload a completed PDF or DOCX for the approved version before sending for signature.",
      );
    }
    return chosen;
  }

  function eligibilityBlocker(
    row: typeof contract.$inferSelect,
    approvedVersionId: string | null,
    open: typeof signatureEnvelope.$inferSelect | undefined,
  ): string | null {
    if (row.status === "ACTIVE" || row.status === "SIGNED") {
      return "This contract is already executed.";
    }
    if (row.status === "EXPIRED" || row.status === "TERMINATED") {
      return "This contract cannot enter the signing workflow.";
    }
    if (row.status !== "APPROVED" && row.status !== "PENDING_SIGNATURE") {
      return "Only an approved contract version can be sent for signature.";
    }
    if (!row.currentVersionId) {
      return "This contract has no current version.";
    }
    if (!approvedVersionId) {
      return "This contract has not been approved.";
    }
    if (approvedVersionId !== row.currentVersionId) {
      return "The current version has not been approved.";
    }
    if (open) {
      return "A signature request is already in progress.";
    }
    return null;
  }

  function currentRoutingOrder(signers: (typeof signatureSigner.$inferSelect)[]): number {
    const required = signers.filter((signer) => signer.required);
    const pending = required.filter((signer) => signer.status !== "SIGNED");
    if (pending.length === 0) return Number.POSITIVE_INFINITY;
    return Math.min(...pending.map((signer) => signer.routingOrder));
  }

  function matchSigner(
    signers: (typeof signatureSigner.$inferSelect)[],
    event: NormalizedWebhookEvent,
  ): typeof signatureSigner.$inferSelect | undefined {
    if (event.signerId) {
      const byId = signers.find(
        (signer) => signer.id === event.signerId || signer.providerSignerId === event.signerId,
      );
      if (byId) return byId;
    }
    if (event.signerEmail) {
      const email = event.signerEmail.toLowerCase();
      return signers.find((signer) => signer.email.toLowerCase() === email);
    }
    return undefined;
  }

  async function storeEvidence(input: {
    organizationId: string;
    contractId: string;
    versionId: string;
    createdByUserId: string;
    fileName: string;
    contentType: string;
    bytes: Uint8Array;
    idempotencyKey: string;
  }): Promise<string> {
    const storage = requireStorage(options.storage);
    const existing = await db.query.document.findFirst({
      where: and(
        eq(document.organizationId, input.organizationId),
        eq(document.idempotencyKey, input.idempotencyKey),
      ),
    });
    if (existing) return existing.id;
    const processed = await processor.process({
      bytes: input.bytes,
      fileName: input.fileName,
      contentType: input.contentType,
    });
    const documentId = id();
    const createdAt = now();
    try {
      await db.insert(document).values({
        id: documentId,
        organizationId: input.organizationId,
        contractId: input.contractId,
        versionId: input.versionId,
        fileName: processed.fileName,
        contentType: processed.contentType,
        byteSize: input.bytes.byteLength,
        storageKey: null,
        status: "PROCESSING",
        sha256: processed.sha256,
        processingError: null,
        processedAt: null,
        pageCount: processed.pageCount,
        idempotencyKey: input.idempotencyKey,
        createdByUserId: input.createdByUserId,
        createdAt,
        updatedAt: createdAt,
      });
    } catch (error) {
      if (!isUniqueFailure(error)) throw error;
      const replayed = await db.query.document.findFirst({
        where: and(
          eq(document.organizationId, input.organizationId),
          eq(document.idempotencyKey, input.idempotencyKey),
        ),
      });
      if (replayed) return replayed.id;
      throw error;
    }
    const stored = await storage.put({
      organizationId: input.organizationId,
      documentId,
      fileName: processed.fileName,
      contentType: processed.contentType,
      bytes: input.bytes,
    });
    const completedAt = now();
    await db
      .update(document)
      .set({
        storageKey: stored.storageKey,
        status: "COMPLETED",
        processedAt: completedAt,
        byteSize: stored.byteSize,
        updatedAt: completedAt,
      })
      .where(and(eq(document.id, documentId), eq(document.organizationId, input.organizationId)));
    return documentId;
  }

  async function notify(
    organizationId: string,
    userId: string,
    title: string,
    body: string,
    entityId: string,
    href: string,
  ) {
    await dispatchNotification(db, options, {
      organizationId,
      userId,
      kind: "SIGNING_UPDATE",
      title,
      body,
      entityType: "signature_envelope",
      entityId,
      href,
      at: now(),
    });
  }

  async function completeEnvelope(
    envelope: typeof signatureEnvelope.$inferSelect,
    signers: (typeof signatureSigner.$inferSelect)[],
  ): Promise<typeof signatureEnvelope.$inferSelect> {
    if (!envelope.providerEnvelopeId) {
      throw new AppError("INTERNAL", "This signature request has no provider id.");
    }
    const files = await esign.downloadCompletion(envelope.providerEnvelopeId);
    const executedDocumentId = await storeEvidence({
      organizationId: envelope.organizationId,
      contractId: envelope.contractId,
      versionId: envelope.versionId,
      createdByUserId: envelope.createdByUserId,
      fileName: files.executed.fileName,
      contentType: files.executed.contentType,
      bytes: files.executed.bytes,
      idempotencyKey: `esign-executed:${envelope.id}`,
    });
    const certificateDocumentId = await storeEvidence({
      organizationId: envelope.organizationId,
      contractId: envelope.contractId,
      versionId: envelope.versionId,
      createdByUserId: envelope.createdByUserId,
      fileName: files.certificate.fileName,
      contentType: files.certificate.contentType,
      bytes: files.certificate.bytes,
      idempotencyKey: `esign-certificate:${envelope.id}`,
    });
    const completedAt = now();
    await db.transaction(async (tx) => {
      await tx
        .update(signatureEnvelope)
        .set({
          status: "COMPLETED",
          executedDocumentId,
          certificateDocumentId,
          completedAt,
          updatedAt: completedAt,
        })
        .where(
          and(
            eq(signatureEnvelope.id, envelope.id),
            eq(signatureEnvelope.organizationId, envelope.organizationId),
          ),
        );
      await tx
        .update(contract)
        .set({ status: "ACTIVE", updatedAt: completedAt })
        .where(
          and(
            eq(contract.id, envelope.contractId),
            eq(contract.organizationId, envelope.organizationId),
          ),
        );
      await writeAudit(
        tx,
        webhookActor(envelope),
        "signature.complete",
        "signature_envelope",
        envelope.id,
        {
          contractId: envelope.contractId,
          versionId: envelope.versionId,
          testMode: envelope.testMode,
        },
      );
    });
    const parent = await db.query.contract.findFirst({
      where: and(
        eq(contract.id, envelope.contractId),
        eq(contract.organizationId, envelope.organizationId),
      ),
    });
    const recipients = new Set(
      [envelope.createdByUserId, parent?.ownerUserId].filter((value): value is string =>
        Boolean(value),
      ),
    );
    for (const userId of recipients) {
      await notify(
        envelope.organizationId,
        userId,
        envelope.testMode ? "Sandbox signing completed" : "Contract executed",
        envelope.testMode
          ? "Sandbox completion evidence was stored. This is not a legally binding signature."
          : `${signers.length} required signers completed. The contract is active.`,
        envelope.id,
        `/contracts/${envelope.contractId}`,
      );
    }
    const updated = await db.query.signatureEnvelope.findFirst({
      where: eq(signatureEnvelope.id, envelope.id),
    });
    if (!updated) notFound();
    return updated;
  }

  async function revertContractToApproved(envelope: typeof signatureEnvelope.$inferSelect) {
    await db
      .update(contract)
      .set({ status: "APPROVED", updatedAt: now() })
      .where(
        and(
          eq(contract.id, envelope.contractId),
          eq(contract.organizationId, envelope.organizationId),
          inArray(contract.status, ["PENDING_SIGNATURE"]),
        ),
      );
  }

  async function applyEvent(
    envelope: typeof signatureEnvelope.$inferSelect,
    event: NormalizedWebhookEvent,
  ): Promise<void> {
    if (TERMINAL_ENVELOPE.includes(envelope.status as EnvelopeStatus)) {
      if (envelope.status === "COMPLETED" && event.type === "envelope.completed") return;
      throw new AppError("CONFLICT", "This signature request is no longer open.");
    }
    const signers = await db
      .select()
      .from(signatureSigner)
      .where(
        and(
          eq(signatureSigner.envelopeId, envelope.id),
          eq(signatureSigner.organizationId, envelope.organizationId),
        ),
      );
    const occurredAt = event.occurredAt;
    const stamp = now();

    if (event.type === "envelope.sent") {
      await db
        .update(signatureEnvelope)
        .set({ status: envelope.status === "SENT" ? "SENT" : envelope.status, updatedAt: stamp })
        .where(eq(signatureEnvelope.id, envelope.id));
      return;
    }

    if (event.type === "envelope.expired") {
      await db
        .update(signatureEnvelope)
        .set({ status: "EXPIRED", expiredAt: occurredAt, updatedAt: stamp })
        .where(eq(signatureEnvelope.id, envelope.id));
      await db
        .update(signatureSigner)
        .set({ status: "EXPIRED", updatedAt: stamp })
        .where(
          and(
            eq(signatureSigner.envelopeId, envelope.id),
            inArray(signatureSigner.status, ["PENDING", "SENT", "VIEWED"]),
          ),
        );
      await revertContractToApproved(envelope);
      return;
    }

    if (event.type === "envelope.failed") {
      await db
        .update(signatureEnvelope)
        .set({
          status: "FAILED",
          failedAt: occurredAt,
          failureReason: event.reason ?? "The provider reported a failure.",
          updatedAt: stamp,
        })
        .where(eq(signatureEnvelope.id, envelope.id));
      await revertContractToApproved(envelope);
      return;
    }

    if (event.type === "envelope.completed") {
      const required = signers.filter((signer) => signer.required);
      if (required.some((signer) => signer.status !== "SIGNED")) {
        throw new AppError("CONFLICT", "Not every required signer has signed yet.");
      }
      if (!envelope.executedDocumentId) {
        await completeEnvelope(envelope, signers);
      }
      return;
    }

    const signer = matchSigner(signers, event);
    if (!signer) {
      throw new AppError("VALIDATION", "The webhook does not match a signer on this request.");
    }

    if (event.type === "signer.declined") {
      await db
        .update(signatureSigner)
        .set({
          status: "DECLINED",
          declinedAt: occurredAt,
          declineReason: event.reason ?? null,
          updatedAt: stamp,
        })
        .where(eq(signatureSigner.id, signer.id));
      await db
        .update(signatureEnvelope)
        .set({ status: "DECLINED", declinedAt: occurredAt, updatedAt: stamp })
        .where(eq(signatureEnvelope.id, envelope.id));
      await revertContractToApproved(envelope);
      await notify(
        envelope.organizationId,
        envelope.createdByUserId,
        "Signature declined",
        `${signer.name} declined to sign.`,
        envelope.id,
        `/contracts/${envelope.contractId}`,
      );
      return;
    }

    const turn = currentRoutingOrder(signers);
    if (signer.routingOrder > turn) {
      throw new AppError("CONFLICT", "It is not this signer's turn.");
    }

    if (event.type === "signer.viewed") {
      const nextStatus: SignerStatus =
        signer.status === "SIGNED" || signer.status === "DECLINED"
          ? (signer.status as SignerStatus)
          : "VIEWED";
      await db
        .update(signatureSigner)
        .set({
          status: nextStatus,
          viewedAt: signer.viewedAt ?? occurredAt,
          updatedAt: stamp,
        })
        .where(eq(signatureSigner.id, signer.id));
      if (envelope.status === "SENT") {
        await db
          .update(signatureEnvelope)
          .set({ status: "IN_PROGRESS", updatedAt: stamp })
          .where(eq(signatureEnvelope.id, envelope.id));
      }
      return;
    }

    if (event.type === "signer.signed") {
      await db
        .update(signatureSigner)
        .set({
          status: "SIGNED",
          viewedAt: signer.viewedAt ?? occurredAt,
          signedAt: signer.signedAt ?? occurredAt,
          updatedAt: stamp,
        })
        .where(eq(signatureSigner.id, signer.id));
      const refreshed = signers.map((row) =>
        row.id === signer.id
          ? { ...row, status: "SIGNED" as const, signedAt: signer.signedAt ?? occurredAt }
          : row,
      );
      const nextOrder = currentRoutingOrder(refreshed);
      if (Number.isFinite(nextOrder)) {
        await db
          .update(signatureSigner)
          .set({ status: "SENT", sentAt: stamp, updatedAt: stamp })
          .where(
            and(
              eq(signatureSigner.envelopeId, envelope.id),
              eq(signatureSigner.routingOrder, nextOrder),
              eq(signatureSigner.status, "PENDING"),
            ),
          );
        await db
          .update(signatureEnvelope)
          .set({ status: "IN_PROGRESS", updatedAt: stamp })
          .where(eq(signatureEnvelope.id, envelope.id));
        return;
      }
      const latest = await db.query.signatureEnvelope.findFirst({
        where: eq(signatureEnvelope.id, envelope.id),
      });
      if (!latest) notFound();
      if (!latest.executedDocumentId) {
        await completeEnvelope(latest, refreshed);
      }
      return;
    }
  }

  return {
    getEsignStatus(actor: Actor): EsignStatus {
      requirePermission(actor, "contracts:read");
      return esign.status();
    },

    async getSignatureContext(actor: Actor, contractId: string): Promise<SignatureContext> {
      const organizationId = requirePermission(actor, "contracts:read");
      const row = await helpers.scopedContract(organizationId, contractId);
      const [approvedVersionId, open, documents] = await Promise.all([
        latestApprovedVersion(organizationId, contractId),
        openEnvelope(organizationId, contractId),
        helpers.listDocuments(actor, contractId),
      ]);
      const documentId =
        documents.find(
          (item) =>
            item.status === "COMPLETED" &&
            item.hasFile &&
            (item.versionId === row.currentVersionId || !item.versionId),
        )?.id ?? null;
      const blocker = eligibilityBlocker(row, approvedVersionId, open);
      const missingFile =
        !documentId && !blocker
          ? "Upload a completed PDF or DOCX for the approved version before sending for signature."
          : null;
      const reason = blocker ?? missingFile;
      return {
        status: esign.status(),
        canSend: can(actor, "signatures:send"),
        eligible: !reason,
        blocker: reason,
        versionId: row.currentVersionId,
        documentId,
        openEnvelopeId: open?.id ?? null,
      };
    },

    async listEnvelopes(actor: Actor, contractId: string): Promise<EnvelopeView[]> {
      const organizationId = requirePermission(actor, "contracts:read");
      await helpers.scopedContract(organizationId, contractId);
      const rows = await db
        .select()
        .from(signatureEnvelope)
        .where(
          and(
            eq(signatureEnvelope.organizationId, organizationId),
            eq(signatureEnvelope.contractId, contractId),
          ),
        )
        .orderBy(desc(signatureEnvelope.createdAt));
      return Promise.all(rows.map((row) => loadView(organizationId, row)));
    },

    async getEnvelope(actor: Actor, envelopeId: string): Promise<EnvelopeView> {
      const organizationId = requirePermission(actor, "contracts:read");
      const row = await scopedEnvelope(organizationId, envelopeId);
      return loadView(organizationId, row);
    },

    async sendEnvelope(actor: Actor, contractId: string, raw: unknown): Promise<EnvelopeView> {
      const organizationId = requirePermission(actor, "signatures:send");
      const input = parseInput(sendEnvelopeSchema, raw);
      const parent = await helpers.scopedContract(organizationId, contractId);
      const approvedVersionId = await latestApprovedVersion(organizationId, contractId);
      const open = await openEnvelope(organizationId, contractId);
      const blocker = eligibilityBlocker(parent, approvedVersionId, open);
      if (blocker) throw new AppError("CONFLICT", blocker);
      const versionId = parent.currentVersionId;
      if (!versionId) throw new AppError("CONFLICT", "This contract has no current version.");

      const emails = input.signers.map((signer) => signer.email.toLowerCase());
      if (new Set(emails).size !== emails.length) {
        throw new AppError("VALIDATION", "Each signer email must be unique on a request.");
      }
      const partyIds = input.signers
        .map((signer) => signer.partyId)
        .filter((value): value is string => Boolean(value));
      if (partyIds.length > 0) {
        const parties = await db
          .select()
          .from(contractParty)
          .where(
            and(
              eq(contractParty.organizationId, organizationId),
              eq(contractParty.contractId, contractId),
            ),
          );
        const allowed = new Set(parties.map((party) => party.id));
        if (partyIds.some((partyId) => !allowed.has(partyId))) {
          throw new AppError("VALIDATION", "A selected party is not on this contract.");
        }
      }

      const source = await pickSourceDocument(actor, contractId, versionId, input.documentId);
      const file = await helpers.getDocumentFile(actor, source.id);
      const envelopeId = id();
      const createdAt = now();
      const signerRows = input.signers.map((signer) => ({
        id: id(),
        organizationId,
        envelopeId,
        partyId: signer.partyId ?? null,
        name: signer.name,
        email: signer.email.toLowerCase(),
        role: "SIGNATORY",
        routingOrder: signer.routingOrder,
        required: signer.required ?? true,
        status: "PENDING" as const,
        providerSignerId: null as string | null,
        declineReason: null as string | null,
        sentAt: null as Date | null,
        viewedAt: null as Date | null,
        signedAt: null as Date | null,
        declinedAt: null as Date | null,
        createdAt,
        updatedAt: createdAt,
      }));
      const firstOrder = Math.min(
        ...signerRows.filter((signer) => signer.required).map((signer) => signer.routingOrder),
      );
      const provider = await esign.createEnvelope({
        title: parent.title,
        message: input.message,
        document: { fileName: file.fileName, contentType: file.contentType, bytes: file.bytes },
        signers: signerRows.map((signer) => ({
          id: signer.id,
          name: signer.name,
          email: signer.email,
          routingOrder: signer.routingOrder,
        })),
        metadata: { organizationId, envelopeId, contractId, versionId },
      });
      const status = esign.status();
      const sentAt = now();
      const withProvider = signerRows.map((signer) => {
        const mapped = provider.signers.find((item) => item.id === signer.id);
        const onTurn = signer.routingOrder === firstOrder;
        return {
          ...signer,
          providerSignerId: mapped?.providerSignerId ?? null,
          status: onTurn ? ("SENT" as const) : ("PENDING" as const),
          sentAt: onTurn ? sentAt : null,
          updatedAt: sentAt,
        };
      });
      try {
        await db.transaction(async (tx) => {
          await tx.insert(signatureEnvelope).values({
            id: envelopeId,
            organizationId,
            contractId,
            versionId,
            sourceDocumentId: source.id,
            executedDocumentId: null,
            certificateDocumentId: null,
            provider: status.provider,
            providerEnvelopeId: provider.providerEnvelopeId,
            status: "SENT",
            title: parent.title,
            message: input.message ?? null,
            testMode: status.testOnly,
            sentAt,
            completedAt: null,
            declinedAt: null,
            expiredAt: null,
            failedAt: null,
            cancelledAt: null,
            failureReason: null,
            createdByUserId: actor.userId,
            createdAt,
            updatedAt: sentAt,
          });
          await tx.insert(signatureSigner).values(withProvider);
          await tx
            .update(contract)
            .set({ status: "PENDING_SIGNATURE", updatedAt: sentAt })
            .where(and(eq(contract.id, contractId), eq(contract.organizationId, organizationId)));
          await writeAudit(tx, actor, "signature.send", "signature_envelope", envelopeId, {
            contractId,
            versionId,
            provider: status.provider,
            testMode: status.testOnly,
          });
        });
      } catch (error) {
        await esign.cancelEnvelope(provider.providerEnvelopeId).catch(() => undefined);
        throw error;
      }
      return loadView(organizationId, await scopedEnvelope(organizationId, envelopeId));
    },

    async cancelEnvelope(actor: Actor, envelopeId: string): Promise<EnvelopeView> {
      const organizationId = requirePermission(actor, "signatures:send");
      const row = await scopedEnvelope(organizationId, envelopeId);
      if (!OPEN_ENVELOPE.includes(row.status as EnvelopeStatus)) {
        throw new AppError("CONFLICT", "Only an in-progress signature request can be cancelled.");
      }
      if (row.providerEnvelopeId) {
        await esign.cancelEnvelope(row.providerEnvelopeId);
      }
      const cancelledAt = now();
      await db
        .update(signatureEnvelope)
        .set({ status: "CANCELLED", cancelledAt, updatedAt: cancelledAt })
        .where(
          and(
            eq(signatureEnvelope.id, envelopeId),
            eq(signatureEnvelope.organizationId, organizationId),
          ),
        );
      await revertContractToApproved(row);
      await writeAudit(db, actor, "signature.cancel", "signature_envelope", envelopeId, {
        contractId: row.contractId,
      });
      return loadView(organizationId, await scopedEnvelope(organizationId, envelopeId));
    },

    async processSignatureWebhook(input: {
      rawBody: string;
      headers: {
        signature?: string | null;
        timestamp?: string | null;
        eventId?: string | null;
        contentType?: string | null;
      };
      now?: Date;
    }): Promise<{ duplicate: boolean; envelopeId: string | null; status: string | null }> {
      const webhook = options.esignWebhook;
      if (!webhook || webhook.provider === "none") {
        throw new AppError("VALIDATION", "E-signature is not connected.");
      }
      const event = verifyWebhook({
        provider: webhook.provider,
        secret: webhook.secret,
        apiKey: webhook.apiKey,
        toleranceSeconds: webhook.toleranceSeconds,
        rawBody: input.rawBody,
        signatureHeader: input.headers.signature,
        timestampHeader: input.headers.timestamp,
        eventIdHeader: input.headers.eventId,
        contentType: input.headers.contentType,
        now: input.now,
      });
      const envelope = await db.query.signatureEnvelope.findFirst({
        where: and(
          eq(signatureEnvelope.provider, event.provider),
          eq(signatureEnvelope.providerEnvelopeId, event.providerEnvelopeId),
        ),
      });
      if (!envelope) notFound();

      const existing = await db.query.signatureEvent.findFirst({
        where: and(
          eq(signatureEvent.provider, event.provider),
          eq(signatureEvent.providerEventId, event.providerEventId),
        ),
      });
      if (existing?.processedAt) {
        return { duplicate: true, envelopeId: envelope.id, status: envelope.status };
      }

      let eventRow = existing;
      if (!eventRow) {
        const receivedAt = now();
        const signer = matchSigner(
          await db
            .select()
            .from(signatureSigner)
            .where(eq(signatureSigner.envelopeId, envelope.id)),
          event,
        );
        const row = {
          id: id(),
          organizationId: envelope.organizationId,
          envelopeId: envelope.id,
          signerId: signer?.id ?? null,
          provider: event.provider,
          providerEventId: event.providerEventId,
          eventType: event.type,
          payloadHash: sha256(input.rawBody),
          occurredAt: event.occurredAt,
          receivedAt,
          processedAt: null as Date | null,
        };
        try {
          await db.insert(signatureEvent).values(row);
          eventRow = row;
        } catch (error) {
          if (!isUniqueFailure(error)) throw error;
          const raced = await db.query.signatureEvent.findFirst({
            where: and(
              eq(signatureEvent.provider, event.provider),
              eq(signatureEvent.providerEventId, event.providerEventId),
            ),
          });
          if (raced?.processedAt) {
            return { duplicate: true, envelopeId: envelope.id, status: envelope.status };
          }
          eventRow = raced ?? row;
        }
      }

      try {
        await applyEvent(envelope, event);
        const processedAt = now();
        await db
          .update(signatureEvent)
          .set({ processedAt })
          .where(eq(signatureEvent.id, eventRow.id));
      } catch (error) {
        if (isAppError(error) && error.code === "CONFLICT") throw error;
        throw error;
      }
      const latest = await db.query.signatureEnvelope.findFirst({
        where: eq(signatureEnvelope.id, envelope.id),
      });
      return {
        duplicate: false,
        envelopeId: envelope.id,
        status: latest?.status ?? envelope.status,
      };
    },
  };
}
