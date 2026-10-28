import Link from "next/link";
import { Activity, AlertTriangle, CalendarClock, FileText, Shield } from "lucide-react";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  buttonClasses,
} from "@accordiq/ui";
import type { OverviewSnapshot } from "../lib/demo-data";

function formatMetric(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("en-US");
}

function MetricCard({
  label,
  value,
  hint,
  demo,
}: {
  label: string;
  value: number | null;
  hint: string;
  demo: boolean;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption font-medium text-ink-muted">{label}</p>
        {demo && <Badge tone="warning">Demo data</Badge>}
      </div>
      <p
        className={
          value === null ? "mt-3 text-h3 font-semibold text-ink-muted" : "mt-3 text-h1 tabular-nums"
        }
      >
        {value === null ? "No data" : formatMetric(value)}
      </p>
      <p className="mt-1 text-caption text-ink-muted">{hint}</p>
    </Card>
  );
}

function LifecycleChart({ snapshot }: { snapshot: OverviewSnapshot }) {
  const counts = snapshot.lifecycle.map((row) => row.count ?? 0);
  const max = Math.max(1, ...counts);
  const empty = snapshot.source === "empty";

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-h4">Contract lifecycle</h2>
        {snapshot.source === "demo" && <Badge tone="warning">Demo data</Badge>}
      </div>
      {empty && (
        <p className="mt-1 text-caption text-ink-muted">
          Stage counts will appear here once contracts are in the repository.
        </p>
      )}
      <ul className="mt-5 grid gap-3">
        {snapshot.lifecycle.map((row) => {
          const width = row.count === null ? 0 : Math.round((row.count / max) * 100);
          return (
            <li key={row.stage} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-3">
              <span className="text-small text-ink">{row.stage}</span>
              <div
                className="h-2 rounded-full bg-line"
                role="img"
                aria-label={
                  row.count === null
                    ? `${row.stage}: no data`
                    : `${row.stage}: ${row.count} contracts`
                }
              >
                <div className="h-2 rounded-full bg-primary" style={{ width: `${width}%` }} />
              </div>
              <span className="text-right text-small tabular-nums text-ink-muted">
                {formatMetric(row.count)}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function RiskSummary({ snapshot }: { snapshot: OverviewSnapshot }) {
  const rows = [
    { label: "High", value: snapshot.risk.high, tone: "error" as const },
    { label: "Medium", value: snapshot.risk.medium, tone: "warning" as const },
    { label: "Low", value: snapshot.risk.low, tone: "success" as const },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-h4">Risk summary</h2>
        {snapshot.source === "demo" && <Badge tone="warning">Demo data</Badge>}
      </div>
      <p className="mt-1 text-caption text-ink-muted">
        Explainable risk scores are not connected yet. This panel does not assess any contract.
      </p>
      <ul className="mt-5 grid gap-3">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3 text-small">
            <span className="flex items-center gap-2">
              <Badge tone={row.tone} dot>
                {row.label}
              </Badge>
            </span>
            <span className="tabular-nums text-ink">{formatMetric(row.value)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function OverviewDashboard({ snapshot }: { snapshot: OverviewSnapshot }) {
  const emptyHint = "No data yet. This figure will appear once the backend is connected.";
  const demo = snapshot.source === "demo";

  return (
    <div className="mx-auto max-w-6xl">
      <h1>Overview</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        A snapshot of every contract and commitment in this workspace. Counts stay empty until a
        repository is connected.
      </p>

      {demo ? (
        <Alert className="mt-6" tone="warning" title="Demo data is on">
          Figures on this page are synthetic and labeled. They are not from a database. Disable{" "}
          <code className="font-mono">NEXT_PUBLIC_DEMO_DATA</code> to return to empty states.
        </Alert>
      ) : (
        <Alert className="mt-6" tone="info" title="Waiting on the contract repository">
          Nothing below is a live metric. Empty values mean the backend is not connected, not that
          you have zero contracts.
        </Alert>
      )}

      <section aria-label="Key figures" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Contracts" value={snapshot.contracts} hint={emptyHint} demo={demo} />
        <MetricCard
          label="Pending approvals"
          value={snapshot.pendingApprovals}
          hint={emptyHint}
          demo={demo}
        />
        <MetricCard
          label="Upcoming expirations"
          value={snapshot.upcomingExpirations}
          hint={emptyHint}
          demo={demo}
        />
        <MetricCard
          label="Active obligations"
          value={snapshot.activeObligations}
          hint={emptyHint}
          demo={demo}
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <RiskSummary snapshot={snapshot} />
        <LifecycleChart snapshot={snapshot} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-0">
          <div className="flex items-center justify-between gap-2 border-b border-line px-card py-4">
            <h2 className="text-h4">Recent activity</h2>
            {demo && <Badge tone="warning">Demo data</Badge>}
          </div>
          {snapshot.activity.length === 0 ? (
            <EmptyState
              icon={Activity}
              headingLevel="h3"
              title="No activity yet"
              description="Audit events will list here once identity and the activity log are connected."
            />
          ) : (
            <ul className="divide-y divide-line">
              {snapshot.activity.map((event) => (
                <li
                  key={event.id}
                  className="flex items-start justify-between gap-3 px-card py-3 text-small"
                >
                  <span>{event.summary}</span>
                  <span className="shrink-0 text-caption text-ink-muted">{event.when}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-0">
          <div className="flex items-center justify-between gap-2 border-b border-line px-card py-4">
            <h2 className="text-h4">Upcoming renewals</h2>
            {demo && <Badge tone="warning">Demo data</Badge>}
          </div>
          {snapshot.renewals.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              headingLevel="h3"
              title="No upcoming renewals"
              description="Renewal dates will appear here once obligations are extracted from contracts."
            />
          ) : (
            <Table caption="Upcoming renewals (demo data)">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Contract</TableHeaderCell>
                  <TableHeaderCell>Counterparty</TableHeaderCell>
                  <TableHeaderCell>Due</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {snapshot.renewals.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.title}</TableCell>
                    <TableCell>{row.counterparty}</TableCell>
                    <TableCell>{row.due}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card className="flex items-start gap-3">
          <FileText aria-hidden className="mt-0.5 size-4 text-primary-strong" />
          <div>
            <h2 className="text-h4">Contracts</h2>
            <p className="mt-1 text-caption text-ink-muted">
              The repository is not connected. Upload is not available.
            </p>
            <Link
              href="/contracts"
              className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-3" })}
            >
              Open Contracts
            </Link>
          </div>
        </Card>
        <Card className="flex items-start gap-3">
          <Shield aria-hidden className="mt-0.5 size-4 text-primary-strong" />
          <div>
            <h2 className="text-h4">Risk</h2>
            <p className="mt-1 text-caption text-ink-muted">
              Explainable assessments ship with AI Contract Studio.
            </p>
            <Link
              href="/studio"
              className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-3" })}
            >
              Open Studio
            </Link>
          </div>
        </Card>
        <Card className="flex items-start gap-3">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 text-primary-strong" />
          <div>
            <h2 className="text-h4">Approvals</h2>
            <p className="mt-1 text-caption text-ink-muted">
              There is no queue to act on until workflows are connected.
            </p>
            <Link
              href="/approvals"
              className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-3" })}
            >
              Open Approvals
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
