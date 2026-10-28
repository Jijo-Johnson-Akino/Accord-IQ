"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@accordiq/ui";
import { isNavActive, type NavItem } from "../../lib/navigation";

export function NavLink({
  item,
  collapsed = false,
  onNavigate,
}: {
  item: NavItem;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isNavActive(item.href, pathname);

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-small font-medium",
        "transition-colors duration-(--duration-fast)",
        collapsed && "justify-center px-0",
        active
          ? "bg-primary-soft text-primary-strong"
          : "text-ink hover:bg-background hover:text-ink",
      )}
    >
      <item.icon aria-hidden className="size-4 shrink-0" />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="truncate">{item.label}</span>
      )}
    </Link>
  );
}
