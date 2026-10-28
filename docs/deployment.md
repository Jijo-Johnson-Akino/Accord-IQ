# AccordIQ deployment

This release is a **development and staging candidate**, not a production-hosted CLM. Runtime
`NODE_ENV=production` refuses SQLite, local disk storage, the console mailer, the fixture LLM, the
sandbox e-sign adapter, and the development `AUTH_SECRET`. PostgreSQL and S3 are the documented
targets and are **not wired**. Do not store customer contracts in `.data/`.

Placeholders below are names only. Never commit real secret values.

## Environment variables

Copy `.env.example` to `.env.local` (or `apps/web/.env.local`). `loadConfig` fails fast with the
**variable name**, never the value.

| Variable                          | Required                | Notes                                                                                                                                    |
| --------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                        | yes                     | `development` locally. `production` is fail-closed until Postgres and object storage ship.                                               |
| `APP_URL`                         | yes                     | Public origin. Must match the browser origin (trusted Better Auth origin and CSRF check).                                                |
| `DATABASE_URL`                    | yes                     | Local: `file:.data/accordiq.sqlite`. `postgres://` and `postgresql://` are refused. Production refuses `file:` and `:memory:`.           |
| `AUTH_SECRET`                     | production              | ≥ 32 characters. Also used to wrap organization CRM/ERP credentials (AES-256-GCM). The development placeholder is refused in production. |
| `EMAIL_DRIVER`                    | yes                     | `console` (test-only, writes `.data/mail-outbox.jsonl`) or `resend`. Production refuses `console`.                                       |
| `EMAIL_FROM`                      | yes                     | From-address shown on transactional mail.                                                                                                |
| `RESEND_API_KEY`                  | when Resend             | Server-side only.                                                                                                                        |
| `AUTH_SEED_PASSWORD`              | optional                | Development seed only. Seed is refused in production.                                                                                    |
| `STORAGE_DRIVER`                  | yes                     | `local` (dev files under `STORAGE_LOCAL_DIR`). `s3` is refused; the adapter is not wired. Production refuses `local`.                    |
| `STORAGE_LOCAL_DIR`               | local storage           | Default `.data/uploads`. Gitignored. Directory must not be web-served.                                                                   |
| `LLM_PROVIDER`                    | yes                     | Default `none`. `fixture` is test-only and refused in production. `openai` / `anthropic` need `LLM_API_KEY`.                             |
| `LLM_API_KEY`                     | live LLM                | Server-side only. Never `NEXT_PUBLIC_*`.                                                                                                 |
| `LLM_MODEL`                       | optional                | Provider model id.                                                                                                                       |
| `LLM_TIMEOUT_MS`                  | optional                | 1000–120000, default 30000.                                                                                                              |
| `ESIGN_PROVIDER`                  | yes                     | Default `none`. `sandbox` is test-only and refused in production. `dropbox_sign` needs `ESIGN_API_KEY`.                                  |
| `ESIGN_API_KEY`                   | Dropbox Sign            | Server-side only.                                                                                                                        |
| `ESIGN_WEBHOOK_SECRET`            | sandbox or Dropbox Sign | ≥ 16 characters.                                                                                                                         |
| `ESIGN_WEBHOOK_TOLERANCE_SECONDS` | optional                | Default 300.                                                                                                                             |
| `ESIGN_TEST_MODE`                 | Dropbox Sign            | Keep `true` until live requests are intended.                                                                                            |
| `NEXT_PUBLIC_DEMO_DATA`           | optional                | Synthetic Overview figures. Ignored in production.                                                                                       |

No `NEXT_PUBLIC_` variable may hold an API key, webhook secret, or `AUTH_SECRET`.

## Remaining external provider credentials

Operators still need to provision (when those adapters are wired and enabled):

- Resend API key (`EMAIL_DRIVER=resend`)
- OpenAI or Anthropic API key (`LLM_PROVIDER=openai` or `anthropic`)
- Dropbox Sign API key and webhook secret (`ESIGN_PROVIDER=dropbox_sign`)
- Organization-stored CRM/ERP keys on `/integrations` — stored encrypted, **not connected**
- A future PostgreSQL URL and S3 (or equivalent) credentials — **not accepted in this release**

## Database migrations and backup

Migrations live in `packages/db/drizzle` (`0001_identity` … `0011_notifications_integrations`).
`pnpm db:migrate` applies pending files in order, records ids in `schema_migration`, and **never
DROPs** tables or data. Re-running migrate is safe. Never delete `.data/accordiq.sqlite` to “fix”
a migration.

**Backup (local SQLite)**

1. Stop writers (`pnpm` / Next.js) or accept a fuzzy copy.
2. Copy `.data/accordiq.sqlite` (and `-wal` / `-shm` if present) to an offline location.
3. Copy `.data/uploads` with the same timestamp; storage keys in the database point at those files.

**Restore**

1. Stop the app.
2. Replace the sqlite file (and WAL/SHM) and the uploads directory from the same backup set.
3. Start the app. Do not replay migrations that are already in `schema_migration`.

**Rollback**

There is no automated down-migration. Roll back application code to the previous git revision.
Schema is additive; a code rollback may leave unused columns/tables in place, which is expected.
Do not DROP those objects on a database that still holds tenant data.

When PostgreSQL is wired, use the provider’s point-in-time backup and test restore on a copy
before any production cutover. This release cannot run that cutover.

## File-storage permissions

- `STORAGE_DRIVER=local` writes under `STORAGE_LOCAL_DIR`. The process user needs create/read/delete
  on that tree only. Do not put the directory in `public/` or behind a static file server.
- Object keys are `{organizationId}/{documentId}/{safeFileName}`. Path traversal is rejected.
- Downloads go through `GET /api/documents/:id/file` after session + RBAC. JSON never includes
  storage keys or public object URLs.
- Uploaded bytes are untrusted. Magic-byte checks allow PDF and DOCX only.
- `STORAGE_DRIVER=s3` throws at configuration time until an adapter exists.

## Logging and errors

- `toErrorPayload` maps unexpected errors to `{ error: "Something went wrong.", code: "INTERNAL" }`.
  Clients never receive stacks.
- `logInternalError` prints a truncated, token-redacted `name: message` line. Do not pass document
  text, cookies, or API keys into logs. AI and integration paths already avoid logging contract
  bodies and ciphertext.
- `console` email is a local outbox file, not a live provider.

## Deploy steps (when hosting is actually possible)

Until Postgres and object storage ship, production boot is refused by design. For a **local or
internal preview**:

1. Node 20.9+ and pnpm 10.
2. Copy `.env.example` → `.env.local` and fill development values only.
3. `pnpm install`
4. `pnpm db:migrate` then `pnpm db:seed` if the identity tables are empty.
5. `pnpm check`
6. `pnpm --filter @accordiq/web test:e2e` against `http://localhost:3000`
7. `pnpm build` (compile placeholders are allowed; this is not a production runtime)
8. `pnpm dev` for interactive use. Do not run `pnpm start` with `NODE_ENV=production` on SQLite.

**Application rollback:** redeploy the previous git revision. Keep the database and upload backup
from before the release. Additive schema from a newer build can remain.

**CI:** `.github/workflows/ci.yml` runs format, lint, typecheck, unit tests, production compile,
and Playwright Chromium against a seeded SQLite file.

## Known limitations (do not treat as complete)

- PostgreSQL client and S3 adapter are not implemented.
- No rate limiting, bot protection, or IP allowlists on auth or upload.
- `assertSameOrigin` allows a missing `Origin` header (non-browser clients). CSRF residual is
  SameSite=Lax cookies.
- `apps/web/proxy.ts` only checks that a session cookie exists; it is not the authorization
  boundary. Handlers load the session and call `assertCan`.
- Better Auth adapter is SQLite-only (`drizzleAdapter` `provider: "sqlite"`).
- No Content-Security-Policy yet. HSTS is set; it is ignored on `localhost`.
- Seed accounts are development-only. Public signup is disabled.
- CRM/ERP, `/reports`, and `/vendors` remain unimplemented. Overview stays empty unless
  `NEXT_PUBLIC_DEMO_DATA=true` in development.
- E-sign sandbox and Dropbox Sign test mode are not legally binding signatures.
- Generated assistant language is not legally validated.
- Using `AUTH_SECRET` both for session signing and credential wrapping couples rotation of those
  concerns; a dedicated data key is not split out yet.
- No automated backup job ships with this repository.
