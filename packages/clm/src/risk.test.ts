import { describe, expect, it } from "vitest";
import { createFixtureAdapter, FIXTURES, textToMinimalPdf } from "@accordiq/ai";
import { loadActor, SEED } from "@accordiq/auth";
import { parseInput, parsePage } from "@accordiq/core";
import { createMemoryStorage } from "@accordiq/storage";
import { createClm } from "./access";
import { createClmHarness } from "./harness";
import { assessContractSchema } from "./validation";

const PASSWORD = "Dev-only-passw0rd!";
const ORIGIN = "http://localhost:3000";
const page = parsePage(new URLSearchParams("limit=100"));

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

describe("contract risk engine access", () => {
  it("scores from rules, ignores client severity, and skips text rules without a file", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, { title: "Risk subject" });
    const parsed = parseInput(assessContractSchema, {
      overallSeverity: "HIGH",
      asOf: "2026-10-27",
    });
    expect("overallSeverity" in parsed).toBe(false);

    const result = await harness.clm.assessContract(legal, created.contract.id, {
      overallSeverity: "HIGH",
      asOf: "2026-10-27",
    });
    expect(result.assessment.engineVersion).toBe("accordiq-risk-v1");
    expect(result.assessment.assessmentNumber).toBe(1);
    expect(result.assessment.scoreMethod).toBe("SUM_WEIGHTS_CAPPED_100");
    expect(result.assessment.overallSeverity).not.toBe("HIGH");
    expect(result.findings.some((row) => row.ruleCode === "GOVERNING_LAW")).toBe(true);
    expect(result.findings.every((row) => row.aiExplanation === null)).toBe(true);
    expect(result.findings.some((row) => row.ruleCode === "CONFIDENTIALITY")).toBe(false);
  });

  it("does not let suggested extraction fields change the numeric score", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const sample = FIXTURES["complete-msa"]!;
    const clm = createClm(harness.db, {
      storage: createMemoryStorage(),
      llm: createFixtureAdapter(),
    });
    const created = await clm.createContract(legal, { title: sample.fileName });
    await clm.uploadDocument(legal, created.contract.id, {
      bytes: textToMinimalPdf(sample.text),
      fileName: sample.fileName,
      contentType: "application/pdf",
    });
    const bundle = await clm.startExtraction(legal, created.contract.id, {});
    const law = bundle.fields.find((row) => row.fieldKey === "GOVERNING_LAW");
    expect(law?.verification).toBe("SUGGESTED");
    expect(law?.valueText).toBeTruthy();
    const assessed = await clm.assessContract(legal, created.contract.id, { asOf: "2026-10-27" });
    expect(assessed.findings.some((row) => row.ruleCode === "GOVERNING_LAW")).toBe(true);
  });

  it("keeps the prior assessment and marks it stale when a rule changes", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, { title: "Rule change" });
    const first = await harness.clm.assessContract(legal, created.contract.id, {
      asOf: "2026-10-27",
    });
    const rules = await harness.clm.listRiskRules(legal, page);
    const governing = rules.items.find((row) => row.code === "GOVERNING_LAW");
    expect(governing).toBeTruthy();
    const updated = await harness.clm.updateRiskRule(legal, governing!.id, { weight: 18 });
    expect(updated.versionNumber).toBe(governing!.versionNumber + 1);
    const listed = await harness.clm.listRiskAssessments(legal, created.contract.id);
    expect(listed.find((row) => row.id === first.assessment.id)?.stale).toBe(true);
    const second = await harness.clm.assessContract(legal, created.contract.id, {
      asOf: "2026-10-27",
    });
    expect(second.assessment.assessmentNumber).toBe(first.assessment.assessmentNumber + 1);
    expect(second.assessment.stale).toBe(false);
    expect(second.findings.find((row) => row.ruleCode === "GOVERNING_LAW")?.ruleVersion).toBe(
      updated.versionNumber,
    );
    expect(first.findings.find((row) => row.ruleCode === "GOVERNING_LAW")?.ruleVersion).toBe(
      governing!.versionNumber,
    );
  });

  it("rejects contradictory policy updates and records finding reviews with an audit trail", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, { title: "Review trail" });
    const assessed = await harness.clm.assessContract(legal, created.contract.id, {
      asOf: "2026-10-27",
    });
    const finding = assessed.findings[0];
    expect(finding).toBeTruthy();
    await expect(
      harness.clm.updateRiskPolicy(legal, {
        highMin: 70,
        mediumMin: 80,
        expiryUrgentDays: 30,
        expiryWarnDays: 90,
        autoRenewNoticeDaysMin: 60,
        maxTermDays: 1825,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const reviewed = await harness.clm.reviewRiskFinding(legal, finding!.id, {
      reviewStatus: "RESOLVED",
      reviewNote: "Accepted exception recorded.",
    });
    expect(reviewed.reviewStatus).toBe("RESOLVED");
    expect(reviewed.reviewedByUserId).toBe(legal.userId);
    const events = await harness.clm.listAudit(legal, page, {
      entityType: "risk_finding",
      entityId: finding!.id,
    });
    expect(events.items.some((row) => row.action === "risk_finding.review")).toBe(true);
  });

  it("enforces assess vs review permissions and hides foreign assessments", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    const finance = await actorFor(harness, SEED.users.northwindFinance.email);
    const procurement = await actorFor(harness, SEED.users.northwindProcurement.email);
    const created = await harness.clm.createContract(legal, { title: "Permissioned risk" });
    await expect(
      harness.clm.assessContract(viewer, created.contract.id, { asOf: "2026-10-27" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      harness.clm.assessContract(finance, created.contract.id, { asOf: "2026-10-27" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const assessed = await harness.clm.assessContract(procurement, created.contract.id, {
      asOf: "2026-10-27",
    });
    const finding = assessed.findings[0];
    expect(finding).toBeTruthy();
    await expect(
      harness.clm.reviewRiskFinding(procurement, finding!.id, {
        reviewStatus: "DISMISSED",
        reviewNote: "Should not work.",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      harness.clm.reviewRiskFinding(finance, finding!.id, {
        reviewStatus: "DISMISSED",
        reviewNote: "Should not work.",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const contoso = await actorFor(harness, SEED.users.contosoAdmin.email);
    await expect(
      harness.clm.getRiskAssessment(contoso, assessed.assessment.id),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
