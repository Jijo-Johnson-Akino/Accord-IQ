import { handleApi, jsonOk, readJson } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const assessments = await clm.listRiskAssessments(actor, id);
    return jsonOk({ assessments });
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(request, async ({ actor, clm }) => {
    const { id } = await context.params;
    const result = await clm.assessContract(actor, id, await readJson(request));
    return jsonOk(result, 201);
  });
}
