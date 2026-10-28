"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import {
  Bell,
  Building2,
  FileText,
  ListChecks,
  LogOut,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  EmptyState,
  IconButton,
  Input,
  Kbd,
  Modal,
  buttonClasses,
  cn,
} from "@accordiq/ui";
import { authClient } from "../../lib/auth-client";
import { initials } from "../../lib/shell-session";
import { filterNavItems } from "../../lib/navigation";
import { useShellSession } from "./session-context";

export function QuickCreate() {
  return (
    <DropdownMenu
      align="end"
      aria-label="Quick create"
      label="New"
      trigger={
        <>
          <Plus aria-hidden className="size-4" />
          <span className="hidden sm:inline">New</span>
        </>
      }
      showChevron={false}
      items={[
        {
          label: "Contract",
          href: "/contracts",
          icon: FileText,
          description: "Opens Contracts. Upload a PDF or DOCX from that page.",
        },
        {
          label: "Obligation",
          href: "/obligations",
          icon: ListChecks,
          description:
            "Opens Obligations. Record a commitment, assign an owner, and track renewals.",
        },
        {
          label: "Vendor",
          href: "/vendors",
          icon: Building2,
          description: "Opens Vendors. Creating a record is not connected yet.",
        },
      ]}
    />
  );
}

export function NotificationsMenu() {
  const [items, setItems] = useState<
    {
      id: string;
      title: string;
      body: string;
      href?: string | null;
      entityType: string | null;
      entityId: string | null;
    }[]
  >([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/notifications?limit=10", { signal: controller.signal })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as {
              items?: {
                id: string;
                title: string;
                body: string;
                href?: string | null;
                entityType: string | null;
                entityId: string | null;
              }[];
            })
          : null,
      )
      .then((body) => {
        setItems(body?.items ?? []);
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setItems([]);
          setLoaded(true);
        }
      });
    return () => controller.abort();
  }, []);

  function hrefFor(row: {
    href?: string | null;
    entityType: string | null;
    entityId: string | null;
  }): string | undefined {
    if (row.href) return row.href;
    if (row.entityType === "obligation") return "/obligations";
    if (row.entityType === "renewal") return "/obligations?view=renewals";
    if (row.entityType === "approval_request" && row.entityId) return `/approvals/${row.entityId}`;
    if (row.entityType === "signature_envelope") return "/integrations";
    return undefined;
  }

  const menuItems = !loaded
    ? [{ label: "Loading notifications", disabled: true as const }]
    : items.length === 0
      ? [
          {
            label: "No notifications",
            disabled: true as const,
            description: "Reminders and escalations for this account appear here.",
          },
        ]
      : items.map((row) => ({
          label: row.title,
          description: row.body,
          href: hrefFor(row),
        }));

  return (
    <DropdownMenu
      align="end"
      aria-label="Notifications"
      trigger={<Bell aria-hidden className="size-4" />}
      showChevron={false}
      triggerClassName={buttonClasses({
        variant: "ghost",
        size: "md",
        className: "px-0 size-10",
      })}
      items={menuItems}
    />
  );
}

export function ProfileMenu() {
  const { actor } = useShellSession();
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu
      align="end"
      aria-label="Account menu"
      trigger={
        <>
          <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-caption font-semibold text-primary-strong">
            {initials(actor.name)}
          </span>
          <span className="hidden max-w-36 truncate lg:inline">{actor.name}</span>
        </>
      }
      showChevron={false}
      triggerClassName={buttonClasses({
        variant: "ghost",
        size: "md",
        className: "gap-2 pr-3 pl-1",
      })}
      items={[
        {
          label: actor.email,
          disabled: true,
          description: actor.roleLabel,
        },
        { type: "separator" },
        { label: "Settings", href: "/settings", icon: Settings },
        {
          label: "Sign out",
          icon: LogOut,
          tone: "danger",
          onSelect: () => {
            void signOut();
          },
        },
      ]}
    />
  );
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [contracts, setContracts] = useState<{ id: string; title: string }[]>([]);
  const listId = useId();
  const results = filterNavItems(query);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const needle = query.trim();
    if (!open || needle.length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/contracts?q=${encodeURIComponent(needle)}&limit=8`, {
        signal: controller.signal,
      })
        .then(async (response) =>
          response.ok
            ? ((await response.json()) as { items?: { id: string; title: string }[] })
            : null,
        )
        .then((body) => {
          setContracts(body?.items?.map((row) => ({ id: row.id, title: row.title })) ?? []);
        })
        .catch(() => {
          if (!controller.signal.aborted) setContracts([]);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
  }

  function close() {
    setOpen(false);
    setQuery("");
    setContracts([]);
  }

  const contractHits = query.trim().length >= 2 ? contracts : [];
  const empty = results.length === 0 && contractHits.length === 0;

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className="hidden w-full max-w-md justify-start font-normal text-ink-muted sm:inline-flex sm:min-w-56"
        leadingIcon={<Search aria-hidden className="size-4" />}
      >
        <span className="flex-1 truncate text-left">Search workspace</span>
        <Kbd>Ctrl K</Kbd>
      </Button>

      <IconButton label="Search workspace" className="sm:hidden" onClick={() => setOpen(true)}>
        <Search aria-hidden className="size-4" />
      </IconButton>

      <Modal
        open={open}
        onClose={close}
        title="Search"
        description="Jump to a workspace section or a contract in this organization."
        size="lg"
      >
        <form role="search" onSubmit={onSubmit} className="grid gap-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contracts or sections…"
            aria-label="Search contracts or sections"
            aria-controls={listId}
            autoFocus
          />
          {empty ? (
            <EmptyState
              headingLevel="h3"
              title="No matching contracts or sections"
              description="Try a contract title, counterparty, or section name."
            />
          ) : (
            <ul id={listId} className="grid gap-1">
              {contractHits.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/contracts/${row.id}`}
                    onClick={close}
                    className={cn(
                      "flex items-start gap-3 rounded-md px-3 py-2 text-small",
                      "hover:bg-primary-soft focus-visible:bg-primary-soft",
                    )}
                  >
                    <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-strong" />
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{row.title}</span>
                      <span className="block text-caption text-ink-muted">Contract</span>
                    </span>
                  </Link>
                </li>
              ))}
              {results.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={close}
                    className={cn(
                      "flex items-start gap-3 rounded-md px-3 py-2 text-small",
                      "hover:bg-primary-soft focus-visible:bg-primary-soft",
                    )}
                  >
                    <item.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-strong" />
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{item.label}</span>
                      <span className="block text-caption text-ink-muted">{item.description}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </form>
      </Modal>
    </>
  );
}
