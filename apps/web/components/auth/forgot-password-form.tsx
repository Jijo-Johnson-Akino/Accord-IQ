"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert, Button, Card, Field, Input } from "@accordiq/ui";
import { authClient } from "../../lib/auth-client";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    const result = await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPending(false);
    if (result.error) {
      setError("We could not queue a reset email. Try again in a moment.");
      return;
    }
    setSent(true);
  }

  return (
    <Card>
      <h1 className="text-h3">Reset password</h1>
      <p className="mt-2 text-small text-ink-muted">
        Enter your email. If an account exists, a reset link is queued. This form does not say
        whether the address is registered.
      </p>
      {error && (
        <Alert className="mt-4" tone="error" title="Request failed">
          {error}
        </Alert>
      )}
      {sent ? (
        <Alert className="mt-4" tone="success" title="Check the reset outbox">
          If that address has an account, a link was queued. In local development the URL is written
          to <code className="font-mono">.data/mail-outbox.jsonl</code>. Production uses Resend when{" "}
          <code className="font-mono">EMAIL_DRIVER=resend</code>.
        </Alert>
      ) : (
        <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
          <Field label="Email" required>
            <Input name="email" type="email" autoComplete="username" required />
          </Field>
          <Button type="submit" loading={pending}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-4 text-small">
        <Link href="/login" className="font-medium text-primary-strong hover:underline">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
