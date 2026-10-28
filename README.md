# AccordIQ

> Every contract. Every commitment. Under control.

AI-powered contract lifecycle management. This repository is a pnpm monorepo.

## Status

- Phase 1 (foundation): monorepo tooling, health endpoint.
- Phase 2 (brand and design system): logo, tokens, accessible components. Browse `/design-system`.
- Phase 3 (application shell): collapsible sidebar, top bar, search, notifications, quick-create,
  account menu, organization switcher, Overview empty states, and routes for every workspace section.
- Phase 4 (authentication and access control): Better Auth sessions, password reset, organization
  membership, centralized RBAC, tenant isolation from the session.
- Phase 5 (database and backend foundation): versioned Drizzle migrations, CLM entities, tenant-scoped
  data access, request validation, centralized errors, pagination, and protected APIs.
- Phase 6 (contract repository and secure upload): private local storage, PDF/DOCX validation,
  processing states, searchable contract table, versions, authorized download, duplicate detection.
- Phase 7 (AI contract intelligence): server-side provider adapter, schema-validated extraction,
  grounded citations, Q&A, version compare, and human verification. Default provider is `none`.
- Phase 8 (contract risk engine and clause library): deterministic rule evaluation, configurable
  **proposed-default** thresholds (not an official rating), historical assessments, authorized
  finding review, and versioned approved clauses.
- Phase 9 (approval workflows): sequential and parallel stages, conditions, decide/reject/request
  changes, delegation, due dates, and an audit trail. The server — not the UI — decides who can act.
- Phase 10 (e-signature): server-side adapter (`none` / `sandbox` / `dropbox_sign`), approval
  gating, signing order, authenticated webhooks, and executed-file retrieval. The UI cannot mark a
  contract signed.
- Phase 11 (obligations and renewals): timezone-aware due dates, recurring commitments, list and
  calendar views, notice-period watches, and renewal decisions that apply only after an approved
  workflow. The sweep never renews or terminates a contract.
- Phase 12 (financial intelligence): contract-stated values, committed spend, imported transactions,
  payment milestones, escalation forecasts, and savings opportunities. Currencies are never mixed.
  Estimated opportunities are labeled and are not verified savings.
- Phase 13 (AI contract assistant): authorized research on `/studio`, grounded citations, playbook
  drafts that require confirmation, and evaluation for isolation, injection, and unsupported answers.
  Generated language is not legally validated.
- Phase 14 (notifications and integrations): in-app and email delivery with retries, approval /
  signing / obligation / renewal / escalation kinds, and a modular integration catalog. CRM and ERP
  never show as connected. API keys stay server-side.
- Phase 15 (QA, security, and deployment readiness): production-safe INTERNAL logs, fail-closed
  production config (SQLite, local disk, S3, and PostgreSQL URLs), Playwright coverage, and the
  deployment runbook. This revision is **not production-hostable** until Postgres and object
  storage are wired. See `docs/deployment.md`.

Overview metrics stay empty unless `NEXT_PUBLIC_DEMO_DATA=true` is set in development. See
`docs/adr/0001-modular-monolith.md`, `docs/adr/0002-authentication-and-tenancy.md`,
`docs/adr/0003-database-and-clm-foundation.md`, `docs/adr/0004-contract-repository-storage.md`,
`docs/adr/0005-ai-contract-intelligence.md`, `docs/adr/0006-risk-engine-and-clause-library.md`,
`docs/adr/0007-approval-workflows.md`, `docs/adr/0008-esignature.md`,
`docs/adr/0009-obligations-and-renewals.md`, `docs/adr/0010-financial-intelligence.md`,
`docs/adr/0011-ai-contract-assistant.md`, `docs/adr/0012-notifications-and-integrations.md`,
and `docs/adr/0013-qa-security-deployment.md`.

## Requirements

- Node.js 20.9 or newer (see `.nvmrc`)
- pnpm 10 (`corepack enable` or `npm i -g pnpm`)

Better Auth is pinned to 1.4.21. 1.7 pulls Kysely 0.29, which requires Node 22.

No Docker or Postgres is required for local development. SQLite (libSQL) holds identity, membership
and sample contract rows. PostgreSQL remains the production target — do not store real customer
contracts in the local SQLite file. Drizzle stays the ORM; Prisma is not used.

## Database

Local default: `DATABASE_URL=file:.data/accordiq.sqlite` (see `.env.example`).

```powershell
pnpm db:migrate   # apply pending SQL in packages/db/drizzle, never drops data
pnpm db:seed      # identity accounts, then additive CLM sample rows
pnpm db:setup     # migrate + seed
```

Migrations are recorded in `schema_migration`. Re-running migrate is safe. An existing Phase 4
database is recognized (user table present) so `0001_identity` is not replayed; `0002_contract_foundation`
is applied on top, then `0003_contract_repository`, then `0004_ai_intelligence`, then
`0005_risk_and_clauses`, then `0006_approval_workflows`, then `0007_esignature`, then
`0008_obligations_renewals`, then `0009_financial_intelligence`, then `0010_ai_assistant`, then
`0011_notifications_integrations`. Never delete
`.data/accordiq.sqlite` to “fix” a migration. Uploaded files live under `.data/uploads`
(gitignored). `STORAGE_DRIVER=s3` is not wired in this environment.

Seed is refused when `NODE_ENV=production`. Development auto-seeds on first app boot if the user
table is empty, then fills missing CLM rows without deleting anything.

List APIs share `limit` (1–100, default 20), `offset`, and optional `q`. Tenant scope is the session
organization; `organizationId` in a URL or body is ignored. Cross-organization ids return 404.

Protected CLM routes (all require a session and RBAC):

| Method     | Path                                       | Notes                                                              |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------ |
| GET, POST  | `/api/vendors`                             | `contracts:read` / `contracts:write`                               |
| GET        | `/api/vendors/:id`                         | 404 if another organization                                        |
| GET, POST  | `/api/contracts`                           | optional `status`, `category`, `vendorId`, dates, `q`              |
| GET, PATCH | `/api/contracts/:id`                       | includes versions, documents, relations                            |
| POST       | `/api/contracts/:id/versions`              |                                                                    |
| GET, POST  | `/api/contracts/:id/parties`               |                                                                    |
| GET, POST  | `/api/contracts/:id/documents`             | multipart upload; `Idempotency-Key`                                |
| GET, POST  | `/api/contracts/:id/relations`             | related agreements                                                 |
| DELETE     | `/api/contracts/:id/relations/:rid`        |                                                                    |
| GET        | `/api/documents/:id/file`                  | authorized bytes; no storage URLs                                  |
| POST       | `/api/documents/:id/retry`                 | reprocess a FAILED document                                        |
| GET, POST  | `/api/contracts/:id/risk-assessments`      | POST runs the engine; client scores are ignored                    |
| GET        | `/api/risk-assessments/:id`                | assessment plus findings                                           |
| PATCH      | `/api/risk-findings/:id`                   | `risk:review`; resolve or dismiss with a note                      |
| GET, PATCH | `/api/risk-policy`                         | proposed-default thresholds; contradictory values 422              |
| GET, POST  | `/api/risk-rules`                          | unique per organization `code`                                     |
| GET, PATCH | `/api/risk-rules/:id`                      | material edits bump version and mark assessments stale             |
| GET, POST  | `/api/clauses`                             | `contracts:read` / `clauses:manage`                                |
| GET, PATCH | `/api/clauses/:id`                         | versions, alternatives, usage                                      |
| POST       | `/api/clauses/:id/versions`                | new draft body; approved text is not edited in place               |
| POST       | `/api/clauses/:id/approve`                 | authorized users only                                              |
| POST       | `/api/clauses/:id/deprecate`               |                                                                    |
| POST       | `/api/clauses/:id/alternatives`            |                                                                    |
| POST       | `/api/clauses/:id/usages`                  | link a contract                                                    |
| POST       | `/api/contracts/:id/approvals`             | start from a workflow template; `Idempotency-Key`                  |
| GET, POST  | `/api/obligations`                         | optional `contractId`, `status`, `ownerUserId`, `priority`         |
| GET, PATCH | `/api/obligations/:id`                     | events; owner may complete without `contracts:write`               |
| POST       | `/api/obligations/:id/complete`            | optional evidence document and note; recurring spawns next due     |
| POST       | `/api/obligations/:id/assign`              | owner must be an organization member                               |
| POST       | `/api/obligations/:id/cancel`              | `contracts:write`                                                  |
| GET        | `/api/obligations/calendar`                | optional `from` / `to` (YYYY-MM-DD) in the organization timezone   |
| GET        | `/api/renewals`                            | upcoming expiry watches; optional `status`                         |
| GET        | `/api/contracts/:id/renewal`               | notice, terminate-by, decision, events                             |
| POST       | `/api/contracts/:id/renewal/decision`      | `RENEW` or `TERMINATE`; does not change contract status            |
| POST       | `/api/contracts/:id/renewal/approval`      | start a workflow after the decision                                |
| POST       | `/api/contracts/:id/renewal/apply`         | requires an approved workflow created after the decision           |
| POST       | `/api/monitoring/sync`                     | overdue flags and de-duplicated reminders; never auto-renews       |
| GET, PATCH | `/api/organization`                        | IANA timezone; `settings:manage` to change                         |
| GET, POST  | `/api/workflows`                           | `contracts:read` / `workflows:manage`                              |
| GET        | `/api/approvals`                           | optional `contractId`, `status`                                    |
| GET        | `/api/approvals/:id`                       | stages, comments, events; `canAct` is server-computed              |
| POST       | `/api/approvals/:id/decision`              | `approvals:act`; prereqs, role, stale checks                       |
| POST       | `/api/approvals/:id/comments`              | reviewer comment                                                   |
| POST       | `/api/approvals/:id/resubmit`              | after reject-to-review is a new start; this reopens changes/stale  |
| POST       | `/api/approvals/:id/stages/:sid/delegate`  | one hop; required role or org admin                                |
| GET        | `/api/approvals/:id/stages/:sid/reviewers` | eligible delegatees                                                |
| GET        | `/api/notifications`                       | current user only                                                  |
| PATCH      | `/api/notifications/:id`                   | mark read                                                          |
| GET        | `/api/audit`                               | `audit:read`                                                       |
| GET        | `/api/ai/status`                           | provider, availability, setup steps                                |
| GET        | `/api/contracts/:id/intelligence`          | latest run, suggestions, Q&A, comparisons                          |
| POST       | `/api/contracts/:id/extractions`           | `contracts:write`; records UNAVAILABLE if disconnected             |
| POST       | `/api/extractions/:id/fields/:fieldId`     | verify, correct or reject a suggestion                             |
| POST       | `/api/extractions/:id/apply`               | copy VERIFIED/CORRECTED fields onto the contract                   |
| POST       | `/api/contracts/:id/questions`             | `contracts:read`; unsupported answers are refused                  |
| POST       | `/api/contracts/:id/comparisons`           | `contracts:write`; two documents                                   |
| POST       | `/api/assistant`                           | send a Studio message; `contracts:read`; tenant from session       |
| GET        | `/api/assistant/threads`                   | current user's threads in the active organization                  |
| GET        | `/api/assistant/threads/:id`               | messages, citations, proposals                                     |
| POST       | `/api/assistant/proposals/:id/confirm`     | `contracts:write`; creates a DRAFT contract from approved playbook |
| POST       | `/api/assistant/proposals/:id/reject`      | `contracts:write`                                                  |

## Run locally

```powershell
pnpm install
pnpm dev          # http://localhost:3000
```

The first request applies pending migrations and seeds development accounts plus sample CLM rows
if they are missing. You can also run that explicitly:

```powershell
pnpm db:setup
```

Optional: copy `.env.example` to `.env.local` (or `apps/web/.env.local`) to override defaults.
Never commit real secrets.

### Development accounts

Default password: `Dev-only-passw0rd!` (override with `AUTH_SEED_PASSWORD`). These exist only
outside production.

| Email                         | Role               | Organization   |
| ----------------------------- | ------------------ | -------------- |
| superadmin@accordiq.example   | SUPERADMIN         | any (switcher) |
| admin@northwind.example       | ORGANIZATION_ADMIN | Northwind      |
| legal@northwind.example       | LEGAL              | Northwind      |
| finance@northwind.example     | FINANCE            | Northwind      |
| procurement@northwind.example | PROCUREMENT        | Northwind      |
| manager@northwind.example     | DEPARTMENT_MANAGER | Northwind      |
| viewer@northwind.example      | VIEWER             | Northwind      |
| admin@contoso.example         | ORGANIZATION_ADMIN | Contoso        |
| viewer@contoso.example        | VIEWER             | Contoso        |

Self-serve sign-up at `/signup` creates a **new** organization. It cannot join Northwind,
Contoso, or another existing tenant. Inviting people into an existing workspace is still
seed-only. Better Auth’s public `/api/auth/sign-up/email` endpoint stays closed.

### Password reset (local)

`EMAIL_DRIVER=console` (the development default) writes the reset URL to
`.data/mail-outbox.jsonl`. Open that file, copy the link, and set a new password. This is not
email delivery. Production must set:

```
NODE_ENV=production
AUTH_SECRET=<at least 32 characters, not the development placeholder>
EMAIL_DRIVER=resend
RESEND_API_KEY=<from Resend>
EMAIL_FROM=AccordIQ <noreply@your-domain.example>
DATABASE_URL=<postgres connection string when that driver is wired>
```

Until Resend is configured, production password reset and notification email are not live. The
console driver is test-only. Do not claim email is connected.

Approval reminders, signing updates, obligation reminders, renewal alerts, and escalations also
queue email when the user has that kind enabled (Settings → Notifications). Failed sends retry
with backoff, then mark `FAILED`.

### Integration webhooks (CRM / ERP placeholders)

No CRM or ERP adapter is wired. Organization admins may store an API key and webhook secret on
`/integrations`; that does **not** connect the provider. Inbound callbacks:

```
POST /api/webhooks/integrations/crm
POST /api/webhooks/integrations/erp
```

Headers:

- `X-AccordIQ-Organization` — organization slug (`northwind`, `contoso`)
- `X-AccordIQ-Timestamp` — unix seconds (300s window)
- `X-AccordIQ-Event-Id` — unique per event (retries of the same id are ignored)
- `X-AccordIQ-Signature` — `v1=<hex>` HMAC-SHA256 of `timestamp.eventId.rawBody` using the stored
  webhook secret

Revoke clears the ciphertext. The UI never receives API keys.

### AI provider

The default is `LLM_PROVIDER=none`. Studio and contract pages show a setup path. The assistant still
answers from authorized contract records, obligations, renewals, and approved playbook language. No extraction is
invented. To evaluate labeled samples locally:

```
LLM_PROVIDER=fixture
```

Fixture only analyzes documents that contain an `ACCORDIQ_FIXTURE:` marker. It is not a live
model and is refused when `NODE_ENV=production`.

To connect a live provider (server-side only):

```
LLM_PROVIDER=openai
LLM_API_KEY=<from the provider>
# optional: LLM_MODEL=gpt-4o-mini
# optional: LLM_TIMEOUT_MS=30000
```

`anthropic` is the other live option. The API key is never rendered in the UI. Application logs
record provider, model, status and source size — not contract text.

### E-signature provider

The default is `ESIGN_PROVIDER=none`. Integrations and contract pages show a setup path. No
contract is marked signed from the browser. For a local, explicitly test-only adapter:

```
ESIGN_PROVIDER=sandbox
ESIGN_WEBHOOK_SECRET=<at least 16 characters>
```

Sandbox does not email signers and is not a legally binding signature. It is refused when
`NODE_ENV=production`. Drive `signer.viewed`, `signer.signed`, `signer.declined`, and
`envelope.expired` through `POST /api/webhooks/esign` with:

- `X-AccordIQ-Timestamp` — unix seconds (must be within `ESIGN_WEBHOOK_TOLERANCE_SECONDS`)
- `X-AccordIQ-Event-Id` — unique per event (retries of the same id are ignored)
- `X-AccordIQ-Signature` — `v1=<hex>` HMAC-SHA256 of `timestamp.eventId.rawBody`

JSON body: `{ "providerEnvelopeId", "type", "signerEmail"? }`.

To connect Dropbox Sign (server-side only):

```
ESIGN_PROVIDER=dropbox_sign
ESIGN_API_KEY=<from Dropbox Sign>
ESIGN_WEBHOOK_SECRET=<used if you also send AccordIQ-signed test callbacks>
# keep true until you are ready for live requests
ESIGN_TEST_MODE=true
```

Point the Dropbox Sign callback URL at `POST /api/webhooks/esign`. AccordIQ verifies
SHA256(`event_time` + `event_type` + API key). The API key is never rendered in the UI. The
contract becomes `ACTIVE` only after the executed file and completion evidence are stored against
the approved version.

## Security model

- Sessions are httpOnly cookies (`accordiq.session_token`). The proxy only checks that a cookie
  exists; pages and APIs load the session and enforce policy.
- Tenant scope is `session.active_organization_id`. Handlers ignore `organizationId` in URLs and
  bodies. Cross-organization reads return 404.
- Permissions are defined in `packages/auth/src/policy.ts`. The UI may hide actions; every write
  still calls `assertCan` on the server. `risk:review`, `clauses:manage`, and `workflows:manage`
  are granted to LEGAL and ORGANIZATION_ADMIN (and SUPERADMIN). `signatures:send` is the same
  grant and is required to send or cancel a signature request. FINANCE has `approvals:act` so it
  can decide finance stages; it still cannot start a request or edit a workflow. The frontend
  `canAct` flag is informational — decide, resubmit, and delegate re-check prerequisites and role.
  `finance:read` can view Financial Intelligence and export contract-stated insights.
  `finance:write` is required to import transactions, verify savings, and export the transaction
  ledger. Contract-stated value remains on the contract row and still requires `contracts:write`.
- Contract files are stored privately. Downloads go through an authorized handler; storage keys
  are never returned in JSON. Uploaded bytes are validated as PDF or DOCX and are not treated as
  instructions. AI analysis and the Studio assistant run only after access control, wrap retrieved
  text as untrusted data, and keep suggestions separate from verified contract facts. The assistant
  cites source clauses when available, states when evidence is insufficient, and will not override
  permissions or skip draft confirmation. Generated legal language is not legally validated.
  Risk scores use deterministic rules and
  verified fields only; suggested AI values and `ai_explanation` never change the number. Thresholds
  shipped with the product are proposed defaults, not an official rating.

## Quality checks

```powershell
pnpm check        # format check + lint + typecheck + unit/integration tests
pnpm test:e2e     # Playwright (reuses localhost:3000 when already running)
pnpm build        # production compile (not a production runtime on SQLite)
```

Deployment, backup, rollback, and residual risks: `docs/deployment.md`.

## Layout

```
apps/web         Next.js app (UI + thin HTTP layer)
packages/ai      LLM adapters, schemas, grounding, assistant intent, labeled fixtures
packages/auth    Better Auth, RBAC policy, seed, tenant access
packages/clm     contract data access, validation, CLM seed
packages/esign   e-signature adapters, webhook verification
packages/integrations catalog, credential encryption, webhook HMAC, retry backoff
packages/storage private object storage adapters and upload validation
packages/core    config validation, errors, pagination, brand constants
packages/db      Drizzle schema, SQLite client, versioned migrations
packages/ui      design tokens, logo and accessible components
docs/adr         architecture decision records
docs/deployment.md  environment names, backup, rollback, residual risks
```
