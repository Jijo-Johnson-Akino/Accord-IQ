import { AppError, logInternalError, toErrorPayload, type AppConfig } from "@accordiq/core";

export function jsonOk(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** Authorized download. Never include storage keys or public object URLs. */
export function fileResponse(input: {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
  disposition?: "inline" | "attachment";
}): Response {
  const name = input.fileName.replace(/["\r\n\\]/g, "_");
  const disposition = input.disposition === "inline" ? "inline" : "attachment";
  return new Response(Buffer.from(input.bytes), {
    headers: {
      "Content-Type": input.contentType,
      "Content-Length": String(input.bytes.byteLength),
      "Content-Disposition": `${disposition}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function jsonError(error: unknown): Response {
  const payload = toErrorPayload(error);
  if (payload.code === "INTERNAL") {
    logInternalError(error);
  }
  return Response.json({ error: payload.error, code: payload.code }, { status: payload.status });
}

/** Reject cross-site mutating requests. Same-origin fetch sends Origin; missing Origin is allowed. */
export function assertSameOrigin(request: Request, config: AppConfig): void {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (origin && origin !== config.APP_URL) {
    throw new AppError("FORBIDDEN", "Invalid origin.");
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  return body as Record<string, unknown>;
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
