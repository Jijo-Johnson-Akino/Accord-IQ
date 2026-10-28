import { handleApi, jsonOk } from "../../../../lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const notification = await clm.markNotificationRead(actor, id);
    return jsonOk({ notification });
  });
}
