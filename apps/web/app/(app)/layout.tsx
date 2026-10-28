import type { ReactNode } from "react";
import { connection } from "next/server";
import { AppShell } from "../../components/shell/app-shell";
import { requireActor, shellProps } from "../../lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await connection();
  const actor = await requireActor("/dashboard");
  const session = await shellProps(actor);
  return (
    <AppShell actor={session.actor} organizations={session.organizations}>
      {children}
    </AppShell>
  );
}
