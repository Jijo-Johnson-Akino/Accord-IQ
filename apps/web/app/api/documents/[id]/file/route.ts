import { handleApi, fileResponse } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const file = await clm.getDocumentFile(actor, id);
    const disposition =
      new URL(request.url).searchParams.get("disposition") === "inline" ? "inline" : "attachment";
    return fileResponse({
      bytes: file.bytes,
      contentType: file.contentType,
      fileName: file.fileName,
      disposition,
    });
  });
}
