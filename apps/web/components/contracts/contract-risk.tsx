"use client";

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
import { REVIEW_LABELS, RISK_CATEGORY_LABELS, reviewTone, severityTone } from "../clauses/labels";

type Assessment = {
  id: string;
  assessmentNumber: number;
  overallSeverity: string;
  score: number;
  scoreMethod: string;
  stale: boolean;
  engineVersion: string | null;
  summary: string | null;
  createdAt: string | Date;
};

type Finding = {
  id: string;
  ruleCode: string;
  ruleVersion: number;
  category: string;
  severity: string;
  weight: number;
  contractText: string | null;
  explanation: string;
  aiExplanation: string | null;
  remediation: string | null;
  reviewStatus: string;
  reviewNote: string | null;
};

function categoryLabel(category: string): string {
  return RISK_CATEGORY_LABELS[category as keyof typeof RISK_CATEGORY_LABELS] ?? category;
}

export function ContractRisk({
  contractId,
  canAssess,
  canReview,
  assessments,
  latest,
}: {
  contractId: string;
  canAssess: boolean;
  canReview: boolean;
  assessments: Assessment[];
  latest: { assessment: Assessment; findings: Finding[] } | null;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);
  const [selectedId, setSelectedId] = useState(latest?.assessment.id ?? assessments[0]?.id ?? "");
  const [detail, setDetail] = useState(latest);

  async function loadAssessment(id: string) {
    const response = await fetch(`/api/risk-assessments/${id}`);
    if (!response.ok) return;
    const body = (await response.json()) as { assessment: Assessment; findings: Finding[] };
    setDetail(body);
  }

  async function runAssessment() {
    setPending(true);
    const response = await fetch(`/api/contracts/${contractId}/risk-assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    setPending(false);
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      assessment?: Assessment;
      findings?: Finding[];
    } | null;
    if (!response.ok || !body?.assessment) {
      notify({
        tone: "error",
        title: "Assessment failed",
        description: body && "error" in body ? body.error : undefined,
      });
      return;
    }
    notify({
      tone: "success",
      title: `Assessment v${body.assessment.assessmentNumber} recorded`,
    });
    setSelectedId(body.assessment.id);
    setDetail({ assessment: body.assessment, findings: body.findings ?? [] });
    router.refresh();
  }

  async function reviewFinding(event: FormEvent<HTMLFormElement>, findingId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    const response = await fetch(`/api/risk-findings/${findingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewStatus: String(data.get("reviewStatus") ?? ""),
        reviewNote: String(data.get("reviewNote") ?? ""),
      }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({ tone: "error", title: "Review not saved", description: body?.error });
      return;
    }
    notify({ tone: "success", title: "Finding updated" });
    form.reset();
    await loadAssessment(selectedId);
    router.refresh();
  }

  const current = detail?.assessment;
  const predatesEngine = Boolean(current && !current.engineVersion);

  return (
    <section id="risk" className="mt-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h3">Contract risk</h2>
          <p className="mt-1 text-small text-ink-muted">
            Scores come from deterministic rules. AI explanations are stored separately and never
            change the number.
          </p>
        </div>
        {canAssess && (
          <Button type="button" onClick={() => void runAssessment()} loading={pending}>
            Run assessment
          </Button>
        )}
      </div>

      {assessments.length > 1 && (
        <div className="mt-4 max-w-sm">
          <Field label="Assessment version">
            <Select
              value={selectedId}
              onChange={(event) => {
                const id = event.target.value;
                setSelectedId(id);
                void loadAssessment(id);
              }}
            >
              {assessments.map((row) => (
                <option key={row.id} value={row.id}>
                  v{row.assessmentNumber}
                  {row.stale ? " (stale)" : ""}
                  {row.engineVersion ? "" : " (pre-engine)"}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      {!current ? (
        <Alert className="mt-4" tone="info" title="No engine assessment yet">
          Run an assessment to evaluate the current record against the organization rule set.
          Historical rows are kept when you run it again.
        </Alert>
      ) : (
        <>
          {predatesEngine && (
            <Alert className="mt-4" tone="warning" title="This assessment predates the engine">
              The seed row was recorded before deterministic scoring. Run a new assessment to
              produce findings, a score, and an engine version.
            </Alert>
          )}
          {current.stale && (
            <Alert className="mt-4" tone="warning" title="Rules or thresholds changed">
              This version is kept for history. Run a new assessment to evaluate the current rule
              set.
            </Alert>
          )}
          <Card className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={severityTone(current.overallSeverity)} dot>
                {current.overallSeverity}
              </Badge>
              <span className="text-small">
                Score {current.score} · {current.scoreMethod}
              </span>
              {current.engineVersion && <Badge>{current.engineVersion}</Badge>}
              <Badge>v{current.assessmentNumber}</Badge>
            </div>
            <p className="mt-3 text-small text-ink-muted">
              {current.summary ?? "No summary stored."} Thresholds are proposed defaults unless the
              organization replaced them. This is not an official rating.
            </p>
          </Card>

          {(detail?.findings.length ?? 0) === 0 ? (
            <p className="mt-4 text-small text-ink-muted">
              No findings on this version. Text-matching rules are skipped when no source document
              is available.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {detail?.findings.map((finding) => (
                <li key={finding.id}>
                  <Card>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={severityTone(finding.severity)} dot>
                        {finding.severity}
                      </Badge>
                      <Badge tone={reviewTone(finding.reviewStatus)}>
                        {REVIEW_LABELS[finding.reviewStatus as keyof typeof REVIEW_LABELS] ??
                          finding.reviewStatus}
                      </Badge>
                      <span className="font-mono text-caption">{finding.ruleCode}</span>
                      <span className="text-caption text-ink-muted">
                        rule v{finding.ruleVersion} · weight {finding.weight}
                      </span>
                    </div>
                    <p className="mt-2 text-small font-medium">{categoryLabel(finding.category)}</p>
                    <p className="mt-2 text-small">{finding.explanation}</p>
                    {finding.contractText && (
                      <blockquote className="mt-2 border-l-2 border-line pl-3 text-small text-ink-muted">
                        {finding.contractText}
                      </blockquote>
                    )}
                    {finding.remediation && (
                      <p className="mt-2 text-small">
                        <span className="font-medium">Recommended remediation: </span>
                        {finding.remediation}
                      </p>
                    )}
                    {finding.reviewNote && (
                      <p className="mt-2 text-small text-ink-muted">
                        Review note: {finding.reviewNote}
                      </p>
                    )}
                    {canReview && finding.reviewStatus === "OPEN" && (
                      <form
                        className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
                        onSubmit={(event) => void reviewFinding(event, finding.id)}
                      >
                        <Field label="Review status" required>
                          <Select name="reviewStatus" required defaultValue="RESOLVED">
                            <option value="RESOLVED">Resolved</option>
                            <option value="DISMISSED">Dismissed</option>
                          </Select>
                        </Field>
                        <Field label="Review note" required>
                          <Textarea name="reviewNote" required rows={2} />
                        </Field>
                        <Button type="submit" variant="secondary" loading={pending}>
                          Save review
                        </Button>
                      </form>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}

          {(detail?.findings.length ?? 0) > 0 && (
            <div className="mt-4">
              <Table caption="Finding review status">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Rule</TableHeaderCell>
                    <TableHeaderCell>Severity</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Assessment</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail?.findings.map((finding) => (
                    <TableRow key={finding.id}>
                      <TableCell className="font-mono">{finding.ruleCode}</TableCell>
                      <TableCell>{finding.severity}</TableCell>
                      <TableCell>{finding.reviewStatus}</TableCell>
                      <TableCell>v{current.assessmentNumber}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
