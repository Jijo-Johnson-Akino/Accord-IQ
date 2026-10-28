import { handleApi, jsonOk, readJson } from "../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const settings = await clm.getMonitoringSettings(actor);
    return jsonOk(settings);
  });
}

export async function PATCH(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const settings = await clm.updateOrganizationTimezone(actor, await readJson(request));
    return jsonOk(settings);
  });
}
