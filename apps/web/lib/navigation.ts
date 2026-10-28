import {
  BarChart3,
  BookMarked,
  Building2,
  CalendarCheck,
  FileText,
  GitPullRequestArrow,
  History,
  LayoutDashboard,
  LineChart,
  Plug,
  Settings,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Short description used in search results and on placeholder pages. */
  description: string;
  /** True only for routes that have a real page (not a "coming in a later phase" placeholder). */
  implemented: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      {
        label: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
        description: "Counts, risk, activity and renewals for the workspace.",
        implemented: true,
      },
      {
        label: "Contracts",
        href: "/contracts",
        icon: FileText,
        description: "Repository, versions and secure document upload.",
        implemented: true,
      },
      {
        label: "AI Contract Studio",
        href: "/studio",
        icon: Sparkles,
        description: "Authorized research, citations, playbook drafts and obligation lookup.",
        implemented: true,
      },
      {
        label: "Approvals",
        href: "/approvals",
        icon: GitPullRequestArrow,
        description: "In-flight reviews and decisions waiting on you.",
        implemented: true,
      },
      {
        label: "Obligations",
        href: "/obligations",
        icon: CalendarCheck,
        description: "Commitments, dates and renewal reminders.",
        implemented: true,
      },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    items: [
      {
        label: "Vendors",
        href: "/vendors",
        icon: Building2,
        description: "Counterparties, contacts and vendor records.",
        implemented: false,
      },
      {
        label: "Financial Intelligence",
        href: "/finance",
        icon: LineChart,
        description: "Contract-stated value, committed spend, imported transactions and forecasts.",
        implemented: true,
      },
      {
        label: "Clause Library",
        href: "/clauses",
        icon: BookMarked,
        description: "Approved language, playbooks and policy checks.",
        implemented: true,
      },
      {
        label: "Workflows",
        href: "/workflows",
        icon: Workflow,
        description: "Configurable approval paths and routing rules.",
        implemented: true,
      },
      {
        label: "Reports & Analytics",
        href: "/reports",
        icon: BarChart3,
        description: "Saved views across contracts, risk and spend.",
        implemented: false,
      },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      {
        label: "Integrations",
        href: "/integrations",
        icon: Plug,
        description: "E-signature, email, storage, and future CRM/ERP connections.",
        implemented: true,
      },
      {
        label: "Activity & Audit Logs",
        href: "/activity",
        icon: History,
        description: "Append-only history of who did what, and when.",
        implemented: false,
      },
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        description: "Workspace, members and notification preferences.",
        implemented: true,
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export const OVERVIEW_HREF = "/dashboard";

export function requireNavItem(href: string): NavItem {
  const item = NAV_ITEMS.find((candidate) => candidate.href === href);
  if (!item) throw new Error(`Unknown workspace route: ${href}`);
  return item;
}

/** True when this nav href is the current page (or a nested path of it). */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === OVERVIEW_HREF) {
    return pathname === OVERVIEW_HREF;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => isNavActive(item.href, pathname));
}

export function breadcrumbsFor(pathname: string): { href?: string; label: string }[] {
  const overview = { href: OVERVIEW_HREF, label: "Overview" };
  const current = navItemForPath(pathname);
  if (!current || current.href === OVERVIEW_HREF) {
    return [{ label: overview.label }];
  }
  if (current.href === "/contracts" && pathname.startsWith("/contracts/")) {
    return [overview, { href: "/contracts", label: current.label }, { label: "Contract" }];
  }
  if (current.href === "/clauses" && pathname.startsWith("/clauses/")) {
    return [overview, { href: "/clauses", label: current.label }, { label: "Clause" }];
  }
  if (current.href === "/approvals" && pathname.startsWith("/approvals/")) {
    return [overview, { href: "/approvals", label: current.label }, { label: "Request" }];
  }
  return [overview, { label: current.label }];
}

/** Client-side jump-to-section filter. Does not search contract text. */
export function filterNavItems(query: string, items: NavItem[] = NAV_ITEMS): NavItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => {
    const haystack = `${item.label} ${item.description}`.toLowerCase();
    return haystack.includes(needle);
  });
}
