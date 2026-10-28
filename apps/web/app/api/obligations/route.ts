import { handleApi, jsonOk, pageOf, queryParam, readJson } from "../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const result = await clm.listObligations(actor, pageOf(request), {
      contractId: queryParam(request, "contractId"),
      status: queryParam(request, "status"),
      ownerUserId: queryParam(request, "ownerUserId"),
      priority: queryParam(request, "priority"),
    });
    return jsonOk(result);
  });
}

export async function POST(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const obligation = await clm.createObligation(actor, await readJson(request));
    return jsonOk({ obligation }, 201);
  });
}
