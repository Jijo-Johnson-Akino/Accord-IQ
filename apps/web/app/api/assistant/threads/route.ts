import { handleApi, jsonOk } from "../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const threads = await clm.listAssistantThreads(actor);
    return jsonOk({ threads });
  });
}
