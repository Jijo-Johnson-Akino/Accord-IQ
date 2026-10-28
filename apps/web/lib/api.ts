import { parsePage } from "@accordiq/core";
import { assertSameOrigin, fileResponse, jsonError, jsonOk, readJson } from "./http";
import { getRuntime } from "./runtime";
import { requireApiActor } from "./session";

type ActorContext = Awaited<ReturnType<typeof requireApiActor>>;

export async function handleApi(
  request: Request,
  run: (ctx: ActorContext) => Promise<Response>,
): Promise<Response> {
  try {
    const ctx = await requireApiActor();
    if (request.method !== "GET" && request.method !== "HEAD") {
      assertSameOrigin(request, ctx.config);
    }
    return await run(ctx);
  } catch (error) {
    return jsonError(error);
  }
}

/** Provider callbacks. No session. Authenticity is the HMAC/event-hash check in CLM. */
export async function handlePublicWebhook(run: () => Promise<Response>): Promise<Response> {
  try {
    await getRuntime();
    return await run();
  } catch (error) {
    return jsonError(error);
  }
}

export function pageOf(request: Request) {
  return parsePage(new URL(request.url).searchParams);
}

export function queryParam(request: Request, name: string): string | null {
  return new URL(request.url).searchParams.get(name);
}

/** Prefer the Idempotency-Key header; body may still send idempotencyKey. */
export function withIdempotencyKey(
  request: Request,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const header = request.headers.get("idempotency-key");
  if (header && typeof body.idempotencyKey !== "string") {
    return { ...body, idempotencyKey: header };
  }
  return body;
}

export { fileResponse, jsonOk, readJson };
