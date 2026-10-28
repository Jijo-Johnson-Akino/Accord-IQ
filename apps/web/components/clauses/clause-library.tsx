"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
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
  Textarea,
  useToast,
} from "@accordiq/ui";
import { BookMarked } from "lucide-react";
import { CATEGORY_LABELS } from "../contracts/labels";
import {
  CLAUSE_CATEGORY_LABELS,
  CLAUSE_CATEGORY_OPTIONS,
  CLAUSE_STATUS_LABELS,
  clauseStatusTone,
} from "./labels";

type ClauseRow = {
  id: string;
  code: string;
  title: string;
  category: string;
  jurisdiction: string | null;
  contractTypes: string[];
  status: string;
};

export function ClauseLibrary({ canManage, items }: { canManage: boolean; items: ClauseRow[] }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const types = data.getAll("contractTypes").map(String);
    setPending(true);
    const response = await fetch("/api/clauses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: String(data.get("code") ?? ""),
        title: String(data.get("title") ?? ""),
        category: String(data.get("category") ?? ""),
        jurisdiction: String(data.get("jurisdiction") ?? "") || undefined,
        contractTypes: types.length ? types : undefined,
        body: String(data.get("body") ?? ""),
        changeSummary: String(data.get("changeSummary") ?? "") || undefined,
      }),
    });
    setPending(false);
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      template?: { id: string };
    } | null;
    if (!response.ok || !body?.template) {
      notify({ tone: "error", title: "Clause not created", description: body?.error });
      return;
    }
    form.reset();
    notify({ tone: "success", title: "Draft clause created" });
    router.push(`/clauses/${body.template.id}`);
    router.refresh();
  }

  return (
    <>
      {!canManage && (
        <Alert className="mt-6" tone="info" title="Read-only on this account">
          Changing approved standard clauses requires{" "}
          <code className="font-mono">clauses:manage</code>. Hiding the form is not the security
          boundary.
        </Alert>
      )}

      {canManage && (
        <form className="mt-6 grid gap-3" onSubmit={(event) => void onCreate(event)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Code" required hint="Uppercase, like CONFIDENTIALITY.">
              <Input name="code" required placeholder="CONFIDENTIALITY" />
            </Field>
            <Field label="Title" required>
              <Input name="title" required />
            </Field>
            <Field label="Category" required>
              <Select name="category" required defaultValue="CONFIDENTIALITY">
                {CLAUSE_CATEGORY_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {CLAUSE_CATEGORY_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Jurisdiction">
              <Input name="jurisdiction" placeholder="Delaware" />
            </Field>
          </div>
          <fieldset>
            <legend className="text-small font-medium text-ink">Contract types</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-small">
                  <input type="checkbox" name="contractTypes" value={value} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Clause body" required>
            <Textarea name="body" required rows={6} />
          </Field>
          <Field label="Change summary">
            <Input name="changeSummary" />
          </Field>
          <Button type="submit" loading={pending} className="justify-self-start">
            Save draft
          </Button>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={BookMarked}
          title="No clauses in this organization"
          description="Legal and organization admins can add approved language here. Version history is kept when the text changes."
        />
      ) : (
        <div className="mt-8">
          <Table caption="Approved and draft clause templates">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell>Jurisdiction</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/clauses/${row.id}`} className="font-medium hover:underline">
                      {row.title}
                    </Link>
                    <div className="font-mono text-caption text-ink-muted">{row.code}</div>
                  </TableCell>
                  <TableCell>
                    {CLAUSE_CATEGORY_LABELS[row.category as keyof typeof CLAUSE_CATEGORY_LABELS] ??
                      row.category}
                  </TableCell>
                  <TableCell>{row.jurisdiction ?? "—"}</TableCell>
                  <TableCell>
                    <Badge tone={clauseStatusTone(row.status)} dot>
                      {CLAUSE_STATUS_LABELS[row.status as keyof typeof CLAUSE_STATUS_LABELS] ??
                        row.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
