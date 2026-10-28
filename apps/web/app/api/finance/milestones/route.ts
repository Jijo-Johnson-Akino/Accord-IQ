import { handleApi, jsonOk, pageOf, queryParam, readJson } from "../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const result = await clm.listPaymentMilestones(
      actor,
      pageOf(request),
      queryParam(request, "contractId"),
    );
    return jsonOk(result);
  });
}

export async function POST(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const milestone = await clm.createPaymentMilestone(actor, await readJson(request));
    return jsonOk({ milestone }, 201);
  });
}
