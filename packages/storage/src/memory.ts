import { assertSafeStorageKey, buildStorageKey } from "./keys";
import type { ReadObjectResult, StorageAdapter, StoredObject } from "./types";

export function createMemoryStorage(): StorageAdapter {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    async put(input): Promise<StoredObject> {
      const storageKey = buildStorageKey(input.organizationId, input.documentId, input.fileName);
      objects.set(storageKey, {
        bytes: Uint8Array.from(input.bytes),
        contentType: input.contentType,
      });
      return { storageKey, contentType: input.contentType, byteSize: input.bytes.byteLength };
    },
    async read(storageKey): Promise<ReadObjectResult | null> {
      const safe = assertSafeStorageKey(storageKey);
      const row = objects.get(safe);
      if (!row) return null;
      return { bytes: row.bytes, contentType: row.contentType, byteSize: row.bytes.byteLength };
    },
    async remove(storageKey): Promise<void> {
      objects.delete(assertSafeStorageKey(storageKey));
    },
  };
}
