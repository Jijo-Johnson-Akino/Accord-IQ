import { AppError } from "@accordiq/core";
import { handleApi, jsonOk, readJson } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const documents = await clm.listDocuments(actor, id);
    return jsonOk({ documents });
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        throw new AppError("VALIDATION", "Choose a PDF or DOCX file.");
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const versionId = String(form.get("versionId") ?? "").trim() || undefined;
      const result = await clm.uploadDocument(actor, id, {
        bytes,
        fileName: file.name,
        contentType: file.type,
        versionId,
        idempotencyKey: request.headers.get("idempotency-key"),
      });
      return jsonOk(result, result.replayed ? 200 : 201);
    }
    const document = await clm.registerDocument(actor, id, await readJson(request));
    return jsonOk({ document }, 201);
  });
}
