import { handleApi, jsonOk, pageOf, readJson } from "../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const result = await clm.listVendors(actor, pageOf(request));
    return jsonOk(result);
  });
}

export async function POST(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    // organizationId in the body is ignored. Tenant scope comes from the session.
    const vendor = await clm.createVendor(actor, await readJson(request));
    return jsonOk({ vendor }, 201);
  });
}
