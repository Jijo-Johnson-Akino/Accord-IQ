import { handleApi, jsonOk } from "../../../../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; stageId: string }> },
) {
  return handleApi(_request, async ({ actor, clm }) => {
    const { id, stageId } = await context.params;
    const reviewers = await clm.listReviewers(actor, id, stageId);
    return jsonOk({ reviewers });
  });
}
