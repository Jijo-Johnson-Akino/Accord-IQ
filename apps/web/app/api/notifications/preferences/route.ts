import { handleApi, jsonOk, readJson } from "../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    return jsonOk({ preferences: await clm.listNotificationPreferences(actor) });
  });
}

export async function PATCH(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const preferences = await clm.updateNotificationPreferences(actor, await readJson(request));
    return jsonOk({ preferences });
  });
}
