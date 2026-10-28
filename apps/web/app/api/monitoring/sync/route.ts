import { handleApi, jsonOk } from "../../../../lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const result = await clm.syncMonitoring(actor);
    return jsonOk(result);
  });
}
