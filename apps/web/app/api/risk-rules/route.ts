import { handleApi, jsonOk, pageOf, readJson } from "../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const result = await clm.listRiskRules(actor, pageOf(request));
    return jsonOk(result);
  });
}

export async function POST(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const rule = await clm.createRiskRule(actor, await readJson(request));
    return jsonOk({ rule }, 201);
  });
}
