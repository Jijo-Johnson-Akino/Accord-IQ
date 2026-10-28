import { BRAND } from "@accordiq/core";

export const dynamic = "force-dynamic";

/** Liveness probe. Deliberately exposes no configuration or secrets. */
export function GET() {
  return Response.json({
    status: "ok",
    service: BRAND.name,
    time: new Date().toISOString(),
  });
}
