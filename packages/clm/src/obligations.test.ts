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

async function approveLegalFinance(
  harness: Awaited<ReturnType<typeof createClmHarness>>,
  requestId: string,
  legal: Awaited<ReturnType<typeof actorFor>>,
  finance: Awaited<ReturnType<typeof actorFor>>,
) {
  await harness.clm.decideApproval(legal, requestId, { decision: "APPROVED" });
  return harness.clm.decideApproval(finance, requestId, { decision: "APPROVED" });
}

describe("obligation and renewal management", { timeout: 20_000 }, () => {
  it("spawns the next monthly occurrence and clamps month-end", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createObligation(legal, {
      contractId: CLM_SEED.contracts.northwindMsa.id,
      title: "Month-end certificate",
      dueOn: "2026-01-31",
      frequency: "MONTHLY",
      priority: "HIGH",
    });
    const completed = await harness.clm.completeObligation(legal, created.id, {
      completionNote: "Filed for January.",
    });
    expect(completed.obligation.status).toBe("DONE");
    expect(completed.next?.dueOn).toBe("2026-02-28");
    expect(completed.next?.occurrenceIndex).toBe(2);
    expect(completed.next?.parentObligationId).toBe(created.id);
    expect(completed.next?.status).toBe("OPEN");
  });

  it("marks overdue using the organization timezone at a UTC date boundary", async () => {
    const nowMs = Date.parse("2026-10-28T23:30:00.000Z");
    const harness = await createClmHarness(PASSWORD, { clock: () => new Date(nowMs) });
    const admin = await actorFor(harness, SEED.users.northwindAdmin.email);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    await harness.clm.updateOrganizationTimezone(admin, { timezone: "UTC" });
    const utcRow = await harness.clm.createObligation(legal, {
      contractId: CLM_SEED.contracts.northwindMsa.id,
      title: "Due on the UTC civil date",
      dueOn: "2026-10-28",
    });
    await harness.clm.syncMonitoring(legal);
    const stillOpen = await harness.clm.getObligation(legal, utcRow.id);
    expect(stillOpen.obligation.status).toBe("OPEN");

    await harness.clm.updateOrganizationTimezone(admin, { timezone: "Asia/Kolkata" });
    await harness.clm.syncMonitoring(legal);
    const overdue = await harness.clm.getObligation(legal, utcRow.id);
    expect(overdue.obligation.status).toBe("OVERDUE");
    expect(overdue.events.some((event) => event.action === "OVERDUE")).toBe(true);
  });

  it("sends a reminder once per due date even if the sweep runs twice", async () => {
    const nowMs = Date.parse("2026-10-28T15:00:00.000Z");
    const harness = await createClmHarness(PASSWORD, { clock: () => new Date(nowMs) });
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createObligation(legal, {
      contractId: CLM_SEED.contracts.northwindMsa.id,
      title: "Insurance filing",
      dueOn: "2026-10-30",
      reminderDaysBefore: 7,
      ownerUserId: legal.userId,
    });
    await harness.clm.syncMonitoring(legal);
    await harness.clm.syncMonitoring(legal);
    const notes = await harness.clm.listNotifications(legal, page);
    const reminders = notes.items.filter(
      (row) => row.entityId === created.id && row.title === "Obligation reminder",
    );
    expect(reminders).toHaveLength(1);
    const events = await harness.clm.getObligation(legal, created.id);
    expect(events.events.filter((event) => event.action === "REMIND")).toHaveLength(1);
  });

  it("computes notice and termination deadlines from expiry without changing contract state", async () => {
    const nowMs = Date.parse("2026-10-28T12:00:00.000Z");
    const harness = await createClmHarness(PASSWORD, { clock: () => new Date(nowMs) });
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, {
      title: "Expiring MSA",
      expiresOn: "2026-12-31",
    });
    await harness.clm.updateContract(legal, created.contract.id, {
      noticeDays: 90,
      autoRenew: true,
    });
    const bundle = await harness.clm.getRenewalWatch(legal, created.contract.id);
    expect(bundle.watch?.noticeOn).toBe("2026-10-02");
    expect(bundle.watch?.terminateBy).toBe("2026-10-02");
    expect(bundle.watch?.expiresOn).toBe("2026-12-31");
    expect(bundle.watch?.autoRenew).toBe(true);
    expect(bundle.watch?.status).toBe("NOTICE_DUE");
    expect(bundle.contract.status).toBe("DRAFT");
  });

  it("never auto-renews or auto-terminates, including when expiry has lapsed", async () => {
    const nowMs = Date.parse("2027-01-15T12:00:00.000Z");
    const harness = await createClmHarness(PASSWORD, { clock: () => new Date(nowMs) });
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, {
      title: "Lapsed auto-renew",
      expiresOn: "2026-12-31",
    });
    await harness.clm.updateContract(legal, created.contract.id, {
      autoRenew: true,
      noticeDays: 30,
    });
    await harness.clm.syncMonitoring(legal);
    const bundle = await harness.clm.getRenewalWatch(legal, created.contract.id);
    expect(bundle.watch?.status).toBe("LAPSED");
    expect(bundle.contract.status).toBe("DRAFT");
    expect(bundle.contract.expiresOn).toBe("2026-12-31");
    await expect(
      harness.clm.applyRenewalDecision(legal, created.contract.id, {}),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("applies a renewal only after a workflow approved after the decision", async () => {
    let nowMs = Date.parse("2026-10-28T12:00:00.000Z");
    const harness = await createClmHarness(PASSWORD, { clock: () => new Date(nowMs) });
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const finance = await actorFor(harness, SEED.users.northwindFinance.email);
    const created = await harness.clm.createContract(legal, {
      title: "Renewal decision path",
      expiresOn: "2026-12-31",
    });
    await harness.clm.updateContract(legal, created.contract.id, { noticeDays: 30 });

    nowMs += 1000;
    await harness.clm.recordRenewalDecision(legal, created.contract.id, {
      decision: "RENEW",
      proposedExpiresOn: "2027-12-31",
    });
    await expect(
      harness.clm.applyRenewalDecision(legal, created.contract.id, {}),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    nowMs += 1000;
    const started = await harness.clm.startRenewalApproval(legal, created.contract.id, {
      templateId: CLM_SEED.workflows.northwindLegalFinance.id,
    });
    nowMs += 1000;
    await approveLegalFinance(harness, started.approval.request.id, legal, finance);
    nowMs += 1000;
    const applied = await harness.clm.applyRenewalDecision(legal, created.contract.id, {});
    expect(applied.contract.expiresOn).toBe("2027-12-31");
    expect(applied.contract.status).toBe("APPROVED");
    expect(applied.watch.status).toBe("WATCHING");
    expect(applied.watch.decision).toBeNull();
    expect(applied.watch.noticeOn).toBe("2027-12-01");

    nowMs += 1000;
    await harness.clm.recordRenewalDecision(legal, created.contract.id, { decision: "TERMINATE" });
    await expect(
      harness.clm.applyRenewalDecision(legal, created.contract.id, {}),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    nowMs += 1000;
    const terminateApproval = await harness.clm.startRenewalApproval(legal, created.contract.id, {
      templateId: CLM_SEED.workflows.northwindLegalFinance.id,
    });
    nowMs += 1000;
    await approveLegalFinance(harness, terminateApproval.approval.request.id, legal, finance);
    nowMs += 1000;
    const terminated = await harness.clm.applyRenewalDecision(legal, created.contract.id, {});
    expect(terminated.contract.status).toBe("TERMINATED");
    expect(terminated.watch.status).toBe("TERMINATED");
  });

  it("lets the assigned owner complete without contracts:write, and refuses others", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    const finance = await actorFor(harness, SEED.users.northwindFinance.email);
    const created = await harness.clm.createObligation(legal, {
      contractId: CLM_SEED.contracts.northwindMsa.id,
      title: "Owner-only filing",
      dueOn: "2026-11-01",
      ownerUserId: viewer.userId,
    });
    await expect(harness.clm.completeObligation(finance, created.id, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const done = await harness.clm.completeObligation(viewer, created.id, {
      completionNote: "Filed.",
    });
    expect(done.obligation.status).toBe("DONE");
    expect(done.obligation.completedByUserId).toBe(viewer.userId);
  });

  it("hides foreign obligations and renewals as not found", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const contoso = await actorFor(harness, SEED.users.contosoAdmin.email);
    const created = await harness.clm.createObligation(legal, {
      contractId: CLM_SEED.contracts.northwindMsa.id,
      title: "Northwind only",
      dueOn: "2026-11-15",
    });
    await expect(harness.clm.getObligation(contoso, created.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const renewals = await harness.clm.listRenewals(contoso, page);
    expect(
      renewals.items.every((row) => row.organizationId !== SEED.organizations.northwind.id),
    ).toBe(true);
  });
});
