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
  Input,
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
import { CLAUSE_CATEGORY_LABELS, CLAUSE_STATUS_LABELS, clauseStatusTone } from "./labels";

type Template = {
  id: string;
  code: string;
  title: string;
  category: string;
  jurisdiction: string | null;
  contractTypes: string[];
  status: string;
  currentVersionId: string | null;
};

type Version = {
  id: string;
  versionNumber: number;
  body: string;
  changeSummary: string | null;
  status: string;
  createdAt: string | Date;
};

type Alternative = {
  id: string;
  note: string | null;
  alternative: { id: string; title: string; code: string };
};

type Usage = {
  id: string;
  contractId: string;
  contractTitle: string;
  versionId: string;
};

export function ClauseDetail({
  canManage,
  initial,
  contracts,
  otherClauses,
}: {
  canManage: boolean;
  initial: {
    template: Template;
    versions: Version[];
    alternatives: Alternative[];
    usages: Usage[];
  };
  contracts: { id: string; title: string }[];
  otherClauses: { id: string; title: string; code: string }[];
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);
  const [data, setData] = useState(initial);
  const deprecated = data.template.status === "DEPRECATED";

  async function reload() {
    const response = await fetch(`/api/clauses/${data.template.id}`);
    if (response.ok) {
      setData((await response.json()) as typeof initial);
    }
    router.refresh();
  }

  async function post(path: string, body: unknown, success: string) {
    setPending(true);
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setPending(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({ tone: "error", title: "Action refused", description: payload?.error });
      return;
    }
    notify({ tone: "success", title: success });
    await reload();
  }

  async function addVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    await post(
      `/api/clauses/${data.template.id}/versions`,
      {
        body: String(fields.get("body") ?? ""),
        changeSummary: String(fields.get("changeSummary") ?? "") || undefined,
      },
      "New version saved as draft",
    );
    form.reset();
  }

  async function addAlternative(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    await post(
      `/api/clauses/${data.template.id}/alternatives`,
      {
        alternativeTemplateId: String(fields.get("alternativeTemplateId") ?? ""),
        note: String(fields.get("note") ?? "") || undefined,
      },
      "Alternative linked",
    );
    form.reset();
  }

  async function addUsage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await post(
      `/api/clauses/${data.template.id}/usages`,
      { contractId: String(new FormData(form).get("contractId") ?? "") },
      "Contract linked",
    );
    form.reset();
  }

  const current = data.versions.find((row) => row.id === data.template.currentVersionId);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={clauseStatusTone(data.template.status)} dot>
          {CLAUSE_STATUS_LABELS[data.template.status as keyof typeof CLAUSE_STATUS_LABELS] ??
            data.template.status}
        </Badge>
        <Badge>
          {CLAUSE_CATEGORY_LABELS[data.template.category as keyof typeof CLAUSE_CATEGORY_LABELS] ??
            data.template.category}
        </Badge>
        <span className="font-mono text-caption">{data.template.code}</span>
      </div>
      {data.template.jurisdiction && (
        <p className="mt-2 text-small text-ink-muted">Jurisdiction: {data.template.jurisdiction}</p>
      )}
      {data.template.contractTypes.length > 0 && (
        <p className="mt-1 text-small text-ink-muted">
          Contract types: {data.template.contractTypes.join(", ")}
        </p>
      )}

      {deprecated && (
        <Alert className="mt-4" tone="warning" title="Deprecated">
          This standard clause can no longer be edited, versioned, or approved.
        </Alert>
      )}

      {current && (
        <Card className="mt-6">
          <h2 className="text-h4">Current text</h2>
          <p className="mt-1 text-caption text-ink-muted">Version {current.versionNumber}</p>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-small">{current.body}</pre>
        </Card>
      )}

      {canManage && !deprecated && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            loading={pending}
            onClick={() =>
              void post(`/api/clauses/${data.template.id}/approve`, {}, "Clause approved")
            }
          >
            Approve current draft
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={pending}
            onClick={() =>
              void post(`/api/clauses/${data.template.id}/deprecate`, {}, "Clause deprecated")
            }
          >
            Deprecate
          </Button>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-h4">Version history</h2>
        <div className="mt-3">
          <Table caption="Clause versions">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Version</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Summary</TableHeaderCell>
                {canManage && <TableHeaderCell>Actions</TableHeaderCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.versions.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>v{row.versionNumber}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.changeSummary ?? "—"}</TableCell>
                  {canManage && (
                    <TableCell>
                      {row.status === "DRAFT" && !deprecated && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={pending}
                          onClick={() =>
                            void post(
                              `/api/clauses/${data.template.id}/approve`,
                              { versionId: row.id },
                              `Version ${row.versionNumber} approved`,
                            )
                          }
                        >
                          Approve
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {data.versions.map((row) => (
          <details key={`${row.id}-body`} className="mt-2 rounded-md border border-line px-3 py-2">
            <summary className="cursor-pointer text-small font-medium">
              v{row.versionNumber} text
            </summary>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-small">{row.body}</pre>
          </details>
        ))}
      </section>

      {canManage && !deprecated && (
        <form className="mt-6 grid gap-3" onSubmit={(event) => void addVersion(event)}>
          <h2 className="text-h4">New version</h2>
          <p className="text-small text-ink-muted">
            Approved wording is not edited in place. Save a new version, then approve it to
            supersede the current one.
          </p>
          <Field label="Body" required>
            <Textarea name="body" required rows={6} defaultValue={current?.body} />
          </Field>
          <Field label="Change summary">
            <Input name="changeSummary" />
          </Field>
          <Button type="submit" loading={pending} className="justify-self-start">
            Save draft version
          </Button>
        </form>
      )}

      <section className="mt-8">
        <h2 className="text-h4">Alternative clauses</h2>
        {data.alternatives.length === 0 ? (
          <p className="mt-2 text-small text-ink-muted">No alternatives linked.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {data.alternatives.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/clauses/${row.alternative.id}`}
                  className="font-medium hover:underline"
                >
                  {row.alternative.title}
                </Link>
                <span className="ml-2 font-mono text-caption">{row.alternative.code}</span>
                {row.note && <p className="text-small text-ink-muted">{row.note}</p>}
              </li>
            ))}
          </ul>
        )}
        {canManage && otherClauses.length > 0 && (
          <form
            className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(event) => void addAlternative(event)}
          >
            <Field label="Alternative" required>
              <Select name="alternativeTemplateId" required defaultValue={otherClauses[0]?.id}>
                {otherClauses.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title} ({row.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Note">
              <Input name="note" />
            </Field>
            <Button type="submit" variant="secondary" loading={pending}>
              Link
            </Button>
          </form>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-h4">Contracts using this clause</h2>
        {data.usages.length === 0 ? (
          <p className="mt-2 text-small text-ink-muted">No contracts linked yet.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {data.usages.map((row) => (
              <li key={row.id}>
                <Link href={`/contracts/${row.contractId}`} className="hover:underline">
                  {row.contractTitle}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {canManage && contracts.length > 0 && (
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => void addUsage(event)}
          >
            <Field label="Contract" className="min-w-0 flex-1" required>
              <Select name="contractId" required defaultValue={contracts[0]?.id}>
                {contracts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="secondary" loading={pending}>
              Link contract
            </Button>
          </form>
        )}
      </section>
    </>
  );
}
