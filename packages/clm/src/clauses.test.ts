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

describe("clause library", () => {
  it("versions approved language and supersedes the previous current version", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createClause(legal, {
      code: "TERM_PLAYBOOK",
      title: "Standard term",
      category: "TERM",
      jurisdiction: "Delaware",
      contractTypes: ["MSA"],
      body: "The term is twelve months.",
    });
    expect(created.template.status).toBe("DRAFT");
    expect(created.versions).toHaveLength(1);
    const approved = await harness.clm.approveClause(legal, created.template.id);
    expect(approved.status).toBe("APPROVED");
    const draft = await harness.clm.addClauseVersion(legal, created.template.id, {
      body: "The term is twenty-four months.",
      changeSummary: "Longer default term.",
    });
    expect(draft.versionNumber).toBe(2);
    expect(draft.status).toBe("DRAFT");
    await harness.clm.approveClause(legal, created.template.id, draft.id);
    const after = await harness.clm.getClause(legal, created.template.id);
    expect(after.template.status).toBe("APPROVED");
    expect(after.template.currentVersionId).toBe(draft.id);
    expect(after.versions.find((row) => row.versionNumber === 1)?.status).toBe("SUPERSEDED");
    expect(after.versions.find((row) => row.versionNumber === 2)?.status).toBe("APPROVED");
    await harness.clm.deprecateClause(legal, created.template.id);
    await expect(
      harness.clm.addClauseVersion(legal, created.template.id, { body: "Too late." }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lets legal manage clauses and refuses viewers, finance, and procurement", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    const finance = await actorFor(harness, SEED.users.northwindFinance.email);
    const procurement = await actorFor(harness, SEED.users.northwindProcurement.email);
    const listed = await harness.clm.listClauses(viewer, page);
    expect(
      listed.items.some((row) => row.id === CLM_SEED.clauses.northwindConfidentiality.id),
    ).toBe(true);
    const payload = {
      code: "VIEWER_CLAUSE",
      title: "Should not exist",
      category: "OTHER",
      body: "No.",
    };
    await expect(harness.clm.createClause(viewer, payload)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(harness.clm.createClause(finance, payload)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(harness.clm.createClause(procurement, payload)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      harness.clm.approveClause(viewer, CLM_SEED.clauses.northwindConfidentiality.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const seeded = await harness.clm.getClause(legal, CLM_SEED.clauses.northwindConfidentiality.id);
    expect(seeded.alternatives).toHaveLength(1);
    expect(seeded.usages.some((row) => row.contractId === CLM_SEED.contracts.northwindMsa.id)).toBe(
      true,
    );
  });

  it("hides another organization's clauses as not found", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const contoso = await actorFor(harness, SEED.users.contosoAdmin.email);
    const created = await harness.clm.createClause(contoso, {
      code: "CO_ONLY",
      title: "Contoso only",
      category: "OTHER",
      body: "Contoso language.",
    });
    await expect(harness.clm.getClause(legal, created.template.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
