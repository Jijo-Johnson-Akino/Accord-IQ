import { publicActor } from "@accordiq/auth";
import { jsonError, jsonOk } from "../../../lib/http";
import { requireApiActor } from "../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { actor, access } = await requireApiActor();
    const organizations = await access.listAccessibleOrganizations(actor);
    return jsonOk({
      actor: publicActor(actor),
      organizations: organizations.map((org) => ({ id: org.id, name: org.name })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
