"use client";

import { useState, type FormEvent } from "react";
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
import { RISK_CATEGORY_LABELS, severityTone } from "../clauses/labels";

type Policy = {
  highMin: number;
  mediumMin: number;
  expiryUrgentDays: number;
  expiryWarnDays: number;
  autoRenewNoticeDaysMin: number;
  maxTermDays: number;
  source: string;
  official: boolean;
  note: string;
};

type Rule = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  severity: string;
  weight: number;
  status: string;
  versionNumber: number;
};

export function RiskPolicyForm({
  canReview,
  initial,
  rules,
}: {
  canReview: boolean;
  initial: Policy;
  rules: Rule[];
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);
  const [policy, setPolicy] = useState(initial);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      highMin: Number(data.get("highMin")),
      mediumMin: Number(data.get("mediumMin")),
      expiryUrgentDays: Number(data.get("expiryUrgentDays")),
      expiryWarnDays: Number(data.get("expiryWarnDays")),
      autoRenewNoticeDaysMin: Number(data.get("autoRenewNoticeDaysMin")),
      maxTermDays: Number(data.get("maxTermDays")),
    };
    setPending(true);
    const response = await fetch("/api/risk-policy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPending(false);
    const body = (await response.json().catch(() => null)) as (Policy & { error?: string }) | null;
    if (!response.ok || !body || body.error) {
      notify({ tone: "error", title: "Policy not saved", description: body?.error });
      return;
    }
    setPolicy(body);
    notify({ tone: "success", title: "Risk policy updated" });
    router.refresh();
  }

  async function toggleRule(rule: Rule) {
    setPending(true);
    const response = await fetch(`/api/risk-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: rule.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({ tone: "error", title: "Rule not updated", description: body?.error });
      return;
    }
    notify({ tone: "success", title: "Rule version stored; assessments marked stale" });
    router.refresh();
  }

  return (
    <section className="mt-8">
      <h2 className="text-h4">Risk policy</h2>
      <Alert className="mt-3" tone="info" title="Proposed defaults, not an official scale">
        {policy.note} Current source: {policy.source}. Changing thresholds or rules keeps historical
        assessments and marks them stale.
      </Alert>

      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
        <Field label="High score from" required hint="Inclusive. Must be above the medium floor.">
          <Input
            name="highMin"
            type="number"
            min={1}
            max={100}
            required
            defaultValue={policy.highMin}
            disabled={!canReview}
          />
        </Field>
        <Field label="Medium score from" required>
          <Input
            name="mediumMin"
            type="number"
            min={0}
            max={99}
            required
            defaultValue={policy.mediumMin}
            disabled={!canReview}
          />
        </Field>
        <Field label="Expiry urgent (days)" required>
          <Input
            name="expiryUrgentDays"
            type="number"
            min={1}
            required
            defaultValue={policy.expiryUrgentDays}
            disabled={!canReview}
          />
        </Field>
        <Field label="Expiry warn (days)" required>
          <Input
            name="expiryWarnDays"
            type="number"
            min={1}
            required
            defaultValue={policy.expiryWarnDays}
            disabled={!canReview}
          />
        </Field>
        <Field label="Auto-renew notice minimum (days)" required>
          <Input
            name="autoRenewNoticeDaysMin"
            type="number"
            min={1}
            required
            defaultValue={policy.autoRenewNoticeDaysMin}
            disabled={!canReview}
          />
        </Field>
        <Field label="Maximum term (days)" required>
          <Input
            name="maxTermDays"
            type="number"
            min={30}
            required
            defaultValue={policy.maxTermDays}
            disabled={!canReview}
          />
        </Field>
        {canReview && (
          <Button type="submit" loading={pending} className="justify-self-start">
            Save policy
          </Button>
        )}
      </form>

      <h3 className="mt-8 text-h4">Active rule catalog</h3>
      <p className="mt-1 text-small text-ink-muted">
        Disable a rule to skip it on the next assessment. Material edits bump the rule version.
      </p>
      <div className="mt-3">
        <Table caption="Organization risk rules">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Code</TableHeaderCell>
              <TableHeaderCell>Category</TableHeaderCell>
              <TableHeaderCell>Severity</TableHeaderCell>
              <TableHeaderCell>Weight</TableHeaderCell>
              <TableHeaderCell>Version</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              {canReview && <TableHeaderCell>Actions</TableHeaderCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>
                  <div className="font-mono text-caption">{rule.code}</div>
                  <div className="text-small">{rule.name}</div>
                </TableCell>
                <TableCell>
                  {rule.category
                    ? (RISK_CATEGORY_LABELS[rule.category as keyof typeof RISK_CATEGORY_LABELS] ??
                      rule.category)
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge tone={severityTone(rule.severity)} dot>
                    {rule.severity}
                  </Badge>
                </TableCell>
                <TableCell>{rule.weight}</TableCell>
                <TableCell>v{rule.versionNumber}</TableCell>
                <TableCell>{rule.status}</TableCell>
                {canReview && (
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={pending}
                      onClick={() => void toggleRule(rule)}
                    >
                      {rule.status === "ACTIVE" ? "Disable" : "Enable"}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
