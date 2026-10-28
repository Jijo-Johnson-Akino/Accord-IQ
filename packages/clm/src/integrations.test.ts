import { describe, expect, it } from "vitest";
import { loadActor, SEED } from "@accordiq/auth";
import { parsePage } from "@accordiq/core";
import { signIntegrationWebhook } from "@accordiq/integrations";
import { createClmHarness } from "./harness";

const PASSWORD = "Dev-only-passw0rd!";
const ORIGIN = "http://localhost:3000";
const page = parsePage(new URLSearchParams("limit=100"));
const API_KEY = "sk-live-hubspot-not-for-browser";
const WEBHOOK_SECRET = "org-webhook-secret-16";

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

async function actorFor(harness: Awaited<ReturnType<typeof createClmHarness>>, email: string) {
  const response = await harness.auth.api.signInEmail({
    body: { email, password: PASSWORD },
    headers: new Headers({ origin: ORIGIN }),
    asResponse: true,
  });
  if (!response.ok) throw new Error(`Sign-in failed for ${email}`);
  const payload = await harness.auth.api.getSession({ headers: cookieHeader(response) });
  return loadActor(harness.db, payload!);
}

function signedWebhook(eventId: string, body: string, now = new Date()) {
  const timestamp = String(Math.floor(now.getTime() / 1000));
  return {
    timestamp,
    eventId,
    signature: signIntegrationWebhook({
      secret: WEBHOOK_SECRET,
      timestamp,
      eventId,
      rawBody: body,
    }),
    body,
  };
}

describe("integration framework", () => {
  it("does not claim email, CRM, or ERP are connected in the default catalog", async () => {
    const harness = await createClmHarness(PASSWORD);
    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    const catalog = await harness.clm.listIntegrations(viewer);
    const email = catalog.items.find((item) => item.kind === "EMAIL");
    const crm = catalog.items.find((item) => item.kind === "CRM");
    const erp = catalog.items.find((item) => item.kind === "ERP");
    expect(email?.connected).toBe(false);
    expect(email?.testOnly).toBe(true);
    expect(crm?.connected).toBe(false);
    expect(crm?.available).toBe(false);
    expect(erp?.connected).toBe(false);
    expect(JSON.stringify(catalog)).not.toContain("AUTH_SECRET");
  });

  it("stores CRM credentials without marking the integration connected", async () => {
    const harness = await createClmHarness(PASSWORD);
    const admin = await actorFor(harness, SEED.users.northwindAdmin.email);
    const saved = await harness.clm.saveIntegrationCredentials(admin, {
      kind: "CRM",
      provider: "hubspot",
      apiKey: API_KEY,
      webhookSecret: WEBHOOK_SECRET,
      organizationId: SEED.organizations.contoso.id,
    });
    expect(saved.connected).toBe(false);
    expect(saved.available).toBe(false);
    expect(saved.credentialConfigured).toBe(true);
    const json = JSON.stringify(saved);
    expect(json).not.toContain(API_KEY);
    expect(json).not.toContain(WEBHOOK_SECRET);

    const catalog = await harness.clm.listIntegrations(admin);
    const crm = catalog.items.find((item) => item.kind === "CRM");
    expect(crm?.connected).toBe(false);
    expect(crm?.credentialConfigured).toBe(true);
    expect(JSON.stringify(catalog)).not.toContain(API_KEY);
  });

  it("refuses credential writes from a viewer", async () => {
    const harness = await createClmHarness(PASSWORD);
    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    await expect(
      harness.clm.saveIntegrationCredentials(viewer, {
        kind: "CRM",
        provider: "hubspot",
        apiKey: API_KEY,
        webhookSecret: WEBHOOK_SECRET,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not let another organization see stored credentials", async () => {
    const harness = await createClmHarness(PASSWORD);
    const admin = await actorFor(harness, SEED.users.northwindAdmin.email);
    await harness.clm.saveIntegrationCredentials(admin, {
      kind: "CRM",
      provider: "hubspot",
      apiKey: API_KEY,
      webhookSecret: WEBHOOK_SECRET,
    });
    const contoso = await actorFor(harness, SEED.users.contosoAdmin.email);
    const catalog = await harness.clm.listIntegrations(contoso);
    const crm = catalog.items.find((item) => item.kind === "CRM");
    expect(crm?.credentialConfigured).toBe(false);
  });

  it("accepts a signed webhook once and ignores the duplicate event id", async () => {
    const harness = await createClmHarness(PASSWORD);
    const admin = await actorFor(harness, SEED.users.northwindAdmin.email);
    await harness.clm.saveIntegrationCredentials(admin, {
      kind: "CRM",
      provider: "hubspot",
      apiKey: API_KEY,
      webhookSecret: WEBHOOK_SECRET,
    });
    const body = JSON.stringify({ type: "contact.updated" });
    const hook = signedWebhook("evt_dup_1", body);
    const first = await harness.clm.processIntegrationWebhook({
      kind: "crm",
      rawBody: hook.body,
      headers: {
        signature: hook.signature,
        timestamp: hook.timestamp,
        eventId: hook.eventId,
        organizationSlug: "northwind",
      },
    });
    expect(first.duplicate).toBe(false);
    expect(first.connected).toBe(false);
    const second = await harness.clm.processIntegrationWebhook({
      kind: "crm",
      rawBody: hook.body,
      headers: {
        signature: hook.signature,
        timestamp: hook.timestamp,
        eventId: hook.eventId,
        organizationSlug: "northwind",
      },
    });
    expect(second.duplicate).toBe(true);
    const runs = await harness.clm.listIntegrationRuns(admin, page);
    const webhookRuns = runs.items.filter((row) => row.action === "WEBHOOK");
    expect(webhookRuns).toHaveLength(1);
    expect(JSON.stringify(runs)).not.toContain(API_KEY);
  });

  it("rejects an invalid webhook signature and a missing connection", async () => {
    const harness = await createClmHarness(PASSWORD);
    const admin = await actorFor(harness, SEED.users.northwindAdmin.email);
    await harness.clm.saveIntegrationCredentials(admin, {
      kind: "CRM",
      provider: "hubspot",
      apiKey: API_KEY,
      webhookSecret: WEBHOOK_SECRET,
    });
    const body = JSON.stringify({ type: "contact.updated" });
    const hook = signedWebhook("evt_bad", body);
    await expect(
      harness.clm.processIntegrationWebhook({
        kind: "crm",
        rawBody: hook.body,
        headers: {
          signature: "v1=deadbeef",
          timestamp: hook.timestamp,
          eventId: hook.eventId,
          organizationSlug: "northwind",
        },
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    await expect(
      harness.clm.processIntegrationWebhook({
        kind: "crm",
        rawBody: hook.body,
        headers: {
          signature: hook.signature,
          timestamp: hook.timestamp,
          eventId: "evt_missing_org",
          organizationSlug: "unknown-org",
        },
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("wipes ciphertext on disconnect so the webhook no longer verifies", async () => {
    const harness = await createClmHarness(PASSWORD);
    const admin = await actorFor(harness, SEED.users.northwindAdmin.email);
    await harness.clm.saveIntegrationCredentials(admin, {
      kind: "CRM",
      provider: "hubspot",
      apiKey: API_KEY,
      webhookSecret: WEBHOOK_SECRET,
    });
    const revoked = await harness.clm.disconnectIntegration(admin, { kind: "CRM" });
    expect(revoked.credentialConfigured).toBe(false);
    expect(revoked.connected).toBe(false);
    const catalog = await harness.clm.listIntegrations(admin);
    expect(catalog.items.find((item) => item.kind === "CRM")?.credentialConfigured).toBe(false);

    const body = JSON.stringify({ type: "contact.updated" });
    const hook = signedWebhook("evt_after_revoke", body);
    await expect(
      harness.clm.processIntegrationWebhook({
        kind: "crm",
        rawBody: hook.body,
        headers: {
          signature: hook.signature,
          timestamp: hook.timestamp,
          eventId: hook.eventId,
          organizationSlug: "northwind",
        },
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("refuses to store env-based email credentials on the org record", async () => {
    const harness = await createClmHarness(PASSWORD);
    const admin = await actorFor(harness, SEED.users.northwindAdmin.email);
    await expect(
      harness.clm.saveIntegrationCredentials(admin, {
        kind: "EMAIL",
        provider: "resend",
        apiKey: API_KEY,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
