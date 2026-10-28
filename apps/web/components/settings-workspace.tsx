"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, useToast } from "@accordiq/ui";
import { hasPermission, type ShellActor } from "../lib/shell-session";

export function CreateRecordForm({ actor }: { actor: ShellActor }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);

  if (!hasPermission(actor, "records:write")) return null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") ?? "").trim();
    setPending(true);
    const response = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, organizationId: "ignored-client-value" }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({
        tone: "error",
        title: "Could not create record",
        description: body?.error ?? "The server refused this write.",
      });
      if (response.status === 403) {
        router.push("/forbidden");
      }
      return;
    }
    form.reset();
    notify({ tone: "success", title: "Record created" });
    router.refresh();
  }

  return (
    <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onSubmit}>
      <Field label="New workspace record" className="min-w-0 flex-1" required>
        <Input name="title" required placeholder="Title" />
      </Field>
      <Button type="submit" loading={pending} className="sm:mb-0">
        Create
      </Button>
    </form>
  );
}

export function PermissionNote({ actor }: { actor: ShellActor }) {
  if (hasPermission(actor, "records:write")) return null;
  return (
    <Alert className="mt-4" tone="info" title="Read-only on this account">
      Creating records requires a write role. Hiding this form is not the security boundary — a
      direct POST to <code className="font-mono">/api/records</code> is still refused.
    </Alert>
  );
}
