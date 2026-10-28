# ADR 0013: Final QA, security logging, and deployment posture

- Status: Accepted (Phase 15)
- Date: 2026-10-28

## Context

Phases 1–14 shipped CLM features against SQLite, local disk, and test-only adapters. Production
hosting was documented as a target (PostgreSQL, S3, live email/LLM/e-sign) but those drivers are
not implemented. INTERNAL HTTP errors still printed the raw `Error` object. There was no
Playwright suite and no single deployment runbook.

## Decision

- Keep the modular monolith. Do not rewrite the application for this phase.
- Sanitize INTERNAL process logs (`logInternalError`). Never echo secret values from `loadConfig`.
- Fail closed in production runtime: refuse SQLite `file:` URLs, local disk storage, console email,
  fixture LLM, sandbox e-sign, and the development `AUTH_SECRET`. Refuse PostgreSQL URLs and S3
  until those adapters exist. `next build` may still compile with placeholders.
- Add HSTS and transpile `@accordiq/esign` and `@accordiq/integrations`. Defer a full CSP.
- Session cookies stay httpOnly, SameSite=Lax, Secure in production.
- Playwright covers unauthenticated redirect, seed login, integrations honesty, settings
  preferences, tenant isolation over HTTP, finance export ACL, and a mobile login viewport.
  Vitest remains the unit/integration suite; `pnpm check` does not start a browser.
- Document environment names, backup/restore, rollback, file-storage permissions, and remaining
  provider credentials in `docs/deployment.md` without real secret values.

## Consequences

- This git revision is **not production-hostable**. That is intentional, not an oversight.
- Operators follow `docs/deployment.md`. Additive migrations stay the only schema path; there is
  no down-migration.
- Known residual risks (missing Origin CSRF, no rate limits, no CSP, SQLite/S3 gap) are listed in
  the deployment doc and the Phase 15 readiness report rather than papered over.
