"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from "@accordiq/ui";
import { CalendarCheck } from "lucide-react";
import {
  FREQUENCY_LABELS,
  OBLIGATION_STATUS_LABELS,
  PRIORITY_LABELS,
  RENEWAL_DECISION_LABELS,
  RENEWAL_DECISION_OPTIONS,
  RENEWAL_STATUS_LABELS,
  obligationTone,
  priorityTone,
  renewalTone,
} from "../obligations/labels";
import type { ObligationRow, RenewalRow } from "../obligations/obligations-workspace";

export function ContractMonitoring({
  contractId,
  canWrite,
  userId,
  obligations,
  watch,
  workflows,
}: {
  contractId: string;
  canWrite: boolean;
  userId: string;
  obligations: ObligationRow[];
  watch: RenewalRow | null;
  workflows: { id: string; name: string; status: string }[];
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);
  const activeWorkflows = workflows.filter((row) => row.status === "ACTIVE");

  async function complete(id: string) {
    setPending(true);
    const response = await fetch(`/api/obligations/${id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({
        tone: "error",
        title: "Could not complete",
        description: body?.error ?? "The server refused this update.",
      });
      return;
    }
    notify({ tone: "success", title: "Obligation completed" });
    router.refresh();
  }

  async function onDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    const response = await fetch(`/api/contracts/${contractId}/renewal/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: String(data.get("decision") ?? "RENEW"),
        templateId: String(data.get("templateId") ?? "") || undefined,
        proposedExpiresOn: String(data.get("proposedExpiresOn") ?? "") || undefined,
      }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({
        tone: "error",
        title: "Could not record decision",
        description: body?.error ?? "The server refused this write.",
      });
      return;
    }
    notify({ tone: "success", title: "Renewal decision recorded" });
    router.refresh();
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-h3">Obligations and renewals</h2>
          <p className="mt-1 text-small text-ink-muted">
            Post-signature monitoring. AccordIQ never renews or terminates this contract without an
            explicit decision and an approved workflow.
          </p>
        </div>
        <Link className="text-small text-primary-strong underline" href="/obligations">
          Open Obligations
        </Link>
      </div>

      {watch ? (
        <Card className="mt-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone={renewalTone(watch.status)} dot>
              {RENEWAL_STATUS_LABELS[watch.status as keyof typeof RENEWAL_STATUS_LABELS] ??
                watch.status}
            </Badge>
            {watch.autoRenew && (
              <Badge tone="warning">Auto-renew flag on — not applied automatically</Badge>
            )}
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-caption text-ink-muted">Notice</dt>
              <dd>{watch.noticeOn}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Terminate by</dt>
              <dd>{watch.terminateBy}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Expires</dt>
              <dd>{watch.expiresOn}</dd>
            </div>
          </dl>
          {canWrite && watch.status !== "TERMINATED" && watch.status !== "CANCELLED" && (
            <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={onDecision}>
              <Field label="Decision">
                <Select name="decision" defaultValue={watch.decision ?? "RENEW"}>
                  {RENEWAL_DECISION_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {RENEWAL_DECISION_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Workflow">
                <Select name="templateId" defaultValue={activeWorkflows[0]?.id ?? ""}>
                  <option value="">Record only</option>
                  {activeWorkflows.map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Proposed expiry">
                <Input name="proposedExpiresOn" type="date" />
              </Field>
              <Button type="submit" loading={pending} className="sm:col-span-3">
                Record decision
              </Button>
            </form>
          )}
        </Card>
      ) : (
        <Alert className="mt-4" tone="info" title="No expiry date">
          Set an expiry date on this contract to start a renewal watch.
        </Alert>
      )}

      {obligations.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={CalendarCheck}
          title="No obligations on this contract"
          description="Record a commitment from Obligations, or promote a verified extraction."
        />
      ) : (
        <Table className="mt-6" caption="Contract obligations">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Obligation</TableHeaderCell>
              <TableHeaderCell>Due</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {obligations.map((row) => {
              const canComplete =
                (row.status === "OPEN" || row.status === "OVERDUE") &&
                (canWrite || row.ownerUserId === userId);
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.title}</div>
                    <div className="text-caption text-ink-muted">
                      {FREQUENCY_LABELS[row.frequency as keyof typeof FREQUENCY_LABELS] ??
                        row.frequency}
                      {" · "}
                      <Badge tone={priorityTone(row.priority)} dot>
                        {PRIORITY_LABELS[row.priority as keyof typeof PRIORITY_LABELS] ??
                          row.priority}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>{row.dueOn ?? "—"}</TableCell>
                  <TableCell>
                    <Badge tone={obligationTone(row.status)} dot>
                      {OBLIGATION_STATUS_LABELS[
                        row.status as keyof typeof OBLIGATION_STATUS_LABELS
                      ] ?? row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {canComplete ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={pending}
                        onClick={() => void complete(row.id)}
                      >
                        Complete
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
