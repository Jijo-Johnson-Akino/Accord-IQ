import { handleApi, jsonOk, readJson } from "../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const result = await clm.getContract(actor, id);
    return jsonOk(result);
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const contract = await clm.updateContract(actor, id, await readJson(request));
    return jsonOk({ contract });
  });
}
