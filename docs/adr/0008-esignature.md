# ADR 0008: Server-side e-signature adapter

- Status: Accepted (Phase 10)
- Date: 2026-10-28

## Context

Approved contract versions need a signing workflow with authorized signatories, routing order,
provider webhooks, and executed-file retrieval. A browser click, a drawn signature image, or a
manual status patch is not execution. Credentials must stay off the client.

## Decision

- `packages/esign` sits behind `EsignAdapter`, matching the AI provider pattern. `ESIGN_PROVIDER`
  is `none` (default), `sandbox` (test-only), or `dropbox_sign` (live). Sandbox is refused in
  production. Dropbox Sign requires `ESIGN_API_KEY` and `ESIGN_WEBHOOK_SECRET`.
- Only the current version of an `APPROVED` (or `PENDING_SIGNATURE`) contract may be sent, and only
  when a non-stale approval snapshot matches `currentVersionId`. Duplicate in-progress envelopes
  are rejected.
- Routing order is an integer. Equal numbers may sign in parallel. A later number cannot sign until
  every required signer with a lower number has signed. Out-of-turn webhooks return `CONFLICT` and
  stay unprocessed so a later retry can succeed.
- `POST /api/webhooks/esign` has no session. Sandbox events use HMAC-SHA256 over
  `timestamp.eventId.rawBody` with a skew window. Dropbox Sign events use the documented
  SHA256(`event_time` + `event_type` + api key) hash. Duplicate `(provider, event id)` rows are
  ignored. The contract is never marked signed from a frontend action.
- After every required signer completes, the adapter downloads the executed file and completion
  evidence, stores them as private documents on the approved version, then sets the contract
  `ACTIVE`. Decline, expiry, failure, and cancel return the contract to `APPROVED`. Sandbox files
  are labeled as not legally binding.
- `signatures:send` is granted to LEGAL and ORGANIZATION_ADMIN (and SUPERADMIN). Viewing history
  uses `contracts:read`.

## Consequences

- Additive migration `0007_esignature` adds `signature_envelope`, `signature_signer`, and
  `signature_event`. Existing databases are not dropped.
- Local development without Dropbox Sign credentials uses `ESIGN_PROVIDER=sandbox` plus
  `ESIGN_WEBHOOK_SECRET`. That path does not email signers. Drive viewed/signed/declined events
  through the webhook.
- `ESIGN_TEST_MODE` stays `true` until operators explicitly send live Dropbox Sign requests.
