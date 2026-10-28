import { describe, expect, it } from "vitest";
import { createFixtureAdapter, FIXTURES, textToMinimalPdf } from "@accordiq/ai";
import { loadActor, SEED } from "@accordiq/auth";
import { createMemoryStorage } from "@accordiq/storage";
import { createClm } from "./access";
import { createClmHarness } from "./harness";

const PASSWORD = "Dev-only-passw0rd!";
const ORIGIN = "http://localhost:3000";

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
  if (!response.ok) throw new Error(`Sign-in failed for ${email}`);
  return cookieHeader(response);
}

async function actorFor(harness: Awaited<ReturnType<typeof createClmHarness>>, email: string) {
  const headers = await signIn(harness.auth, email);
  const payload = await harness.auth.api.getSession({ headers });
  return loadActor(harness.db, payload!);
}

async function uploadedFixture(
  harness: Awaited<ReturnType<typeof createClmHarness>>,
  fixtureId: keyof typeof FIXTURES,
) {
  const legal = await actorFor(harness, SEED.users.northwindLegal.email);
  const sample = FIXTURES[fixtureId]!;
  const clm = createClm(harness.db, {
    storage: createMemoryStorage(),
    llm: createFixtureAdapter(),
  });
  const created = await clm.createContract(legal, { title: sample.fileName });
  const uploaded = await clm.uploadDocument(legal, created.contract.id, {
    bytes: textToMinimalPdf(sample.text),
    fileName: sample.fileName,
    contentType: "application/pdf",
  });
  return { legal, clm, contractId: created.contract.id, documentId: uploaded.document.id };
}

describe("AI contract intelligence", () => {
  it("records UNAVAILABLE instead of inventing an extraction when no provider is connected", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, { title: "No AI" });
    await harness.clm.uploadDocument(legal, created.contract.id, {
      bytes: textToMinimalPdf(FIXTURES["complete-msa"]!.text),
      fileName: "msa.pdf",
      contentType: "application/pdf",
    });
    const run = await harness.clm.startExtraction(legal, created.contract.id, {});
    expect(run.run.status).toBe("UNAVAILABLE");
    expect(run.fields).toEqual([]);
    expect(harness.clm.getAiStatus(legal).available).toBe(false);
  });

  it("extracts labeled sample fields and keeps them as suggestions", async () => {
    const harness = await createClmHarness(PASSWORD);
    const { legal, clm, contractId } = await uploadedFixture(harness, "complete-msa");
    const bundle = await clm.startExtraction(legal, contractId, {});
    expect(bundle.run.status).toBe("COMPLETED");
    expect(bundle.run.provider).toBe("fixture");
    const title = bundle.fields.find((row) => row.fieldKey === "TITLE");
    expect(title?.valueText).toBe("MASTER SERVICES AGREEMENT");
    expect(title?.verification).toBe("SUGGESTED");
    expect(title?.citationQuote).toBeTruthy();
    expect(bundle.parties).toHaveLength(2);
    expect(bundle.obligations[0]?.dueOn).toBe("2026-03-01");
  });

  it("leaves missing end date, value and governing law null on the NDA sample", async () => {
    const harness = await createClmHarness(PASSWORD);
    const { legal, clm, contractId } = await uploadedFixture(harness, "missing-fields");
    const bundle = await clm.startExtraction(legal, contractId, {});
    expect(bundle.fields.find((row) => row.fieldKey === "END_DATE")?.valueText).toBeNull();
    expect(bundle.fields.find((row) => row.fieldKey === "VALUE")?.valueText).toBeNull();
    expect(bundle.fields.find((row) => row.fieldKey === "GOVERNING_LAW")?.valueText).toBeNull();
  });

  it("does not invent an end date when the sample conflicts", async () => {
    const harness = await createClmHarness(PASSWORD);
    const { legal, clm, contractId } = await uploadedFixture(harness, "conflicting-dates");
    const bundle = await clm.startExtraction(legal, contractId, {});
    const end = bundle.fields.find((row) => row.fieldKey === "END_DATE");
    expect(end?.valueText).toBeNull();
    expect(bundle.run.conflictJson).toMatch(/END_DATE/);
  });

  it("ignores injected instructions in the uploaded document", async () => {
    const harness = await createClmHarness(PASSWORD);
    const { legal, clm, contractId } = await uploadedFixture(harness, "injection");
    const bundle = await clm.startExtraction(legal, contractId, {});
    const value = bundle.fields.find((row) => row.fieldKey === "VALUE");
    expect(value?.valueText).toBe("50000");
    expect(value?.valueText).not.toMatch(/999/);
    const law = bundle.fields.find((row) => row.fieldKey === "GOVERNING_LAW");
    expect(law?.valueText).toBeNull();
    const extracted = bundle.fields.map((row) => row.valueText).join(" ");
    expect(extracted).not.toMatch(/Atlantis/i);
  });

  it("lets a writer correct a suggestion and apply it onto the contract", async () => {
    const harness = await createClmHarness(PASSWORD);
    const { legal, clm, contractId } = await uploadedFixture(harness, "complete-msa");
    const bundle = await clm.startExtraction(legal, contractId, {});
    const title = bundle.fields.find((row) => row.fieldKey === "TITLE")!;
    await clm.correctExtractedField(legal, bundle.run.id, title.id, {
      verification: "CORRECTED",
      correctedValue: "Northwind–Acme MSA",
    });
    const start = bundle.fields.find((row) => row.fieldKey === "START_DATE")!;
    await clm.correctExtractedField(legal, bundle.run.id, start.id, { verification: "VERIFIED" });
    const updated = await clm.applyExtraction(legal, bundle.run.id, {});
    expect(updated.title).toBe("Northwind–Acme MSA");
    expect(updated.effectiveOn).toBe("2026-01-01");
    expect(updated.status).toBe("DRAFT");
  });

  it("answers from source text and refuses unsupported questions", async () => {
    const harness = await createClmHarness(PASSWORD);
    const { legal, clm, contractId } = await uploadedFixture(harness, "complete-msa");
    const supported = await clm.askQuestion(legal, contractId, {
      question: "What is the governing law?",
    });
    expect(supported.supported).toBe(true);
    expect(supported.answer).toMatch(/Delaware/);
    expect(supported.citations.length).toBeGreaterThan(0);
    const refused = await clm.askQuestion(legal, contractId, {
      question: "What is the CEO's personal mobile number?",
    });
    expect(refused.supported).toBe(false);
    expect(refused.answer).toBeNull();
  });

  it("compares two labeled versions of the same contract", async () => {
    const harness = await createClmHarness(PASSWORD);
    const { legal, clm, contractId } = await uploadedFixture(harness, "complete-msa");
    const right = await clm.uploadDocument(legal, contractId, {
      bytes: textToMinimalPdf(FIXTURES["amended-msa"]!.text),
      fileName: "amended-msa.pdf",
      contentType: "application/pdf",
    });
    const docs = await clm.listDocuments(legal, contractId);
    const left = docs.find((row) => row.fileName === "complete-msa.pdf")!;
    const compared = await clm.compareDocuments(legal, contractId, {
      leftDocumentId: left.id,
      rightDocumentId: right.document.id,
    });
    expect(compared.status).toBe("COMPLETED");
    expect(compared.summary).toMatch(/2028-12-31/);
    expect(compared.changes.length).toBeGreaterThan(0);
  });

  it("hides foreign documents and refuses viewer analysis", async () => {
    const harness = await createClmHarness(PASSWORD);
    const { legal, clm, contractId } = await uploadedFixture(harness, "complete-msa");
    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    const contoso = await actorFor(harness, SEED.users.contosoAdmin.email);
    await expect(clm.startExtraction(viewer, contractId, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const readable = await clm.getContractIntelligence(viewer, contractId);
    expect(readable.status.synthetic).toBe(true);
    await expect(clm.getContractIntelligence(contoso, contractId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(clm.startExtraction(legal, "missing", {})).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
