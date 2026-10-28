"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Field, Input } from "@accordiq/ui";
import { useClientReady } from "./client-ready";

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const ready = useClientReady();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        password,
        organizationName: String(form.get("organizationName") ?? ""),
        organizationId: "ignored-client-value",
      }),
    });
    if (!response.ok) {
      setPending(false);
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not create that account.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <h1 className="text-h3">Create an account</h1>
      <p className="mt-2 text-small text-ink-muted">
        This opens a new workspace. It does not join an existing organization.
      </p>
      {error && (
        <Alert className="mt-4" tone="error" title="Could not create account">
          {error}
        </Alert>
      )}
      <form
        className="mt-6 grid gap-4"
        method="post"
        action="/signup"
        data-ready={ready ? "true" : "false"}
        onSubmit={onSubmit}
      >
        <Field label="Full name" required>
          <Input
            name="name"
            type="text"
            autoComplete="name"
            required
            minLength={2}
            maxLength={80}
          />
        </Field>
        <Field
          label="Organization name"
          required
          hint="A new workspace. Not an invite into another tenant."
        >
          <Input
            name="organizationName"
            type="text"
            autoComplete="organization"
            required
            minLength={2}
            maxLength={80}
          />
        </Field>
        <Field label="Email" required>
          <Input name="email" type="email" autoComplete="username" required />
        </Field>
        <Field label="Password" required hint="At least 10 characters.">
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
          />
        </Field>
        <Field label="Confirm password" required>
          <Input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
          />
        </Field>
        <Button type="submit" loading={pending} disabled={!ready}>
          Create account
        </Button>
      </form>
      <p className="mt-4 text-small">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary-strong hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
