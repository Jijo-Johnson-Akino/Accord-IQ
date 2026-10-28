import { AppError } from "@accordiq/core";
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  DOCX_CONTENT_TYPE,
  PDF_CONTENT_TYPE,
  type StoredKind,
} from "./types";
import { sanitizeFileName } from "./keys";

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04

export interface InspectedUpload {
  fileName: string;
  contentType: string;
  kind: StoredKind;
  byteSize: number;
}

function startsWith(bytes: Uint8Array, magic: Uint8Array): boolean {
  if (bytes.byteLength < magic.byteLength) return false;
  for (let i = 0; i < magic.byteLength; i += 1) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

function extensionOf(fileName: string): string {
  const base = sanitizeFileName(fileName);
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot).toLowerCase() : "";
}

function declaredKind(fileName: string, contentType: string): StoredKind {
  const ext = extensionOf(fileName);
  const type = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  const pdfType = type === PDF_CONTENT_TYPE || type === "application/x-pdf";
  const docxType =
    type === DOCX_CONTENT_TYPE || type === "application/zip" || type === "application/octet-stream";
  if (ext === ".pdf" && (pdfType || type === "" || type === "application/octet-stream"))
    return "pdf";
  if (ext === ".docx" && (docxType || type === "")) return "docx";
  throw new AppError("VALIDATION", "Upload a PDF or DOCX file.");
}

/** Size, name and declared type only. Does not inspect bytes as instructions. */
export function inspectDeclaredUpload(input: {
  fileName: string;
  contentType: string;
  byteSize: number;
  maxBytes?: number;
}): InspectedUpload {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    throw new AppError("VALIDATION", "The file is empty.");
  }
  if (input.byteSize > maxBytes) {
    const mb = Math.floor(maxBytes / (1024 * 1024));
    throw new AppError("VALIDATION", `The file is larger than ${mb} MB.`);
  }
  const fileName = sanitizeFileName(input.fileName);
  const kind = declaredKind(fileName, input.contentType);
  const contentType = kind === "pdf" ? PDF_CONTENT_TYPE : DOCX_CONTENT_TYPE;
  return { fileName, contentType, kind, byteSize: input.byteSize };
}

/**
 * Magic-byte check. File bytes are never evaluated or sent to a model here. Analysis is on-demand
 * after access control, not in this gate.
 */
export function assertDocumentMagic(bytes: Uint8Array, kind: StoredKind): void {
  if (kind === "pdf") {
    if (!startsWith(bytes, PDF_MAGIC)) {
      throw new AppError("VALIDATION", "The file is not a valid PDF.");
    }
    return;
  }
  if (!startsWith(bytes, ZIP_MAGIC)) {
    throw new AppError("VALIDATION", "The file is not a valid Word document.");
  }
  const asText = Buffer.from(bytes.subarray(0, Math.min(bytes.byteLength, 4096))).toString(
    "latin1",
  );
  if (!asText.includes("word/")) {
    throw new AppError("VALIDATION", "The file is not a valid Word document.");
  }
}
