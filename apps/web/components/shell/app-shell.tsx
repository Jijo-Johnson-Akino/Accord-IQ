"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Breadcrumbs } from "@accordiq/ui";
import { breadcrumbsFor } from "../../lib/navigation";
import {
  getSidebarCollapsed,
  getSidebarCollapsedServer,
  setSidebarCollapsed,
  subscribeSidebarCollapsed,
} from "../../lib/sidebar-collapsed";
import type { ShellActor, ShellOrganization } from "../../lib/shell-session";
import { MobileNav } from "./mobile-nav";
import { ShellSessionProvider } from "./session-context";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({
  children,
  actor,
  organizations,
}: {
  children: ReactNode;
  actor: ShellActor;
  organizations: ShellOrganization[];
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribeSidebarCollapsed,
    getSidebarCollapsed,
    getSidebarCollapsedServer,
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  const crumbs = breadcrumbsFor(pathname);

  return (
    <ShellSessionProvider actor={actor} organizations={organizations}>
      <div className="flex min-h-screen bg-background">
        <Sidebar collapsed={collapsed} onToggle={() => setSidebarCollapsed(!collapsed)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenMobile={() => setMobileOpen(true)} />
          <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />
          <main id="main" className="min-w-0 flex-1 px-gutter py-6 sm:px-8 sm:py-8">
            {!actor.organizationId && (
              <div className="mb-5 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-small text-ink">
                Select an organization to scope this workspace. Tenant data is not loaded until
                then.
              </div>
            )}
            <Breadcrumbs
              className="mb-5"
              items={crumbs}
              renderLink={(item, className) => (
                <Link href={item.href ?? "/dashboard"} className={className}>
                  {item.label}
                </Link>
              )}
            />
            {children}
          </main>
        </div>
      </div>
    </ShellSessionProvider>
  );
}
