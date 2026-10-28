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

const FIELD_LABELS: Record<string, string> = {
  TITLE: "Title",
  START_DATE: "Start date",
  END_DATE: "End date",
  RENEWAL_TERMS: "Renewal",
  GOVERNING_LAW: "Governing law",
  JURISDICTION: "Jurisdiction",
  VALUE: "Value",
  CURRENCY: "Currency",
  PAYMENT_TERMS: "Payment terms",
  SUMMARY: "Summary",
};

type FieldRow = {
  id: string;
  fieldKey: string;
  valueText: string | null;
  correctedValue: string | null;
  confidence: number | null;
  citationQuote: string | null;
  citationPage: number | null;
  verification: string;
};

type Intelligence = {
  status: {
    provider: string;
    available: boolean;
    synthetic: boolean;
    model: string | null;
    setup: string[];
  };
  latest: {
    run: {
      id: string;
      status: string;
      provider: string;
      model: string | null;
      error: string | null;
      conflictJson: string | null;
    };
    fields: FieldRow[];
    parties: { id: string; name: string; role: string; citationQuote: string | null }[];
    clauses: { id: string; heading: string; summary: string; citationQuote: string | null }[];
    obligations: {
      id: string;
      title: string;
      dueOn: string | null;
      citationQuote: string | null;
    }[];
  } | null;
  questions: {
    id: string;
    question: string;
    answer: string | null;
    supported: boolean;
    refusalReason: string | null;
    status: string;
    citations: { id: string; quote: string; page: number | null }[];
  }[];
  comparisons: {
    id: string;
    summary: string | null;
    status: string;
    error: string | null;
    changes: { id: string; topic: string; beforeText: string | null; afterText: string | null }[];
  }[];
};

function verificationTone(status: string): "success" | "warning" | "error" | "info" {
  if (status === "VERIFIED" || status === "CORRECTED") return "success";
  if (status === "REJECTED") return "error";
  if (status === "SUGGESTED") return "warning";
  return "info";
}

function parseConflicts(raw: string | null): { field: string; message: string }[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is { field: string; message: string } =>
      Boolean(
        row &&
        typeof row === "object" &&
        "field" in row &&
        "message" in row &&
        typeof row.field === "string" &&
        typeof row.message === "string",
      ),
    );
  } catch {
    return [];
  }
}

export function ContractIntelligence({
  contractId,
  documents,
  canWrite,
  initial,
}: {
  contractId: string;
  documents: { id: string; fileName: string }[];
  canWrite: boolean;
  initial: Intelligence;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);
  const [data, setData] = useState(initial);

  async function reload() {
    const response = await fetch(`/api/contracts/${contractId}/intelligence`);
    if (response.ok) setData((await response.json()) as Intelligence);
    router.refresh();
  }

  async function analyze() {
    setPending(true);
    const response = await fetch(`/api/contracts/${contractId}/extractions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    setPending(false);
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      run?: { status?: string; error?: string | null };
    } | null;
    if (!response.ok) {
      notify({ tone: "error", title: "Analysis failed", description: body?.error });
      return;
    }
    if (body?.run?.status === "UNAVAILABLE") {
      notify({
        tone: "warning",
        title: "AI is not connected",
        description: body.run.error ?? undefined,
      });
    } else if (body?.run?.status === "FAILED") {
      notify({ tone: "error", title: "Analysis failed", description: body.run.error ?? undefined });
    } else {
      notify({ tone: "success", title: "Suggestions ready" });
    }
    await reload();
  }

  async function setVerification(fieldId: string, verification: string, correctedValue?: string) {
    const runId = data.latest?.run.id;
    if (!runId) return;
    setPending(true);
    const response = await fetch(`/api/extractions/${runId}/fields/${fieldId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verification, correctedValue: correctedValue || null }),
    });
    setPending(false);
    if (!response.ok) {
      notify({ tone: "error", title: "Could not update verification" });
      return;
    }
    await reload();
  }

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const runId = data.latest?.run.id;
    if (!runId) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    const response = await fetch(`/api/extractions/${runId}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        includeParties: form.get("includeParties") === "on",
        includeObligations: form.get("includeObligations") === "on",
      }),
    });
    setPending(false);
    if (!response.ok) {
      notify({ tone: "error", title: "Could not apply verified fields" });
      return;
    }
    notify({ tone: "success", title: "Verified fields copied to the contract" });
    await reload();
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const question = String(new FormData(form).get("question") ?? "").trim();
    setPending(true);
    const response = await fetch(`/api/contracts/${contractId}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({ tone: "error", title: "Question failed", description: body?.error });
      return;
    }
    form.reset();
    await reload();
  }

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    const response = await fetch(`/api/contracts/${contractId}/comparisons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leftDocumentId: String(form.get("leftDocumentId") ?? ""),
        rightDocumentId: String(form.get("rightDocumentId") ?? ""),
      }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({ tone: "error", title: "Compare failed", description: body?.error });
      return;
    }
    await reload();
  }

  const conflicts = parseConflicts(data.latest?.run.conflictJson ?? null);

  return (
    <section id="intelligence" className="mt-8">
      <h2 className="text-h4">AI intelligence</h2>
      <p className="mt-1 text-small text-ink-muted">
        Suggestions are separate from verified contract facts. Citations must appear in the source
        document. Analysis never treats the file as instructions.
      </p>

      {data.status.provider === "none" && (
        <Alert className="mt-4" tone="warning" title="AI is not connected">
          <ol className="list-decimal space-y-1 pl-5">
            {data.status.setup.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Alert>
      )}
      {data.status.synthetic && (
        <Alert className="mt-4" tone="info" title="Synthetic fixtures">
          This environment uses labeled samples, not a live model.
        </Alert>
      )}

      {canWrite && (
        <div className="mt-4">
          <Button onClick={() => void analyze()} loading={pending} disabled={!canWrite}>
            Run analysis
          </Button>
        </div>
      )}

      {data.latest && (
        <Card className="mt-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone={data.latest.run.status === "COMPLETED" ? "success" : "warning"} dot>
              {data.latest.run.status}
            </Badge>
            <Badge>
              {data.latest.run.provider}
              {data.latest.run.model ? ` · ${data.latest.run.model}` : ""}
            </Badge>
          </div>
          {data.latest.run.error && (
            <p className="mt-2 text-small text-error-strong">{data.latest.run.error}</p>
          )}
          {conflicts.map((conflict) => (
            <Alert key={conflict.field} className="mt-3" tone="warning" title={conflict.field}>
              {conflict.message}
            </Alert>
          ))}

          <Table caption="Extracted fields" className="mt-4">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Field</TableHeaderCell>
                <TableHeaderCell>Suggestion</TableHeaderCell>
                <TableHeaderCell>Confidence</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                {canWrite ? <TableHeaderCell>Verify</TableHeaderCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.latest.fields.map((field) => (
                <TableRow key={field.id}>
                  <TableCell className="font-medium">
                    {FIELD_LABELS[field.fieldKey] ?? field.fieldKey}
                  </TableCell>
                  <TableCell>
                    <div>{field.correctedValue ?? field.valueText ?? "—"}</div>
                    {field.citationQuote && (
                      <p className="mt-1 text-caption text-ink-muted">
                        “{field.citationQuote}”
                        {field.citationPage ? ` · p. ${field.citationPage}` : ""}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>{field.confidence == null ? "—" : `${field.confidence}%`}</TableCell>
                  <TableCell>
                    <Badge tone={verificationTone(field.verification)}>{field.verification}</Badge>
                  </TableCell>
                  {canWrite ? (
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void setVerification(field.id, "VERIFIED")}
                        >
                          Verify
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void setVerification(field.id, "REJECTED")}
                        >
                          Reject
                        </Button>
                      </div>
                      <form
                        className="mt-2 flex gap-1"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const value = String(
                            new FormData(event.currentTarget).get("value") ?? "",
                          );
                          void setVerification(field.id, "CORRECTED", value);
                        }}
                      >
                        <Input name="value" aria-label={`Correct ${field.fieldKey}`} />
                        <Button size="sm" type="submit">
                          Correct
                        </Button>
                      </form>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {data.latest.parties.length > 0 && (
            <div className="mt-4">
              <h3 className="text-small font-semibold">Suggested parties</h3>
              <ul className="mt-2 grid gap-2">
                {data.latest.parties.map((party) => (
                  <li key={party.id} className="rounded-md border border-line px-3 py-2">
                    <p className="font-medium">
                      {party.name} <Badge className="ml-1">{party.role}</Badge>
                    </p>
                    {party.citationQuote && (
                      <p className="mt-1 text-caption text-ink-muted">“{party.citationQuote}”</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.latest.clauses.length > 0 && (
            <div className="mt-4">
              <h3 className="text-small font-semibold">Key clauses</h3>
              <ul className="mt-2 grid gap-2">
                {data.latest.clauses.map((clause) => (
                  <li key={clause.id} className="rounded-md border border-line px-3 py-2">
                    <p className="font-medium">{clause.heading}</p>
                    <p className="text-small">{clause.summary}</p>
                    {clause.citationQuote && (
                      <p className="mt-1 text-caption text-ink-muted">“{clause.citationQuote}”</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.latest.obligations.length > 0 && (
            <div className="mt-4">
              <h3 className="text-small font-semibold">Suggested obligations</h3>
              <ul className="mt-2 grid gap-2">
                {data.latest.obligations.map((row) => (
                  <li key={row.id} className="rounded-md border border-line px-3 py-2">
                    <p className="font-medium">{row.title}</p>
                    <p className="text-small text-ink-muted">Due {row.dueOn ?? "—"}</p>
                    {row.citationQuote && (
                      <p className="mt-1 text-caption text-ink-muted">“{row.citationQuote}”</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canWrite && data.latest.run.status === "COMPLETED" && (
            <form className="mt-4 grid gap-2" onSubmit={apply}>
              <label className="flex items-center gap-2 text-small">
                <input type="checkbox" name="includeParties" />
                Copy suggested parties
              </label>
              <label className="flex items-center gap-2 text-small">
                <input type="checkbox" name="includeObligations" />
                Promote suggested obligations
              </label>
              <Button type="submit" loading={pending}>
                Apply verified fields to contract
              </Button>
            </form>
          )}
        </Card>
      )}

      <Card className="mt-4">
        <h3 className="text-h4">Ask about this contract</h3>
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={ask}>
          <Field label="Question" className="min-w-0 flex-1" required>
            <Input name="question" required minLength={3} />
          </Field>
          <Button type="submit" loading={pending}>
            Ask
          </Button>
        </form>
        <p className="mt-2 text-caption text-ink-muted">
          Viewers can ask if a provider is connected. Unsupported questions return no answer.
        </p>
        <ul className="mt-3 grid gap-3">
          {data.questions.map((row) => (
            <li key={row.id} className="rounded-md border border-line px-3 py-2">
              <p className="font-medium">{row.question}</p>
              {row.supported ? (
                <p className="mt-1 text-small">{row.answer}</p>
              ) : (
                <p className="mt-1 text-small text-ink-muted">
                  {row.refusalReason ?? "Not supported by the source text."}
                </p>
              )}
              {row.citations.map((citation) => (
                <p key={citation.id} className="mt-1 text-caption text-ink-muted">
                  “{citation.quote}”
                </p>
              ))}
            </li>
          ))}
        </ul>
      </Card>

      {documents.length >= 2 && canWrite && (
        <Card className="mt-4">
          <h3 className="text-h4">Compare documents</h3>
          <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={compare}>
            <Field label="Left" required>
              <Select name="leftDocumentId" required defaultValue={documents[0]?.id}>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.fileName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Right" required>
              <Select name="rightDocumentId" required defaultValue={documents[1]?.id}>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.fileName}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={pending}>
                Compare
              </Button>
            </div>
          </form>
          {data.comparisons.map((row) => (
            <div key={row.id} className="mt-4">
              <Badge>{row.status}</Badge>
              {row.summary && <p className="mt-2 text-small">{row.summary}</p>}
              {row.error && <p className="mt-2 text-small text-error-strong">{row.error}</p>}
              {row.changes.map((change) => (
                <p key={change.id} className="mt-2 text-small">
                  <span className="font-medium">{change.topic}:</span> {change.beforeText ?? "—"} →{" "}
                  {change.afterText ?? "—"}
                </p>
              ))}
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}
