-- AccordIQ 0001: identity, membership, session tenancy, generic tenant rows, audit.
-- Additive baseline from Phase 4. Do not DROP tables.

CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  platform_role TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  active_organization_id TEXT
);
CREATE INDEX IF NOT EXISTS session_user_id_idx ON session(user_id);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_user_id_idx ON account(user_id);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS membership (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS membership_org_user_idx ON membership(organization_id, user_id);
CREATE INDEX IF NOT EXISTS membership_user_id_idx ON membership(user_id);

CREATE TABLE IF NOT EXISTS tenant_record (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tenant_record_org_idx ON tenant_record(organization_id);

CREATE TABLE IF NOT EXISTS audit_event (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organization(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_event_org_idx ON audit_event(organization_id);
