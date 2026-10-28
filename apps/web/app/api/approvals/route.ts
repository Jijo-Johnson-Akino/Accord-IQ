import { handleApi, jsonOk, pageOf, queryParam } from "../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const result = await clm.listApprovals(actor, pageOf(request), {
      contractId: queryParam(request, "contractId"),
      status: queryParam(request, "status"),
    });
    return jsonOk(result);
  });
}
