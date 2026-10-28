import { getRuntime } from "../../../../lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { auth } = await getRuntime();
  return auth.handler(request);
}

export async function POST(request: Request) {
  const { auth } = await getRuntime();
  return auth.handler(request);
}
