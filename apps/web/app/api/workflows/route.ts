import { handleApi, jsonOk, readJson } from "../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const workflows = await clm.listWorkflows(actor);
    return jsonOk({ workflows });
  });
}

export async function POST(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const workflow = await clm.createWorkflow(actor, await readJson(request));
    return jsonOk({ workflow }, 201);
  });
}
