"use client";

import { Menu } from "lucide-react";
import { IconButton } from "@accordiq/ui";
import { GlobalSearch, NotificationsMenu, ProfileMenu, QuickCreate } from "./command-menus";

export function Topbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface px-3 sm:px-4">
      <IconButton label="Open navigation" className="lg:hidden" onClick={onOpenMobile}>
        <Menu aria-hidden className="size-4" />
      </IconButton>
      <div className="flex min-w-0 flex-1 justify-center sm:justify-start">
        <GlobalSearch />
      </div>
      <div className="flex items-center gap-1">
        <QuickCreate />
        <NotificationsMenu />
        <ProfileMenu />
      </div>
    </header>
  );
}
