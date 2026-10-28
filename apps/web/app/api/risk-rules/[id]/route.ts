import { handleApi, jsonOk, readJson } from "../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const rule = await clm.getRiskRule(actor, id);
    return jsonOk({ rule });
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const rule = await clm.updateRiskRule(actor, id, await readJson(request));
    return jsonOk({ rule });
  });
}
