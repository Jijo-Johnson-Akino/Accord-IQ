"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
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
import { formatWhen } from "./labels";

type SignerDraft = {
  key: string;
  name: string;
  email: string;
  routingOrder: number;
  partyId?: string;
};

type EnvelopeSigner = {
  id: string;
  name: string;
  email: string;
  routingOrder: number;
  status: string;
  sentAt: string | Date | null;
  viewedAt: string | Date | null;
  signedAt: string | Date | null;
  declinedAt: string | Date | null;
  declineReason: string | null;
};

type EnvelopeEvent = {
  id: string;
  eventType: string;
  occurredAt: string | Date;
  receivedAt: string | Date;
  processedAt: string | Date | null;
};

type Envelope = {
  id: string;
  status: string;
  testMode: boolean;
  versionId: string;
  provider: string;
  sentAt: string | Date | null;
  completedAt: string | Date | null;
  executedDocumentId: string | null;
  certificateDocumentId: string | null;
  failureReason: string | null;
  signers: EnvelopeSigner[];
  events: EnvelopeEvent[];
};

type Context = {
  status: { provider: string; available: boolean; testOnly: boolean; setup: string[] };
  canSend: boolean;
  eligible: boolean;
  blocker: string | null;
  versionId: string | null;
  documentId: string | null;
  openEnvelopeId: string | null;
};

const SIGNER_LABELS: Record<string, string> = {
  PENDING: "Waiting",
  SENT: "Sent",
  VIEWED: "Viewed",
  SIGNED: "Signed",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

const ENVELOPE_LABELS: Record<string, string> = {
  SENT: "Sent",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

function tone(status: string): "success" | "error" | "warning" | "info" | "neutral" {
  if (status === "SIGNED" || status === "COMPLETED") return "success";
  if (status === "DECLINED" || status === "FAILED") return "error";
  if (status === "EXPIRED" || status === "CANCELLED") return "warning";
  if (status === "SENT" || status === "VIEWED" || status === "IN_PROGRESS") return "info";
  return "neutral";
}

export function ContractSigning({
  contractId,
  canSend,
  parties,
  context,
  envelopes,
}: {
  contractId: string;
  canSend: boolean;
  parties: { id: string; name: string; email: string | null }[];
  context: Context;
  envelopes: Envelope[];
}) {
  const router = useRouter();
  const { notify } = useToast();
  const initial = useMemo<SignerDraft[]>(() => {
    const withEmail = parties.filter((party) => party.email);
    if (withEmail.length === 0) {
      return [{ key: crypto.randomUUID(), name: "", email: "", routingOrder: 1 }];
    }
    return withEmail.map((party, index) => ({
      key: party.id,
      name: party.name,
      email: party.email ?? "",
      routingOrder: index + 1,
      partyId: party.id,
    }));
  }, [parties]);
  const [signers, setSigners] = useState(initial);
  const [pending, setPending] = useState(false);
  const open = envelopes.find((row) => row.status === "SENT" || row.status === "IN_PROGRESS");

  function updateSigner(key: string, patch: Partial<SignerDraft>) {
    setSigners((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function onSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const response = await fetch(`/api/contracts/${contractId}/envelopes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: context.documentId,
        signers: signers.map((signer) => ({
          name: signer.name,
          email: signer.email,
          routingOrder: signer.routingOrder,
          partyId: signer.partyId,
        })),
      }),
    });
    setPending(false);
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      notify({
        tone: "error",
        title: "Signature request not sent",
        description: body?.error ?? "The server refused this request.",
      });
      return;
    }
    notify({ tone: "success", title: "Signature request sent" });
    router.refresh();
  }

  async function onCancel(envelopeId: string) {
    setPending(true);
    const response = await fetch(`/api/envelopes/${envelopeId}/cancel`, { method: "POST" });
    setPending(false);
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      notify({
        tone: "error",
        title: "Could not cancel",
        description: body?.error ?? "The server refused this request.",
      });
      return;
    }
    router.refresh();
  }

  return (
    <section className="mt-8" id="signatures">
      <h2 className="text-h4">E-signature</h2>
      <p className="mt-1 text-small text-ink-muted">
        Only the approved current version can be sent. Completion is recorded from an authenticated
        provider webhook, not from this page.
      </p>

      {!context.status.available && (
        <Alert className="mt-4" tone="warning" title="E-signature is not connected">
          <p>
            Set a provider in environment variables, then restart the app. Keys stay server-side.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {context.status.setup.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Alert>
      )}

      {context.status.testOnly && (
        <Alert className="mt-4" tone="info" title="Sandbox adapter — not legally binding">
          Events must be posted to <code>/api/webhooks/esign</code> with HMAC headers. This adapter
          does not email signers or stamp a signature image.
        </Alert>
      )}

      {context.blocker && (
        <Alert className="mt-4" tone="warning" title="Not eligible for signing">
          {context.blocker}
        </Alert>
      )}

      {canSend && context.eligible && context.status.available && !open && (
        <form className="mt-4 grid gap-3" onSubmit={onSend}>
          <p className="text-small text-ink-muted">
            Routing order 1 signs first. The same number signs in parallel. Later numbers wait.
          </p>
          {signers.map((signer) => (
            <div key={signer.key} className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem_auto]">
              <Field label="Name" required>
                <Input
                  value={signer.name}
                  onChange={(event) => updateSigner(signer.key, { name: event.target.value })}
                  required
                />
              </Field>
              <Field label="Email" required>
                <Input
                  type="email"
                  value={signer.email}
                  onChange={(event) => updateSigner(signer.key, { email: event.target.value })}
                  required
                />
              </Field>
              <Field label="Order" required>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={signer.routingOrder}
                  onChange={(event) =>
                    updateSigner(signer.key, { routingOrder: Number(event.target.value) || 1 })
                  }
                  required
                />
              </Field>
              <div className="flex items-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setSigners((current) => current.filter((row) => row.key !== signer.key))
                  }
                  disabled={signers.length === 1}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setSigners((current) => [
                  ...current,
                  {
                    key: crypto.randomUUID(),
                    name: "",
                    email: "",
                    routingOrder: current.length + 1,
                  },
                ])
              }
            >
              Add signer
            </Button>
            <Button type="submit" loading={pending}>
              Send signature request
            </Button>
          </div>
        </form>
      )}

      {open && canSend && (
        <div className="mt-4">
          <Button variant="secondary" loading={pending} onClick={() => onCancel(open.id)}>
            Cancel request
          </Button>
        </div>
      )}

      <Table caption="Signing history" className="mt-6">
        <TableHead>
          <TableRow>
            <TableHeaderCell>Request</TableHeaderCell>
            <TableHeaderCell>Signers</TableHeaderCell>
            <TableHeaderCell>Evidence</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {envelopes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3}>No signature requests yet.</TableCell>
            </TableRow>
          ) : (
            envelopes.map((envelope) => (
              <TableRow key={envelope.id}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={tone(envelope.status)}>
                      {ENVELOPE_LABELS[envelope.status] ?? envelope.status}
                    </Badge>
                    {envelope.testMode && <Badge>Sandbox</Badge>}
                  </div>
                  <p className="mt-1 text-caption text-ink-muted">
                    Sent {formatWhen(envelope.sentAt)}
                    {envelope.completedAt ? ` · Completed ${formatWhen(envelope.completedAt)}` : ""}
                  </p>
                  {envelope.failureReason ? (
                    <p className="mt-1 text-caption text-ink-muted">{envelope.failureReason}</p>
                  ) : null}
                  <ul className="mt-2 grid gap-1 text-caption text-ink-muted">
                    {envelope.events.map((item) => (
                      <li key={item.id}>
                        {item.eventType} · {formatWhen(item.occurredAt)}
                      </li>
                    ))}
                  </ul>
                </TableCell>
                <TableCell>
                  <ul className="grid gap-2">
                    {envelope.signers.map((signer) => (
                      <li key={signer.id}>
                        <Badge tone={tone(signer.status)}>
                          {SIGNER_LABELS[signer.status] ?? signer.status}
                        </Badge>{" "}
                        {signer.name} · order {signer.routingOrder}
                        <div className="text-caption text-ink-muted">
                          {signer.email}
                          {signer.viewedAt ? ` · viewed ${formatWhen(signer.viewedAt)}` : ""}
                          {signer.signedAt ? ` · signed ${formatWhen(signer.signedAt)}` : ""}
                          {signer.declinedAt ? ` · declined ${formatWhen(signer.declinedAt)}` : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                </TableCell>
                <TableCell>
                  {envelope.executedDocumentId ? (
                    <a
                      className="block text-primary-strong underline"
                      href={`/api/documents/${envelope.executedDocumentId}/file`}
                    >
                      Executed copy
                    </a>
                  ) : (
                    "—"
                  )}
                  {envelope.certificateDocumentId ? (
                    <a
                      className="mt-1 block text-primary-strong underline"
                      href={`/api/documents/${envelope.certificateDocumentId}/file`}
                    >
                      Completion evidence
                    </a>
                  ) : null}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}
