import { handleApi, jsonOk } from "../../../../../../lib/api";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; relationId: string }> },
) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id, relationId } = await context.params;
    const result = await clm.removeRelation(actor, id, relationId);
    return jsonOk(result);
  });
}
