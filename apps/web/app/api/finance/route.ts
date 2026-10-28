import { handleApi, jsonOk, queryParam } from "../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const insights = await clm.getFinanceInsights(actor, {
      currency: queryParam(request, "currency"),
      vendorId: queryParam(request, "vendorId"),
      statusGroup: queryParam(request, "statusGroup"),
      contractId: queryParam(request, "contractId"),
    });
    return jsonOk({ insights });
  });
}
