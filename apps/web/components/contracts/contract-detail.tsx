"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
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
import {
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  CURRENCY_OPTIONS,
  DEPARTMENT_LABELS,
  DEPARTMENT_OPTIONS,
  formatMinorAmount,
  minorToMajorInput,
  LIFECYCLE_LABELS,
  PROCESSING_LABELS,
  RELATION_LABELS,
  RELATION_OPTIONS,
  processingTone,
} from "./labels";
import { postFormWithProgress } from "./upload-progress";

const ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface DetailContract {
  id: string;
  title: string;
  status: string;
  vendorId: string | null;
  vendorName: string | null;
  category: string | null;
  currency: string | null;
  valueMinor: number | null;
  department: string | null;
  effectiveOn: string | null;
  expiresOn: string | null;
  noticeDays: number | null;
  autoRenew: boolean;
  currentVersionId: string | null;
}

interface DetailVersion {
  id: string;
  versionNumber: number;
  status: string;
  summary: string | null;
  createdAt: string | Date;
}

interface DetailParty {
  id: string;
  name: string;
  role: string;
  email: string | null;
}

interface DetailDocument {
  id: string;
  fileName: string;
  status: string;
  contentType: string;
  processingError: string | null;
  pageCount: number | null;
  hasFile: boolean;
}

interface DetailRelation {
  id: string;
  relationType: string;
  otherContract: { id: string; title: string };
}

export function ContractDetail({
  canWrite,
  vendors,
  contracts,
  detail,
}: {
  canWrite: boolean;
  vendors: { id: string; name: string }[];
  contracts: { id: string; title: string }[];
  detail: {
    contract: DetailContract;
    versions: DetailVersion[];
    documents: DetailDocument[];
    parties: DetailParty[];
    relations: DetailRelation[];
  };
}) {
  const router = useRouter();
  const { notify } = useToast();
  const { contract } = detail;
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewObject = useRef<string | null>(null);
  const keyRef = useRef(crypto.randomUUID());

  const previewId =
    detail.documents.find(
      (doc) => doc.status === "COMPLETED" && doc.contentType === "application/pdf",
    )?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    async function loadPreview() {
      setPreviewError(null);
      if (!previewId) {
        setPreviewUrl(null);
        return;
      }
      const response = await fetch(`/api/documents/${previewId}/file?disposition=inline`);
      if (!response.ok) {
        if (!cancelled) setPreviewError("Preview is not available.");
        return;
      }
      const blob = await response.blob();
      if (cancelled) return;
      if (previewObject.current) URL.revokeObjectURL(previewObject.current);
      const url = URL.createObjectURL(blob);
      previewObject.current = url;
      setPreviewUrl(url);
    }
    void loadPreview();
    return () => {
      cancelled = true;
      if (previewObject.current) {
        URL.revokeObjectURL(previewObject.current);
        previewObject.current = null;
      }
    };
  }, [previewId]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      title: String(data.get("title") ?? "").trim(),
      vendorId: String(data.get("vendorId") ?? "") || null,
      category: String(data.get("category") ?? "") || null,
      department: String(data.get("department") ?? "") || null,
      currency: String(data.get("currency") ?? "") || null,
      effectiveOn: String(data.get("effectiveOn") ?? "") || null,
      expiresOn: String(data.get("expiresOn") ?? "") || null,
      noticeDays: String(data.get("noticeDays") ?? "") ? Number(data.get("noticeDays")) : null,
      autoRenew: String(data.get("autoRenew") ?? "") === "true",
      value: String(data.get("value") ?? "").trim() || null,
    };
    setPending(true);
    const response = await fetch(`/api/contracts/${contract.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({
        tone: "error",
        title: "Could not save",
        description: body?.error ?? "The server refused this update.",
      });
      if (response.status === 403) router.push("/forbidden");
      return;
    }
    notify({ tone: "success", title: "Contract updated" });
    setEditing(false);
    router.refresh();
  }

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      notify({ tone: "error", title: "Choose a PDF or DOCX file." });
      return;
    }
    setPending(true);
    setUploadProgress(0);
    try {
      const { status, body } = await postFormWithProgress(
        `/api/contracts/${contract.id}/documents`,
        form,
        keyRef.current,
        setUploadProgress,
      );
      if (status >= 400) {
        notify({
          tone: "error",
          title: "Upload failed",
          description:
            typeof body.error === "string" ? body.error : "The server refused this file.",
        });
        return;
      }
      const document = body.document as
        { status?: string; processingError?: string | null } | undefined;
      const duplicates = body.duplicates as { fileName: string }[] | undefined;
      if (document?.status === "FAILED") {
        notify({
          tone: "error",
          title: "Processing failed",
          description: document.processingError ?? "The file could not be processed.",
        });
      } else {
        notify({ tone: "success", title: "Document stored" });
      }
      if (duplicates && duplicates.length > 0) {
        notify({
          tone: "warning",
          title: "Possible duplicate",
          description: `A matching file already exists (${duplicates[0]?.fileName}).`,
        });
      }
      keyRef.current = crypto.randomUUID();
      formEl.reset();
      router.refresh();
    } finally {
      setPending(false);
      setUploadProgress(null);
    }
  }

  async function retry(documentId: string) {
    setPending(true);
    const response = await fetch(`/api/documents/${documentId}/retry`, { method: "POST" });
    setPending(false);
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      document?: { status?: string; processingError?: string | null };
    } | null;
    if (!response.ok) {
      notify({
        tone: "error",
        title: "Retry failed",
        description: body?.error ?? "The document could not be reprocessed.",
      });
      return;
    }
    if (body?.document?.status === "FAILED") {
      notify({
        tone: "error",
        title: "Processing failed",
        description: body.document.processingError ?? "The file could not be processed.",
      });
    } else {
      notify({ tone: "success", title: "Document reprocessed" });
    }
    router.refresh();
  }

  async function addRelation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    const response = await fetch(`/api/contracts/${contract.id}/relations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toContractId: String(data.get("toContractId") ?? ""),
        relationType: String(data.get("relationType") ?? ""),
      }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      notify({
        tone: "error",
        title: "Could not link agreement",
        description: body?.error ?? "The server refused this relationship.",
      });
      return;
    }
    notify({ tone: "success", title: "Related agreement added" });
    event.currentTarget.reset();
    router.refresh();
  }

  async function removeRelation(relationId: string) {
    setPending(true);
    const response = await fetch(`/api/contracts/${contract.id}/relations/${relationId}`, {
      method: "DELETE",
    });
    setPending(false);
    if (!response.ok) {
      notify({ tone: "error", title: "Could not remove relationship" });
      return;
    }
    router.refresh();
  }

  const valueDisplay = minorToMajorInput(contract.valueMinor, contract.currency);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{contract.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>
              {LIFECYCLE_LABELS[contract.status as keyof typeof LIFECYCLE_LABELS] ??
                contract.status}
            </Badge>
            {contract.category && (
              <Badge tone="info">
                {CATEGORY_LABELS[contract.category as keyof typeof CATEGORY_LABELS] ??
                  contract.category}
              </Badge>
            )}
          </div>
        </div>
        {canWrite && (
          <Button variant="secondary" onClick={() => setEditing((open) => !open)}>
            {editing ? "Close editor" : "Edit metadata"}
          </Button>
        )}
      </div>

      {!canWrite && (
        <Alert className="mt-4" tone="info" title="Read-only on this account">
          Editing and uploads require a write role. Hiding those actions is not the security
          boundary.
        </Alert>
      )}

      {editing && canWrite ? (
        <Card className="mt-6">
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSave}>
            <Field label="Title" required className="sm:col-span-2">
              <Input name="title" required defaultValue={contract.title} maxLength={300} />
            </Field>
            <Field label="Counterparty">
              <Select name="vendorId" defaultValue={contract.vendorId ?? ""}>
                <option value="">None</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category">
              <Select name="category" defaultValue={contract.category ?? ""}>
                <option value="">None</option>
                {CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Department">
              <Select name="department" defaultValue={contract.department ?? ""}>
                <option value="">None</option>
                {DEPARTMENT_OPTIONS.map((department) => (
                  <option key={department} value={department}>
                    {DEPARTMENT_LABELS[department]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Effective on">
              <Input name="effectiveOn" type="date" defaultValue={contract.effectiveOn ?? ""} />
            </Field>
            <Field label="Expires on">
              <Input name="expiresOn" type="date" defaultValue={contract.expiresOn ?? ""} />
            </Field>
            <Field label="Notice period (days)">
              <Input
                name="noticeDays"
                type="number"
                min={0}
                max={365}
                defaultValue={contract.noticeDays ?? ""}
              />
            </Field>
            <Field
              label="Auto-renew flag"
              hint="This flag is recorded only. AccordIQ will not renew without an approved decision."
            >
              <Select name="autoRenew" defaultValue={contract.autoRenew ? "true" : "false"}>
                <option value="false">Off</option>
                <option value="true">On</option>
              </Select>
            </Field>
            <Field label="Currency">
              <Select name="currency" defaultValue={contract.currency ?? "USD"}>
                {CURRENCY_OPTIONS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Contract value">
              <Input name="value" inputMode="decimal" defaultValue={valueDisplay} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={pending}>
                Save changes
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-caption text-ink-muted">Counterparty</dt>
            <dd>{contract.vendorName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Value</dt>
            <dd>{formatMinorAmount(contract.valueMinor, contract.currency)}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Department</dt>
            <dd>
              {contract.department
                ? (DEPARTMENT_LABELS[contract.department as keyof typeof DEPARTMENT_LABELS] ??
                  contract.department)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Effective</dt>
            <dd>{contract.effectiveOn ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Expires</dt>
            <dd>{contract.expiresOn ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Notice period</dt>
            <dd>
              {contract.noticeDays != null ? `${contract.noticeDays} days` : "Default 60 days"}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Auto-renew flag</dt>
            <dd>{contract.autoRenew ? "On (not applied automatically)" : "Off"}</dd>
          </div>
        </dl>
      )}

      <section className="mt-8">
        <h2 className="text-h4">Document</h2>
        <p className="mt-1 text-small text-ink-muted">
          Processing state is separate from the contract lifecycle. Preview uses an authorized
          download, not a public storage URL.
        </p>
        {previewUrl && previewId ? (
          <iframe
            title="Contract PDF preview"
            src={previewUrl}
            className="mt-4 h-[32rem] w-full rounded-lg border border-line bg-surface"
          />
        ) : (
          <p className="mt-4 text-small text-ink-muted">
            {previewError ??
              "PDF preview is available after a PDF finishes processing. Word documents can be downloaded."}
          </p>
        )}

        {canWrite && (
          <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onUpload}>
            <Field label="Add document version" className="min-w-0 flex-1" required>
              <Input name="file" type="file" accept={ACCEPT} required />
            </Field>
            <Button type="submit" loading={pending}>
              Upload
            </Button>
          </form>
        )}
        {uploadProgress != null && (
          <progress
            className="mt-3 h-2 w-full overflow-hidden rounded-full"
            max={100}
            value={uploadProgress}
            aria-label="Upload progress"
          />
        )}

        <div className="mt-4">
          <Table caption="Document versions">
            <TableHead>
              <TableRow>
                <TableHeaderCell>File</TableHeaderCell>
                <TableHeaderCell>Processing</TableHeaderCell>
                <TableHeaderCell>Pages</TableHeaderCell>
                <TableHeaderCell>Download</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detail.documents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>No documents uploaded yet.</TableCell>
                </TableRow>
              ) : (
                detail.documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.fileName}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge tone={processingTone(doc.status)} dot>
                          {PROCESSING_LABELS[doc.status as keyof typeof PROCESSING_LABELS] ??
                            doc.status}
                        </Badge>
                        {doc.status === "FAILED" && doc.processingError && (
                          <span className="text-caption text-error-strong">
                            {doc.processingError}
                          </span>
                        )}
                        {doc.status === "FAILED" && canWrite && (
                          <Button size="sm" variant="secondary" onClick={() => retry(doc.id)}>
                            Retry processing
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{doc.pageCount ?? "—"}</TableCell>
                    <TableCell>
                      {doc.hasFile ? (
                        <a
                          className="text-primary-strong underline"
                          href={`/api/documents/${doc.id}/file`}
                        >
                          Download
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-h4">Versions</h2>
        <Table caption="Contract versions" className="mt-3">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Number</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Summary</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {detail.versions.map((version) => (
              <TableRow key={version.id}>
                <TableCell>{version.versionNumber}</TableCell>
                <TableCell>{version.status}</TableCell>
                <TableCell>{version.summary ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="mt-8">
        <h2 className="text-h4">Parties</h2>
        <Table caption="Contract parties" className="mt-3">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Role</TableHeaderCell>
              <TableHeaderCell>Email</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {detail.parties.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3}>No parties recorded.</TableCell>
              </TableRow>
            ) : (
              detail.parties.map((party) => (
                <TableRow key={party.id}>
                  <TableCell className="font-medium">{party.name}</TableCell>
                  <TableCell>{party.role}</TableCell>
                  <TableCell>{party.email ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section className="mt-8">
        <h2 className="text-h4">Related agreements</h2>
        <p className="mt-1 text-small text-ink-muted">
          Amendments, renewals and other linked contracts in this organization.
        </p>
        {canWrite && (
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={addRelation}
          >
            <Field label="Related contract" className="min-w-0 flex-1" required>
              <Select name="toContractId" required defaultValue="">
                <option value="" disabled>
                  Select a contract
                </option>
                {contracts
                  .filter((row) => row.id !== contract.id)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.title}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Relationship" required>
              <Select name="relationType" required defaultValue="RELATED">
                {RELATION_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {RELATION_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" loading={pending}>
              Link
            </Button>
          </form>
        )}
        <ul className="mt-4 grid gap-2">
          {detail.relations.length === 0 ? (
            <li className="text-small text-ink-muted">No related agreements.</li>
          ) : (
            detail.relations.map((relation) => (
              <li
                key={relation.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-4 py-3"
              >
                <span>
                  <Badge className="mr-2">
                    {RELATION_LABELS[relation.relationType as keyof typeof RELATION_LABELS] ??
                      relation.relationType}
                  </Badge>
                  <Link
                    className="text-primary-strong underline"
                    href={`/contracts/${relation.otherContract.id}`}
                  >
                    {relation.otherContract.title}
                  </Link>
                </span>
                {canWrite && (
                  <Button size="sm" variant="ghost" onClick={() => removeRelation(relation.id)}>
                    Remove
                  </Button>
                )}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
