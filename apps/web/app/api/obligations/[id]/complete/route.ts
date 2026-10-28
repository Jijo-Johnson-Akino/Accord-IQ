import { handleApi, jsonOk, readJson } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const result = await clm.completeObligation(actor, id, await readJson(request));
    return jsonOk(result);
  });
}
