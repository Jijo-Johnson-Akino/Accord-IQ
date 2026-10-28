import { handleApi, jsonOk, pageOf } from "../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const result = await clm.listNotifications(actor, pageOf(request));
    return jsonOk(result);
  });
}
