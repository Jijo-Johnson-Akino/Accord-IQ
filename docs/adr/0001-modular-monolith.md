# ADR 0001: Modular monolith on Next.js, TypeScript and PostgreSQL

- Status: Accepted (Phase 1)
- Date: 2026-10-27

## Context

AccordIQ is a greenfield contract lifecycle platform with many domains (contracts, AI extraction,
clauses, workflows, e-signature, obligations, vendors, finance, audit) and strict requirements
for organization-level data isolation and auditability.

## Decision

- One deployable application (modular monolith) in a pnpm workspace. Domain logic lives in
  `packages/*`; `apps/web` is a thin delivery layer.
- TypeScript everywhere, Next.js App Router for UI and HTTP, PostgreSQL for data (introduced in
  the identity and tenancy phase), with every tenant-owned table carrying `organization_id`.
- All external systems (AI, storage, e-signature, email) sit behind interfaces so they can be
  swapped and mocked.
- AI proposes, humans confirm: AI outputs carry citations, confidence and model/prompt versions.

## Consequences

- Cheap to build and operate now; modules can be extracted into services later if needed.
- Module boundaries must be enforced by convention and lint rules, not by the network.
- A database and auth are deferred to a later phase; Phase 1 ships only the shell and tooling.
