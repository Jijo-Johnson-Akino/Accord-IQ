import { createHash } from "node:crypto";
import { assertDocumentMagic, inspectDeclaredUpload } from "./validate";
import type { StoredKind } from "./types";

export interface DocumentProcessInput {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  maxBytes?: number;
}

export interface DocumentProcessResult {
  sha256: string;
  kind: StoredKind;
  contentType: string;
  fileName: string;
  pageCount: number | null;
  /**
   * Upload processing does not run a model. On-demand analysis lives in `@accordiq/clm`.
   */
  extraction: null;
}

export interface DocumentProcessor {
  process(input: DocumentProcessInput): Promise<DocumentProcessResult>;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pdfPageCount(bytes: Uint8Array): number | null {
  const text = Buffer.from(bytes).toString("latin1");
  const pages = text.match(/\/Type\s*\/Page(?!s)/g);
  if (!pages || pages.length === 0) return null;
  return pages.length;
}

/** Minimal structural parser. Not extraction and not a model. */
export function createBasicProcessor(): DocumentProcessor {
  return {
    async process(input) {
      const declared = inspectDeclaredUpload({
        fileName: input.fileName,
        contentType: input.contentType,
        byteSize: input.bytes.byteLength,
        maxBytes: input.maxBytes,
      });
      assertDocumentMagic(input.bytes, declared.kind);
      return {
        sha256: sha256Hex(input.bytes),
        kind: declared.kind,
        contentType: declared.contentType,
        fileName: declared.fileName,
        pageCount: declared.kind === "pdf" ? pdfPageCount(input.bytes) : null,
        extraction: null,
      };
    },
  };
}
