import { handleApi, jsonOk, queryParam } from "../../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, async ({ actor, clm }) => {
    const result = await clm.listObligationCalendar(actor, {
      from: queryParam(request, "from") ?? undefined,
      to: queryParam(request, "to") ?? undefined,
    });
    return jsonOk(result);
  });
}
