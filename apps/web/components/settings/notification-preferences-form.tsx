"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@accordiq/ui";
import { NOTIFICATION_KIND_LABELS } from "../integrations/labels";

export type PreferenceRow = { kind: string; inApp: boolean; email: boolean };

export function NotificationPreferencesForm({
  preferences,
  emailTestOnly,
}: {
  preferences: PreferenceRow[];
  emailTestOnly: boolean;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = preferences.map((row) => ({
      kind: row.kind,
      inApp: data.get(`${row.kind}:inApp`) === "on",
      email: data.get(`${row.kind}:email`) === "on",
    }));
    setPending(true);
    const response = await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: payload }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({
        tone: "error",
        title: "Could not save preferences",
        description: body?.error ?? "The server refused this write.",
      });
      return;
    }
    notify({ tone: "success", title: "Notification preferences saved" });
    router.refresh();
  }

  return (
    <form className="mt-3" onSubmit={onSubmit}>
      {emailTestOnly ? (
        <p className="mb-3 text-caption text-ink-muted">
          Email is the console outbox, not a live provider. Uncheck Email to skip the queue.
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr className="text-left text-caption text-ink-muted">
              <th className="py-1.5 pr-3 font-medium">Kind</th>
              <th className="py-1.5 pr-3 font-medium">In-app</th>
              <th className="py-1.5 font-medium">Email</th>
            </tr>
          </thead>
          <tbody>
            {preferences.map((row) => (
              <tr key={row.kind} className="border-t border-line">
                <td className="py-2 pr-3">{NOTIFICATION_KIND_LABELS[row.kind] ?? row.kind}</td>
                <td className="py-2 pr-3">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      name={`${row.kind}:inApp`}
                      defaultChecked={row.inApp}
                      className="size-4 accent-primary"
                    />
                    <span className="sr-only">In-app for {row.kind}</span>
                  </label>
                </td>
                <td className="py-2">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      name={`${row.kind}:email`}
                      defaultChecked={row.email}
                      className="size-4 accent-primary"
                    />
                    <span className="sr-only">Email for {row.kind}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button className="mt-3" type="submit" loading={pending}>
        Save preferences
      </Button>
    </form>
  );
}
