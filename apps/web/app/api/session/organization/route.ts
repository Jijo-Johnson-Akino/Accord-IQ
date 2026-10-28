import { AppError } from "@accordiq/core";
import { asString, assertSameOrigin, jsonError, jsonOk, readJson } from "../../../../lib/http";
import { requireApiActor } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { actor, sessionId, access, config } = await requireApiActor();
    assertSameOrigin(request, config);
    const organizationId = asString((await readJson(request)).organizationId).trim();
    if (!organizationId) throw new AppError("VALIDATION", "Organization is required.");
    const org = await access.switchOrganization(actor, organizationId, sessionId);
    return jsonOk({ id: org.id, name: org.name });
  } catch (error) {
    return jsonError(error);
  }
}
