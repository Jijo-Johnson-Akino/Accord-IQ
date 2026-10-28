import { jsonError, jsonOk } from "../../../../lib/http";
import { requireApiActor } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { actor, access } = await requireApiActor();
    const { id } = await context.params;
    const record = await access.getRecord(actor, id);
    return jsonOk({ record });
  } catch (error) {
    return jsonError(error);
  }
}
