"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Field, Input } from "@accordiq/ui";
import { authClient } from "../../lib/auth-client";
import { safeNextPath } from "../../lib/safe-path";
import { useClientReady } from "./client-ready";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const ready = useClientReady();
  const destination = safeNextPath(nextPath);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setPending(false);
      setError("Invalid email or password.");
      return;
    }
    router.push(destination);
    router.refresh();
  }

  return (
    <Card>
      <h1 className="text-h3">Sign in</h1>
      <p className="mt-2 text-small text-ink-muted">
        Sign in with an existing account, or create a new workspace.
      </p>
      {error && (
        <Alert className="mt-4" tone="error" title="Could not sign in">
          {error}
        </Alert>
      )}
      <form
        className="mt-6 grid gap-4"
        method="post"
        action="/login"
        data-ready={ready ? "true" : "false"}
        onSubmit={onSubmit}
      >
        <Field label="Email" required>
          <Input name="email" type="email" autoComplete="username" required />
        </Field>
        <Field label="Password" required>
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" loading={pending} disabled={!ready}>
          Sign in
        </Button>
      </form>
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-small">
        <Link href="/signup" className="font-medium text-primary-strong hover:underline">
          Create an account
        </Link>
        <Link href="/forgot-password" className="font-medium text-primary-strong hover:underline">
          Forgot password
        </Link>
      </p>
    </Card>
  );
}
