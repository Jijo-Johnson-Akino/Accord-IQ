import { describe, expect, it } from "vitest";
import {
  applyEscalationBps,
  buildFinanceReport,
  groupByCurrency,
  toInsightsCsv,
  verifiedSavingsTotals,
  type FinanceContractInput,
} from "./finance-engine";

function contract(overrides: Partial<FinanceContractInput>): FinanceContractInput {
  return {
    id: "c1",
    title: "MSA",
    status: "DRAFT",
    vendorId: "v1",
    vendorName: "Acme",
    currency: "USD",
    valueMinor: 12500000,
    expiresOn: "2026-12-31",
    autoRenew: false,
    ...overrides,
  };
}

describe("finance engine", () => {
  it("never sums amounts across currencies", () => {
    expect(
      groupByCurrency([
        { currency: "USD", amountMinor: 100 },
        { currency: "EUR", amountMinor: 100 },
        { currency: "USD", amountMinor: 50 },
      ]),
    ).toEqual([
      { currency: "EUR", amountMinor: 100 },
      { currency: "USD", amountMinor: 150 },
    ]);
  });

  it("applies escalation in basis points with integer rounding", () => {
    expect(applyEscalationBps(12500000, 250)).toBe(12812500);
    expect(applyEscalationBps(1500, 1000)).toBe(1650);
  });

  it("keeps draft contract-stated value out of committed spend", () => {
    const report = buildFinanceReport({
      asOf: "2026-10-28",
      timezone: "UTC",
      contracts: [contract({ status: "DRAFT" })],
      milestones: [],
      transactions: [],
      escalations: [],
      savings: [],
    });
    expect(report.statedByCurrency).toEqual([{ currency: "USD", amountMinor: 12500000 }]);
    expect(report.committedByCurrency).toEqual([]);
    expect(report.pipelineByCurrency).toEqual([{ currency: "USD", amountMinor: 12500000 }]);
    expect(report.charts.committedByVendor).toEqual([]);
  });

  it("counts only committed statuses toward committed spend", () => {
    const report = buildFinanceReport({
      asOf: "2026-10-28",
      timezone: "UTC",
      contracts: [
        contract({ id: "draft", status: "DRAFT", valueMinor: 100 }),
        contract({ id: "active", status: "ACTIVE", valueMinor: 200 }),
        contract({ id: "signed", status: "SIGNED", valueMinor: 50 }),
        contract({ id: "expired", status: "EXPIRED", valueMinor: 999 }),
      ],
      milestones: [],
      transactions: [],
      escalations: [],
      savings: [],
    });
    expect(report.committedByCurrency).toEqual([{ currency: "USD", amountMinor: 250 }]);
  });

  it("excludes missing values and records gaps instead of inventing totals", () => {
    const report = buildFinanceReport({
      asOf: "2026-10-28",
      timezone: "UTC",
      contracts: [
        contract({ id: "ok", status: "ACTIVE", valueMinor: 100, currency: "USD" }),
        contract({
          id: "no-ccy",
          title: "No currency",
          status: "ACTIVE",
          valueMinor: 50,
          currency: null,
        }),
        contract({
          id: "no-val",
          title: "No value",
          status: "ACTIVE",
          valueMinor: null,
          currency: "EUR",
        }),
      ],
      milestones: [],
      transactions: [],
      escalations: [],
      savings: [],
    });
    expect(report.committedByCurrency).toEqual([{ currency: "USD", amountMinor: 100 }]);
    expect(report.gaps.map((gap) => gap.code).sort()).toEqual([
      "CURRENCY_WITHOUT_VALUE",
      "VALUE_WITHOUT_CURRENCY",
    ]);
    const emptyCommitted = buildFinanceReport({
      asOf: "2026-10-28",
      timezone: "UTC",
      contracts: [
        contract({
          id: "blank",
          title: "Blank",
          status: "ACTIVE",
          valueMinor: null,
          currency: null,
        }),
      ],
      milestones: [],
      transactions: [],
      escalations: [],
      savings: [],
    });
    expect(emptyCommitted.gaps.some((gap) => gap.code === "COMMITTED_WITHOUT_VALUE")).toBe(true);
  });

  it("does not mix imported transactions into contract-stated or committed totals", () => {
    const report = buildFinanceReport({
      asOf: "2026-10-28",
      timezone: "UTC",
      contracts: [contract({ status: "ACTIVE", valueMinor: 1000 })],
      milestones: [],
      transactions: [
        {
          id: "t1",
          contractId: "c1",
          vendorId: "v1",
          amountMinor: 400,
          currency: "USD",
          occurredOn: "2026-02-01",
          reference: "INV-1",
          note: null,
          source: "IMPORTED",
        },
      ],
      escalations: [],
      savings: [],
    });
    expect(report.committedByCurrency).toEqual([{ currency: "USD", amountMinor: 1000 }]);
    expect(report.importedByCurrency).toEqual([{ currency: "USD", amountMinor: 400 }]);
  });

  it("never counts estimated opportunities as verified savings", () => {
    const report = buildFinanceReport({
      asOf: "2026-10-28",
      timezone: "UTC",
      contracts: [contract({ status: "ACTIVE" })],
      milestones: [],
      transactions: [],
      escalations: [],
      savings: [
        {
          id: "s1",
          contractId: "c1",
          vendorId: "v1",
          kind: "PRICE_REDUCTION",
          title: "Guess",
          amountMinor: 5000,
          currency: "USD",
          status: "ESTIMATE",
          explanation: "Guess",
        },
        {
          id: "s2",
          contractId: "c1",
          vendorId: "v1",
          kind: "VOLUME",
          title: "Booked",
          amountMinor: 1000,
          currency: "USD",
          status: "VERIFIED",
          explanation: "Booked",
        },
      ],
    });
    expect(report.verifiedSavingsByCurrency).toEqual([{ currency: "USD", amountMinor: 1000 }]);
    expect(report.estimatedOpportunitiesByCurrency).toEqual([
      { currency: "USD", amountMinor: 5000 },
    ]);
    expect(verifiedSavingsTotals(report.derivedOpportunities as never)).toEqual([]);
  });

  it("labels estimate escalations on forecasts and keeps clause escalations as stated", () => {
    const estimate = buildFinanceReport({
      asOf: "2026-10-28",
      timezone: "UTC",
      contracts: [contract({ status: "ACTIVE", valueMinor: 10000 })],
      milestones: [],
      transactions: [],
      escalations: [
        {
          id: "e1",
          contractId: "c1",
          percentBps: 1000,
          effectiveOn: "2026-01-01",
          source: "ESTIMATE",
        },
      ],
      savings: [],
    });
    expect(estimate.forecasts[0]?.forecastMinor).toBe(11000);
    expect(estimate.forecasts[0]?.confidence).toBe("ESTIMATE");
    expect(estimate.derivedOpportunities.some((row) => row.status === "ESTIMATE")).toBe(true);

    const clause = buildFinanceReport({
      asOf: "2026-10-28",
      timezone: "UTC",
      contracts: [contract({ status: "ACTIVE", valueMinor: 10000 })],
      milestones: [],
      transactions: [],
      escalations: [
        {
          id: "e2",
          contractId: "c1",
          percentBps: 500,
          effectiveOn: "2026-01-01",
          source: "CONTRACT_CLAUSE",
        },
      ],
      savings: [],
    });
    expect(clause.forecasts[0]?.forecastMinor).toBe(10500);
    expect(clause.forecasts[0]?.confidence).toBe("STATED");
  });

  it("filters by currency, vendor, and status group", () => {
    const report = buildFinanceReport({
      asOf: "2026-10-28",
      timezone: "UTC",
      filters: { currency: "EUR", statusGroup: "committed" },
      contracts: [
        contract({ id: "usd", currency: "USD", status: "ACTIVE", valueMinor: 10 }),
        contract({
          id: "eur",
          currency: "EUR",
          status: "ACTIVE",
          valueMinor: 20,
          vendorId: "v2",
          vendorName: "Globex",
        }),
        contract({ id: "eur-draft", currency: "EUR", status: "DRAFT", valueMinor: 99 }),
      ],
      milestones: [],
      transactions: [],
      escalations: [],
      savings: [],
    });
    expect(report.committedByCurrency).toEqual([{ currency: "EUR", amountMinor: 20 }]);
    expect(report.statedByCurrency).toEqual([{ currency: "EUR", amountMinor: 20 }]);
  });

  it("flags milestone sum mismatches and keeps export text free of estimated-as-verified claims", () => {
    const report = buildFinanceReport({
      asOf: "2026-10-28",
      timezone: "UTC",
      contracts: [contract({ status: "ACTIVE", valueMinor: 1000 })],
      milestones: [
        {
          id: "m1",
          contractId: "c1",
          amountMinor: 400,
          currency: "USD",
          status: "PLANNED",
          source: "CONTRACT_STATED",
        },
      ],
      transactions: [],
      escalations: [],
      savings: [
        {
          id: "s1",
          contractId: "c1",
          vendorId: "v1",
          kind: "OTHER",
          title: "Maybe",
          amountMinor: 50,
          currency: "USD",
          status: "ESTIMATE",
          explanation: "Maybe",
        },
      ],
    });
    expect(report.gaps.some((gap) => gap.code === "MILESTONE_SUM_MISMATCH")).toBe(true);
    const csv = toInsightsCsv(report);
    expect(csv).toContain("estimated_opportunity");
    expect(csv).toContain("ESTIMATE");
    expect(csv).not.toMatch(/verified_savings,USD,,.*50/);
  });
});
