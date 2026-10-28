import { handleApi, jsonOk, readJson, withIdempotencyKey } from "../../../../../../lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const result = await clm.startRenewalApproval(
      actor,
      id,
      withIdempotencyKey(request, await readJson(request)),
    );
    return jsonOk(result, 201);
  });
}
