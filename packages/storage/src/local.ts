import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { AppError } from "@accordiq/core";
import { assertSafeStorageKey, buildStorageKey } from "./keys";
import type { ReadObjectResult, StorageAdapter, StoredObject } from "./types";

function resolveKey(rootDir: string, storageKey: string): string {
  const safe = assertSafeStorageKey(storageKey);
  const root = resolve(rootDir);
  const full = resolve(root, ...safe.split("/"));
  const rel = relative(root, full);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new AppError("VALIDATION", "Invalid storage key.");
  }
  if (full.split(sep).includes("..")) {
    throw new AppError("VALIDATION", "Invalid storage key.");
  }
  return full;
}

/** Development adapter. Files live under STORAGE_LOCAL_DIR, never served by URL. */
export function createLocalStorage(rootDir: string): StorageAdapter {
  return {
    async put(input): Promise<StoredObject> {
      const storageKey = buildStorageKey(input.organizationId, input.documentId, input.fileName);
      const full = resolveKey(rootDir, storageKey);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, input.bytes);
      return { storageKey, contentType: input.contentType, byteSize: input.bytes.byteLength };
    },
    async read(storageKey): Promise<ReadObjectResult | null> {
      const full = resolveKey(rootDir, storageKey);
      try {
        const buf = await readFile(full);
        const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        return { bytes, contentType: "application/octet-stream", byteSize: bytes.byteLength };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async remove(storageKey): Promise<void> {
      const full = resolveKey(rootDir, storageKey);
      try {
        await unlink(full);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
    },
  };
}
