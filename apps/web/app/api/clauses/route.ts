import { handleApi, jsonOk, pageOf, queryParam, readJson } from "../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const result = await clm.listClauses(actor, pageOf(request), {
      status: queryParam(request, "status"),
    });
    return jsonOk(result);
  });
}

export async function POST(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const created = await clm.createClause(actor, await readJson(request));
    return jsonOk(created, 201);
  });
}
