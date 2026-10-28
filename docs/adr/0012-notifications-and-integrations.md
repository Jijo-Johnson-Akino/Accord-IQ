# ADR 0012: Notifications and integrations

- Status: Accepted (Phase 14)
- Date: 2026-10-28

## Context

Reminders for approvals, signing, obligations, renewals, and escalations were in-app only. Email
existed for password reset. Integrations showed e-signature status and nothing else. A CRM or ERP
toggle that looked connected without an adapter would be a lie.

## Decision

- Dispatch in-app notifications and email deliveries from one helper. User preferences default to
  both channels. Email goes through the configured `Mailer` (`console` or `resend`).
- Console email is test-only. It writes `.data/mail-outbox.jsonl` and is never labeled connected.
  Production still refuses `EMAIL_DRIVER=console`.
- Failed sends retry with backoff and then mark `FAILED`. Delivery logs omit API keys.
- `@accordiq/integrations` owns the catalog, AES-256-GCM credential wrapping, HMAC webhooks, and
  retry math. CRM and ERP accept stored secrets so the connection record exists, but `connected`
  stays false until an adapter ships.
- Inbound integration webhooks are HMAC-authenticated, tenant-scoped by organization slug, and
  idempotent on `(organization, kind, provider, event id)`. Duplicate ids do not run again.
- Disconnect clears ciphertext. The UI never receives API keys. Environment-configured providers
  (email, e-sign, storage) are not stored on the organization row.

## Consequences

- Additive migration `0011_notifications_integrations` extends `notification` and adds
  preferences, deliveries, connections, webhook events, and runs. Existing databases are not dropped.
- `/integrations` stays in the existing 13-item navigation. Settings holds notification
  preferences. Reports and Vendors stay unimplemented.
- A stored CRM key is not a live integration. Setup copy says so.
