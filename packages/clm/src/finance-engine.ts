import { AppError } from "@accordiq/core";
import {
  ESCALATION_SOURCES,
  FINANCIAL_SOURCES,
  FINANCE_EXPORT_KINDS,
  FINANCE_STATUS_GROUPS,
  MILESTONE_STATUSES,
  SAVINGS_KINDS,
  SAVINGS_STATUSES,
  type ContractStatus,
  type EscalationSource,
  type FinanceExportKind,
  type FinanceStatusGroup,
  type FinancialSource,
  type MilestoneStatus,
  type SavingsKind,
  type SavingsStatus,
} from "./enums";
import { moneyToMinor } from "./money";

export const COMMITTED_STATUSES = [
  "APPROVED",
  "PENDING_SIGNATURE",
  "SIGNED",
  "ACTIVE",
] as const satisfies readonly ContractStatus[];

export const PIPELINE_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "NEGOTIATION",
  "PENDING_APPROVAL",
] as const satisfies readonly ContractStatus[];

export const CLOSED_STATUSES = [
  "EXPIRED",
  "TERMINATED",
] as const satisfies readonly ContractStatus[];

export {
  ESCALATION_SOURCES,
  FINANCIAL_SOURCES,
  FINANCE_EXPORT_KINDS,
  FINANCE_STATUS_GROUPS,
  MILESTONE_STATUSES,
  SAVINGS_KINDS,
  SAVINGS_STATUSES,
};
export type {
  EscalationSource,
  FinanceExportKind,
  FinanceStatusGroup,
  FinancialSource,
  MilestoneStatus,
  SavingsKind,
  SavingsStatus,
};

export const FINANCE_EXPLANATIONS = {
  stated:
    "Contract-stated value is the sum of contract.value_minor for records that have both a value and an ISO currency. Each currency is totaled separately. Missing or conflicting rows are listed as gaps and are not included.",
  committed:
    "Committed spend is contract-stated value restricted to statuses Approved, Pending signature, Signed, and Active. Draft, in-review, negotiation, and pending-approval records are pipeline only. Expired and terminated records are excluded. Currencies are never mixed.",
  imported:
    "Imported spend is the sum of financial_transaction.amount_minor. These rows are invoices or payments recorded by finance. They are never added to contract-stated or committed totals.",
  verifiedSavings:
    "Verified savings is the sum of savings_opportunity.amount_minor where status is VERIFIED. Estimated opportunities are listed separately and are never included here.",
  estimatedOpportunities:
    "Estimated opportunities are labeled ESTIMATE. They may be recorded rows still in estimate status or derived reviews (auto-renew, escalation, extraction differences). They are not verified savings.",
  forecast:
    "Renewal cost forecast starts from the contract-stated value. A recorded price-escalation amount in basis points is applied as round(value × (10_000 + bps) / 10_000). An ESTIMATE escalation labels the forecast as an estimate. auto_renew is a flag only and does not change the amount or renew the contract.",
  vendor:
    "Vendor summaries list contract-stated committed spend and imported transactions in separate columns, grouped by currency. Unassigned contracts appear as No vendor.",
  milestones:
    "Payment milestones are stored per contract. CONTRACT_STATED rows come from the agreement; IMPORTED rows are finance entries. Milestone totals are not mixed into imported spend.",
} as const;

export type MoneyTotal = { currency: string; amountMinor: number };

export type FinanceGap = {
  code: string;
  contractId: string | null;
  contractTitle: string | null;
  currency: string | null;
  message: string;
  severity: "warning" | "info";
};

export type FinanceContractInput = {
  id: string;
  title: string;
  status: string;
  vendorId: string | null;
  vendorName: string | null;
  currency: string | null;
  valueMinor: number | null;
  expiresOn: string | null;
  autoRenew: boolean;
};

export type FinanceMilestoneInput = {
  id: string;
  contractId: string;
  amountMinor: number;
  currency: string;
  status: string;
  source: string;
};

export type FinanceTransactionInput = {
  id: string;
  contractId: string | null;
  vendorId: string | null;
  amountMinor: number;
  currency: string;
  occurredOn: string;
  reference: string | null;
  note: string | null;
  source: string;
};

export type FinanceEscalationInput = {
  id: string;
  contractId: string;
  percentBps: number;
  effectiveOn: string | null;
  source: string;
};

export type FinanceSavingsInput = {
  id: string;
  contractId: string | null;
  vendorId: string | null;
  kind: string;
  title: string;
  amountMinor: number | null;
  currency: string | null;
  status: string;
  explanation: string;
};

export type ExtractedMoneyHint = {
  contractId: string;
  fieldKey: "VALUE" | "CURRENCY";
  valueText: string | null;
  verification: string;
};

export type FinanceFilters = {
  currency?: string | null;
  vendorId?: string | null;
  statusGroup?: FinanceStatusGroup | null;
  contractId?: string | null;
};

export type VendorChartRow = {
  vendorId: string | null;
  vendorName: string;
  currency: string;
  amountMinor: number;
};

export type RenewalForecast = {
  contractId: string;
  title: string;
  vendorName: string | null;
  expiresOn: string;
  autoRenew: boolean;
  currency: string;
  statedMinor: number;
  escalationBps: number | null;
  escalationSource: EscalationSource | null;
  forecastMinor: number;
  confidence: "STATED" | "ESTIMATE";
  explanation: string;
};

export type DerivedOpportunity = {
  contractId: string | null;
  vendorId: string | null;
  kind: SavingsKind;
  title: string;
  amountMinor: number | null;
  currency: string | null;
  status: "ESTIMATE";
  explanation: string;
};

export type VendorSummary = {
  vendorId: string | null;
  vendorName: string;
  contractCount: number;
  statedByCurrency: MoneyTotal[];
  committedByCurrency: MoneyTotal[];
  importedByCurrency: MoneyTotal[];
};

export type FinanceReport = {
  asOf: string;
  timezone: string;
  explanations: typeof FINANCE_EXPLANATIONS;
  filters: {
    currency: string | null;
    vendorId: string | null;
    statusGroup: FinanceStatusGroup;
    contractId: string | null;
  };
  statedByCurrency: MoneyTotal[];
  committedByCurrency: MoneyTotal[];
  pipelineByCurrency: MoneyTotal[];
  importedByCurrency: MoneyTotal[];
  verifiedSavingsByCurrency: MoneyTotal[];
  estimatedOpportunitiesByCurrency: MoneyTotal[];
  gaps: FinanceGap[];
  forecasts: RenewalForecast[];
  derivedOpportunities: DerivedOpportunity[];
  vendorSummaries: VendorSummary[];
  charts: {
    committedByVendor: VendorChartRow[];
    importedByVendor: VendorChartRow[];
  };
};

const COMMITTED = new Set<string>(COMMITTED_STATUSES);
const PIPELINE = new Set<string>(PIPELINE_STATUSES);
const CLOSED = new Set<string>(CLOSED_STATUSES);
const ACTIVE_MILESTONE = new Set(["PLANNED", "DUE", "PAID"]);

export function statusesForGroup(group: FinanceStatusGroup | null | undefined): Set<string> | null {
  if (!group || group === "all") return null;
  if (group === "committed") return COMMITTED;
  if (group === "pipeline") return PIPELINE;
  return CLOSED;
}

export function groupByCurrency(
  rows: { currency: string | null | undefined; amountMinor: number | null | undefined }[],
): MoneyTotal[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.currency || row.amountMinor == null) continue;
    map.set(row.currency, (map.get(row.currency) ?? 0) + row.amountMinor);
  }
  return [...map.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amountMinor]) => ({ currency, amountMinor }));
}

/** Apply a basis-point increase: new = round(amount × (10_000 + bps) / 10_000). */
export function applyEscalationBps(amountMinor: number, bps: number): number {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new AppError("VALIDATION", "Amount must be a non-negative integer in minor units.");
  }
  if (!Number.isInteger(bps) || bps < 0 || bps > 100_000) {
    throw new AppError("VALIDATION", "Escalation must be between 0 and 100000 basis points.");
  }
  return Math.round((amountMinor * (10_000 + bps)) / 10_000);
}

export function pickEscalation(
  rows: FinanceEscalationInput[],
  today: string,
): FinanceEscalationInput | null {
  if (rows.length === 0) return null;
  const clause = rows.filter((row) => row.source === "CONTRACT_CLAUSE");
  const pool = clause.length > 0 ? clause : rows;
  const dated = pool.filter((row) => row.effectiveOn && row.effectiveOn <= today);
  const use = dated.length > 0 ? dated : pool;
  return (
    [...use].sort((left, right) =>
      (right.effectiveOn ?? "").localeCompare(left.effectiveOn ?? ""),
    )[0] ?? null
  );
}

export function verifiedSavingsTotals(rows: FinanceSavingsInput[]): MoneyTotal[] {
  return groupByCurrency(
    rows
      .filter((row) => row.status === "VERIFIED")
      .map((row) => ({
        currency: row.currency,
        amountMinor: row.amountMinor,
      })),
  );
}

export function estimatedSavingsTotals(
  recorded: FinanceSavingsInput[],
  derived: DerivedOpportunity[],
): MoneyTotal[] {
  const recordedEstimates = recorded.filter((row) => row.status === "ESTIMATE");
  return groupByCurrency([
    ...recordedEstimates.map((row) => ({ currency: row.currency, amountMinor: row.amountMinor })),
    ...derived.map((row) => ({ currency: row.currency, amountMinor: row.amountMinor })),
  ]);
}

function matchesFilters(
  row: { vendorId: string | null; currency: string | null; status: string; id: string },
  filters: FinanceFilters,
): boolean {
  if (filters.contractId && row.id !== filters.contractId) return false;
  if (filters.vendorId && row.vendorId !== filters.vendorId) return false;
  if (filters.currency && row.currency !== filters.currency) return false;
  const allowed = statusesForGroup(filters.statusGroup);
  if (allowed && !allowed.has(row.status)) return false;
  return true;
}

function vendorKey(vendorId: string | null): string {
  return vendorId ?? "";
}

function vendorLabel(vendorName: string | null, vendorId: string | null): string {
  if (vendorName) return vendorName;
  if (vendorId) return vendorId;
  return "No vendor";
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toInsightsCsv(report: FinanceReport): string {
  const header = [
    "section",
    "currency",
    "vendor",
    "contract_id",
    "contract_title",
    "metric",
    "amount_minor",
    "source",
    "confidence",
    "explanation",
  ];
  const lines = [
    "# AccordIQ financial export",
    `# Calculated at: ${report.asOf} (${report.timezone})`,
    `# ${FINANCE_EXPLANATIONS.stated}`,
    `# ${FINANCE_EXPLANATIONS.committed}`,
    `# ${FINANCE_EXPLANATIONS.imported}`,
    `# ${FINANCE_EXPLANATIONS.verifiedSavings}`,
    `# Estimated opportunities are labeled ESTIMATE and are excluded from verified savings.`,
    header.join(","),
  ];

  function add(
    section: string,
    currency: string,
    metric: string,
    amountMinor: number,
    source: string,
    confidence: string,
    explanation: string,
    extra: { vendor?: string; contractId?: string; title?: string } = {},
  ) {
    lines.push(
      [
        section,
        currency,
        csvEscape(extra.vendor ?? ""),
        extra.contractId ?? "",
        csvEscape(extra.title ?? ""),
        metric,
        String(amountMinor),
        source,
        confidence,
        csvEscape(explanation),
      ].join(","),
    );
  }

  for (const row of report.statedByCurrency) {
    add(
      "stated",
      row.currency,
      "stated_value",
      row.amountMinor,
      "CONTRACT_STATED",
      "STATED",
      FINANCE_EXPLANATIONS.stated,
    );
  }
  for (const row of report.committedByCurrency) {
    add(
      "committed",
      row.currency,
      "committed_spend",
      row.amountMinor,
      "CONTRACT_STATED",
      "STATED",
      FINANCE_EXPLANATIONS.committed,
    );
  }
  for (const row of report.pipelineByCurrency) {
    add(
      "pipeline",
      row.currency,
      "pipeline_value",
      row.amountMinor,
      "CONTRACT_STATED",
      "STATED",
      "Pipeline statuses are not committed spend.",
    );
  }
  for (const row of report.importedByCurrency) {
    add(
      "imported",
      row.currency,
      "imported_spend",
      row.amountMinor,
      "IMPORTED",
      "STATED",
      FINANCE_EXPLANATIONS.imported,
    );
  }
  for (const row of report.verifiedSavingsByCurrency) {
    add(
      "verified_savings",
      row.currency,
      "verified_savings",
      row.amountMinor,
      "VERIFIED",
      "VERIFIED",
      FINANCE_EXPLANATIONS.verifiedSavings,
    );
  }
  for (const row of report.estimatedOpportunitiesByCurrency) {
    add(
      "estimated_opportunities",
      row.currency,
      "estimated_opportunity",
      row.amountMinor,
      "ESTIMATE",
      "ESTIMATE",
      FINANCE_EXPLANATIONS.estimatedOpportunities,
    );
  }
  for (const forecast of report.forecasts) {
    add(
      "forecast",
      forecast.currency,
      "renewal_cost_forecast",
      forecast.forecastMinor,
      forecast.escalationSource ?? "CONTRACT_STATED",
      forecast.confidence,
      forecast.explanation,
      { vendor: forecast.vendorName ?? "", contractId: forecast.contractId, title: forecast.title },
    );
  }
  return `${lines.join("\n")}\n`;
}

export function toTransactionsCsv(rows: FinanceTransactionInput[]): string {
  const header = [
    "id",
    "contract_id",
    "vendor_id",
    "amount_minor",
    "currency",
    "occurred_on",
    "reference",
    "source",
    "note",
  ];
  const lines = [
    "# AccordIQ imported transaction ledger",
    "# These rows are IMPORTED. They are not contract-stated values and are not mixed into committed spend.",
    header.join(","),
  ];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.contractId ?? "",
        row.vendorId ?? "",
        String(row.amountMinor),
        row.currency,
        row.occurredOn,
        csvEscape(row.reference ?? ""),
        row.source,
        csvEscape(row.note ?? ""),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function latestHint(
  hints: ExtractedMoneyHint[],
  contractId: string,
  fieldKey: "VALUE" | "CURRENCY",
): ExtractedMoneyHint | null {
  const matches = hints.filter(
    (hint) => hint.contractId === contractId && hint.fieldKey === fieldKey,
  );
  return matches[matches.length - 1] ?? null;
}

export function buildFinanceReport(input: {
  asOf: string;
  timezone: string;
  filters?: FinanceFilters;
  contracts: FinanceContractInput[];
  milestones: FinanceMilestoneInput[];
  transactions: FinanceTransactionInput[];
  escalations: FinanceEscalationInput[];
  savings: FinanceSavingsInput[];
  extractedHints?: ExtractedMoneyHint[];
}): FinanceReport {
  const filters: FinanceFilters = {
    currency: input.filters?.currency ?? null,
    vendorId: input.filters?.vendorId ?? null,
    statusGroup: input.filters?.statusGroup ?? "all",
    contractId: input.filters?.contractId ?? null,
  };
  const gaps: FinanceGap[] = [];
  const derivedOpportunities: DerivedOpportunity[] = [];
  const visibleContracts = input.contracts.filter((row) => matchesFilters(row, filters));
  const hints = input.extractedHints ?? [];

  const statedRows: { currency: string | null; amountMinor: number | null }[] = [];
  const committedRows: { currency: string | null; amountMinor: number | null }[] = [];
  const pipelineRows: { currency: string | null; amountMinor: number | null }[] = [];

  for (const row of visibleContracts) {
    if (row.valueMinor != null && !row.currency) {
      gaps.push({
        code: "VALUE_WITHOUT_CURRENCY",
        contractId: row.id,
        contractTitle: row.title,
        currency: null,
        message: `“${row.title}” has a stored value but no currency, so it is excluded from totals.`,
        severity: "warning",
      });
    } else if (row.valueMinor == null && row.currency) {
      gaps.push({
        code: "CURRENCY_WITHOUT_VALUE",
        contractId: row.id,
        contractTitle: row.title,
        currency: row.currency,
        message: `“${row.title}” has currency ${row.currency} but no stored value.`,
        severity: "info",
      });
    } else if (row.valueMinor == null && COMMITTED.has(row.status)) {
      gaps.push({
        code: "COMMITTED_WITHOUT_VALUE",
        contractId: row.id,
        contractTitle: row.title,
        currency: row.currency,
        message: `“${row.title}” is in a committed status (${row.status}) but has no contract-stated value.`,
        severity: "warning",
      });
    }

    if (row.valueMinor != null && row.currency) {
      statedRows.push({ currency: row.currency, amountMinor: row.valueMinor });
      if (COMMITTED.has(row.status)) {
        committedRows.push({ currency: row.currency, amountMinor: row.valueMinor });
      } else if (PIPELINE.has(row.status)) {
        pipelineRows.push({ currency: row.currency, amountMinor: row.valueMinor });
      }
    }

    const valueHint = latestHint(hints, row.id, "VALUE");
    const currencyHint = latestHint(hints, row.id, "CURRENCY");
    if (valueHint?.verification === "SUGGESTED" && valueHint.valueText) {
      try {
        const extractedMinor = moneyToMinor({
          value: valueHint.valueText,
          currency: currencyHint?.valueText ?? row.currency,
        });
        if (
          extractedMinor != null &&
          (row.valueMinor == null || extractedMinor !== row.valueMinor)
        ) {
          gaps.push({
            code: "EXTRACTED_VALUE_DIFFERS",
            contractId: row.id,
            contractTitle: row.title,
            currency: row.currency,
            message: `An unverified extraction for “${row.title}” suggests a different value than the stored contract amount. The suggestion is an estimate and is not included in totals.`,
            severity: "info",
          });
          derivedOpportunities.push({
            contractId: row.id,
            vendorId: row.vendorId,
            kind: "OTHER",
            title: `Review extracted value on ${row.title}`,
            amountMinor: extractedMinor,
            currency: currencyHint?.valueText ?? row.currency,
            status: "ESTIMATE",
            explanation:
              "Derived from an unverified VALUE extraction. Labeled ESTIMATE. Not verified savings.",
          });
        }
      } catch {
        // Unparseable extraction text is ignored; the stored contract value remains the source.
      }
    }
    if (
      currencyHint?.verification === "SUGGESTED" &&
      currencyHint.valueText &&
      row.currency &&
      currencyHint.valueText !== row.currency
    ) {
      gaps.push({
        code: "EXTRACTED_CURRENCY_DIFFERS",
        contractId: row.id,
        contractTitle: row.title,
        currency: row.currency,
        message: `An unverified extraction for “${row.title}” suggests ${currencyHint.valueText}, which conflicts with stored ${row.currency}.`,
        severity: "info",
      });
    }

    if (row.autoRenew && row.valueMinor != null && row.currency && !CLOSED.has(row.status)) {
      derivedOpportunities.push({
        contractId: row.id,
        vendorId: row.vendorId,
        kind: "AUTO_RENEW_REVIEW",
        title: `Review auto-renew cost for ${row.title}`,
        amountMinor: row.valueMinor,
        currency: row.currency,
        status: "ESTIMATE",
        explanation:
          "auto_renew is a flag only. This estimate is the current contract-stated value for review. It is not verified savings and does not renew the contract.",
      });
    }
  }

  const visibleContractIds = new Set(visibleContracts.map((row) => row.id));
  const milestonesByContract = new Map<string, FinanceMilestoneInput[]>();
  for (const milestone of input.milestones) {
    if (!visibleContractIds.has(milestone.contractId)) continue;
    const list = milestonesByContract.get(milestone.contractId) ?? [];
    list.push(milestone);
    milestonesByContract.set(milestone.contractId, list);
  }

  for (const row of visibleContracts) {
    const statedMilestones = (milestonesByContract.get(row.id) ?? []).filter(
      (milestone) =>
        milestone.source === "CONTRACT_STATED" && ACTIVE_MILESTONE.has(milestone.status),
    );
    if (row.valueMinor != null && row.currency && statedMilestones.length > 0) {
      const mixed = statedMilestones.some((milestone) => milestone.currency !== row.currency);
      if (mixed) {
        gaps.push({
          code: "MILESTONE_CURRENCY_CONFLICT",
          contractId: row.id,
          contractTitle: row.title,
          currency: row.currency,
          message: `Contract-stated milestones on “${row.title}” use a currency that does not match the contract.`,
          severity: "warning",
        });
      } else {
        const sum = statedMilestones.reduce((total, milestone) => total + milestone.amountMinor, 0);
        if (sum !== row.valueMinor) {
          gaps.push({
            code: "MILESTONE_SUM_MISMATCH",
            contractId: row.id,
            contractTitle: row.title,
            currency: row.currency,
            message: `Contract-stated milestones on “${row.title}” sum to ${sum} minor units, which does not match the stored value ${row.valueMinor}.`,
            severity: "warning",
          });
        }
      }
    }
  }

  const visibleTransactions = input.transactions.filter((row) => {
    if (filters.contractId && row.contractId !== filters.contractId) return false;
    if (filters.vendorId && row.vendorId !== filters.vendorId) return false;
    if (filters.currency && row.currency !== filters.currency) return false;
    if (row.contractId && input.contracts.length > 0) {
      const parent = input.contracts.find((contract) => contract.id === row.contractId);
      if (parent && filters.contractId && parent.id !== filters.contractId) return false;
      if (parent && parent.currency && parent.currency !== row.currency) {
        if (!filters.contractId || parent.id === filters.contractId) {
          const already = gaps.some(
            (gap) => gap.code === "TRANSACTION_CURRENCY_CONFLICT" && gap.contractId === parent.id,
          );
          if (!already) {
            gaps.push({
              code: "TRANSACTION_CURRENCY_CONFLICT",
              contractId: parent.id,
              contractTitle: parent.title,
              currency: row.currency,
              message: `An imported transaction on “${parent.title}” is in ${row.currency}, which differs from the contract currency ${parent.currency}. It is included in imported spend for ${row.currency} only.`,
              severity: "warning",
            });
          }
        }
      }
    }
    return true;
  });

  const forecasts: RenewalForecast[] = [];
  for (const row of visibleContracts) {
    if (!row.expiresOn || row.valueMinor == null || !row.currency) continue;
    if (CLOSED.has(row.status)) continue;
    const picked = pickEscalation(
      input.escalations.filter((item) => item.contractId === row.id),
      input.asOf,
    );
    const bps = picked?.percentBps ?? 0;
    const source = (picked?.source as EscalationSource | undefined) ?? null;
    const forecastMinor = picked ? applyEscalationBps(row.valueMinor, bps) : row.valueMinor;
    const confidence: "STATED" | "ESTIMATE" = source === "ESTIMATE" ? "ESTIMATE" : "STATED";
    if (source === "ESTIMATE") {
      derivedOpportunities.push({
        contractId: row.id,
        vendorId: row.vendorId,
        kind: "PRICE_REDUCTION",
        title: `Review estimated escalation on ${row.title}`,
        amountMinor: forecastMinor - row.valueMinor,
        currency: row.currency,
        status: "ESTIMATE",
        explanation:
          "Increase implied by an ESTIMATE escalation. Labeled ESTIMATE. Not verified savings.",
      });
    }
    forecasts.push({
      contractId: row.id,
      title: row.title,
      vendorName: row.vendorName,
      expiresOn: row.expiresOn,
      autoRenew: row.autoRenew,
      currency: row.currency,
      statedMinor: row.valueMinor,
      escalationBps: picked ? bps : null,
      escalationSource: source,
      forecastMinor,
      confidence,
      explanation: picked
        ? `Forecast = round(${row.valueMinor} × (10_000 + ${bps}) / 10_000) from a ${source === "ESTIMATE" ? "labeled estimate" : "recorded contract-clause"} escalation. auto_renew=${row.autoRenew} is a flag only.`
        : `Forecast equals the contract-stated value ${row.valueMinor} ${row.currency}. No escalation is recorded. auto_renew=${row.autoRenew} is a flag only.`,
    });
  }

  const recordedEstimates = input.savings.filter((row) => {
    if (row.status === "DISMISSED") return false;
    if (filters.contractId && row.contractId !== filters.contractId) return false;
    if (filters.vendorId && row.vendorId !== filters.vendorId) return false;
    if (filters.currency && row.currency && row.currency !== filters.currency) return false;
    return true;
  });

  const vendorIds = new Set<string>();
  for (const row of visibleContracts) vendorIds.add(vendorKey(row.vendorId));
  for (const row of visibleTransactions) vendorIds.add(vendorKey(row.vendorId));

  const vendorSummaries: VendorSummary[] = [...vendorIds]
    .sort((left, right) => left.localeCompare(right))
    .map((key) => {
      const vendorId = key === "" ? null : key;
      const sample = visibleContracts.find((row) => vendorKey(row.vendorId) === key);
      const vendorName = vendorLabel(sample?.vendorName ?? null, vendorId);
      const vendorContracts = visibleContracts.filter((row) => vendorKey(row.vendorId) === key);
      return {
        vendorId,
        vendorName: vendorName || "No vendor",
        contractCount: vendorContracts.length,
        statedByCurrency: groupByCurrency(
          vendorContracts.map((row) => ({ currency: row.currency, amountMinor: row.valueMinor })),
        ),
        committedByCurrency: groupByCurrency(
          vendorContracts
            .filter((row) => COMMITTED.has(row.status))
            .map((row) => ({ currency: row.currency, amountMinor: row.valueMinor })),
        ),
        importedByCurrency: groupByCurrency(
          visibleTransactions
            .filter((row) => vendorKey(row.vendorId) === key)
            .map((row) => ({ currency: row.currency, amountMinor: row.amountMinor })),
        ),
      };
    });

  const committedByVendor: VendorChartRow[] = [];
  const importedByVendor: VendorChartRow[] = [];
  for (const summary of vendorSummaries) {
    for (const total of summary.committedByCurrency) {
      committedByVendor.push({
        vendorId: summary.vendorId,
        vendorName: summary.vendorName,
        currency: total.currency,
        amountMinor: total.amountMinor,
      });
    }
    for (const total of summary.importedByCurrency) {
      importedByVendor.push({
        vendorId: summary.vendorId,
        vendorName: summary.vendorName,
        currency: total.currency,
        amountMinor: total.amountMinor,
      });
    }
  }

  return {
    asOf: input.asOf,
    timezone: input.timezone,
    explanations: FINANCE_EXPLANATIONS,
    filters: {
      currency: filters.currency ?? null,
      vendorId: filters.vendorId ?? null,
      statusGroup: filters.statusGroup ?? "all",
      contractId: filters.contractId ?? null,
    },
    statedByCurrency: groupByCurrency(statedRows),
    committedByCurrency: groupByCurrency(committedRows),
    pipelineByCurrency: groupByCurrency(pipelineRows),
    importedByCurrency: groupByCurrency(
      visibleTransactions.map((row) => ({ currency: row.currency, amountMinor: row.amountMinor })),
    ),
    verifiedSavingsByCurrency: verifiedSavingsTotals(recordedEstimates),
    estimatedOpportunitiesByCurrency: estimatedSavingsTotals(
      recordedEstimates,
      derivedOpportunities,
    ),
    gaps,
    forecasts: forecasts.sort((left, right) => left.expiresOn.localeCompare(right.expiresOn)),
    derivedOpportunities,
    vendorSummaries,
    charts: { committedByVendor, importedByVendor },
  };
}
