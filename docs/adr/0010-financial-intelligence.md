# ADR 0010: Financial intelligence

- Status: Accepted (Phase 12)
- Date: 2026-10-28

## Context

Finance needs to see what contracts commit the organization to spend, what was imported from
invoices or payments, and what a renewal might cost. Mixing those numbers, summing across
currencies, or treating an AI estimate as booked savings would misstate the books.

## Decision

- Money is stored as integer minor units. Scale follows ISO 4217: JPY has 0 decimal digits; the
  other supported currencies have 2. Totals are grouped by currency and are never mixed.
- Contract-stated value lives on `contract.value_minor` / `contract.currency`. Committed spend is
  that value for statuses `APPROVED`, `PENDING_SIGNATURE`, `SIGNED`, and `ACTIVE`. Pipeline and
  closed statuses are excluded.
- Imported spend lives in `financial_transaction` and is never added to contract-stated or
  committed totals. Payment milestones record a schedule; `CONTRACT_STATED` and `IMPORTED` sources
  stay distinct.
- Price escalations are integer basis points. Renewal forecast is
  `round(value × (10_000 + bps) / 10_000)`. An `ESTIMATE` escalation labels the forecast as an
  estimate. `auto_renew` is a flag only.
- Savings opportunities start as `ESTIMATE`. Only `finance:write` can mark `VERIFIED`. Estimated
  rows are listed separately and are never included in verified savings.
- `finance:read` (every organization role) can view insights and export the contract-stated report.
  `finance:write` (FINANCE, ORGANIZATION_ADMIN, SUPERADMIN) is required to import transactions,
  verify savings, and export the transaction ledger. Contract-stated milestones and clause
  escalations require `contracts:write`.
- Missing value or currency, milestone mismatches, and extraction conflicts are gaps — they are
  excluded from totals rather than filled in.

## Consequences

- Additive migration `0009_financial_intelligence` adds `payment_milestone`,
  `financial_transaction`, `price_escalation`, and `savings_opportunity`. Existing databases are
  not dropped.
- Charts and metric cards render stored aggregations or an empty state. Overview metrics stay
  demo-gated. `/reports` remains unimplemented.
- Reports explain how each metric was calculated in the payload and on the Finance page.
