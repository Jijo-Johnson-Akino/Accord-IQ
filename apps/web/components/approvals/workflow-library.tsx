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
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from "@accordiq/ui";
import { CATEGORY_LABELS, DEPARTMENT_LABELS } from "../contracts/labels";
import {
  CATEGORY_OPTIONS,
  DEPARTMENT_OPTIONS,
  ROLE_LABELS,
  ROLE_OPTIONS,
  SEVERITY_OPTIONS,
} from "./labels";

type StageRow = {
  id: string;
  name: string;
  requiredRole: string;
  step: number;
  conditionJson: string | null;
  dueInDays: number | null;
  allowDelegate: boolean;
};

type WorkflowRow = {
  id: string;
  name: string;
  status: string;
  stages: StageRow[];
};

function conditionSummary(raw: string | null): string {
  if (!raw) return "Always";
  try {
    const parsed = JSON.parse(raw) as {
      predicates?: { field?: string; op?: string; amount?: number; values?: string[] }[];
    };
    const first = parsed.predicates?.[0];
    if (!first?.field) return "Always";
    if (first.field === "VALUE_MINOR") {
      return `Value ${first.op ?? ""} ${(Number(first.amount ?? 0) / 100).toFixed(2)}`;
    }
    return `${first.field} ${(first.values ?? []).join(", ")}`;
  } catch {
    return "Always";
  }
}

export function WorkflowLibrary({
  canManage,
  items,
}: {
  canManage: boolean;
  items: WorkflowRow[];
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);
  const [stageCount, setStageCount] = useState(2);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const stages = [];
    for (let index = 0; index < stageCount; index += 1) {
      const name = String(data.get(`stage-${index}-name`) ?? "").trim();
      const requiredRole = String(data.get(`stage-${index}-role`) ?? "");
      const step = Number(data.get(`stage-${index}-step`) ?? index + 1);
      const dueInDaysRaw = String(data.get(`stage-${index}-due`) ?? "").trim();
      const gate = String(data.get(`stage-${index}-gate`) ?? "ALWAYS");
      const amount = String(data.get(`stage-${index}-amount`) ?? "").trim();
      const category = String(data.get(`stage-${index}-category`) ?? "");
      const department = String(data.get(`stage-${index}-department`) ?? "");
      const risk = String(data.get(`stage-${index}-risk`) ?? "");
      let condition: unknown;
      if (gate === "VALUE" && amount) {
        condition = {
          match: "ALL",
          predicates: [
            { field: "VALUE_MINOR", op: "GTE", amount: Math.round(Number(amount) * 100) },
          ],
        };
      } else if (gate === "CATEGORY" && category) {
        condition = {
          match: "ALL",
          predicates: [{ field: "CATEGORY", op: "IN", values: [category] }],
        };
      } else if (gate === "DEPARTMENT" && department) {
        condition = {
          match: "ALL",
          predicates: [{ field: "DEPARTMENT", op: "IN", values: [department] }],
        };
      } else if (gate === "RISK" && risk) {
        condition = { match: "ALL", predicates: [{ field: "RISK", op: "IN", values: [risk] }] };
      }
      stages.push({
        name,
        requiredRole,
        step: Number.isFinite(step) ? step : index + 1,
        dueInDays: dueInDaysRaw ? Number(dueInDaysRaw) : undefined,
        allowDelegate: data.get(`stage-${index}-delegate`) === "on",
        escalateToRole: "ORGANIZATION_ADMIN",
        reminderHoursBefore: 24,
        condition,
      });
    }
    setPending(true);
    const response = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: String(data.get("name") ?? ""), stages }),
    });
    setPending(false);
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      notify({
        tone: "error",
        title: "Workflow not created",
        description: body?.error ?? "The server refused this template.",
      });
      if (response.status === 403) router.push("/forbidden");
      return;
    }
    form.reset();
    notify({ tone: "success", title: "Workflow saved" });
    router.refresh();
  }

  return (
    <>
      {!canManage && (
        <Alert className="mt-6" tone="info" title="Read-only on this account">
          Creating workflows requires <code className="font-mono">workflows:manage</code>. Hiding
          the form is not the security boundary.
        </Alert>
      )}

      {canManage && (
        <Card className="mt-6">
          <h2 className="text-h4">New workflow</h2>
          <p className="mt-1 text-small text-ink-muted">
            Same step number means those stages run in parallel. Later steps wait for every earlier
            stage.
          </p>
          <form className="mt-4 grid gap-4" onSubmit={(event) => void onCreate(event)}>
            <Field label="Name" required>
              <Input name="name" required maxLength={200} />
            </Field>
            {Array.from({ length: stageCount }, (_, index) => (
              <fieldset key={index} className="grid gap-3 rounded-lg border border-line p-4">
                <legend className="px-1 text-small font-medium">Stage {index + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name" required>
                    <Input
                      name={`stage-${index}-name`}
                      required
                      defaultValue={`Stage ${index + 1}`}
                    />
                  </Field>
                  <Field label="Required role" required>
                    <Select
                      name={`stage-${index}-role`}
                      required
                      defaultValue={ROLE_OPTIONS[1] ?? "LEGAL"}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Step" hint="Identical steps run together." required>
                    <Input
                      name={`stage-${index}-step`}
                      type="number"
                      min={1}
                      max={20}
                      required
                      defaultValue={index + 1}
                    />
                  </Field>
                  <Field label="Due in days">
                    <Input
                      name={`stage-${index}-due`}
                      type="number"
                      min={1}
                      max={365}
                      defaultValue={5}
                    />
                  </Field>
                  <Field label="Include when">
                    <Select name={`stage-${index}-gate`} defaultValue="ALWAYS">
                      <option value="ALWAYS">Always</option>
                      <option value="VALUE">Value at least</option>
                      <option value="CATEGORY">Contract type</option>
                      <option value="DEPARTMENT">Department</option>
                      <option value="RISK">Latest risk</option>
                    </Select>
                  </Field>
                  <Field label="Value (major units)">
                    <Input
                      name={`stage-${index}-amount`}
                      inputMode="decimal"
                      placeholder="100000.00"
                    />
                  </Field>
                  <Field label="Type">
                    <Select name={`stage-${index}-category`} defaultValue="MSA">
                      {CATEGORY_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {CATEGORY_LABELS[value]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Department">
                    <Select name={`stage-${index}-department`} defaultValue="LEGAL">
                      {DEPARTMENT_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {DEPARTMENT_LABELS[value]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Risk">
                    <Select name={`stage-${index}-risk`} defaultValue="HIGH">
                      {SEVERITY_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <label className="flex items-center gap-2 text-small">
                    <input type="checkbox" name={`stage-${index}-delegate`} defaultChecked />
                    Allow delegation
                  </label>
                </div>
              </fieldset>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStageCount((count) => Math.min(12, count + 1))}
              >
                Add stage
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStageCount((count) => Math.max(1, count - 1))}
              >
                Remove last stage
              </Button>
              <Button type="submit" loading={pending}>
                Save workflow
              </Button>
            </div>
          </form>
        </Card>
      )}

      {items.length === 0 ? (
        <p className="mt-8 text-small text-ink-muted">No workflows in this organization yet.</p>
      ) : (
        <div className="mt-8 grid gap-4">
          {items.map((workflow) => (
            <Card key={workflow.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-h4">{workflow.name}</h2>
                <Badge>{workflow.status}</Badge>
              </div>
              <Table className="mt-3" caption={`${workflow.name} stages`}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Step</TableHeaderCell>
                    <TableHeaderCell>Stage</TableHeaderCell>
                    <TableHeaderCell>Role</TableHeaderCell>
                    <TableHeaderCell>Condition</TableHeaderCell>
                    <TableHeaderCell>Due (days)</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {workflow.stages.map((stage) => (
                    <TableRow key={stage.id}>
                      <TableCell>{stage.step}</TableCell>
                      <TableCell className="font-medium">{stage.name}</TableCell>
                      <TableCell>
                        {ROLE_LABELS[stage.requiredRole as keyof typeof ROLE_LABELS] ??
                          stage.requiredRole}
                      </TableCell>
                      <TableCell>{conditionSummary(stage.conditionJson)}</TableCell>
                      <TableCell>{stage.dueInDays ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
