import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AppError } from "@accordiq/core";
import { MINIMAL_DOCX, MINIMAL_PDF } from "./fixtures";
import { assertSafeStorageKey, buildStorageKey, sanitizeFileName } from "./keys";
import { createLocalStorage } from "./local";
import { createMemoryStorage } from "./memory";
import { createBasicProcessor } from "./processor";
import { createStorage } from "./index";
import { inspectDeclaredUpload } from "./validate";

describe("storage keys", () => {
  it("strips directories from file names and rejects traversal in keys", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(buildStorageKey("org_1", "doc_1", "msa.pdf")).toBe("org_1/doc_1/msa.pdf");
    expect(() => assertSafeStorageKey("../secret")).toThrow(AppError);
    expect(() => assertSafeStorageKey("/absolute/path")).toThrow(AppError);
  });
});

describe("upload validation", () => {
  it("accepts PDF and DOCX declarations and rejects unsupported or oversized files", () => {
    expect(
      inspectDeclaredUpload({
        fileName: "msa.pdf",
        contentType: "application/pdf",
        byteSize: MINIMAL_PDF.byteLength,
      }).kind,
    ).toBe("pdf");
    expect(
      inspectDeclaredUpload({
        fileName: "nda.docx",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteSize: MINIMAL_DOCX.byteLength,
      }).kind,
    ).toBe("docx");
    expect(() =>
      inspectDeclaredUpload({
        fileName: "payload.exe",
        contentType: "application/octet-stream",
        byteSize: 12,
      }),
    ).toThrow(AppError);
    expect(() =>
      inspectDeclaredUpload({
        fileName: "huge.pdf",
        contentType: "application/pdf",
        byteSize: 100,
        maxBytes: 10,
      }),
    ).toThrow(/larger/i);
  });
});

describe("document processor", () => {
  it("hashes a PDF, counts pages, and leaves extraction empty during processing", async () => {
    const result = await createBasicProcessor().process({
      bytes: MINIMAL_PDF,
      fileName: "msa.pdf",
      contentType: "application/pdf",
    });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.pageCount).toBe(1);
    expect(result.extraction).toBeNull();
  });

  it("rejects corrupt PDF and DOCX bytes", async () => {
    const processor = createBasicProcessor();
    await expect(
      processor.process({
        bytes: new TextEncoder().encode("not a document"),
        fileName: "msa.pdf",
        contentType: "application/pdf",
      }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      processor.process({
        bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]),
        fileName: "nda.docx",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("adapters", () => {
  it("round-trips bytes in memory and on disk, and blocks traversal", async () => {
    const memory = createMemoryStorage();
    const stored = await memory.put({
      organizationId: "org_1",
      documentId: "doc_1",
      fileName: "msa.pdf",
      contentType: "application/pdf",
      bytes: MINIMAL_PDF,
    });
    const read = await memory.read(stored.storageKey);
    expect(read?.byteSize).toBe(MINIMAL_PDF.byteLength);
    await expect(memory.read("org_1/../secret")).rejects.toBeInstanceOf(AppError);

    const root = await mkdtemp(join(tmpdir(), "accordiq-storage-"));
    const local = createLocalStorage(root);
    const localStored = await local.put({
      organizationId: "org_1",
      documentId: "doc_1",
      fileName: "msa.pdf",
      contentType: "application/pdf",
      bytes: MINIMAL_PDF,
    });
    const localRead = await local.read(localStored.storageKey);
    expect(localRead?.byteSize).toBe(MINIMAL_PDF.byteLength);
    await expect(local.read("org_1/../../secret")).rejects.toBeInstanceOf(AppError);
    await writeFile(join(root, "outside.bin"), "nope");
    await expect(local.read("outside.bin")).rejects.toBeInstanceOf(AppError);
  });

  it("refuses to construct an S3 driver in this environment", () => {
    expect(() =>
      createStorage({ STORAGE_DRIVER: "s3", STORAGE_LOCAL_DIR: ".data/uploads" }, process.cwd()),
    ).toThrow(/S3 storage is not wired/);
  });
});
