import type { Metadata } from "next";
import { ResetPasswordForm } from "../../../../components/auth/reset-password-form";

export const metadata: Metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token?: string[] }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const path = await params;
  const query = await searchParams;
  const token = query.token ?? path.token?.[0] ?? null;
  return <ResetPasswordForm token={token} invalid={query.error === "INVALID_TOKEN"} />;
}
