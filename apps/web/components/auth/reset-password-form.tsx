"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Field, Input } from "@accordiq/ui";
import { authClient } from "../../lib/auth-client";

export function ResetPasswordForm({ token, invalid }: { token: string | null; invalid: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    invalid || !token ? "This reset link is missing or no longer valid. Request a new one." : null,
  );
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (newPassword.length < 10) {
      setPending(false);
      setError("Use at least 10 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setPending(false);
      setError("The two passwords do not match.");
      return;
    }
    const result = await authClient.resetPassword({ token, newPassword });
    setPending(false);
    if (result.error) {
      setError("This reset link is invalid or expired. Request a new one.");
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <Card>
      <h1 className="text-h3">Choose a new password</h1>
      <p className="mt-2 text-small text-ink-muted">
        This replaces the previous password and signs out other sessions.
      </p>
      {error && (
        <Alert className="mt-4" tone="error" title="Cannot reset password">
          {error}
        </Alert>
      )}
      <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
        <Field label="New password" required hint="At least 10 characters.">
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            disabled={!token}
          />
        </Field>
        <Field label="Confirm password" required>
          <Input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            disabled={!token}
          />
        </Field>
        <Button type="submit" loading={pending} disabled={!token}>
          Update password
        </Button>
      </form>
      <p className="mt-4 text-small">
        <Link href="/forgot-password" className="font-medium text-primary-strong hover:underline">
          Request a new link
        </Link>
      </p>
    </Card>
  );
}
