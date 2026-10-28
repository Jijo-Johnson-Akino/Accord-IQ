"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from "@accordiq/ui";
import { formatUtcStamp, integrationStateLabel } from "./labels";

export type IntegrationCardView = {
  kind: string;
  title: string;
  description: string;
  state: string;
  available: boolean;
  connected: boolean;
  testOnly: boolean;
  provider: string;
  setup: string[];
  credentialConfigured: boolean;
  warning: string | null;
  webhookPath: string | null;
};

export type IntegrationRunView = {
  id: string;
  kind: string;
  action: string;
  status: string;
  attempt: number;
  error: string | null;
  createdAt: string | Date;
};

export function IntegrationsWorkspace({
  items,
  runs,
  organizationSlug,
  canManage,
}: {
  items: IntegrationCardView[];
  runs: IntegrationRunView[];
  organizationSlug: string | null;
  canManage: boolean;
}) {
  return (
    <div className="grid gap-6">
      {items.map((card) => (
        <IntegrationCard
          key={card.kind}
          card={card}
          organizationSlug={organizationSlug}
          canManage={canManage}
        />
      ))}
      {canManage ? <ExecutionLogs runs={runs} /> : null}
    </div>
  );
}

function IntegrationCard({
  card,
  organizationSlug,
  canManage,
}: {
  card: IntegrationCardView;
  organizationSlug: string | null;
  canManage: boolean;
}) {
  const status = integrationStateLabel(card);
  const storeable = card.kind === "CRM" || card.kind === "ERP";
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-h4">{card.title}</h2>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
        <Badge>{card.provider}</Badge>
      </div>
      <p className="mt-2 text-small text-ink-muted">{card.description}</p>
      {card.warning ? (
        <Alert className="mt-4" tone={card.connected ? "success" : "warning"} title={status.label}>
          {card.warning}
        </Alert>
      ) : null}
      {!card.connected ? (
        <div className="mt-4">
          <p className="text-small font-medium text-ink">Setup</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-small text-ink">
            {card.setup.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {card.webhookPath ? (
        <p className="mt-3 text-caption text-ink-muted">
          Webhook: <code>{card.webhookPath}</code>
          {organizationSlug ? (
            <>
              {" "}
              · header <code>X-AccordIQ-Organization: {organizationSlug}</code>
            </>
          ) : null}
        </p>
      ) : null}
      {storeable && canManage ? (
        <CredentialForm kind={card.kind} credentialConfigured={card.credentialConfigured} />
      ) : null}
    </Card>
  );
}

function CredentialForm({
  kind,
  credentialConfigured,
}: {
  kind: string;
  credentialConfigured: boolean;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);
  const [revoking, setRevoking] = useState(false);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    const response = await fetch("/api/integrations/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        provider: String(data.get("provider") ?? ""),
        apiKey: String(data.get("apiKey") ?? ""),
        webhookSecret: String(data.get("webhookSecret") ?? "") || undefined,
        organizationId: "ignored-client-value",
      }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({
        tone: "error",
        title: "Could not store credentials",
        description: body?.error ?? "The server refused this write.",
      });
      return;
    }
    const body = (await response.json()) as { connected?: boolean; warning?: string };
    form.reset();
    notify({
      tone: "info",
      title: "Credentials stored",
      description:
        body.warning ??
        "The secret is encrypted on the server. This integration is still not connected.",
    });
    router.refresh();
  }

  async function onRevoke() {
    setRevoking(true);
    const response = await fetch("/api/integrations/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    setRevoking(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({
        tone: "error",
        title: "Could not revoke credentials",
        description: body?.error ?? "The server refused this write.",
      });
      return;
    }
    notify({ tone: "success", title: "Credentials revoked" });
    router.refresh();
  }

  return (
    <form className="mt-4 grid gap-3" onSubmit={onSave}>
      <Field label="Provider name" hint="A label only. No adapter is called.">
        <Input name="provider" required maxLength={40} placeholder="hubspot" autoComplete="off" />
      </Field>
      <Field
        label="API key"
        hint="Stored encrypted. Never shown again and never sent to the browser."
      >
        <Input name="apiKey" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <Field
        label="Webhook secret"
        hint="HMAC secret for POST /api/webhooks/integrations. Optional until you send callbacks."
      >
        <Input name="webhookSecret" type="password" minLength={16} autoComplete="new-password" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          Store credentials
        </Button>
        {credentialConfigured ? (
          <Button type="button" variant="danger" loading={revoking} onClick={() => void onRevoke()}>
            Revoke
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function ExecutionLogs({ runs }: { runs: IntegrationRunView[] }) {
  return (
    <section>
      <h2 className="text-h4">Execution logs</h2>
      <p className="mt-1 text-small text-ink-muted">
        Saves, revocations, and inbound webhooks. Errors never include API keys.
      </p>
      <div className="mt-3">
        <Table caption="Integration execution logs">
          <TableHead>
            <TableRow>
              <TableHeaderCell>When</TableHeaderCell>
              <TableHeaderCell>Kind</TableHeaderCell>
              <TableHeaderCell>Action</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Detail</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>No integration runs yet.</TableCell>
              </TableRow>
            ) : (
              runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{formatUtcStamp(run.createdAt)}</TableCell>
                  <TableCell>{run.kind}</TableCell>
                  <TableCell>{run.action}</TableCell>
                  <TableCell>{run.status}</TableCell>
                  <TableCell>{run.error ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
