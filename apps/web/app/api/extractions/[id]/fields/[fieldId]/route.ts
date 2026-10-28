import { handleApi, jsonOk, readJson } from "../../../../../../lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; fieldId: string }> },
) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id, fieldId } = await context.params;
    const field = await clm.correctExtractedField(actor, id, fieldId, await readJson(request));
    return jsonOk({ field });
  });
}
