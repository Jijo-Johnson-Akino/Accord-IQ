import { handleApi, jsonOk, readJson } from "../../../../lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const finding = await clm.reviewRiskFinding(actor, id, await readJson(request));
    return jsonOk({ finding });
  });
}
