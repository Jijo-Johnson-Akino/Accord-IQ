import { handleApi, jsonOk, pageOf, queryParam, readJson } from "../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const result = await clm.listPriceEscalations(
      actor,
      pageOf(request),
      queryParam(request, "contractId"),
    );
    return jsonOk(result);
  });
}

export async function POST(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const escalation = await clm.createPriceEscalation(actor, await readJson(request));
    return jsonOk({ escalation }, 201);
  });
}
