import { handleApi, jsonOk } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const template = await clm.deprecateClause(actor, id);
    return jsonOk({ template });
  });
}
