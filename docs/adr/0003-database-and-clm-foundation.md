# ADR 0003: Database foundation and contract data access

- Status: Accepted (Phase 5)
- Date: 2026-10-27

## Context

AccordIQ needs a durable model for organizations, membership, contracts, versions, documents,
parties, vendors, risk, approvals, obligations, notifications, and audit. Local development still
has no Docker or Postgres. Production remains PostgreSQL.

## Decision

- Keep Drizzle. Do not introduce a second ORM.
- SQLite via libSQL locally; the schema stays portable for a later Postgres driver.
- Versioned SQL in `packages/db/drizzle`, applied in order through `schema_migration`. Never drop
  an existing database to make a migration pass. A Phase 4 identity database is recognized and
  `0001_identity` is recorded as already applied, then `0002_contract_foundation` is added.
- Tenant scope is always `actor.organizationId` from the session. Client-supplied `organizationId`
  is stripped by validation and ignored by handlers. Cross-tenant reads return 404.
- Roles stay in `membership.role` plus `packages/auth/src/policy.ts`. There is no grant table.
- Domain writes live in `@accordiq/clm`. Auth must not import that package.
- Related writes (contract + first version, workflow + stages, approval + stages + contract status)
  run in a transaction and emit an audit row in the same transaction.
- List endpoints share `limit` (1–100, default 20), `offset`, and optional `q`.
- Document rows in this phase are metadata only (`status = PENDING`, `storage_key` null). File
  upload is a later phase.
- Development seed is additive and refused when `NODE_ENV=production`.

## Consequences

- Existing local SQLite files keep their identity rows; only new CLM tables are added.
- Moving to Postgres is a driver and DDL dialect change, not a tenancy-model change.
- Overview metrics are still empty unless `NEXT_PUBLIC_DEMO_DATA=true`. Contract counts are not
  wired to the dashboard in this phase.
