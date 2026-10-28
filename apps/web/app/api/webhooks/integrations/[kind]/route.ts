import { handlePublicWebhook, jsonOk } from "../../../../../lib/api";
import { getRuntime } from "../../../../../lib/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ kind: string }> }) {
  return handlePublicWebhook(async () => {
    const { clm } = await getRuntime();
    const { kind } = await context.params;
    const rawBody = await request.text();
    const result = await clm.processIntegrationWebhook({
      kind,
      rawBody,
      headers: {
        signature: request.headers.get("x-accordiq-signature"),
        timestamp: request.headers.get("x-accordiq-timestamp"),
        eventId: request.headers.get("x-accordiq-event-id"),
        organizationSlug: request.headers.get("x-accordiq-organization"),
      },
    });
    return jsonOk(result);
  });
}
