"use client";

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
import { formatMinorAmount } from "../contracts/labels";
import type { FinanceInsights } from "./finance-workspace";
import {
  ESCALATION_SOURCE_LABELS,
  MILESTONE_STATUS_LABELS,
  SAVINGS_STATUS_LABELS,
  SOURCE_LABELS,
  savingsTone,
  sourceTone,
} from "./labels";

type MilestoneRow = {
  id: string;
  title: string;
  amountMinor: number;
  currency: string;
  dueOn: string | null;
  status: string;
  source: string;
};

type TransactionRow = {
  id: string;
  amountMinor: number;
  currency: string;
  occurredOn: string;
  reference: string | null;
};

type EscalationRow = {
  id: string;
  percentBps: number;
  effectiveOn: string | null;
  source: string;
};

type SavingsRow = {
  id: string;
  title: string;
  amountMinor: number | null;
  currency: string | null;
  status: string;
  explanation: string;
};

export function ContractFinance({
  contractId,
  currency,
  canWriteFinance,
  canWriteContracts,
  insights,
  milestones,
  transactions,
  escalations,
  savings,
}: {
  contractId: string;
  currency: string | null;
  canWriteFinance: boolean;
  canWriteContracts: boolean;
  insights: FinanceInsights;
  milestones: MilestoneRow[];
  transactions: TransactionRow[];
  escalations: EscalationRow[];
  savings: SavingsRow[];
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);
  const stated = insights.statedByCurrency[0];
  const forecast = insights.forecasts[0];

  async function post(url: string, body: Record<string, unknown>, success: string) {
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

  function onMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void post(
      "/api/finance/milestones",
      {
        contractId,
        title: String(data.get("title") ?? ""),
        amount: String(data.get("amount") ?? ""),
        currency: currency ?? undefined,
        dueOn: String(data.get("dueOn") ?? "") || undefined,
        source: String(data.get("source") ?? ""),
      },
      "Milestone recorded",
    );
  }

  return (
    <Card className="mt-8">
      <h2 className="text-h4">Financials</h2>
      <p className="mt-1 text-caption text-ink-muted">{insights.explanations.stated}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-caption text-ink-muted">Contract-stated</dt>
          <dd className="font-medium">
            {stated ? formatMinorAmount(stated.amountMinor, stated.currency) : "No data"}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Imported</dt>
          <dd className="font-medium">
            {insights.importedByCurrency[0]
              ? formatMinorAmount(
                  insights.importedByCurrency[0].amountMinor,
                  insights.importedByCurrency[0].currency,
                )
              : "No data"}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Renewal forecast</dt>
          <dd className="font-medium">
            {forecast ? (
              <>
                {formatMinorAmount(forecast.forecastMinor, forecast.currency)}{" "}
                <Badge tone={forecast.confidence === "ESTIMATE" ? "warning" : "info"}>
                  {forecast.confidence === "ESTIMATE" ? "Estimate" : "Stated"}
                </Badge>
              </>
            ) : (
              "No data"
            )}
          </dd>
        </div>
      </dl>
      {insights.gaps.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {insights.gaps.map((gap) => (
            <li key={`${gap.code}-${gap.message}`}>
              <Alert tone={gap.severity === "warning" ? "warning" : "info"} title={gap.code}>
                {gap.message}
              </Alert>
            </li>
          ))}
        </ul>
      ) : null}

      <h3 className="mt-6 text-h4">Milestones</h3>
      {milestones.length === 0 ? (
        <EmptyState
          className="py-8"
          title="No milestones"
          description="Record contract-stated or imported installments for this agreement."
        />
      ) : (
        <Table caption="Payment milestones" className="mt-3">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Title</TableHeaderCell>
              <TableHeaderCell>Amount</TableHeaderCell>
              <TableHeaderCell>Source</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {milestones.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {row.title}{" "}
                  <span className="text-caption text-ink-muted">
                    {MILESTONE_STATUS_LABELS[row.status as keyof typeof MILESTONE_STATUS_LABELS] ??
                      row.status}
                  </span>
                </TableCell>
                <TableCell>{formatMinorAmount(row.amountMinor, row.currency)}</TableCell>
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
      {canWriteContracts || canWriteFinance ? (
        <form className="mt-4 grid gap-3 sm:grid-cols-4" onSubmit={onMilestone}>
          <Field label="Title">
            <Input name="title" required />
          </Field>
          <Field label="Amount">
            <Input name="amount" inputMode="decimal" required />
          </Field>
          <Field label="Source">
            <Select name="source" defaultValue={canWriteContracts ? "CONTRACT_STATED" : "IMPORTED"}>
              {canWriteContracts ? <option value="CONTRACT_STATED">Contract-stated</option> : null}
              {canWriteFinance ? <option value="IMPORTED">Imported</option> : null}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" loading={pending}>
              Add
            </Button>
          </div>
        </form>
      ) : null}

      <h3 className="mt-6 text-h4">Imported transactions</h3>
      {transactions.length === 0 ? (
        <p className="mt-2 text-small text-ink-muted">
          No imported transactions for this contract.
        </p>
      ) : (
        <ul className="mt-2 grid gap-1 text-small">
          {transactions.map((row) => (
            <li key={row.id}>
              {row.occurredOn} · {formatMinorAmount(row.amountMinor, row.currency)}
              {row.reference ? ` · ${row.reference}` : ""}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-6 text-h4">Escalations</h3>
      {escalations.length === 0 ? (
        <p className="mt-2 text-small text-ink-muted">No price-escalation clauses recorded.</p>
      ) : (
        <ul className="mt-2 grid gap-1 text-small">
          {escalations.map((row) => (
            <li key={row.id}>
              {row.percentBps} bps ·{" "}
              {ESCALATION_SOURCE_LABELS[row.source as keyof typeof ESCALATION_SOURCE_LABELS] ??
                row.source}
              {row.effectiveOn ? ` · ${row.effectiveOn}` : ""}
            </li>
          ))}
        </ul>
      )}

      {savings.length > 0 ? (
        <>
          <h3 className="mt-6 text-h4">Savings on this contract</h3>
          <ul className="mt-2 grid gap-2">
            {savings.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2">
                <span>{row.title}</span>
                <Badge tone={savingsTone(row.status)}>
                  {SAVINGS_STATUS_LABELS[row.status as keyof typeof SAVINGS_STATUS_LABELS] ??
                    row.status}
                </Badge>
                <span className="text-caption text-ink-muted">
                  {formatMinorAmount(row.amountMinor, row.currency)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}
