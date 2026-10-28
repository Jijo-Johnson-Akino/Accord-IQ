import { jsonError, jsonOk } from "../../../lib/http";
import { requireApiActor } from "../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { actor, access } = await requireApiActor();
    const members = await access.listMembers(actor);
    return jsonOk({ members });
  } catch (error) {
    return jsonError(error);
  }
}
