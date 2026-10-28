-- AccordIQ 0011: notification kinds, email deliveries, and integration connections.
-- Additive only. Never DROP tables or existing columns.
-- Credential ciphertext is server-side only. Do not treat a stored secret as a live connection.

ALTER TABLE notification ADD COLUMN kind TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE notification ADD COLUMN href TEXT;

CREATE TABLE notification_preference (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  in_app INTEGER NOT NULL DEFAULT 1,
  email INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX notification_preference_user_kind_idx
  ON notification_preference(organization_id, user_id, kind);

CREATE TABLE notification_delivery (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  notification_id TEXT REFERENCES notification(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  provider_message_id TEXT,
  next_retry_at INTEGER,
  sent_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX notification_delivery_retry_idx
  ON notification_delivery(organization_id, status, next_retry_at);

CREATE TABLE integration_connection (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  ciphertext TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE UNIQUE INDEX integration_connection_org_kind_idx
  ON integration_connection(organization_id, kind);

CREATE TABLE integration_webhook_event (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX integration_webhook_event_idem_idx
  ON integration_webhook_event(organization_id, kind, provider, provider_event_id);

CREATE TABLE integration_run (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  webhook_event_id TEXT REFERENCES integration_webhook_event(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX integration_run_org_idx
  ON integration_run(organization_id, created_at);
