import type { Metadata } from "next";
import { LoginForm } from "../../../components/auth/login-form";
import { safeNextPath } from "../../../lib/safe-path";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return <LoginForm nextPath={safeNextPath(params.next)} />;
}
