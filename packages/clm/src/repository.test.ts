import { describe, expect, it } from "vitest";
import { AppError, parsePage } from "@accordiq/core";
import { loadActor, SEED } from "@accordiq/auth";
import { createBasicProcessor, createMemoryStorage, MINIMAL_PDF } from "@accordiq/storage";
import { createClm } from "./access";
import { CLM_SEED } from "./seed";
import { createClmHarness } from "./harness";

const PASSWORD = "Dev-only-passw0rd!";
const ORIGIN = "http://localhost:3000";
const page = parsePage(new URLSearchParams());

function cookieHeader(response: Response): Headers {
  const headers = new Headers({ origin: ORIGIN });
  const setCookie =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const fallback = response.headers.get("set-cookie");
  const parts = setCookie.length > 0 ? setCookie : fallback ? [fallback] : [];
  const pairs = parts
    .map((entry) => entry.split(";")[0]?.trim())
    .filter((pair): pair is string => Boolean(pair));
  if (pairs.length) headers.set("cookie", pairs.join("; "));
  return headers;
}

async function signIn(auth: Awaited<ReturnType<typeof createClmHarness>>["auth"], email: string) {
  const response = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    headers: new Headers({ origin: ORIGIN }),
    asResponse: true,
  });
  if (!response.ok) {
    throw new Error(`Sign-in failed for ${email}: ${response.status}`);
  }
  return cookieHeader(response);
}

async function actorFor(harness: Awaited<ReturnType<typeof createClmHarness>>, email: string) {
  const headers = await signIn(harness.auth, email);
  const payload = await harness.auth.api.getSession({ headers });
  return loadActor(harness.db, payload!);
}

describe("contract repository", () => {
  it("uploads a PDF, persists metadata, and omits storage keys from the public document", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, {
      title: "Uploaded MSA",
      vendorId: CLM_SEED.vendors.northwindAcme.id,
      category: "MSA",
      currency: "USD",
      value: "2500.00",
      effectiveOn: "2026-02-01",
      expiresOn: "2027-02-01",
    });
    expect(created.contract.organizationId).toBe(SEED.organizations.northwind.id);
    expect(created.contract.valueMinor).toBe(250000);
    expect(created.contract.status).toBe("DRAFT");

    const uploaded = await harness.clm.uploadDocument(legal, created.contract.id, {
      bytes: MINIMAL_PDF,
      fileName: "msa.pdf",
      contentType: "application/pdf",
      idempotencyKey: "upload-1",
    });
    expect(uploaded.replayed).toBe(false);
    expect(uploaded.document.status).toBe("COMPLETED");
    expect(uploaded.document.hasFile).toBe(true);
    expect(uploaded.document).not.toHaveProperty("storageKey");
    expect(JSON.stringify(uploaded)).not.toContain("storageKey");
    expect(uploaded.document.sha256).toMatch(/^[a-f0-9]{64}$/);
    const detail = await harness.clm.getContract(legal, created.contract.id);
    expect(JSON.stringify(detail)).not.toContain("storageKey");

    const updated = await harness.clm.updateContract(legal, created.contract.id, {
      title: "Uploaded MSA (amended title)",
      valueMinor: 300000,
    });
    expect(updated.title).toBe("Uploaded MSA (amended title)");
    expect(updated.valueMinor).toBe(300000);
    expect(updated.status).toBe("DRAFT");
  });

  it("reuses an idempotency key instead of creating a second record", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, { title: "Idempotent upload" });
    const first = await harness.clm.uploadDocument(legal, created.contract.id, {
      bytes: MINIMAL_PDF,
      fileName: "msa.pdf",
      contentType: "application/pdf",
      idempotencyKey: "same-submit",
    });
    const second = await harness.clm.uploadDocument(legal, created.contract.id, {
      bytes: MINIMAL_PDF,
      fileName: "msa.pdf",
      contentType: "application/pdf",
      idempotencyKey: "same-submit",
    });
    expect(second.replayed).toBe(true);
    expect(second.document.id).toBe(first.document.id);
    const listed = await harness.clm.listDocuments(legal, created.contract.id);
    expect(listed).toHaveLength(1);
  });

  it("warns about duplicate content without blocking the second upload", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, { title: "Duplicate content" });
    await harness.clm.uploadDocument(legal, created.contract.id, {
      bytes: MINIMAL_PDF,
      fileName: "one.pdf",
      contentType: "application/pdf",
      idempotencyKey: "dup-a",
    });
    const second = await harness.clm.uploadDocument(legal, created.contract.id, {
      bytes: MINIMAL_PDF,
      fileName: "two.pdf",
      contentType: "application/pdf",
      idempotencyKey: "dup-b",
    });
    expect(second.document.status).toBe("COMPLETED");
    expect(second.duplicates.length).toBeGreaterThan(0);
    expect(second.duplicates[0]?.fileName).toBe("one.pdf");
  });

  it("filters contracts by category, vendor, search, and expiry window", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    await harness.clm.createContract(legal, {
      title: "Short SOW",
      vendorId: CLM_SEED.vendors.northwindAcme.id,
      category: "SOW",
      expiresOn: "2026-06-01",
    });
    const filtered = await harness.clm.listContracts(
      legal,
      parsePage(new URLSearchParams("q=Acme")),
      {
        category: "SOW",
        vendorId: CLM_SEED.vendors.northwindAcme.id,
        expiresAfter: "2026-01-01",
        expiresBefore: "2026-12-31",
      },
    );
    expect(filtered.items.map((row) => row.title)).toEqual(["Short SOW"]);
    expect(filtered.items[0]?.vendorName).toBe("Acme Supplies");

    const none = await harness.clm.listContracts(legal, page, { category: "LICENSE" });
    expect(none.items).toEqual([]);
  });

  it("hides foreign documents as not found and refuses viewer uploads", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    const contoso = await actorFor(harness, SEED.users.contosoAdmin.email);
    const created = await harness.clm.createContract(legal, { title: "Northwind only" });
    const uploaded = await harness.clm.uploadDocument(legal, created.contract.id, {
      bytes: MINIMAL_PDF,
      fileName: "msa.pdf",
      contentType: "application/pdf",
    });

    await expect(
      harness.clm.uploadDocument(viewer, created.contract.id, {
        bytes: MINIMAL_PDF,
        fileName: "viewer.pdf",
        contentType: "application/pdf",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const readable = await harness.clm.getDocumentFile(viewer, uploaded.document.id);
    expect(readable.fileName).toBe("msa.pdf");

    await expect(harness.clm.getDocumentFile(contoso, uploaded.document.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(harness.clm.getContract(contoso, created.contract.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects unsupported and oversized files before creating a record", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, { title: "Validation" });
    await expect(
      harness.clm.uploadDocument(legal, created.contract.id, {
        bytes: new Uint8Array([0x4d, 0x5a]),
        fileName: "payload.exe",
        contentType: "application/octet-stream",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const limited = createClm(harness.db, {
      storage: createMemoryStorage(),
      processor: createBasicProcessor(),
      maxUploadBytes: 16,
    });
    await expect(
      limited.uploadDocument(legal, created.contract.id, {
        bytes: MINIMAL_PDF,
        fileName: "msa.pdf",
        contentType: "application/pdf",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const listed = await harness.clm.listDocuments(legal, created.contract.id);
    expect(listed).toHaveLength(0);
  });

  it("records corrupt files as FAILED and allows a retry after the processor recovers", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, { title: "Recoverable" });
    let fail = true;
    const processor = {
      async process() {
        if (fail) throw new AppError("VALIDATION", "The file is not a valid PDF.");
        return {
          sha256: "a".repeat(64),
          kind: "pdf" as const,
          contentType: "application/pdf",
          fileName: "msa.pdf",
          pageCount: 1,
          extraction: null,
        };
      },
    };
    const storage = createMemoryStorage();
    const clm = createClm(harness.db, { storage, processor });
    const failed = await clm.uploadDocument(legal, created.contract.id, {
      bytes: MINIMAL_PDF,
      fileName: "msa.pdf",
      contentType: "application/pdf",
    });
    expect(failed.document.status).toBe("FAILED");
    expect(failed.document.processingError).toMatch(/valid PDF/);
    expect(failed.document.hasFile).toBe(true);

    fail = false;
    const retried = await clm.retryDocumentProcessing(legal, failed.document.id);
    expect(retried.document.status).toBe("COMPLETED");
    expect(retried.document.processingError).toBeNull();
  });

  it("links related agreements inside the organization only", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, { title: "Amendment host" });
    const relation = await harness.clm.addRelation(legal, created.contract.id, {
      toContractId: CLM_SEED.contracts.northwindMsa.id,
      relationType: "AMENDMENT",
    });
    expect(relation.organizationId).toBe(SEED.organizations.northwind.id);
    await expect(
      harness.clm.addRelation(legal, created.contract.id, {
        toContractId: CLM_SEED.contracts.contosoNda.id,
        relationType: "RELATED",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const listed = await harness.clm.listRelations(legal, created.contract.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.otherContract.id).toBe(CLM_SEED.contracts.northwindMsa.id);
  });
});
