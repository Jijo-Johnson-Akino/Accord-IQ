import { handleApi, jsonOk, readJson } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const body = await readJson(request);
    const versionId = typeof body.versionId === "string" ? body.versionId : undefined;
    const template = await clm.approveClause(actor, id, versionId);
    return jsonOk({ template });
  });
}
