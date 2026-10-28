import { handlePublicWebhook, jsonOk } from "../../../../lib/api";
import { getRuntime } from "../../../../lib/runtime";

export const dynamic = "force-dynamic";

/** Dropbox Sign and the sandbox adapter post here. The browser cannot mark a contract signed. */
export async function POST(request: Request) {
  return handlePublicWebhook(async () => {
    const { clm } = await getRuntime();
    const rawBody = await request.text();
    const result = await clm.processSignatureWebhook({
      rawBody,
      headers: {
        signature: request.headers.get("x-accordiq-signature"),
        timestamp: request.headers.get("x-accordiq-timestamp"),
        eventId: request.headers.get("x-accordiq-event-id"),
        contentType: request.headers.get("content-type"),
      },
    });
    return jsonOk(result);
  });
}
