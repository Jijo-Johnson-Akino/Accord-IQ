import { handleApi, jsonOk, readJson } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const relations = await clm.listRelations(actor, id);
    return jsonOk({ relations });
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const relation = await clm.addRelation(actor, id, await readJson(request));
    return jsonOk({ relation }, 201);
  });
}
