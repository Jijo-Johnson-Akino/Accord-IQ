import { describe, expect, it } from "vitest";
import { AppError, parsePage } from "@accordiq/core";
import { loadActor, SEED } from "@accordiq/auth";
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

describe("CLM tenant isolation and access", () => {
  it("scopes contract lists to the session organization and hides foreign ids as not found", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const listed = await harness.clm.listContracts(legal, page);
    expect(listed.items.map((row) => row.id)).toEqual([CLM_SEED.contracts.northwindMsa.id]);
    expect(listed.page.total).toBe(1);

    await expect(
      harness.clm.getContract(legal, CLM_SEED.contracts.contosoNda.id),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      harness.clm.getVendor(legal, CLM_SEED.vendors.contosoGlobex.id),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("ignores organizationId in the body and writes the session tenant", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, {
      title: "Should stay in Northwind",
      organizationId: SEED.organizations.contoso.id,
    });
    expect(created.contract.organizationId).toBe(SEED.organizations.northwind.id);
    expect(created.version.organizationId).toBe(SEED.organizations.northwind.id);
    expect(created.version.versionNumber).toBe(1);
  });

  it("refuses viewer writes while allowing legal reads", async () => {
    const harness = await createClmHarness(PASSWORD);
    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    await expect(
      harness.clm.createVendor(viewer, { name: "Should not exist" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const vendors = await harness.clm.listVendors(viewer, page);
    expect(vendors.items.some((row) => row.id === CLM_SEED.vendors.northwindAcme.id)).toBe(true);
  });

  it("does not let finance decide a legal approval stage", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const finance = await actorFor(harness, SEED.users.northwindFinance.email);
    const procurement = await actorFor(harness, SEED.users.northwindProcurement.email);
    const admin = await actorFor(harness, SEED.users.northwindAdmin.email);

    const started = await harness.clm.startApproval(legal, CLM_SEED.contracts.northwindMsa.id, {
      templateId: CLM_SEED.workflows.northwindLegalFinance.id,
    });
    expect(started.request.status).toBe("IN_PROGRESS");
    expect(started.stages.map((stage) => stage.requiredRole)).toEqual(["LEGAL", "FINANCE"]);

    await expect(
      harness.clm.decideApproval(finance, started.request.id, { decision: "APPROVED" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      harness.clm.decideApproval(procurement, started.request.id, { decision: "APPROVED" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const legalDecision = await harness.clm.decideApproval(legal, started.request.id, {
      decision: "APPROVED",
    });
    expect(legalDecision.requestStatus).toBe("IN_PROGRESS");

    await expect(
      harness.clm.decideApproval(legal, started.request.id, { decision: "APPROVED" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const adminDecision = await harness.clm.decideApproval(admin, started.request.id, {
      decision: "APPROVED",
    });
    expect(adminDecision.requestStatus).toBe("APPROVED");
    const { contract: after } = await harness.clm.getContract(
      legal,
      CLM_SEED.contracts.northwindMsa.id,
    );
    expect(after.status).toBe("APPROVED");
  });

  it("paginates vendor lists", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    await harness.clm.createVendor(legal, { name: "Zephyr Parts" });
    const first = await harness.clm.listVendors(
      legal,
      parsePage(new URLSearchParams("limit=1&offset=0")),
    );
    expect(first.items).toHaveLength(1);
    expect(first.page.total).toBeGreaterThanOrEqual(2);
    expect(first.page.limit).toBe(1);
    const second = await harness.clm.listVendors(
      legal,
      parsePage(new URLSearchParams("limit=1&offset=1")),
    );
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it("writes an audit event for a vendor create in the actor organization", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createVendor(legal, { name: "Audit Vendor" });
    const events = await harness.clm.listAudit(legal, page, {
      entityType: "vendor",
      entityId: created.id,
    });
    expect(events.items.some((row) => row.action === "vendor.create")).toBe(true);
    expect(
      events.items.every((row) => row.organizationId === SEED.organizations.northwind.id),
    ).toBe(true);
  });

  it("keeps notifications on the current user and organization", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    await harness.clm.createObligation(legal, {
      contractId: CLM_SEED.contracts.northwindMsa.id,
      title: "Renewal notice",
    });
    const mine = await harness.clm.listNotifications(legal, page);
    expect(mine.items.length).toBeGreaterThan(0);
    expect(mine.items.every((row) => row.userId === legal.userId)).toBe(true);
    expect(mine.items.every((row) => row.organizationId === SEED.organizations.northwind.id)).toBe(
      true,
    );

    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    const viewerNotes = await harness.clm.listNotifications(viewer, page);
    expect(
      viewerNotes.items.some(
        (row) => row.title === "Renewal notice" || row.body === "Renewal notice",
      ),
    ).toBe(false);
  });

  it("rejects a second in-progress approval on the same contract", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    await harness.clm.startApproval(legal, CLM_SEED.contracts.northwindMsa.id, {
      templateId: CLM_SEED.workflows.northwindLegalFinance.id,
    });
    await expect(
      harness.clm.startApproval(legal, CLM_SEED.contracts.northwindMsa.id, {
        templateId: CLM_SEED.workflows.northwindLegalFinance.id,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
