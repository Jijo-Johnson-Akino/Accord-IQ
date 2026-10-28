import { handleApi, jsonOk } from "../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const vendor = await clm.getVendor(actor, id);
    return jsonOk({ vendor });
  });
}
