"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Badge, cn, useToast } from "@accordiq/ui";
import { useShellSession } from "./session-context";

export function OrgSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { actor, organizations } = useShellSession();
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);

  async function select(organizationId: string) {
    if (organizationId === actor.organizationId || pending) return;
    setPending(true);
    const response = await fetch("/api/session/organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    setPending(false);
    if (!response.ok) {
      notify({
        tone: "error",
        title: "Could not switch organization",
        description: "That workspace is not available on this account.",
      });
      return;
    }
    router.refresh();
  }

  const current = organizations.find((org) => org.id === actor.organizationId);

  if (organizations.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed border-line-strong bg-background",
          collapsed ? "p-1" : "p-2.5",
        )}
      >
        <p
          className={cn(
            "flex items-start gap-2 text-small text-ink-muted",
            collapsed && "justify-center",
          )}
        >
          <Building2 aria-hidden className="mt-0.5 size-4 shrink-0" />
          {collapsed ? (
            <span className="sr-only">No organization</span>
          ) : (
            <span className="min-w-0">
              <span className="block font-medium text-ink">No organization</span>
              <Badge className="mt-1.5">Not a member</Badge>
            </span>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-md border border-line bg-background", collapsed ? "p-1" : "p-2")}>
      <p
        className={cn(
          "flex items-center gap-2 px-1 pt-1 text-caption text-ink-muted",
          collapsed && "sr-only",
        )}
      >
        <Building2 aria-hidden className="size-3.5" />
        Organization
      </p>
      {collapsed ? (
        <p
          className="px-1 py-1 text-center text-caption font-medium text-ink"
          title={current?.name}
        >
          {(current?.name ?? "?").slice(0, 1)}
        </p>
      ) : (
        <label className="mt-1 block">
          <span className="sr-only">Switch organization</span>
          <select
            className="h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-small text-ink"
            value={actor.organizationId ?? ""}
            disabled={pending}
            onChange={(event) => void select(event.target.value)}
          >
            {!actor.organizationId && <option value="">Select…</option>}
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
