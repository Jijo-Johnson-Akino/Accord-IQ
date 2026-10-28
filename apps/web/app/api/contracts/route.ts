import { handleApi, jsonOk, pageOf, queryParam, readJson } from "../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const result = await clm.listContracts(actor, pageOf(request), {
      status: queryParam(request, "status"),
      category: queryParam(request, "category"),
      vendorId: queryParam(request, "vendorId"),
      expiresAfter: queryParam(request, "expiresAfter"),
      expiresBefore: queryParam(request, "expiresBefore"),
    });
    return jsonOk(result);
  });
}

export async function POST(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    // organizationId in the body is ignored. Tenant scope comes from the session.
    const created = await clm.createContract(actor, await readJson(request));
    return jsonOk(created, 201);
  });
}
