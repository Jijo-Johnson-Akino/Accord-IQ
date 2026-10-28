export const PDF_CONTENT_TYPE = "application/pdf";
export const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type StoredKind = "pdf" | "docx";

export interface PutObjectInput {
  organizationId: string;
  documentId: string;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface StoredObject {
  storageKey: string;
  contentType: string;
  byteSize: number;
}

export interface ReadObjectResult {
  bytes: Uint8Array;
  contentType: string;
  byteSize: number;
}

/**
 * Private object storage. Keys are never returned to browsers; callers stream bytes through
 * an authorized HTTP handler.
 */
export interface StorageAdapter {
  put(input: PutObjectInput): Promise<StoredObject>;
  read(storageKey: string): Promise<ReadObjectResult | null>;
  remove(storageKey: string): Promise<void>;
}

export const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
