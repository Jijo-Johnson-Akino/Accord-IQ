import { join } from "node:path";
import type { AppConfig } from "@accordiq/core";
import { createLocalStorage } from "./local";
import type { StorageAdapter } from "./types";

export type {
  StorageAdapter,
  StoredObject,
  ReadObjectResult,
  PutObjectInput,
  StoredKind,
} from "./types";
export { PDF_CONTENT_TYPE, DOCX_CONTENT_TYPE, DEFAULT_MAX_UPLOAD_BYTES } from "./types";
export { sanitizeFileName, buildStorageKey, assertSafeStorageKey } from "./keys";
export { inspectDeclaredUpload, assertDocumentMagic } from "./validate";
export {
  createBasicProcessor,
  type DocumentProcessor,
  type DocumentProcessInput,
  type DocumentProcessResult,
} from "./processor";
export { createMemoryStorage } from "./memory";
export { createLocalStorage } from "./local";
export { MINIMAL_PDF, MINIMAL_DOCX } from "./fixtures";

export function createStorage(
  config: Pick<AppConfig, "STORAGE_DRIVER" | "STORAGE_LOCAL_DIR">,
  workspaceRoot: string,
): StorageAdapter {
  if (config.STORAGE_DRIVER === "s3") {
    throw new Error("S3 storage is not wired in this environment. Use STORAGE_DRIVER=local.");
  }
  return createLocalStorage(join(workspaceRoot, config.STORAGE_LOCAL_DIR));
}
