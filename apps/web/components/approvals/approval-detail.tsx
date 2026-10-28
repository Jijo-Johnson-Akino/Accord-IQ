"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
  useToast,
} from "@accordiq/ui";
import {
  APPROVAL_STATUS_LABELS,
  DECISION_LABELS,
  EVENT_LABELS,
  ROLE_LABELS,
  STAGE_STATUS_LABELS,
  approvalTone,
  formatWhen,
} from "./labels";

type Stage = {
  id: string;
  name: string;
  requiredRole: string;
  status: string;
  step: number;
  comment: string | null;
  skippedReason: string | null;
  dueAt: string | Date | null;
  overdue: boolean;
  actionable: boolean;
  canAct: boolean;
  allowDelegate: boolean;
  delegatedToUserId: string | null;
  escalateToRole: string | null;
  escalatedAt: string | Date | null;
};

type CommentRow = {
  id: string;
  body: string;
  createdAt: string | Date;
  createdByUserId: string;
};

type EventRow = {
  id: string;
  action: string;
  payloadJson: string | null;
  createdAt: string | Date;
  actorUserId: string;
};

type Reviewer = { userId: string; name: string | null; email: string; role: string };

export function ApprovalDetail({
  requestId,
  canWrite,
  contract,
  request,
  stages,
  comments,
  events,
  reviewersByStage,
}: {
  requestId: string;
  canWrite: boolean;
  contract: { id: string; title: string; status: string };
  request: {
    status: string;
    stale: boolean;
    invalidatedReason: string | null;
    resubmitCount: number;
  };
  stages: Stage[];
  comments: CommentRow[];
  events: EventRow[];
  reviewersByStage: Record<string, Reviewer[]>;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);
  const [commentByStage, setCommentByStage] = useState<Record<string, string>>({});

  async function decide(stageId: string, decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED") {
    const comment = commentByStage[stageId]?.trim() ?? "";
    if (decision !== "APPROVED" && !comment) {
      notify({ tone: "error", title: "Add a comment for this decision." });
      return;
    }
    setPending(true);
    const response = await fetch(`/api/approvals/${requestId}/decision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ stageId, decision, comment: comment || undefined }),
    });
    setPending(false);
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      notify({
        tone: "error",
        title: "Decision refused",
        description: body?.error ?? "The server refused this action.",
      });
      if (response.status === 403) router.push("/forbidden");
      return;
    }
    notify({ tone: "success", title: DECISION_LABELS[decision] });
    router.refresh();
  }

  async function onComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    const response = await fetch(`/api/approvals/${requestId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: String(data.get("body") ?? ""),
        stageId: String(data.get("stageId") ?? "") || undefined,
      }),
    });
    setPending(false);
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      notify({ tone: "error", title: "Comment not saved", description: body?.error });
      return;
    }
    event.currentTarget.reset();
    notify({ tone: "success", title: "Comment added" });
    router.refresh();
  }

  async function onDelegate(event: FormEvent<HTMLFormElement>, stageId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    const response = await fetch(`/api/approvals/${requestId}/stages/${stageId}/delegate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: String(data.get("toUserId") ?? "") }),
    });
    setPending(false);
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      notify({ tone: "error", title: "Delegation refused", description: body?.error });
      if (response.status === 403) router.push("/forbidden");
      return;
    }
    notify({ tone: "success", title: "Stage delegated" });
    router.refresh();
  }

  async function onResubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    const response = await fetch(`/api/approvals/${requestId}/resubmit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: String(data.get("comment") ?? "") || undefined }),
    });
    setPending(false);
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      notify({ tone: "error", title: "Could not resubmit", description: body?.error });
      return;
    }
    notify({ tone: "success", title: "Approval reopened" });
    router.refresh();
  }

  const canResubmit = canWrite && (request.stale || request.status === "CHANGES_REQUESTED");

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={approvalTone(request.status)} dot>
          {APPROVAL_STATUS_LABELS[request.status as keyof typeof APPROVAL_STATUS_LABELS] ??
            request.status}
        </Badge>
        {request.stale && (
          <Badge tone="error" dot>
            Stale
          </Badge>
        )}
        <Link
          className="text-small text-primary-strong underline"
          href={`/contracts/${contract.id}`}
        >
          {contract.title}
        </Link>
      </div>

      <Alert className="mt-6" tone="info" title="Server-enforced workflow">
        Buttons on this page do not grant permission. Prerequisite steps, role, delegation, and
        material-change checks are applied on the server.
      </Alert>

      {request.stale && (
        <Alert className="mt-4" tone="warning" title="Contract details changed">
          {request.invalidatedReason ??
            "Material fields changed after this approval started. Resubmit before deciding."}
        </Alert>
      )}

      {canResubmit && (
        <Card className="mt-6">
          <h2 className="text-h4">Return to review</h2>
          <p className="mt-1 text-small text-ink-muted">
            {request.stale
              ? "Resubmitting a stale request resets every stage from a new snapshot."
              : "Resubmitting reopens stages that requested changes. Prior approvals stay unless the request is stale."}
          </p>
          <form className="mt-4 grid gap-3" onSubmit={(event) => void onResubmit(event)}>
            <Field label="Note">
              <Textarea name="comment" rows={3} />
            </Field>
            <Button type="submit" loading={pending}>
              Resubmit for approval
            </Button>
          </form>
        </Card>
      )}

      <section className="mt-8">
        <h2 className="text-h4">Stages</h2>
        <p className="mt-1 text-small text-ink-muted">
          Stages that share a step run in parallel. Later steps wait until every earlier stage is
          approved or skipped.
        </p>
        <div className="mt-4 grid gap-4">
          {stages.map((stage) => (
            <Card key={stage.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    Step {stage.step} · {stage.name}
                  </p>
                  <p className="text-small text-ink-muted">
                    {ROLE_LABELS[stage.requiredRole as keyof typeof ROLE_LABELS] ??
                      stage.requiredRole}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={approvalTone(stage.status)} dot>
                    {STAGE_STATUS_LABELS[stage.status as keyof typeof STAGE_STATUS_LABELS] ??
                      stage.status}
                  </Badge>
                  {stage.overdue && (
                    <Badge tone="error" dot>
                      Overdue
                    </Badge>
                  )}
                  {stage.escalatedAt && (
                    <Badge tone="warning" dot>
                      Escalated
                    </Badge>
                  )}
                </div>
              </div>
              <dl className="mt-3 grid gap-2 text-small sm:grid-cols-2">
                <div>
                  <dt className="text-caption text-ink-muted">Due</dt>
                  <dd>{formatWhen(stage.dueAt)}</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">Comment</dt>
                  <dd>{stage.comment ?? stage.skippedReason ?? "—"}</dd>
                </div>
              </dl>
              {stage.canAct && (
                <div className="mt-4 grid gap-3">
                  <Field label="Reviewer comment">
                    <Textarea
                      rows={3}
                      value={commentByStage[stage.id] ?? ""}
                      onChange={(event) =>
                        setCommentByStage((current) => ({
                          ...current,
                          [stage.id]: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      loading={pending}
                      onClick={() => void decide(stage.id, "APPROVED")}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      loading={pending}
                      onClick={() => void decide(stage.id, "CHANGES_REQUESTED")}
                    >
                      Request changes
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      loading={pending}
                      onClick={() => void decide(stage.id, "REJECTED")}
                    >
                      Reject
                    </Button>
                  </div>
                  {stage.allowDelegate && !stage.delegatedToUserId && (
                    <form
                      className="flex flex-col gap-3 sm:flex-row sm:items-end"
                      onSubmit={(event) => void onDelegate(event, stage.id)}
                    >
                      <Field label="Delegate to" className="min-w-0 flex-1">
                        <Select name="toUserId" required defaultValue="">
                          <option value="" disabled>
                            Choose a reviewer
                          </option>
                          {(reviewersByStage[stage.id] ?? []).map((reviewer) => (
                            <option key={reviewer.userId} value={reviewer.userId}>
                              {reviewer.name ?? reviewer.email} (
                              {ROLE_LABELS[reviewer.role as keyof typeof ROLE_LABELS] ??
                                reviewer.role}
                              )
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Button type="submit" variant="secondary" loading={pending}>
                        Delegate
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-h4">Comments</h2>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void onComment(event)}>
          <Field label="Stage">
            <Select name="stageId" defaultValue="">
              <option value="">Whole request</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Comment" required>
            <Textarea name="body" required rows={3} />
          </Field>
          <Button type="submit" loading={pending}>
            Add comment
          </Button>
        </form>
        <ul className="mt-4 grid gap-2">
          {comments.length === 0 ? (
            <li className="text-small text-ink-muted">No reviewer comments yet.</li>
          ) : (
            comments.map((row) => (
              <li key={row.id} className="rounded-lg border border-line bg-surface px-4 py-3">
                <p className="text-caption text-ink-muted">{formatWhen(row.createdAt)}</p>
                <p className="mt-1 whitespace-pre-wrap">{row.body}</p>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-h4">History</h2>
        <Table className="mt-3" caption="Approval audit trail">
          <TableHead>
            <TableRow>
              <TableHeaderCell>When</TableHeaderCell>
              <TableHeaderCell>Action</TableHeaderCell>
              <TableHeaderCell>Detail</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3}>No events recorded.</TableCell>
              </TableRow>
            ) : (
              events.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatWhen(row.createdAt)}</TableCell>
                  <TableCell>{EVENT_LABELS[row.action] ?? row.action}</TableCell>
                  <TableCell className="font-mono text-caption">{row.payloadJson ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {request.resubmitCount > 0 && (
          <p className="mt-2 text-caption text-ink-muted">
            Resubmitted {request.resubmitCount} time(s).
          </p>
        )}
      </section>
    </>
  );
}
