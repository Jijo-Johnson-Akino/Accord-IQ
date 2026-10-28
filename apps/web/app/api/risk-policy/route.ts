import { handleApi, jsonOk, readJson } from "../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    return jsonOk(await clm.getRiskPolicy(actor));
  });
}

export async function PATCH(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const policy = await clm.updateRiskPolicy(actor, await readJson(request));
    return jsonOk(policy);
  });
}
