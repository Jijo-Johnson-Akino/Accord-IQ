import { registerAccount } from "@accordiq/auth";
import { assertSameOrigin, jsonError, jsonOk, readJson } from "../../../lib/http";
import { getRuntime } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { auth, db, config } = await getRuntime();
    assertSameOrigin(request, config);
    const registered = await registerAccount(db, auth, await readJson(request), config.APP_URL);
    const body = jsonOk({ created: true }, 201);
    const headers = new Headers(body.headers);
    const cookies =
      typeof registered.response.headers.getSetCookie === "function"
        ? registered.response.headers.getSetCookie()
        : [];
    const fallback = registered.response.headers.get("set-cookie");
    for (const cookie of cookies.length > 0 ? cookies : fallback ? [fallback] : []) {
      headers.append("set-cookie", cookie);
    }
    return new Response(body.body, { status: 201, headers });
  } catch (error) {
    return jsonError(error);
  }
}
