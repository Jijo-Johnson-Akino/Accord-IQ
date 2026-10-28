import { describe, expect, it } from "vitest";
import { AppError } from "@accordiq/core";
import { loadActor } from "./actor";
import { createAuthHarness } from "./harness";
import { parseResetToken } from "./reset-url";
import { SEED } from "./seed";

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

async function signIn(auth: Awaited<ReturnType<typeof createAuthHarness>>["auth"], email: string) {
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

describe("authentication and tenant isolation", () => {
  it("signs in, scopes records to the session organization, and signs out", async () => {
    const { auth, db, access } = await createAuthHarness(PASSWORD);
    const headers = await signIn(auth, SEED.users.northwindLegal.email);
    const payload = await auth.api.getSession({ headers });
    expect(payload?.user.email).toBe(SEED.users.northwindLegal.email);

    const actor = await loadActor(db, payload!);
    expect(actor.organizationId).toBe(SEED.organizations.northwind.id);
    expect(actor.organizationRole).toBe("LEGAL");

    const records = await access.listRecords(actor);
    expect(records.map((row) => row.id)).toEqual([SEED.records.northwind.id]);

    await expect(access.getRecord(actor, SEED.records.contoso.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await auth.api.signOut({ headers });
    const after = await auth.api.getSession({ headers });
    expect(after).toBeNull();
  });

  it("rejects a cross-organization switch by identifier", async () => {
    const { auth, db, access } = await createAuthHarness(PASSWORD);
    const headers = await signIn(auth, SEED.users.northwindViewer.email);
    const payload = await auth.api.getSession({ headers });
    const actor = await loadActor(db, payload!);
    await expect(
      access.switchOrganization(actor, SEED.organizations.contoso.id, payload!.session.id),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("lets a superadmin switch into another organization", async () => {
    const { auth, db, access } = await createAuthHarness(PASSWORD);
    const headers = await signIn(auth, SEED.users.superadmin.email);
    const payload = await auth.api.getSession({ headers });
    const actor = await loadActor(db, payload!);
    expect(actor.platformRole).toBe("SUPERADMIN");
    await access.switchOrganization(actor, SEED.organizations.contoso.id, payload!.session.id);
    const refreshed = await auth.api.getSession({ headers });
    const switched = await loadActor(db, refreshed!);
    expect(switched.organizationId).toBe(SEED.organizations.contoso.id);
    const records = await access.listRecords(switched);
    expect(records.map((row) => row.id)).toEqual([SEED.records.contoso.id]);
  });

  it("enforces write permission on the server, not the UI", async () => {
    const { auth, db, access } = await createAuthHarness(PASSWORD);
    const viewerHeaders = await signIn(auth, SEED.users.northwindViewer.email);
    const viewer = await loadActor(db, (await auth.api.getSession({ headers: viewerHeaders }))!);
    await expect(access.createRecord(viewer, "Should not exist")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const legalHeaders = await signIn(auth, SEED.users.northwindLegal.email);
    const legal = await loadActor(db, (await auth.api.getSession({ headers: legalHeaders }))!);
    const created = await access.createRecord(legal, "Legal memo");
    expect(created.organizationId).toBe(SEED.organizations.northwind.id);
    expect(created.title).toBe("Legal memo");
  });

  it("resets a password and revokes the previous credential", async () => {
    const { auth, mailer } = await createAuthHarness(PASSWORD);
    await auth.api.requestPasswordReset({
      body: {
        email: SEED.users.northwindViewer.email,
        redirectTo: `${ORIGIN}/reset-password`,
      },
      headers: new Headers({ origin: ORIGIN }),
    });
    expect(mailer.outbox).toHaveLength(1);
    expect(mailer.outbox[0]?.to).toBe(SEED.users.northwindViewer.email);
    const resetUrl = mailer.outbox[0]?.url;
    expect(resetUrl).toBeTruthy();
    const token = parseResetToken(resetUrl!);
    expect(token, `reset url: ${resetUrl}`).toBeTruthy();

    await auth.api.resetPassword({
      body: { token: token!, newPassword: "Replacement-pass1" },
      headers: new Headers({ origin: ORIGIN }),
    });

    const oldPassword = await auth.api.signInEmail({
      body: { email: SEED.users.northwindViewer.email, password: PASSWORD },
      headers: new Headers({ origin: ORIGIN }),
      asResponse: true,
    });
    expect(oldPassword.ok).toBe(false);

    const next = await auth.api.signInEmail({
      body: { email: SEED.users.northwindViewer.email, password: "Replacement-pass1" },
      headers: new Headers({ origin: ORIGIN }),
      asResponse: true,
    });
    expect(next.ok).toBe(true);
  });

  it("refuses public sign-up", async () => {
    const { auth } = await createAuthHarness(PASSWORD);
    const response = await auth.api.signUpEmail({
      body: {
        name: "Intruder",
        email: "intruder@example.com",
        password: PASSWORD,
      },
      headers: new Headers({ origin: ORIGIN }),
      asResponse: true,
    });
    expect(response.ok).toBe(false);
  });

  it("does not reveal another organization's record by id", async () => {
    const { auth, db, access } = await createAuthHarness(PASSWORD);
    const headers = await signIn(auth, SEED.users.contosoViewer.email);
    const actor = await loadActor(db, (await auth.api.getSession({ headers }))!);
    await expect(access.getRecord(actor, SEED.records.northwind.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
