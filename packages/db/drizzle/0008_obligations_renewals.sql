-- AccordIQ 0008: obligation monitoring, renewal watches, and reminder receipts.
-- Additive only. Never DROP tables or existing columns.
-- Sweep/reminders never renew or terminate a contract.

ALTER TABLE organization ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';

ALTER TABLE contract ADD COLUMN notice_days INTEGER;
ALTER TABLE contract ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 0;

ALTER TABLE obligation ADD COLUMN clause_usage_id TEXT REFERENCES clause_usage(id) ON DELETE SET NULL;
ALTER TABLE obligation ADD COLUMN source_quote TEXT;
ALTER TABLE obligation ADD COLUMN frequency TEXT NOT NULL DEFAULT 'ONCE';
ALTER TABLE obligation ADD COLUMN interval_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE obligation ADD COLUMN priority TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE obligation ADD COLUMN completed_at INTEGER;
ALTER TABLE obligation ADD COLUMN completed_by_user_id TEXT REFERENCES user(id) ON DELETE SET NULL;
ALTER TABLE obligation ADD COLUMN completion_note TEXT;
ALTER TABLE obligation ADD COLUMN evidence_document_id TEXT REFERENCES document(id) ON DELETE SET NULL;
ALTER TABLE obligation ADD COLUMN reminder_days_before INTEGER NOT NULL DEFAULT 7;
ALTER TABLE obligation ADD COLUMN escalate_days_after INTEGER NOT NULL DEFAULT 1;
ALTER TABLE obligation ADD COLUMN parent_obligation_id TEXT REFERENCES obligation(id) ON DELETE SET NULL;
ALTER TABLE obligation ADD COLUMN occurrence_index INTEGER NOT NULL DEFAULT 1;
ALTER TABLE obligation ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE obligation ADD COLUMN last_reminded_on TEXT;
ALTER TABLE obligation ADD COLUMN last_escalated_on TEXT;

CREATE TABLE obligation_event (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  obligation_id TEXT NOT NULL REFERENCES obligation(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  due_on TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX obligation_event_obligation_idx
  ON obligation_event(organization_id, obligation_id);

CREATE TABLE renewal_watch (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  expires_on TEXT NOT NULL,
  notice_days INTEGER NOT NULL,
  notice_on TEXT NOT NULL,
  terminate_by TEXT NOT NULL,
  auto_renew INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  decision TEXT,
  decision_note TEXT,
  decided_at INTEGER,
  decided_by_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  owner_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  approval_request_id TEXT REFERENCES approval_request(id) ON DELETE SET NULL,
  proposed_expires_on TEXT,
  reminder_days_before INTEGER NOT NULL DEFAULT 30,
  escalate_days_after INTEGER NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  last_reminded_on TEXT,
  last_escalated_on TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX renewal_watch_contract_idx ON renewal_watch(organization_id, contract_id);
CREATE INDEX renewal_watch_org_notice_idx ON renewal_watch(organization_id, notice_on);

CREATE TABLE renewal_event (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  watch_id TEXT NOT NULL REFERENCES renewal_watch(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX renewal_event_watch_idx ON renewal_event(organization_id, watch_id);

CREATE TABLE reminder_receipt (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  for_date TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX reminder_receipt_dedupe_idx
  ON reminder_receipt(organization_id, entity_type, entity_id, kind, for_date);
