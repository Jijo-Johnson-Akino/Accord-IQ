"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Select, useToast } from "@accordiq/ui";
import { TIMEZONE_OPTIONS } from "../obligations/labels";

export function TimezoneForm({
  timezone,
  today,
  canManage,
}: {
  timezone: string;
  today: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);
  const options = (TIMEZONE_OPTIONS as readonly string[]).includes(timezone)
    ? TIMEZONE_OPTIONS
    : [timezone, ...TIMEZONE_OPTIONS];

  if (!canManage) {
    return (
      <p className="mt-2 text-small text-ink">
        {timezone} · today {today}
      </p>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = String(new FormData(event.currentTarget).get("timezone") ?? "");
    setPending(true);
    const response = await fetch("/api/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: next }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({
        tone: "error",
        title: "Could not update timezone",
        description: body?.error ?? "The server refused this write.",
      });
      return;
    }
    notify({ tone: "success", title: "Timezone updated" });
    router.refresh();
  }

  return (
    <form className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onSubmit}>
      <Field label="IANA timezone" className="min-w-0 flex-1" hint={`Today in this zone: ${today}`}>
        <Select name="timezone" defaultValue={timezone}>
          {options.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" loading={pending}>
        Save timezone
      </Button>
    </form>
  );
}
