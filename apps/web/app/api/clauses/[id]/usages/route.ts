import { handleApi, jsonOk, readJson } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const usage = await clm.addClauseUsage(actor, id, await readJson(request));
    return jsonOk({ usage }, 201);
  });
}
