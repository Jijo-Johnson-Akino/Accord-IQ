"use client";

import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { IconButton, LogoMark, Wordmark, cn } from "@accordiq/ui";
import { NAV_GROUPS, OVERVIEW_HREF } from "../../lib/navigation";
import { NavLink } from "./nav-link";
import { OrgSwitcher } from "./org-switcher";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      id="app-sidebar"
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface lg:flex",
        collapsed ? "w-[4.5rem]" : "w-64",
        "transition-[width] duration-(--duration-base) ease-(--ease-standard) motion-reduce:transition-none",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1 border-b border-line",
          collapsed ? "h-auto flex-col px-2 py-3" : "h-14 px-3",
        )}
      >
        <Link
          href={OVERVIEW_HREF}
          aria-label="AccordIQ overview"
          className={cn("rounded-md", !collapsed && "min-w-0 flex-1")}
        >
          {collapsed ? <LogoMark /> : <Wordmark />}
        </Link>
        <IconButton
          label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-controls="app-sidebar"
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden className="size-4" />
          ) : (
            <PanelLeftClose aria-hidden className="size-4" />
          )}
        </IconButton>
      </div>

      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto p-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="mb-5 last:mb-0">
            <p
              className={cn(
                "px-3 pb-1 text-caption font-medium tracking-wide text-ink-muted uppercase",
                collapsed && "sr-only",
              )}
            >
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn("border-t border-line p-3", collapsed && "flex justify-center")}>
        <OrgSwitcher collapsed={collapsed} />
      </div>
    </aside>
  );
}
