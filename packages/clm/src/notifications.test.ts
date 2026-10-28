import { describe, expect, it } from "vitest";
import { createFailingMailer, loadActor, SEED } from "@accordiq/auth";
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

describe("notification delivery", () => {
  it("queues in-app and email for an assigned obligation", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    await harness.clm.createObligation(legal, {
      contractId: CLM_SEED.contracts.northwindMsa.id,
      title: "Insurance certificate",
    });
    const notes = await harness.clm.listNotifications(legal, page);
    expect(notes.items.some((row) => row.kind === "OBLIGATION_REMINDER")).toBe(true);
    expect(
      harness.mailer.outbox.some((mail) => mail.subject?.includes("Obligation assigned")),
    ).toBe(true);
  });

  it("skips email when the user turns that kind off", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    await harness.clm.updateNotificationPreferences(legal, {
      preferences: [{ kind: "OBLIGATION_REMINDER", inApp: true, email: false }],
    });
    const before = harness.mailer.outbox.length;
    await harness.clm.createObligation(legal, {
      contractId: CLM_SEED.contracts.northwindMsa.id,
      title: "Quiet assignment",
    });
    expect(harness.mailer.outbox.length).toBe(before);
    const notes = await harness.clm.listNotifications(legal, page);
    expect(notes.items.some((row) => row.body === "Quiet assignment")).toBe(true);
  });

  it("retries a failed email then marks it failed after max attempts", async () => {
    const mailer = createFailingMailer(Number.POSITIVE_INFINITY);
    let nowMs = Date.parse("2026-10-28T12:00:00.000Z");
    const harness = await createClmHarness(PASSWORD, {
      mailer,
      notificationMaxAttempts: 2,
      clock: () => new Date(nowMs),
    });
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    await harness.clm.createObligation(legal, {
      contractId: CLM_SEED.contracts.northwindMsa.id,
      title: "Retry delivery",
    });
    const admin = await actorFor(harness, SEED.users.northwindAdmin.email);
    const first = await harness.clm.listNotificationDeliveries(admin, page);
    const queued = first.items.find((row) => row.body.includes("Retry delivery"));
    expect(queued?.status).toBe("PENDING");
    expect(queued?.attempts).toBe(1);
    expect(queued?.lastError).toBe("Failed to send email.");

    nowMs += 61_000;
    const second = await harness.clm.processNotificationDeliveries(admin);
    expect(second.failed).toBe(1);
    const after = await harness.clm.listNotificationDeliveries(admin, page);
    const failed = after.items.find((row) => row.body.includes("Retry delivery"));
    expect(failed?.status).toBe("FAILED");
    expect(failed?.attempts).toBe(2);
  });

  it("recovers on a later attempt when the mailer comes back", async () => {
    const mailer = createFailingMailer(1);
    let nowMs = Date.parse("2026-10-28T12:00:00.000Z");
    const harness = await createClmHarness(PASSWORD, {
      mailer,
      notificationMaxAttempts: 3,
      clock: () => new Date(nowMs),
    });
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    await harness.clm.createObligation(legal, {
      contractId: CLM_SEED.contracts.northwindMsa.id,
      title: "Recovered delivery",
    });
    const admin = await actorFor(harness, SEED.users.northwindAdmin.email);
    nowMs += 61_000;
    const result = await harness.clm.processNotificationDeliveries(admin);
    expect(result.sent).toBeGreaterThanOrEqual(1);
    const rows = await harness.clm.listNotificationDeliveries(admin, page);
    expect(rows.items.some((row) => row.status === "SENT" && row.body.includes("Recovered"))).toBe(
      true,
    );
  });

  it("refuses delivery listing to a viewer", async () => {
    const harness = await createClmHarness(PASSWORD);
    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    await expect(harness.clm.listNotificationDeliveries(viewer, page)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
