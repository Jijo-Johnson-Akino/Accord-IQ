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
  buttonClasses,
  useToast,
} from "@accordiq/ui";
import { LineChart } from "lucide-react";
import { CURRENCY_OPTIONS, formatMinorAmount } from "../contracts/labels";
import {
  ESCALATION_SOURCE_LABELS,
  ESCALATION_SOURCE_OPTIONS,
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUS_OPTIONS,
  SAVINGS_KIND_LABELS,
  SAVINGS_KIND_OPTIONS,
  SAVINGS_STATUS_LABELS,
  SOURCE_LABELS,
  STATUS_GROUP_LABELS,
  STATUS_GROUP_OPTIONS,
  savingsTone,
  sourceTone,
} from "./labels";

type MoneyTotal = { currency: string; amountMinor: number };

type Gap = {
  code: string;
  contractId: string | null;
  contractTitle: string | null;
  currency: string | null;
  message: string;
  severity: "warning" | "info";
};

type Forecast = {
  contractId: string;
  title: string;
  vendorName: string | null;
  expiresOn: string;
  autoRenew: boolean;
  currency: string;
  statedMinor: number;
  escalationBps: number | null;
  escalationSource: string | null;
  forecastMinor: number;
  confidence: "STATED" | "ESTIMATE";
  explanation: string;
};

type ChartRow = {
  vendorId: string | null;
  vendorName: string;
  currency: string;
  amountMinor: number;
};

type VendorSummary = {
  vendorId: string | null;
  vendorName: string;
  contractCount: number;
  statedByCurrency: MoneyTotal[];
  committedByCurrency: MoneyTotal[];
  importedByCurrency: MoneyTotal[];
};

type DerivedOpportunity = {
  contractId: string | null;
  vendorId: string | null;
  kind: string;
  title: string;
  amountMinor: number | null;
  currency: string | null;
  status: "ESTIMATE";
  explanation: string;
};

export type FinanceInsights = {
  asOf: string;
  timezone: string;
  explanations: Record<string, string>;
  statedByCurrency: MoneyTotal[];
  committedByCurrency: MoneyTotal[];
  pipelineByCurrency: MoneyTotal[];
  importedByCurrency: MoneyTotal[];
  verifiedSavingsByCurrency: MoneyTotal[];
  estimatedOpportunitiesByCurrency: MoneyTotal[];
  gaps: Gap[];
  forecasts: Forecast[];
  derivedOpportunities: DerivedOpportunity[];
  vendorSummaries: VendorSummary[];
  charts: { committedByVendor: ChartRow[]; importedByVendor: ChartRow[] };
};

type MilestoneRow = {
  id: string;
  contractId: string;
  title: string;
  amountMinor: number;
  currency: string;
  dueOn: string | null;
  status: string;
  source: string;
};

type TransactionRow = {
  id: string;
  contractId: string | null;
  vendorId: string | null;
  amountMinor: number;
  currency: string;
  occurredOn: string;
  reference: string | null;
  source: string;
};

type EscalationRow = {
  id: string;
  contractId: string;
  percentBps: number;
  effectiveOn: string | null;
  source: string;
  note: string | null;
};

type SavingsRow = {
  id: string;
  contractId: string | null;
  kind: string;
  title: string;
  amountMinor: number | null;
  currency: string | null;
  status: string;
  explanation: string;
};

function totalsLabel(rows: MoneyTotal[]): string {
  if (rows.length === 0) return "No data";
  return rows.map((row) => formatMinorAmount(row.amountMinor, row.currency)).join(" · ");
}

function MoneyBars({ title, rows, empty }: { title: string; rows: ChartRow[]; empty: string }) {
  const max = Math.max(1, ...rows.map((row) => row.amountMinor));
  return (
    <Card>
      <h2 className="text-h4">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState title="No chart data" description={empty} icon={LineChart} />
      ) : (
        <ul className="mt-5 grid gap-3">
          {rows.map((row) => {
            const width = Math.round((row.amountMinor / max) * 100);
            const label = `${row.vendorName} ${row.currency}: ${formatMinorAmount(row.amountMinor, row.currency)}`;
            return (
              <li
                key={`${row.vendorId ?? "none"}-${row.currency}`}
                className="grid grid-cols-[8rem_1fr_auto] items-center gap-3"
              >
                <span className="truncate text-small text-ink">{row.vendorName}</span>
                <div className="h-2 rounded-full bg-line" role="img" aria-label={label}>
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${width}%` }} />
                </div>
                <span className="text-caption tabular-nums text-ink-muted">
                  {formatMinorAmount(row.amountMinor, row.currency)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function FinanceWorkspace({
  canWriteFinance,
  canWriteContracts,
  currency,
  vendorId,
  statusGroup,
  insights,
  milestones,
  transactions,
  escalations,
  savings,
  contracts,
  vendors,
}: {
  canWriteFinance: boolean;
  canWriteContracts: boolean;
  currency: string;
  vendorId: string;
  statusGroup: string;
  insights: FinanceInsights;
  milestones: MilestoneRow[];
  transactions: TransactionRow[];
  escalations: EscalationRow[];
  savings: SavingsRow[];
  contracts: { id: string; title: string }[];
  vendors: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);
  const canRecord = canWriteFinance || canWriteContracts;
  const exportQuery = new URLSearchParams();
  if (currency) exportQuery.set("currency", currency);
  if (vendorId) exportQuery.set("vendorId", vendorId);
  if (statusGroup) exportQuery.set("statusGroup", statusGroup);
  const exportSuffix = exportQuery.toString() ? `&${exportQuery.toString()}` : "";

  async function submit(url: string, body: Record<string, unknown>, success: string) {
    setPending(true);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setPending(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({
        tone: "error",
        title: "Could not save",
        description: payload?.error ?? "The server refused this update.",
      });
      return;
    }
    notify({ tone: "success", title: success });
    router.refresh();
  }

  function onFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const nextCurrency = String(data.get("currency") ?? "");
    const nextVendor = String(data.get("vendorId") ?? "");
    const nextGroup = String(data.get("statusGroup") ?? "");
    if (nextCurrency) params.set("currency", nextCurrency);
    if (nextVendor) params.set("vendorId", nextVendor);
    if (nextGroup && nextGroup !== "all") params.set("statusGroup", nextGroup);
    const query = params.toString();
    router.push(query ? `/finance?${query}` : "/finance");
  }

  return (
    <div className="mt-8 grid gap-8">
      <Alert tone="info" title="How these numbers are calculated">
        <p>{insights.explanations.stated}</p>
        <p className="mt-2">{insights.explanations.committed}</p>
        <p className="mt-2">{insights.explanations.imported}</p>
        <p className="mt-2">{insights.explanations.verifiedSavings}</p>
        <p className="mt-2">{insights.explanations.estimatedOpportunities}</p>
        <p className="mt-2 text-caption">
          As of {insights.asOf} in {insights.timezone}.
        </p>
      </Alert>

      <form onSubmit={onFilter} className="grid gap-3 sm:grid-cols-4">
        <Field label="Currency">
          <Select name="currency" defaultValue={currency}>
            <option value="">All currencies</option>
            {CURRENCY_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vendor">
          <Select name="vendorId" defaultValue={vendorId}>
            <option value="">All vendors</option>
            {vendors.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status group">
          <Select name="statusGroup" defaultValue={statusGroup || "all"}>
            {STATUS_GROUP_OPTIONS.map((group) => (
              <option key={group} value={group}>
                {STATUS_GROUP_LABELS[group]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit">Apply filters</Button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        <a
          className={buttonClasses({ variant: "secondary" })}
          href={`/api/finance/export?kind=insights${exportSuffix}`}
        >
          Export insights
        </a>
        {canWriteFinance ? (
          <a
            className={buttonClasses({ variant: "secondary" })}
            href={`/api/finance/export?kind=transactions${exportSuffix}`}
          >
            Export transactions
          </a>
        ) : (
          <p className="text-caption text-ink-muted">
            Transaction ledger export requires finance write access.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <p className="text-caption font-medium text-ink-muted">Contract-stated value</p>
          <p className="mt-3 text-h3 font-semibold tabular-nums">
            {totalsLabel(insights.statedByCurrency)}
          </p>
        </Card>
        <Card>
          <p className="text-caption font-medium text-ink-muted">Committed spend</p>
          <p className="mt-3 text-h3 font-semibold tabular-nums">
            {totalsLabel(insights.committedByCurrency)}
          </p>
        </Card>
        <Card>
          <p className="text-caption font-medium text-ink-muted">Imported spend</p>
          <p className="mt-3 text-h3 font-semibold tabular-nums">
            {totalsLabel(insights.importedByCurrency)}
          </p>
        </Card>
        <Card>
          <p className="text-caption font-medium text-ink-muted">Pipeline value</p>
          <p className="mt-3 text-h3 font-semibold tabular-nums">
            {totalsLabel(insights.pipelineByCurrency)}
          </p>
        </Card>
        <Card>
          <p className="text-caption font-medium text-ink-muted">Verified savings</p>
          <p className="mt-3 text-h3 font-semibold tabular-nums">
            {totalsLabel(insights.verifiedSavingsByCurrency)}
          </p>
        </Card>
        <Card>
          <p className="text-caption font-medium text-ink-muted">Estimated opportunities</p>
          <Badge tone="warning">Estimate</Badge>
          <p className="mt-3 text-h3 font-semibold tabular-nums">
            {totalsLabel(insights.estimatedOpportunitiesByCurrency)}
          </p>
          <p className="mt-1 text-caption text-ink-muted">Not counted as verified savings.</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MoneyBars
          title="Committed spend by vendor"
          rows={insights.charts.committedByVendor}
          empty="Committed spend appears after a contract is approved, pending signature, signed, or active and has a stored value and currency."
        />
        <MoneyBars
          title="Imported spend by vendor"
          rows={insights.charts.importedByVendor}
          empty="Imported spend appears after finance records a transaction. Those rows stay separate from contract-stated value."
        />
      </div>

      <Card>
        <h2 className="text-h4">Missing or conflicting information</h2>
        {insights.gaps.length === 0 ? (
          <p className="mt-3 text-small text-ink-muted">No financial gaps on the current filter.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {insights.gaps.map((gap) => (
              <li key={`${gap.code}-${gap.contractId ?? "none"}-${gap.message}`}>
                <Alert tone={gap.severity === "warning" ? "warning" : "info"} title={gap.code}>
                  {gap.contractId ? (
                    <Link href={`/contracts/${gap.contractId}`} className="font-medium">
                      {gap.contractTitle}
                    </Link>
                  ) : null}{" "}
                  {gap.message}
                </Alert>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-h4">Vendor spend</h2>
        <p className="mt-1 text-caption text-ink-muted">{insights.explanations.vendor}</p>
        {insights.vendorSummaries.length === 0 ? (
          <EmptyState
            title="No vendor spend"
            description="Vendor rows appear when a contract or imported transaction has a counterparty."
          />
        ) : (
          <Table caption="Vendor spend summaries" className="mt-4">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Vendor</TableHeaderCell>
                <TableHeaderCell>Contracts</TableHeaderCell>
                <TableHeaderCell>Stated</TableHeaderCell>
                <TableHeaderCell>Committed</TableHeaderCell>
                <TableHeaderCell>Imported</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {insights.vendorSummaries.map((row) => (
                <TableRow key={row.vendorId ?? "none"}>
                  <TableCell>{row.vendorName}</TableCell>
                  <TableCell>{row.contractCount}</TableCell>
                  <TableCell>{totalsLabel(row.statedByCurrency)}</TableCell>
                  <TableCell>{totalsLabel(row.committedByCurrency)}</TableCell>
                  <TableCell>{totalsLabel(row.importedByCurrency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card>
        <h2 className="text-h4">Renewal cost forecasts</h2>
        <p className="mt-1 text-caption text-ink-muted">{insights.explanations.forecast}</p>
        {insights.forecasts.length === 0 ? (
          <EmptyState
            title="No forecasts"
            description="A forecast needs a contract-stated value, a currency, and an expiry date. auto_renew is a flag only."
          />
        ) : (
          <Table caption="Renewal cost forecasts" className="mt-4">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Contract</TableHeaderCell>
                <TableHeaderCell>Expires</TableHeaderCell>
                <TableHeaderCell>Stated</TableHeaderCell>
                <TableHeaderCell>Forecast</TableHeaderCell>
                <TableHeaderCell>Confidence</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {insights.forecasts.map((row) => (
                <TableRow key={row.contractId}>
                  <TableCell>
                    <Link href={`/contracts/${row.contractId}`}>{row.title}</Link>
                  </TableCell>
                  <TableCell>{row.expiresOn}</TableCell>
                  <TableCell>{formatMinorAmount(row.statedMinor, row.currency)}</TableCell>
                  <TableCell>{formatMinorAmount(row.forecastMinor, row.currency)}</TableCell>
                  <TableCell>
                    <Badge tone={row.confidence === "ESTIMATE" ? "warning" : "info"}>
                      {row.confidence === "ESTIMATE" ? "Estimate" : "Stated"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card>
        <h2 className="text-h4">Potential savings</h2>
        <p className="mt-1 text-caption text-ink-muted">
          Estimated opportunities are labeled Estimate and are never added to verified savings.
        </p>
        {savings.length === 0 && insights.derivedOpportunities.length === 0 ? (
          <EmptyState
            title="No savings opportunities"
            description="Record an opportunity to track it. Verification requires finance write access."
          />
        ) : (
          <Table caption="Savings opportunities" className="mt-4">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Kind</TableHeaderCell>
                <TableHeaderCell>Amount</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Action</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {savings.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p>{row.title}</p>
                    <p className="text-caption text-ink-muted">{row.explanation}</p>
                  </TableCell>
                  <TableCell>
                    {SAVINGS_KIND_LABELS[row.kind as keyof typeof SAVINGS_KIND_LABELS] ?? row.kind}
                  </TableCell>
                  <TableCell>{formatMinorAmount(row.amountMinor, row.currency)}</TableCell>
                  <TableCell>
                    <Badge tone={savingsTone(row.status)}>
                      {SAVINGS_STATUS_LABELS[row.status as keyof typeof SAVINGS_STATUS_LABELS] ??
                        row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {canWriteFinance && row.status === "ESTIMATE" ? (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            submit(`/api/finance/savings/${row.id}/verify`, {}, "Marked verified")
                          }
                        >
                          Verify
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() =>
                            submit(`/api/finance/savings/${row.id}/dismiss`, {}, "Dismissed")
                          }
                        >
                          Dismiss
                        </Button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {insights.derivedOpportunities.map((row) => (
                <TableRow key={`derived-${row.kind}-${row.contractId ?? row.title}`}>
                  <TableCell>
                    <p>{row.title}</p>
                    <p className="text-caption text-ink-muted">{row.explanation}</p>
                  </TableCell>
                  <TableCell>
                    {SAVINGS_KIND_LABELS[row.kind as keyof typeof SAVINGS_KIND_LABELS] ?? row.kind}
                  </TableCell>
                  <TableCell>{formatMinorAmount(row.amountMinor, row.currency)}</TableCell>
                  <TableCell>
                    <Badge tone="warning">Estimate</Badge>
                  </TableCell>
                  <TableCell>—</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {canRecord ? (
          <form
            className="mt-6 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void submit(
                "/api/finance/savings",
                {
                  title: String(data.get("title") ?? ""),
                  kind: String(data.get("kind") ?? ""),
                  explanation: String(data.get("explanation") ?? ""),
                  amount: String(data.get("amount") ?? "") || undefined,
                  currency: String(data.get("currency") ?? "") || undefined,
                  contractId: String(data.get("contractId") ?? "") || undefined,
                },
                "Opportunity recorded as an estimate",
              );
              event.currentTarget.reset();
            }}
          >
            <Field label="Title">
              <Input name="title" required />
            </Field>
            <Field label="Kind">
              <Select name="kind" defaultValue="PRICE_REDUCTION">
                {SAVINGS_KIND_OPTIONS.map((kind) => (
                  <option key={kind} value={kind}>
                    {SAVINGS_KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount">
              <Input name="amount" inputMode="decimal" />
            </Field>
            <Field label="Currency">
              <Select name="currency" defaultValue="USD">
                {CURRENCY_OPTIONS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Contract">
              <Select name="contractId" defaultValue="">
                <option value="">None</option>
                {contracts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Explanation">
              <Input name="explanation" required />
            </Field>
            <div>
              <Button type="submit" loading={pending}>
                Record estimate
              </Button>
            </div>
          </form>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-h4">Payment milestones</h2>
        <p className="mt-1 text-caption text-ink-muted">{insights.explanations.milestones}</p>
        {milestones.length === 0 ? (
          <EmptyState
            title="No payment milestones"
            description="Legal can record contract-stated installments. Finance can record imported installments."
          />
        ) : (
          <Table caption="Payment milestones" className="mt-4">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Amount</TableHeaderCell>
                <TableHeaderCell>Due</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Source</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {milestones.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>{formatMinorAmount(row.amountMinor, row.currency)}</TableCell>
                  <TableCell>{row.dueOn ?? "—"}</TableCell>
                  <TableCell>
                    {MILESTONE_STATUS_LABELS[row.status as keyof typeof MILESTONE_STATUS_LABELS] ??
                      row.status}
                  </TableCell>
                  <TableCell>
                    <Badge tone={sourceTone(row.source)}>
                      {SOURCE_LABELS[row.source as keyof typeof SOURCE_LABELS] ?? row.source}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {canRecord ? (
          <form
            className="mt-6 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void submit(
                "/api/finance/milestones",
                {
                  contractId: String(data.get("contractId") ?? ""),
                  title: String(data.get("title") ?? ""),
                  amount: String(data.get("amount") ?? ""),
                  currency: String(data.get("currency") ?? "") || undefined,
                  dueOn: String(data.get("dueOn") ?? "") || undefined,
                  status: String(data.get("status") ?? "") || undefined,
                  source: String(data.get("source") ?? ""),
                },
                "Milestone recorded",
              );
              event.currentTarget.reset();
            }}
          >
            <Field label="Contract">
              <Select name="contractId" required defaultValue={contracts[0]?.id ?? ""}>
                {contracts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title">
              <Input name="title" required />
            </Field>
            <Field label="Amount">
              <Input name="amount" inputMode="decimal" required />
            </Field>
            <Field label="Currency">
              <Select name="currency" defaultValue="">
                <option value="">Use contract currency</option>
                {CURRENCY_OPTIONS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due on">
              <Input name="dueOn" type="date" />
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue="PLANNED">
                {MILESTONE_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {MILESTONE_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Source">
              <Select
                name="source"
                defaultValue={canWriteContracts ? "CONTRACT_STATED" : "IMPORTED"}
              >
                {canWriteContracts ? (
                  <option value="CONTRACT_STATED">Contract-stated</option>
                ) : null}
                {canWriteFinance ? <option value="IMPORTED">Imported</option> : null}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" loading={pending}>
                Add milestone
              </Button>
            </div>
          </form>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-h4">Imported transactions</h2>
        <p className="mt-1 text-caption text-ink-muted">{insights.explanations.imported}</p>
        {transactions.length === 0 ? (
          <EmptyState
            title="No imported transactions"
            description="Finance can record invoices or payments here. They are not added to contract-stated or committed totals."
          />
        ) : (
          <Table caption="Imported transactions" className="mt-4">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Occurred</TableHeaderCell>
                <TableHeaderCell>Amount</TableHeaderCell>
                <TableHeaderCell>Reference</TableHeaderCell>
                <TableHeaderCell>Source</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.occurredOn}</TableCell>
                  <TableCell>{formatMinorAmount(row.amountMinor, row.currency)}</TableCell>
                  <TableCell>{row.reference ?? "—"}</TableCell>
                  <TableCell>
                    <Badge tone="warning">Imported</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {canWriteFinance ? (
          <form
            className="mt-6 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void submit(
                "/api/finance/transactions",
                {
                  contractId: String(data.get("contractId") ?? "") || undefined,
                  vendorId: String(data.get("vendorId") ?? "") || undefined,
                  amount: String(data.get("amount") ?? ""),
                  currency: String(data.get("currency") ?? ""),
                  occurredOn: String(data.get("occurredOn") ?? ""),
                  reference: String(data.get("reference") ?? "") || undefined,
                },
                "Transaction imported",
              );
              event.currentTarget.reset();
            }}
          >
            <Field label="Contract">
              <Select name="contractId" defaultValue="">
                <option value="">None</option>
                {contracts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vendor">
              <Select name="vendorId" defaultValue="">
                <option value="">None</option>
                {vendors.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount">
              <Input name="amount" inputMode="decimal" required />
            </Field>
            <Field label="Currency">
              <Select name="currency" defaultValue="USD">
                {CURRENCY_OPTIONS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Occurred on">
              <Input name="occurredOn" type="date" required />
            </Field>
            <Field label="Reference">
              <Input name="reference" />
            </Field>
            <div>
              <Button type="submit" loading={pending}>
                Import transaction
              </Button>
            </div>
          </form>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-h4">Price escalation clauses</h2>
        {escalations.length === 0 ? (
          <EmptyState
            title="No escalations"
            description="Record a contract-clause increase in basis points, or an estimate. Estimates label the renewal forecast as an estimate."
          />
        ) : (
          <Table caption="Price escalation clauses" className="mt-4">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Basis points</TableHeaderCell>
                <TableHeaderCell>Effective</TableHeaderCell>
                <TableHeaderCell>Source</TableHeaderCell>
                <TableHeaderCell>Note</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {escalations.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.percentBps}</TableCell>
                  <TableCell>{row.effectiveOn ?? "—"}</TableCell>
                  <TableCell>
                    <Badge tone={sourceTone(row.source)}>
                      {ESCALATION_SOURCE_LABELS[
                        row.source as keyof typeof ESCALATION_SOURCE_LABELS
                      ] ?? row.source}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.note ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {canRecord ? (
          <form
            className="mt-6 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void submit(
                "/api/finance/escalations",
                {
                  contractId: String(data.get("contractId") ?? ""),
                  percentBps: Number(data.get("percentBps") ?? 0),
                  effectiveOn: String(data.get("effectiveOn") ?? "") || undefined,
                  source: String(data.get("source") ?? ""),
                  note: String(data.get("note") ?? "") || undefined,
                },
                "Escalation recorded",
              );
              event.currentTarget.reset();
            }}
          >
            <Field label="Contract">
              <Select name="contractId" required defaultValue={contracts[0]?.id ?? ""}>
                {contracts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Basis points">
              <Input name="percentBps" inputMode="numeric" required defaultValue="0" />
            </Field>
            <Field label="Effective on">
              <Input name="effectiveOn" type="date" />
            </Field>
            <Field label="Source">
              <Select
                name="source"
                defaultValue={canWriteContracts ? "CONTRACT_CLAUSE" : "ESTIMATE"}
              >
                {ESCALATION_SOURCE_OPTIONS.filter(
                  (source) =>
                    (source === "CONTRACT_CLAUSE" && canWriteContracts) ||
                    (source === "ESTIMATE" && canRecord),
                ).map((source) => (
                  <option key={source} value={source}>
                    {ESCALATION_SOURCE_LABELS[source]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Note">
              <Input name="note" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" loading={pending}>
                Add escalation
              </Button>
            </div>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
