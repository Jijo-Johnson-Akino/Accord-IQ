import { describe, expect, it } from "vitest";
import { loadActor, SEED } from "@accordiq/auth";
import { parsePage } from "@accordiq/core";
import { CLM_SEED } from "./seed";
import { createClmHarness } from "./harness";

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

describe("approval workflows", { timeout: 20_000 }, () => {
  it("lets finance approve the finance stage after legal, and refuses a viewer", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const finance = await actorFor(harness, SEED.users.northwindFinance.email);
    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    const created = await harness.clm.createContract(legal, {
      title: "Sequential finance path",
      value: "150000.00",
      category: "MSA",
      department: "FINANCE",
    });
    const started = await harness.clm.startApproval(legal, created.contract.id, {
      templateId: CLM_SEED.workflows.northwindLegalFinance.id,
    });
    await expect(
      harness.clm.decideApproval(viewer, started.request.id, { decision: "APPROVED" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await harness.clm.decideApproval(legal, started.request.id, { decision: "APPROVED" });
    const financeDecision = await harness.clm.decideApproval(finance, started.request.id, {
      decision: "APPROVED",
    });
    expect(financeDecision.requestStatus).toBe("APPROVED");
    const { contract: after } = await harness.clm.getContract(legal, created.contract.id);
    expect(after.status).toBe("APPROVED");
  });

  it("rejects an out-of-order stage even when the future reviewer is authorized", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const finance = await actorFor(harness, SEED.users.northwindFinance.email);
    const created = await harness.clm.createContract(legal, {
      title: "Out of order",
      value: "150000.00",
      category: "MSA",
    });
    const started = await harness.clm.startApproval(legal, created.contract.id, {
      templateId: CLM_SEED.workflows.northwindLegalFinance.id,
    });
    const financeStage = started.stages.find((stage) => stage.requiredRole === "FINANCE");
    expect(financeStage).toBeTruthy();
    await expect(
      harness.clm.decideApproval(finance, started.request.id, {
        stageId: financeStage!.id,
        decision: "APPROVED",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows either order on parallel stages and blocks the next step until both are done", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const finance = await actorFor(harness, SEED.users.northwindFinance.email);
    const manager = await actorFor(harness, SEED.users.northwindManager.email);
    const created = await harness.clm.createContract(legal, {
      title: "Parallel path",
      value: "80000.00",
      category: "SOW",
      department: "OPERATIONS",
    });
    const workflow = await harness.clm.createWorkflow(legal, {
      name: "Legal and finance then manager",
      stages: [
        { name: "Legal", requiredRole: "LEGAL", step: 1 },
        { name: "Finance", requiredRole: "FINANCE", step: 1 },
        { name: "Manager", requiredRole: "DEPARTMENT_MANAGER", step: 2 },
      ],
    });
    const started = await harness.clm.startApproval(legal, created.contract.id, {
      templateId: workflow.id,
    });
    const legalStage = started.stages.find((stage) => stage.requiredRole === "LEGAL")!;
    const financeStage = started.stages.find((stage) => stage.requiredRole === "FINANCE")!;
    const managerStage = started.stages.find(
      (stage) => stage.requiredRole === "DEPARTMENT_MANAGER",
    )!;
    expect(legalStage.actionable).toBe(true);
    expect(financeStage.actionable).toBe(true);
    expect(managerStage.actionable).toBe(false);
    await expect(
      harness.clm.decideApproval(manager, started.request.id, {
        stageId: managerStage.id,
        decision: "APPROVED",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await harness.clm.decideApproval(finance, started.request.id, {
      stageId: financeStage.id,
      decision: "APPROVED",
    });
    await expect(
      harness.clm.decideApproval(manager, started.request.id, {
        stageId: managerStage.id,
        decision: "APPROVED",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await harness.clm.decideApproval(legal, started.request.id, {
      stageId: legalStage.id,
      decision: "APPROVED",
    });
    const last = await harness.clm.decideApproval(manager, started.request.id, {
      stageId: managerStage.id,
      decision: "APPROVED",
    });
    expect(last.requestStatus).toBe("APPROVED");
  });

  it("returns a rejected contract to review and allows a new request", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, { title: "Reject path" });
    const started = await harness.clm.startApproval(legal, created.contract.id, {
      templateId: CLM_SEED.workflows.northwindLegalFinance.id,
    });
    const rejected = await harness.clm.decideApproval(legal, started.request.id, {
      decision: "REJECTED",
      comment: "Missing indemnity.",
    });
    expect(rejected.requestStatus).toBe("REJECTED");
    const { contract: after } = await harness.clm.getContract(legal, created.contract.id);
    expect(after.status).toBe("IN_REVIEW");
    const detail = await harness.clm.getApproval(legal, started.request.id);
    expect(detail.stages.every((stage) => stage.status !== "PENDING")).toBe(true);
    const restarted = await harness.clm.startApproval(legal, created.contract.id, {
      templateId: CLM_SEED.workflows.northwindLegalFinance.id,
    });
    expect(restarted.request.status).toBe("IN_PROGRESS");
    expect(restarted.request.id).not.toBe(started.request.id);
  });

  it("freezes a changes-requested request until resubmit, then keeps prior approvals", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const finance = await actorFor(harness, SEED.users.northwindFinance.email);
    const created = await harness.clm.createContract(legal, {
      title: "Changes path",
      value: "20000.00",
    });
    const workflow = await harness.clm.createWorkflow(legal, {
      name: "Parallel keep prior",
      stages: [
        { name: "Legal", requiredRole: "LEGAL", step: 1 },
        { name: "Finance", requiredRole: "FINANCE", step: 1 },
      ],
    });
    const started = await harness.clm.startApproval(legal, created.contract.id, {
      templateId: workflow.id,
    });
    const legalStage = started.stages.find((stage) => stage.requiredRole === "LEGAL")!;
    const financeStage = started.stages.find((stage) => stage.requiredRole === "FINANCE")!;
    await harness.clm.decideApproval(legal, started.request.id, {
      stageId: legalStage.id,
      decision: "APPROVED",
    });
    await harness.clm.decideApproval(finance, started.request.id, {
      stageId: financeStage.id,
      decision: "CHANGES_REQUESTED",
      comment: "Need payment schedule.",
    });
    await expect(
      harness.clm.decideApproval(finance, started.request.id, {
        stageId: financeStage.id,
        decision: "APPROVED",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const resubmitted = await harness.clm.resubmitApproval(legal, started.request.id, {
      comment: "Schedule attached.",
    });
    expect(resubmitted.request.status).toBe("IN_PROGRESS");
    expect(resubmitted.stages.find((stage) => stage.id === legalStage.id)?.status).toBe("APPROVED");
    expect(resubmitted.stages.find((stage) => stage.id === financeStage.id)?.status).toBe(
      "PENDING",
    );
    const done = await harness.clm.decideApproval(finance, started.request.id, {
      stageId: financeStage.id,
      decision: "APPROVED",
    });
    expect(done.requestStatus).toBe("APPROVED");
  });

  it("invalidates in-progress approvals when material contract fields change", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, {
      title: "Material change",
      value: "10000.00",
      category: "NDA",
    });
    const started = await harness.clm.startApproval(legal, created.contract.id, {
      templateId: CLM_SEED.workflows.northwindLegalFinance.id,
    });
    await harness.clm.updateContract(legal, created.contract.id, { value: "50000.00" });
    await expect(
      harness.clm.decideApproval(legal, started.request.id, { decision: "APPROVED" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const stale = await harness.clm.getApproval(legal, started.request.id);
    expect(stale.request.stale).toBe(true);
    const { contract: after } = await harness.clm.getContract(legal, created.contract.id);
    expect(after.status).toBe("IN_REVIEW");
    const resubmitted = await harness.clm.resubmitApproval(legal, started.request.id);
    expect(resubmitted.request.stale).toBe(false);
    expect(
      resubmitted.stages.every((stage) => stage.status === "PENDING" || stage.status === "SKIPPED"),
    ).toBe(true);
    await harness.clm.decideApproval(legal, started.request.id, { decision: "APPROVED" });
  });

  it("invalidates approvals when a new contract version becomes current", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, { title: "Version change" });
    const started = await harness.clm.startApproval(legal, created.contract.id, {
      templateId: CLM_SEED.workflows.northwindLegalFinance.id,
    });
    await harness.clm.createContractVersion(legal, created.contract.id, {
      summary: "Revised draft",
    });
    await expect(
      harness.clm.decideApproval(legal, started.request.id, { decision: "APPROVED" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("skips a finance stage when the value condition does not match", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, {
      title: "Low value",
      value: "50.00",
      category: "NDA",
    });
    const started = await harness.clm.startApproval(legal, created.contract.id, {
      templateId: CLM_SEED.workflows.northwindValueGate.id,
    });
    const financeStage = started.stages.find((stage) => stage.requiredRole === "FINANCE");
    expect(financeStage?.status).toBe("SKIPPED");
    const done = await harness.clm.decideApproval(legal, started.request.id, {
      decision: "APPROVED",
    });
    expect(done.requestStatus).toBe("APPROVED");
  });

  it("replays start and decide when the same idempotency key is sent", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, { title: "Idempotent start" });
    const first = await harness.clm.startApproval(legal, created.contract.id, {
      templateId: CLM_SEED.workflows.northwindLegalFinance.id,
      idempotencyKey: "start-key-123456",
    });
    const second = await harness.clm.startApproval(legal, created.contract.id, {
      templateId: CLM_SEED.workflows.northwindLegalFinance.id,
      idempotencyKey: "start-key-123456",
    });
    expect(second.request.id).toBe(first.request.id);
    expect(second.replayed).toBe(true);
    const once = await harness.clm.decideApproval(legal, first.request.id, {
      decision: "APPROVED",
      idempotencyKey: "decide-key-123456",
    });
    const again = await harness.clm.decideApproval(legal, first.request.id, {
      decision: "APPROVED",
      idempotencyKey: "decide-key-123456",
    });
    expect(again.replayed).toBe(true);
    expect(again.stageId).toBe(once.stageId);
  });

  it("delegates a pending stage once, and refuses unauthorized or duplicate delegation", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const procurement = await actorFor(harness, SEED.users.northwindProcurement.email);
    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    const created = await harness.clm.createContract(legal, { title: "Delegate path" });
    const started = await harness.clm.startApproval(legal, created.contract.id, {
      templateId: CLM_SEED.workflows.northwindLegalFinance.id,
    });
    const legalStage = started.stages.find((stage) => stage.requiredRole === "LEGAL")!;
    await expect(
      harness.clm.delegateApproval(procurement, started.request.id, legalStage.id, {
        toUserId: SEED.users.northwindAdmin.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      harness.clm.delegateApproval(legal, started.request.id, legalStage.id, {
        toUserId: viewer.userId,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const delegated = await harness.clm.delegateApproval(legal, started.request.id, legalStage.id, {
      toUserId: SEED.users.northwindAdmin.id,
    });
    expect(delegated.toUserId).toBe(SEED.users.northwindAdmin.id);
    await expect(
      harness.clm.delegateApproval(legal, started.request.id, legalStage.id, {
        toUserId: SEED.users.northwindAdmin.id,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses workflow management and cross-tenant reads", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const finance = await actorFor(harness, SEED.users.northwindFinance.email);
    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    const contoso = await actorFor(harness, SEED.users.contosoViewer.email);
    await expect(
      harness.clm.createWorkflow(viewer, {
        name: "Should fail",
        stages: [{ name: "Legal", requiredRole: "LEGAL" }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      harness.clm.createWorkflow(finance, {
        name: "Should fail",
        stages: [{ name: "Finance", requiredRole: "FINANCE" }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const created = await harness.clm.createContract(legal, { title: "Tenant bound" });
    const started = await harness.clm.startApproval(legal, created.contract.id, {
      templateId: CLM_SEED.workflows.northwindLegalFinance.id,
    });
    await expect(harness.clm.getApproval(contoso, started.request.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const listed = await harness.clm.listApprovals(legal, page);
    expect(listed.items.some((row) => row.id === started.request.id)).toBe(true);
    const comments = await harness.clm.commentApproval(legal, started.request.id, {
      body: "Looks complete.",
    });
    expect(comments.body).toBe("Looks complete.");
  });
});
