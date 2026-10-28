import { handleApi, jsonOk, readJson } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const [envelopes, contextView] = await Promise.all([
      clm.listEnvelopes(actor, id),
      clm.getSignatureContext(actor, id),
    ]);
    return jsonOk({ envelopes, context: contextView });
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const envelope = await clm.sendEnvelope(actor, id, await readJson(request));
    return jsonOk({ envelope }, 201);
  });
}
