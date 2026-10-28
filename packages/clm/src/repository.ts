import { and, desc, eq, ne, or } from "drizzle-orm";
import { AppError, isAppError, parseInput, type AppConfig } from "@accordiq/core";
import type { Actor, Mailer } from "@accordiq/auth";
import { contract, contractRelation, contractVersion, document, type Database } from "@accordiq/db";
import type { LlmAdapter } from "@accordiq/ai";
import type { EsignAdapter, EsignProviderName } from "@accordiq/esign";
import {
  createBasicProcessor,
  DEFAULT_MAX_UPLOAD_BYTES,
  inspectDeclaredUpload,
  type DocumentProcessor,
  type StorageAdapter,
} from "@accordiq/storage";
import { RELATION_TYPES, type RelationType } from "./enums";
import { id, notFound, optionalFilter, requirePermission, writeAudit } from "./helpers";
import { addRelationSchema, registerDocumentSchema } from "./validation";

export interface EsignWebhookOptions {
  provider: EsignProviderName;
  secret: string;
  apiKey?: string;
  toleranceSeconds: number;
}

export interface ClmOptions {
  storage?: StorageAdapter;
  processor?: DocumentProcessor;
  maxUploadBytes?: number;
  llm?: LlmAdapter;
  esign?: EsignAdapter;
  esignWebhook?: EsignWebhookOptions;
  clock?: () => Date;
  mailer?: Mailer;
  credentialSecret?: string;
  config?: Pick<AppConfig, "EMAIL_DRIVER" | "NODE_ENV" | "STORAGE_DRIVER" | "APP_URL">;
  notificationMaxAttempts?: number;
  integrationWebhookToleranceSeconds?: number;
}

export type PublicDocument = Omit<typeof document.$inferSelect, "storageKey"> & {
  hasFile: boolean;
};

export type DuplicateHit = {
  id: string;
  contractId: string;
  fileName: string;
};

export type UploadResult = {
  document: PublicDocument;
  duplicates: DuplicateHit[];
  replayed: boolean;
};

export type RelationView = {
  id: string;
  relationType: string;
  direction: "outgoing" | "incoming";
  otherContract: { id: string; title: string };
};

export function toPublicDocument(row: typeof document.$inferSelect): PublicDocument {
  const { storageKey, ...rest } = row;
  return { ...rest, hasFile: Boolean(storageKey) };
}

function now(): Date {
  return new Date();
}

function isUniqueConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("unique") || message.includes("constraint");
}

function requireStorage(storage: StorageAdapter | undefined): StorageAdapter {
  if (!storage) {
    throw new AppError("INTERNAL", "Document storage is not configured.");
  }
  return storage;
}

export function createDocumentAccess(
  db: Database,
  options: ClmOptions,
  helpers: {
    scopedContract: (
      organizationId: string,
      contractId: string,
    ) => Promise<typeof contract.$inferSelect>;
  },
) {
  const processor = options.processor ?? createBasicProcessor();
  const maxUploadBytes = options.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;

  async function scopedDocument(organizationId: string, documentId: string) {
    const row = await db.query.document.findFirst({
      where: and(eq(document.id, documentId), eq(document.organizationId, organizationId)),
    });
    if (!row) notFound();
    return row;
  }

  async function findDuplicates(
    organizationId: string,
    sha256: string,
    excludeId: string,
  ): Promise<DuplicateHit[]> {
    return db
      .select({
        id: document.id,
        contractId: document.contractId,
        fileName: document.fileName,
      })
      .from(document)
      .where(
        and(
          eq(document.organizationId, organizationId),
          eq(document.sha256, sha256),
          eq(document.status, "COMPLETED"),
          ne(document.id, excludeId),
        ),
      );
  }

  async function loadExistingByKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<UploadResult | null> {
    const existing = await db.query.document.findFirst({
      where: and(
        eq(document.organizationId, organizationId),
        eq(document.idempotencyKey, idempotencyKey),
      ),
    });
    if (!existing) return null;
    const duplicates = existing.sha256
      ? await findDuplicates(organizationId, existing.sha256, existing.id)
      : [];
    return { document: toPublicDocument(existing), duplicates, replayed: true };
  }

  async function markFailed(organizationId: string, documentId: string, message: string) {
    const processedAt = now();
    await db
      .update(document)
      .set({
        status: "FAILED",
        processingError: message,
        processedAt,
        updatedAt: processedAt,
      })
      .where(and(eq(document.id, documentId), eq(document.organizationId, organizationId)));
  }

  async function processStoredDocument(input: {
    organizationId: string;
    documentId: string;
    bytes: Uint8Array;
    fileName: string;
    contentType: string;
  }): Promise<UploadResult> {
    const queuedAt = now();
    await db
      .update(document)
      .set({ status: "QUEUED", updatedAt: queuedAt })
      .where(
        and(eq(document.id, input.documentId), eq(document.organizationId, input.organizationId)),
      );
    const processingAt = now();
    await db
      .update(document)
      .set({ status: "PROCESSING", updatedAt: processingAt })
      .where(
        and(eq(document.id, input.documentId), eq(document.organizationId, input.organizationId)),
      );

    try {
      const result = await processor.process({
        bytes: input.bytes,
        fileName: input.fileName,
        contentType: input.contentType,
        maxBytes: maxUploadBytes,
      });
      // Upload processing does not call the model. Analysis is on-demand via intelligence access.
      const completedAt = now();
      await db
        .update(document)
        .set({
          status: "COMPLETED",
          sha256: result.sha256,
          pageCount: result.pageCount,
          contentType: result.contentType,
          fileName: result.fileName,
          processingError: null,
          processedAt: completedAt,
          updatedAt: completedAt,
        })
        .where(
          and(eq(document.id, input.documentId), eq(document.organizationId, input.organizationId)),
        );
      const row = await scopedDocument(input.organizationId, input.documentId);
      const duplicates = await findDuplicates(input.organizationId, result.sha256, row.id);
      return { document: toPublicDocument(row), duplicates, replayed: false };
    } catch (error) {
      const message = isAppError(error) ? error.message : "Document processing failed.";
      await markFailed(input.organizationId, input.documentId, message);
      const row = await scopedDocument(input.organizationId, input.documentId);
      return { document: toPublicDocument(row), duplicates: [], replayed: false };
    }
  }

  return {
    async findDocumentByIdempotency(
      actor: Actor,
      idempotencyKey: string,
    ): Promise<UploadResult | null> {
      const organizationId = requirePermission(actor, "contracts:write");
      const key = idempotencyKey.trim();
      if (!key) return null;
      return loadExistingByKey(organizationId, key);
    },

    async listDocuments(actor: Actor, contractId: string): Promise<PublicDocument[]> {
      const organizationId = requirePermission(actor, "contracts:read");
      await helpers.scopedContract(organizationId, contractId);
      const rows = await db
        .select()
        .from(document)
        .where(
          and(eq(document.contractId, contractId), eq(document.organizationId, organizationId)),
        )
        .orderBy(desc(document.createdAt));
      return rows.map(toPublicDocument);
    },

    async registerDocument(
      actor: Actor,
      contractId: string,
      raw: unknown,
    ): Promise<PublicDocument> {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(registerDocumentSchema, raw);
      const parent = await helpers.scopedContract(organizationId, contractId);
      if (input.versionId) {
        const version = await db.query.contractVersion.findFirst({
          where: and(
            eq(contractVersion.id, input.versionId),
            eq(contractVersion.organizationId, organizationId),
            eq(contractVersion.contractId, contractId),
          ),
        });
        if (!version) notFound();
      }
      const createdAt = now();
      const row = {
        id: id(),
        organizationId,
        contractId,
        versionId: input.versionId ?? parent.currentVersionId,
        fileName: input.fileName,
        contentType: input.contentType,
        byteSize: input.byteSize,
        storageKey: null as string | null,
        status: "QUEUED" as const,
        sha256: null as string | null,
        processingError: null as string | null,
        processedAt: null as Date | null,
        pageCount: null as number | null,
        idempotencyKey: null as string | null,
        createdByUserId: actor.userId,
        createdAt,
        updatedAt: createdAt,
      };
      await db.transaction(async (tx) => {
        await tx.insert(document).values(row);
        await writeAudit(tx, actor, "document.register", "document", row.id, {
          contractId,
          fileName: row.fileName,
        });
      });
      return toPublicDocument(row);
    },

    async uploadDocument(
      actor: Actor,
      contractId: string,
      input: {
        bytes: Uint8Array;
        fileName: string;
        contentType: string;
        versionId?: string | null;
        idempotencyKey?: string | null;
      },
    ): Promise<UploadResult> {
      const organizationId = requirePermission(actor, "contracts:write");
      const storage = requireStorage(options.storage);
      const parent = await helpers.scopedContract(organizationId, contractId);
      const idempotencyKey = input.idempotencyKey?.trim() || null;

      if (idempotencyKey) {
        const replayed = await loadExistingByKey(organizationId, idempotencyKey);
        if (replayed) return replayed;
      }

      const declared = inspectDeclaredUpload({
        fileName: input.fileName,
        contentType: input.contentType,
        byteSize: input.bytes.byteLength,
        maxBytes: maxUploadBytes,
      });

      if (input.versionId) {
        const version = await db.query.contractVersion.findFirst({
          where: and(
            eq(contractVersion.id, input.versionId),
            eq(contractVersion.organizationId, organizationId),
            eq(contractVersion.contractId, contractId),
          ),
        });
        if (!version) notFound();
      }

      const documentId = id();
      const createdAt = now();
      const row = {
        id: documentId,
        organizationId,
        contractId,
        versionId: input.versionId ?? parent.currentVersionId,
        fileName: declared.fileName,
        contentType: declared.contentType,
        byteSize: declared.byteSize,
        storageKey: null as string | null,
        status: "UPLOADING" as const,
        sha256: null as string | null,
        processingError: null as string | null,
        processedAt: null as Date | null,
        pageCount: null as number | null,
        idempotencyKey,
        createdByUserId: actor.userId,
        createdAt,
        updatedAt: createdAt,
      };

      try {
        await db.insert(document).values(row);
      } catch (error) {
        if (idempotencyKey && isUniqueConflict(error)) {
          const replayed = await loadExistingByKey(organizationId, idempotencyKey);
          if (replayed) return replayed;
        }
        throw error;
      }

      await writeAudit(db, actor, "document.upload", "document", documentId, {
        contractId,
        fileName: declared.fileName,
      });

      try {
        const stored = await storage.put({
          organizationId,
          documentId,
          fileName: declared.fileName,
          contentType: declared.contentType,
          bytes: input.bytes,
        });
        await db
          .update(document)
          .set({ storageKey: stored.storageKey, updatedAt: now() })
          .where(and(eq(document.id, documentId), eq(document.organizationId, organizationId)));
      } catch (error) {
        const message = isAppError(error) ? error.message : "The file could not be stored.";
        await markFailed(organizationId, documentId, message);
        const failed = await scopedDocument(organizationId, documentId);
        return { document: toPublicDocument(failed), duplicates: [], replayed: false };
      }

      return processStoredDocument({
        organizationId,
        documentId,
        bytes: input.bytes,
        fileName: declared.fileName,
        contentType: declared.contentType,
      });
    },

    async retryDocumentProcessing(actor: Actor, documentId: string): Promise<UploadResult> {
      const organizationId = requirePermission(actor, "contracts:write");
      const storage = requireStorage(options.storage);
      const row = await scopedDocument(organizationId, documentId);
      if (row.status !== "FAILED") {
        throw new AppError("CONFLICT", "Only failed documents can be retried.");
      }
      if (!row.storageKey) {
        throw new AppError("VALIDATION", "This document has no stored file to retry.");
      }
      const object = await storage.read(row.storageKey);
      if (!object) {
        throw new AppError("NOT_FOUND", "This document has no stored file.");
      }
      await writeAudit(db, actor, "document.retry", "document", documentId, {
        contractId: row.contractId,
      });
      return processStoredDocument({
        organizationId,
        documentId,
        bytes: object.bytes,
        fileName: row.fileName,
        contentType: row.contentType,
      });
    },

    async getDocumentFile(
      actor: Actor,
      documentId: string,
    ): Promise<{ bytes: Uint8Array; contentType: string; fileName: string; byteSize: number }> {
      const organizationId = requirePermission(actor, "contracts:read");
      const storage = requireStorage(options.storage);
      const row = await scopedDocument(organizationId, documentId);
      if (!row.storageKey) {
        throw new AppError("NOT_FOUND", "This document has no stored file.");
      }
      const object = await storage.read(row.storageKey);
      if (!object) {
        throw new AppError("NOT_FOUND", "This document has no stored file.");
      }
      return {
        bytes: object.bytes,
        contentType: row.contentType,
        fileName: row.fileName,
        byteSize: row.byteSize,
      };
    },

    async listRelations(actor: Actor, contractId: string): Promise<RelationView[]> {
      const organizationId = requirePermission(actor, "contracts:read");
      await helpers.scopedContract(organizationId, contractId);
      const rows = await db
        .select({
          id: contractRelation.id,
          relationType: contractRelation.relationType,
          fromContractId: contractRelation.fromContractId,
          toContractId: contractRelation.toContractId,
        })
        .from(contractRelation)
        .where(
          and(
            eq(contractRelation.organizationId, organizationId),
            or(
              eq(contractRelation.fromContractId, contractId),
              eq(contractRelation.toContractId, contractId),
            ),
          ),
        );

      const otherIds = [
        ...new Set(
          rows.map((row) =>
            row.fromContractId === contractId ? row.toContractId : row.fromContractId,
          ),
        ),
      ];
      const titleFilters = otherIds.map((otherId) => eq(contract.id, otherId));
      const titles =
        titleFilters.length === 0
          ? []
          : await db
              .select({ id: contract.id, title: contract.title })
              .from(contract)
              .where(and(eq(contract.organizationId, organizationId), or(...titleFilters)));
      const titleById = new Map(titles.map((row) => [row.id, row.title]));

      return rows.map((row) => {
        const outgoing = row.fromContractId === contractId;
        const otherId = outgoing ? row.toContractId : row.fromContractId;
        return {
          id: row.id,
          relationType: row.relationType,
          direction: outgoing ? ("outgoing" as const) : ("incoming" as const),
          otherContract: { id: otherId, title: titleById.get(otherId) ?? "Contract" },
        };
      });
    },

    async addRelation(actor: Actor, contractId: string, raw: unknown) {
      const organizationId = requirePermission(actor, "contracts:write");
      const input = parseInput(addRelationSchema, raw);
      const relationType = optionalFilter<RelationType>(input.relationType, RELATION_TYPES);
      if (!relationType) throw new AppError("VALIDATION", "Unknown relation type.");
      if (input.toContractId === contractId) {
        throw new AppError("VALIDATION", "A contract cannot relate to itself.");
      }
      await helpers.scopedContract(organizationId, contractId);
      await helpers.scopedContract(organizationId, input.toContractId);
      const existing = await db.query.contractRelation.findFirst({
        where: and(
          eq(contractRelation.organizationId, organizationId),
          eq(contractRelation.fromContractId, contractId),
          eq(contractRelation.toContractId, input.toContractId),
          eq(contractRelation.relationType, relationType),
        ),
      });
      if (existing) throw new AppError("CONFLICT", "That relationship already exists.");
      const row = {
        id: id(),
        organizationId,
        fromContractId: contractId,
        toContractId: input.toContractId,
        relationType,
        createdByUserId: actor.userId,
        createdAt: now(),
      };
      try {
        await db.transaction(async (tx) => {
          await tx.insert(contractRelation).values(row);
          await writeAudit(tx, actor, "contract.relation.add", "contract_relation", row.id, {
            fromContractId: contractId,
            toContractId: input.toContractId,
            relationType,
          });
        });
      } catch (error) {
        if (isUniqueConflict(error)) {
          throw new AppError("CONFLICT", "That relationship already exists.");
        }
        throw error;
      }
      return row;
    },

    async removeRelation(actor: Actor, contractId: string, relationId: string) {
      const organizationId = requirePermission(actor, "contracts:write");
      await helpers.scopedContract(organizationId, contractId);
      const row = await db.query.contractRelation.findFirst({
        where: and(
          eq(contractRelation.id, relationId),
          eq(contractRelation.organizationId, organizationId),
          or(
            eq(contractRelation.fromContractId, contractId),
            eq(contractRelation.toContractId, contractId),
          ),
        ),
      });
      if (!row) notFound();
      await db
        .delete(contractRelation)
        .where(
          and(
            eq(contractRelation.id, relationId),
            eq(contractRelation.organizationId, organizationId),
          ),
        );
      await writeAudit(db, actor, "contract.relation.remove", "contract_relation", relationId, {
        contractId,
      });
      return { id: relationId };
    },
  };
}
