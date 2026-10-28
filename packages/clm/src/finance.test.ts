import { describe, expect, it } from "vitest";
import { loadActor, SEED } from "@accordiq/auth";
import { parsePage } from "@accordiq/core";
import { contract } from "@accordiq/db";
import { eq } from "drizzle-orm";
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

describe("financial intelligence", { timeout: 20_000 }, () => {
  it("shows seed MSA as stated pipeline value, not committed spend", async () => {
    const harness = await createClmHarness(PASSWORD);
    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    const report = await harness.clm.getFinanceInsights(viewer, {});
    expect(report.statedByCurrency).toEqual([{ currency: "USD", amountMinor: 12500000 }]);
    expect(report.committedByCurrency).toEqual([]);
    expect(report.importedByCurrency).toEqual([]);
    expect(report.verifiedSavingsByCurrency).toEqual([]);
    expect(report.charts.committedByVendor).toEqual([]);
    expect(report.explanations.committed).toMatch(/Approved/);
  });

  it("keeps currencies separate and treats JPY as whole yen", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const usd = await harness.clm.createContract(legal, {
      title: "USD active",
      currency: "USD",
      value: "10.00",
    });
    const jpy = await harness.clm.createContract(legal, {
      title: "JPY active",
      currency: "JPY",
      value: "1500",
    });
    const eur = await harness.clm.createContract(legal, {
      title: "EUR active",
      currency: "EUR",
      value: "20.00",
    });
    await harness.db
      .update(contract)
      .set({ status: "ACTIVE" })
      .where(eq(contract.id, usd.contract.id));
    await harness.db
      .update(contract)
      .set({ status: "ACTIVE" })
      .where(eq(contract.id, jpy.contract.id));
    await harness.db
      .update(contract)
      .set({ status: "ACTIVE" })
      .where(eq(contract.id, eur.contract.id));
    const report = await harness.clm.getFinanceInsights(legal, {});
    expect(report.committedByCurrency).toEqual([
      { currency: "EUR", amountMinor: 2000 },
      { currency: "JPY", amountMinor: 1500 },
      { currency: "USD", amountMinor: 1000 },
    ]);
    const jpyOnly = await harness.clm.getFinanceInsights(legal, { currency: "JPY" });
    expect(jpyOnly.committedByCurrency).toEqual([{ currency: "JPY", amountMinor: 1500 }]);
    expect(jpy.contract.valueMinor).toBe(1500);
  });

  it("does not mix imported transactions into committed spend", async () => {
    const harness = await createClmHarness(PASSWORD);
    const finance = await actorFor(harness, SEED.users.northwindFinance.email);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const created = await harness.clm.createContract(legal, {
      title: "Active MSA",
      currency: "USD",
      value: "100.00",
      vendorId: CLM_SEED.vendors.northwindAcme.id,
    });
    await harness.db
      .update(contract)
      .set({ status: "ACTIVE" })
      .where(eq(contract.id, created.contract.id));
    await harness.clm.createFinancialTransaction(finance, {
      contractId: created.contract.id,
      amount: "40.00",
      currency: "USD",
      occurredOn: "2026-03-01",
      reference: "INV-40",
    });
    const report = await harness.clm.getFinanceInsights(finance, {});
    expect(report.committedByCurrency).toEqual([{ currency: "USD", amountMinor: 10000 }]);
    expect(report.importedByCurrency).toEqual([{ currency: "USD", amountMinor: 4000 }]);
    const acme = report.vendorSummaries.find(
      (row) => row.vendorId === CLM_SEED.vendors.northwindAcme.id,
    );
    expect(acme?.importedByCurrency).toEqual([{ currency: "USD", amountMinor: 4000 }]);
  });

  it("never adds estimated savings into verified totals", async () => {
    const harness = await createClmHarness(PASSWORD);
    const finance = await actorFor(harness, SEED.users.northwindFinance.email);
    const estimate = await harness.clm.createSavingsOpportunity(finance, {
      kind: "PRICE_REDUCTION",
      title: "Possible cut",
      amount: "50.00",
      currency: "USD",
      explanation: "Unverified negotiation.",
    });
    expect(estimate.status).toBe("ESTIMATE");
    const before = await harness.clm.getFinanceInsights(finance, {});
    expect(before.verifiedSavingsByCurrency).toEqual([]);
    expect(before.estimatedOpportunitiesByCurrency).toEqual([
      { currency: "USD", amountMinor: 5000 },
    ]);
    const verified = await harness.clm.verifySavingsOpportunity(finance, estimate.id);
    expect(verified.status).toBe("VERIFIED");
    const after = await harness.clm.getFinanceInsights(finance, {});
    expect(after.verifiedSavingsByCurrency).toEqual([{ currency: "USD", amountMinor: 5000 }]);
  });

  it("enforces finance:write for transactions and transaction export", async () => {
    const harness = await createClmHarness(PASSWORD);
    const viewer = await actorFor(harness, SEED.users.northwindViewer.email);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const finance = await actorFor(harness, SEED.users.northwindFinance.email);
    await expect(
      harness.clm.createFinancialTransaction(viewer, {
        amount: "10.00",
        currency: "USD",
        occurredOn: "2026-01-01",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      harness.clm.createFinancialTransaction(legal, {
        amount: "10.00",
        currency: "USD",
        occurredOn: "2026-01-01",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(harness.clm.exportFinance(viewer, { kind: "transactions" })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
    const insights = await harness.clm.exportFinance(viewer, { kind: "insights" });
    expect(insights.contentType).toContain("text/csv");
    const csv = new TextDecoder().decode(insights.bytes);
    expect(csv).toContain("stated_value");
    expect(csv).toMatch(/Committed spend is contract-stated/);
    expect(csv).not.toContain("verified_savings,USD,,,,verified_savings");
    await harness.clm.createFinancialTransaction(finance, {
      amount: "10.00",
      currency: "USD",
      occurredOn: "2026-01-01",
    });
    const ledger = await harness.clm.exportFinance(finance, { kind: "transactions" });
    expect(new TextDecoder().decode(ledger.bytes)).toContain("IMPORTED");
  });

  it("lets legal record contract-stated milestones and refuses imported ones", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    const finance = await actorFor(harness, SEED.users.northwindFinance.email);
    const created = await harness.clm.createPaymentMilestone(legal, {
      contractId: CLM_SEED.contracts.northwindMsa.id,
      title: "Annual fee",
      amount: "125000.00",
      currency: "USD",
      source: "CONTRACT_STATED",
      dueOn: "2026-12-01",
    });
    expect(created.source).toBe("CONTRACT_STATED");
    await expect(
      harness.clm.createPaymentMilestone(legal, {
        contractId: CLM_SEED.contracts.northwindMsa.id,
        title: "Invoice",
        amount: "10.00",
        currency: "USD",
        source: "IMPORTED",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      harness.clm.createPaymentMilestone(finance, {
        contractId: CLM_SEED.contracts.northwindMsa.id,
        title: "Stated by finance",
        amount: "10.00",
        currency: "USD",
        source: "CONTRACT_STATED",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const imported = await harness.clm.createPaymentMilestone(finance, {
      contractId: CLM_SEED.contracts.northwindMsa.id,
      title: "Imported installment",
      amount: "10.00",
      currency: "USD",
      source: "IMPORTED",
    });
    expect(imported.source).toBe("IMPORTED");
    const listed = await harness.clm.listPaymentMilestones(
      legal,
      page,
      CLM_SEED.contracts.northwindMsa.id,
    );
    expect(listed.items.length).toBe(2);
  });

  it("isolates finance data by organization", async () => {
    const harness = await createClmHarness(PASSWORD);
    const northwind = await actorFor(harness, SEED.users.northwindAdmin.email);
    const contoso = await actorFor(harness, SEED.users.contosoAdmin.email);
    const nw = await harness.clm.getFinanceInsights(northwind, {});
    const co = await harness.clm.getFinanceInsights(contoso, {});
    expect(nw.statedByCurrency).toEqual([{ currency: "USD", amountMinor: 12500000 }]);
    expect(co.statedByCurrency).toEqual([]);
    await expect(
      harness.clm.getContractFinance(contoso, CLM_SEED.contracts.northwindMsa.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("labels auto-renew review opportunities as estimates", async () => {
    const harness = await createClmHarness(PASSWORD);
    const legal = await actorFor(harness, SEED.users.northwindLegal.email);
    await harness.clm.updateContract(legal, CLM_SEED.contracts.northwindMsa.id, {
      autoRenew: true,
    });
    const report = await harness.clm.getFinanceInsights(legal, {});
    const derived = report.derivedOpportunities.find((row) => row.kind === "AUTO_RENEW_REVIEW");
    expect(derived?.status).toBe("ESTIMATE");
    expect(derived?.amountMinor).toBe(12500000);
    expect(report.verifiedSavingsByCurrency).toEqual([]);
  });
});
