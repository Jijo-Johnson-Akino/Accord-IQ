"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card, Field, Select, useToast } from "@accordiq/ui";
import {
  APPROVAL_STATUS_LABELS,
  ROLE_LABELS,
  STAGE_STATUS_LABELS,
  approvalTone,
} from "../approvals/labels";

type Workflow = {
  id: string;
  name: string;
  status: string;
  stages: { id: string; name: string; requiredRole: string; step: number }[];
};

type RequestRow = {
  id: string;
  status: string;
  stale: boolean;
  createdAt: string | Date;
};

type OpenStage = {
  id: string;
  name: string;
  requiredRole: string;
  status: string;
  step: number;
  canAct: boolean;
  overdue: boolean;
};

export function ContractApprovals({
  contractId,
  canWrite,
  workflows,
  requests,
  openStages,
}: {
  contractId: string;
  canWrite: boolean;
  workflows: Workflow[];
  requests: RequestRow[];
  openStages: OpenStage[] | null;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);
  const open = requests.find(
    (row) => row.status === "IN_PROGRESS" || row.status === "CHANGES_REQUESTED",
  );

  async function onStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    const response = await fetch(`/api/contracts/${contractId}/approvals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ templateId: String(data.get("templateId") ?? "") }),
    });
    setPending(false);
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      request?: { id: string };
    } | null;
    if (!response.ok || !body?.request) {
      notify({
        tone: "error",
        title: "Approval not started",
        description: body?.error ?? "The server refused this workflow.",
      });
      if (response.status === 403) router.push("/forbidden");
      return;
    }
    notify({ tone: "success", title: "Approval started" });
    router.push(`/approvals/${body.request.id}`);
    router.refresh();
  }

  return (
    <section className="mt-8">
      <h2 className="text-h4">Approvals</h2>
      <p className="mt-1 text-small text-ink-muted">
        Prerequisite stages, role checks, and stale snapshots are enforced on the server.
      </p>

      {open && (
        <Card className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={approvalTone(open.status)} dot>
              {APPROVAL_STATUS_LABELS[open.status as keyof typeof APPROVAL_STATUS_LABELS] ??
                open.status}
            </Badge>
            {open.stale && (
              <Badge tone="error" dot>
                Stale
              </Badge>
            )}
            <Link className="text-primary-strong underline" href={`/approvals/${open.id}`}>
              Open request
            </Link>
          </div>
          {openStages && (
            <ul className="mt-3 grid gap-2">
              {openStages.map((stage) => (
                <li key={stage.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Step {stage.step} · {stage.name} (
                    {ROLE_LABELS[stage.requiredRole as keyof typeof ROLE_LABELS] ??
                      stage.requiredRole}
                    )
                  </span>
                  <span className="flex gap-2">
                    <Badge tone={approvalTone(stage.status)} dot>
                      {STAGE_STATUS_LABELS[stage.status as keyof typeof STAGE_STATUS_LABELS] ??
                        stage.status}
                    </Badge>
                    {stage.canAct && (
                      <Badge tone="info" dot>
                        Awaiting you
                      </Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {canWrite && !open && (
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => void onStart(event)}
        >
          <Field label="Workflow" className="min-w-0 flex-1" required>
            <Select name="templateId" required defaultValue={workflows[0]?.id ?? ""}>
              {workflows
                .filter((row) => row.status === "ACTIVE")
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Button type="submit" loading={pending} disabled={workflows.length === 0}>
            Start approval
          </Button>
        </form>
      )}

      {!canWrite && (
        <Alert className="mt-4" tone="info" title="Read-only on this account">
          Starting or resubmitting an approval requires a write role.
        </Alert>
      )}

      {requests.length > 1 && (
        <ul className="mt-4 grid gap-1 text-small">
          {requests.map((row) => (
            <li key={row.id}>
              <Link className="text-primary-strong underline" href={`/approvals/${row.id}`}>
                {APPROVAL_STATUS_LABELS[row.status as keyof typeof APPROVAL_STATUS_LABELS] ??
                  row.status}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
