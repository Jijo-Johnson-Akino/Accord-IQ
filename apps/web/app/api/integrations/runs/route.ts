import { handleApi, jsonOk, pageOf } from "../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    return jsonOk(await clm.listIntegrationRuns(actor, pageOf(request)));
  });
}
