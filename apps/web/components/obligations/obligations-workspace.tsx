"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  cn,
  useToast,
} from "@accordiq/ui";
import { CalendarCheck } from "lucide-react";
import {
  FREQUENCY_LABELS,
  FREQUENCY_OPTIONS,
  OBLIGATION_STATUS_LABELS,
  OBLIGATION_STATUS_OPTIONS,
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
  RENEWAL_DECISION_LABELS,
  RENEWAL_DECISION_OPTIONS,
  RENEWAL_STATUS_LABELS,
  RENEWAL_STATUS_OPTIONS,
  obligationTone,
  priorityTone,
  renewalTone,
} from "./labels";

export type ObligationRow = {
  id: string;
  title: string;
  description: string | null;
  dueOn: string | null;
  status: string;
  ownerUserId: string | null;
  frequency: string;
  priority: string;
  contractId: string;
  contractTitle: string;
  sourceQuote: string | null;
};

export type CalendarItem = {
  date: string;
  kind: "OBLIGATION" | "NOTICE" | "EXPIRY" | "TERMINATION";
  id: string;
  title: string;
  status: string;
  contractId: string;
  contractTitle: string;
  priority: string | null;
};

export type RenewalRow = {
  id: string;
  contractId: string;
  contractTitle: string;
  contractStatus: string;
  expiresOn: string;
  noticeOn: string;
  terminateBy: string;
  autoRenew: boolean;
  status: string;
  decision: string | null;
  approvalRequestId: string | null;
};

function tabHref(view: string, status: string) {
  const params = new URLSearchParams();
  if (view !== "list") params.set("view", view);
  if (status) params.set("status", status);
  const query = params.toString();
  return query ? `/obligations?${query}` : "/obligations";
}

function addUtcDays(iso: string, days: number): string {
  const parts = iso.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function ObligationsWorkspace({
  canWrite,
  userId,
  view,
  status,
  timezone,
  today,
  obligations,
  calendar,
  renewals,
  contracts,
  members,
  workflows,
}: {
  canWrite: boolean;
  userId: string;
  view: "list" | "calendar" | "renewals";
  status: string;
  timezone: string;
  today: string;
  obligations: ObligationRow[];
  calendar: { from: string; to: string; items: CalendarItem[] };
  renewals: RenewalRow[];
  contracts: { id: string; title: string }[];
  members: { userId: string; name: string; email: string }[];
  workflows: { id: string; name: string; status: string }[];
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const memberName = useMemo(() => {
    const map = new Map(members.map((member) => [member.userId, member.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "Unassigned") : "Unassigned");
  }, [members]);

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

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    const response = await fetch("/api/obligations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contractId: String(data.get("contractId") ?? ""),
        title: String(data.get("title") ?? "").trim(),
        description: String(data.get("description") ?? "").trim() || undefined,
        dueOn: String(data.get("dueOn") ?? "") || undefined,
        ownerUserId: String(data.get("ownerUserId") ?? "") || undefined,
        frequency: String(data.get("frequency") ?? "ONCE"),
        priority: String(data.get("priority") ?? "MEDIUM"),
        reminderDaysBefore: Number(data.get("reminderDaysBefore") || 7),
        escalateDaysAfter: Number(data.get("escalateDaysAfter") || 1),
        sourceQuote: String(data.get("sourceQuote") ?? "").trim() || undefined,
      }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({
        tone: "error",
        title: "Could not create obligation",
        description: body?.error ?? "The server refused this write.",
      });
      return;
    }
    notify({ tone: "success", title: "Obligation recorded" });
    setCreateOpen(false);
    router.refresh();
  }

  const tabs = [
    { id: "list", label: "List" },
    { id: "calendar", label: "Calendar" },
    { id: "renewals", label: "Renewals" },
  ] as const;

  return (
    <>
      <Alert className="mt-6" tone="info" title="Monitoring only">
        Dates use {timezone} (today {today}). Reminders are recorded once per due date. AccordIQ
        does not renew or terminate a contract unless someone records a decision and an approved
        workflow authorizes it.
      </Alert>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Obligation views" className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={tabHref(tab.id, status)}
              role="tab"
              aria-selected={view === tab.id}
              className={cn(
                "rounded-md px-3 py-2 text-small font-medium",
                view === tab.id
                  ? "bg-primary-soft text-primary-strong"
                  : "text-ink-muted hover:bg-primary-soft hover:text-ink",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        {canWrite && view === "list" && (
          <Button onClick={() => setCreateOpen(true)}>New obligation</Button>
        )}
      </div>

      {view === "list" && (
        <>
          <form className="mt-4 max-w-xs">
            <Select
              name="status"
              defaultValue={status}
              aria-label="Filter by status"
              onChange={(event) => {
                router.push(tabHref("list", event.currentTarget.value));
              }}
            >
              <option value="">All statuses</option>
              {OBLIGATION_STATUS_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {OBLIGATION_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </form>
          {obligations.length === 0 ? (
            <EmptyState
              className="mt-8"
              icon={CalendarCheck}
              title="No obligations"
              description="Commitments appear here after you record them or promote them from a verified extraction."
            />
          ) : (
            <Table className="mt-6" caption="Obligations">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Obligation</TableHeaderCell>
                  <TableHeaderCell>Contract</TableHeaderCell>
                  <TableHeaderCell>Owner</TableHeaderCell>
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
                      <TableCell>
                        <Link
                          className="text-primary-strong underline"
                          href={`/contracts/${row.contractId}`}
                        >
                          {row.contractTitle}
                        </Link>
                      </TableCell>
                      <TableCell>{memberName(row.ownerUserId)}</TableCell>
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
        </>
      )}

      {view === "calendar" && <ObligationCalendar today={today} calendar={calendar} />}

      {view === "renewals" && (
        <RenewalsTable
          canWrite={canWrite}
          renewals={renewals}
          workflows={workflows}
          status={status}
        />
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New obligation"
        description="Link a commitment to a contract. Recurring items spawn the next occurrence when completed."
      >
        <form className="grid gap-4" onSubmit={onCreate}>
          <Field label="Contract" required>
            <Select name="contractId" required defaultValue={contracts[0]?.id ?? ""}>
              {contracts.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description" required>
            <Input name="title" required maxLength={300} />
          </Field>
          <Field label="Details">
            <Input name="description" maxLength={2000} />
          </Field>
          <Field label="Source clause">
            <Input name="sourceQuote" maxLength={2000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Owner">
              <Select name="ownerUserId" defaultValue={userId}>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date">
              <Input name="dueOn" type="date" />
            </Field>
            <Field label="Frequency">
              <Select name="frequency" defaultValue="ONCE">
                {FREQUENCY_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {FREQUENCY_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select name="priority" defaultValue="MEDIUM">
                {PRIORITY_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Remind days before">
              <Input name="reminderDaysBefore" type="number" min={0} max={365} defaultValue={7} />
            </Field>
            <Field label="Escalate days after due">
              <Input name="escalateDaysAfter" type="number" min={0} max={365} defaultValue={1} />
            </Field>
          </div>
          <Button type="submit" loading={pending}>
            Create
          </Button>
        </form>
      </Modal>
    </>
  );
}

function ObligationCalendar({
  today,
  calendar,
}: {
  today: string;
  calendar: { from: string; to: string; items: CalendarItem[] };
}) {
  const byDate = new Map<string, CalendarItem[]>();
  for (const item of calendar.items) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }
  const startWeekday = new Date(`${calendar.from}T00:00:00Z`).getUTCDay();
  const days: (string | null)[] = Array.from({ length: startWeekday }, () => null);
  let cursor = calendar.from;
  while (cursor <= calendar.to) {
    days.push(cursor);
    cursor = addUtcDays(cursor, 1);
  }
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="mt-6">
      <div className="grid grid-cols-7 gap-2 text-caption font-medium text-ink-muted">
        {weekdays.map((day) => (
          <div key={day} className="px-1">
            {day}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-2">
        {days.map((date, index) => {
          if (!date) return <div key={`pad-${index}`} />;
          const items = byDate.get(date) ?? [];
          return (
            <Card
              key={date}
              className={cn("min-h-28 p-2", date === today && "ring-2 ring-primary")}
            >
              <div className="text-caption font-medium">{date.slice(8)}</div>
              <ul className="mt-1 grid gap-1">
                {items.map((item) => (
                  <li key={item.id} className="text-caption">
                    <Link
                      className="text-primary-strong underline"
                      href={`/contracts/${item.contractId}`}
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
      {calendar.items.length === 0 && (
        <EmptyState
          className="mt-6"
          icon={CalendarCheck}
          title="Nothing due this month"
          description="Open, overdue, notice, and expiry dates for this organization appear here."
        />
      )}
    </div>
  );
}

function RenewalsTable({
  canWrite,
  renewals,
  workflows,
  status,
}: {
  canWrite: boolean;
  renewals: RenewalRow[];
  workflows: { id: string; name: string; status: string }[];
  status: string;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);
  const activeWorkflows = workflows.filter((row) => row.status === "ACTIVE");

  async function post(path: string, body: Record<string, unknown>, title: string) {
    setPending(true);
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setPending(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({
        tone: "error",
        title: "Could not update renewal",
        description: payload?.error ?? "The server refused this write.",
      });
      return;
    }
    notify({ tone: "success", title });
    router.refresh();
  }

  return (
    <>
      <form className="mt-4 max-w-xs">
        <Select
          name="status"
          defaultValue={status}
          aria-label="Filter renewals by status"
          onChange={(event) => {
            router.push(tabHref("renewals", event.currentTarget.value));
          }}
        >
          <option value="">All statuses</option>
          {RENEWAL_STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {RENEWAL_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </form>
      {renewals.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={CalendarCheck}
          title="No renewal watches"
          description="A watch appears when a contract has an expiry date. Expiry never changes the contract by itself."
        />
      ) : (
        <ul className="mt-6 grid gap-4">
          {renewals.map((row) => (
            <li key={row.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      className="text-h4 text-primary-strong underline"
                      href={`/contracts/${row.contractId}`}
                    >
                      {row.contractTitle}
                    </Link>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone={renewalTone(row.status)} dot>
                        {RENEWAL_STATUS_LABELS[row.status as keyof typeof RENEWAL_STATUS_LABELS] ??
                          row.status}
                      </Badge>
                      {row.autoRenew && (
                        <Badge tone="warning">
                          Auto-renew flag on — AccordIQ still will not renew automatically
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-caption text-ink-muted">Notice</dt>
                    <dd>{row.noticeOn}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-ink-muted">Terminate by</dt>
                    <dd>{row.terminateBy}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-ink-muted">Expires</dt>
                    <dd>{row.expiresOn}</dd>
                  </div>
                </dl>
                {canWrite && row.status !== "TERMINATED" && row.status !== "CANCELLED" && (
                  <form
                    className="mt-4 grid gap-3 sm:grid-cols-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      const decision = String(data.get("decision") ?? "RENEW");
                      const templateId = String(data.get("templateId") ?? "");
                      const proposedExpiresOn = String(data.get("proposedExpiresOn") ?? "");
                      void post(
                        `/api/contracts/${row.contractId}/renewal/decision`,
                        {
                          decision,
                          templateId: templateId || undefined,
                          proposedExpiresOn: proposedExpiresOn || undefined,
                        },
                        "Decision recorded",
                      );
                    }}
                  >
                    <Field label="Decision">
                      <Select name="decision" defaultValue={row.decision ?? "RENEW"}>
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
                    <div className="flex flex-wrap gap-2 sm:col-span-3">
                      <Button type="submit" loading={pending}>
                        Record decision
                      </Button>
                      {row.decision && !row.approvalRequestId && (
                        <Button
                          type="button"
                          variant="secondary"
                          loading={pending}
                          disabled={!activeWorkflows[0]}
                          onClick={() =>
                            void post(
                              `/api/contracts/${row.contractId}/renewal/approval`,
                              { templateId: activeWorkflows[0]?.id },
                              "Approval started",
                            )
                          }
                        >
                          Start approval
                        </Button>
                      )}
                      {row.decision && row.approvalRequestId && (
                        <Button
                          type="button"
                          variant="secondary"
                          loading={pending}
                          onClick={() =>
                            void post(
                              `/api/contracts/${row.contractId}/renewal/apply`,
                              {},
                              "Decision applied",
                            )
                          }
                        >
                          Apply approved decision
                        </Button>
                      )}
                    </div>
                  </form>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
