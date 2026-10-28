import { handleApi, jsonOk, readJson } from "../../../lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const bundle = await clm.sendAssistantMessage(actor, await readJson(request));
    return jsonOk(bundle, 201);
  });
}
