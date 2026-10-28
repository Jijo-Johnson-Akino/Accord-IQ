"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Modal, Select, useToast } from "@accordiq/ui";
import {
  CATEGORY_OPTIONS,
  CATEGORY_LABELS,
  CURRENCY_OPTIONS,
  DEPARTMENT_LABELS,
  DEPARTMENT_OPTIONS,
} from "./labels";
import { postFormWithProgress } from "./upload-progress";

const ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function UploadContractDialog({ vendors }: { vendors: { id: string; name: string }[] }) {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const keyRef = useRef(crypto.randomUUID());
  const createdIdRef = useRef<string | null>(null);

  function close() {
    if (pending) return;
    setOpen(false);
    setProgress(0);
    setPhase("idle");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      notify({ tone: "error", title: "Choose a PDF or DOCX file." });
      return;
    }
    const metadata = {
      title: String(form.get("title") ?? "").trim(),
      vendorId: String(form.get("vendorId") ?? "") || undefined,
      category: String(form.get("category") ?? "") || undefined,
      department: String(form.get("department") ?? "") || undefined,
      currency: String(form.get("currency") ?? "") || undefined,
      effectiveOn: String(form.get("effectiveOn") ?? "") || undefined,
      expiresOn: String(form.get("expiresOn") ?? "") || undefined,
      value: String(form.get("value") ?? "").trim() || undefined,
    };
    setPending(true);
    setPhase("uploading");
    setProgress(0);
    try {
      let contractId = createdIdRef.current;
      if (!contractId) {
        const createdResponse = await fetch("/api/contracts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(metadata),
        });
        const createdBody = (await createdResponse.json().catch(() => null)) as {
          error?: string;
          contract?: { id: string };
        } | null;
        if (!createdResponse.ok || !createdBody?.contract?.id) {
          notify({
            tone: "error",
            title: "Could not create contract",
            description: createdBody?.error ?? "The server refused this contract.",
          });
          if (createdResponse.status === 403) router.push("/forbidden");
          return;
        }
        contractId = createdBody.contract.id;
        createdIdRef.current = contractId;
      }
      const fileForm = new FormData();
      fileForm.set("file", file);
      const { status, body } = await postFormWithProgress(
        `/api/contracts/${contractId}/documents`,
        fileForm,
        keyRef.current,
        setProgress,
      );
      if (status >= 400) {
        notify({
          tone: "error",
          title: "Upload failed",
          description:
            typeof body.error === "string" ? body.error : "The server refused this file.",
        });
        if (status === 403) router.push("/forbidden");
        return;
      }
      setPhase("processing");
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
        notify({ tone: "success", title: "Contract saved" });
      }
      if (duplicates && duplicates.length > 0) {
        notify({
          tone: "warning",
          title: "Possible duplicate",
          description: `A matching file already exists (${duplicates[0]?.fileName}).`,
        });
      }
      keyRef.current = crypto.randomUUID();
      createdIdRef.current = null;
      formEl.reset();
      setOpen(false);
      router.refresh();
    } catch (error) {
      notify({
        tone: "error",
        title: "Upload failed",
        description: error instanceof Error ? error.message : "The upload could not be completed.",
      });
    } finally {
      setPending(false);
      setPhase("idle");
      setProgress(0);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Upload contract</Button>
      <Modal
        open={open}
        onClose={close}
        title="Upload contract"
        description="PDF and DOCX files are stored privately. File contents are not treated as instructions."
        size="lg"
      >
        <form id="upload-contract-form" className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <Field label="Title" required className="sm:col-span-2">
            <Input name="title" required maxLength={300} />
          </Field>
          <Field label="Counterparty">
            <Select name="vendorId" defaultValue="">
              <option value="">None</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select name="category" defaultValue="">
              <option value="">None</option>
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department">
            <Select name="department" defaultValue="">
              <option value="">None</option>
              {DEPARTMENT_OPTIONS.map((department) => (
                <option key={department} value={department}>
                  {DEPARTMENT_LABELS[department]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Effective on">
            <Input name="effectiveOn" type="date" />
          </Field>
          <Field label="Expires on">
            <Input name="expiresOn" type="date" />
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
          <Field label="Contract value" hint="Major units, up to two decimal places.">
            <Input name="value" inputMode="decimal" placeholder="0.00" />
          </Field>
          <Field label="Document" required className="sm:col-span-2">
            <Input name="file" type="file" accept={ACCEPT} required />
          </Field>
          {phase !== "idle" && (
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-caption text-ink-muted">
                {phase === "uploading" ? `Uploading ${progress}%` : "Processing document"}
              </p>
              <progress
                className="h-2 w-full overflow-hidden rounded-full"
                max={100}
                value={phase === "uploading" ? progress : 100}
                aria-label={phase === "uploading" ? "Upload progress" : "Processing"}
              />
            </div>
          )}
        </form>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="upload-contract-form" loading={pending}>
            Save
          </Button>
        </div>
      </Modal>
    </>
  );
}
