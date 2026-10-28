import { AppError } from "@accordiq/core";
import { asString, assertSameOrigin, jsonError, jsonOk, readJson } from "../../../lib/http";
import { requireApiActor } from "../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { actor, access } = await requireApiActor();
    const records = await access.listRecords(actor);
    return jsonOk({ records });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { actor, access, config } = await requireApiActor();
    assertSameOrigin(request, config);
    const body = await readJson(request);
    // organizationId in the body is ignored. Tenant scope comes from the session.
    const title = asString(body.title);
    if (!title.trim()) throw new AppError("VALIDATION", "Title is required.");
    const record = await access.createRecord(actor, title);
    return jsonOk({ record }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
