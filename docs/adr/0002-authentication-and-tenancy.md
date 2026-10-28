# ADR 0002: Authentication, RBAC and tenant isolation

- Status: Accepted (Phase 4)
- Date: 2026-10-27

## Context

AccordIQ must authenticate people, keep sessions confidential, recover accounts, and isolate
every tenant-owned row by organization. A hidden button is not a security boundary.

Postgres remains the production database target. This environment has no local Postgres or Docker,
so development and tests use SQLite via libSQL against the same portable schema.

## Decision

- Better Auth issues httpOnly session cookies (`accordiq.session_token`). Self-serve sign-up
  (`POST /api/register`) creates a new organization and an ORGANIZATION_ADMIN membership. The
  Better Auth `/sign-up/email` endpoint stays disabled so an account cannot exist without a tenant.
  Joining an existing organization remains seed/invite-only.
- Password reset uses the configured mailer. Development writes the link to `.data/mail-outbox.jsonl`.
  Production requires Resend (`EMAIL_DRIVER=resend` plus `RESEND_API_KEY`).
- Organization membership is a first-class table. The active tenant is `session.active_organization_id`,
  set at login and switched only after a membership (or platform SUPERADMIN) check.
- Queries take `organization_id` from the session actor. Client-supplied ids in URLs or bodies are
  ignored. Cross-tenant reads return 404, not 403, so they do not confirm that a row exists.
- Permissions live in `packages/auth/src/policy.ts`. UI may hide actions using the server-computed
  permission list; every sensitive API calls `assertCan`.
- SUPERADMIN is a platform role on the user, not an organization membership role.

## Consequences

- SQLite is for local auth and tenancy proofs only. Do not store real customer contracts on it.
- Moving to Postgres is a driver and DDL change, not a tenancy-model change.
- Invites into an existing organization are still seed-only. New workspaces come from `/signup`.
