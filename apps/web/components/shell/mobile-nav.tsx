"use client";

import Link from "next/link";
import { Drawer, Wordmark } from "@accordiq/ui";
import { NAV_GROUPS, OVERVIEW_HREF } from "../../lib/navigation";
import { NavLink } from "./nav-link";
import { OrgSwitcher } from "./org-switcher";

export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Navigation"
      description="Workspace sections"
      side="left"
    >
      <Link
        href={OVERVIEW_HREF}
        onClick={onClose}
        aria-label="AccordIQ overview"
        className="mb-4 flex px-1"
      >
        <Wordmark />
      </Link>
      <nav aria-label="Mobile">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="mb-5">
            <p className="px-3 pb-1 text-caption font-medium tracking-wide text-ink-muted uppercase">
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} onNavigate={onClose} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <OrgSwitcher />
    </Drawer>
  );
}
