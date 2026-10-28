import { handleApi, jsonOk, readJson } from "../../../../../../../lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; stageId: string }> },
) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id, stageId } = await context.params;
    const result = await clm.delegateApproval(actor, id, stageId, await readJson(request));
    return jsonOk(result);
  });
}
