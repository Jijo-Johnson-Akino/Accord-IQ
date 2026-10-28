import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { membership, organization, user } from "@accordiq/db";
import { loadActor } from "./actor";
import { createAuthHarness } from "./harness";
import { registerAccount, slugifyOrganizationName } from "./register";
import { SEED } from "./seed";

const PASSWORD = "Dev-only-passw0rd!";
const ORIGIN = "http://localhost:3000";

describe("slugifyOrganizationName", () => {
  it("builds a lowercase hyphenated slug", () => {
    expect(slugifyOrganizationName("Acme Legal Group")).toBe("acme-legal-group");
    expect(slugifyOrganizationName("@@@")).toBe("workspace");
  });
});

describe("registerAccount", () => {
  it("creates a new organization admin and does not join existing tenants", async () => {
    const { auth, db, access } = await createAuthHarness(PASSWORD);
    const registered = await registerAccount(
      db,
      auth,
      {
        name: "Ada Founder",
        email: "ada@newco.example",
        password: "Signup-passw0rd!",
        organizationName: "Newco Legal",
        organizationId: SEED.organizations.northwind.id,
      },
      ORIGIN,
    );
    expect(registered.response.ok).toBe(true);
    expect(registered.organizationId).not.toBe(SEED.organizations.northwind.id);

    const account = await db.query.user.findFirst({
      where: eq(user.email, "ada@newco.example"),
    });
    expect(account?.platformRole).toBeNull();

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, registered.organizationId),
    });
    expect(org?.name).toBe("Newco Legal");
    expect(org?.slug).toBe("newco-legal");

    const member = await db.query.membership.findFirst({
      where: eq(membership.userId, registered.userId),
    });
    expect(member?.role).toBe("ORGANIZATION_ADMIN");
    expect(member?.organizationId).toBe(registered.organizationId);

    const payload = await auth.api.getSession({
      headers: cookieHeader(registered.response),
    });
    const actor = await loadActor(db, payload!);
    expect(actor.organizationId).toBe(registered.organizationId);
    expect(actor.organizationRole).toBe("ORGANIZATION_ADMIN");
    await expect(access.getRecord(actor, SEED.records.northwind.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects a duplicate email without creating another organization", async () => {
    const { auth, db } = await createAuthHarness(PASSWORD);
    await expect(
      registerAccount(
        db,
        auth,
        {
          name: "Copy",
          email: SEED.users.northwindLegal.email,
          password: "Signup-passw0rd!",
          organizationName: "Should Not Exist",
        },
        ORIGIN,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const extra = await db.query.organization.findFirst({
      where: eq(organization.name, "Should Not Exist"),
    });
    expect(extra).toBeUndefined();
  });
});

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
