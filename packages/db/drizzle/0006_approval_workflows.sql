-- AccordIQ 0006: configurable approval workflows.
-- Additive only. Never DROP tables or existing columns.
-- Existing sequential templates are backfilled so step = position (not parallel).

ALTER TABLE contract ADD COLUMN department TEXT;

ALTER TABLE approval_stage_template ADD COLUMN step INTEGER NOT NULL DEFAULT 1;
ALTER TABLE approval_stage_template ADD COLUMN condition_json TEXT;
ALTER TABLE approval_stage_template ADD COLUMN due_in_days INTEGER;
ALTER TABLE approval_stage_template ADD COLUMN reminder_hours_before INTEGER;
ALTER TABLE approval_stage_template ADD COLUMN escalate_to_role TEXT;
ALTER TABLE approval_stage_template ADD COLUMN allow_delegate INTEGER NOT NULL DEFAULT 1;

ALTER TABLE approval_stage ADD COLUMN step INTEGER NOT NULL DEFAULT 1;
ALTER TABLE approval_stage ADD COLUMN condition_json TEXT;
ALTER TABLE approval_stage ADD COLUMN due_at INTEGER;
ALTER TABLE approval_stage ADD COLUMN due_in_days INTEGER;
ALTER TABLE approval_stage ADD COLUMN reminder_hours_before INTEGER;
ALTER TABLE approval_stage ADD COLUMN reminder_sent_at INTEGER;
ALTER TABLE approval_stage ADD COLUMN escalate_to_role TEXT;
ALTER TABLE approval_stage ADD COLUMN escalated_at INTEGER;
ALTER TABLE approval_stage ADD COLUMN delegated_to_user_id TEXT REFERENCES user(id) ON DELETE SET NULL;
ALTER TABLE approval_stage ADD COLUMN delegated_by_user_id TEXT REFERENCES user(id) ON DELETE SET NULL;
ALTER TABLE approval_stage ADD COLUMN delegated_at INTEGER;
ALTER TABLE approval_stage ADD COLUMN skipped_reason TEXT;
ALTER TABLE approval_stage ADD COLUMN allow_delegate INTEGER NOT NULL DEFAULT 1;

ALTER TABLE approval_request ADD COLUMN snapshot_json TEXT;
ALTER TABLE approval_request ADD COLUMN stale INTEGER NOT NULL DEFAULT 0;
ALTER TABLE approval_request ADD COLUMN invalidated_reason TEXT;
ALTER TABLE approval_request ADD COLUMN resubmit_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE approval_request ADD COLUMN idempotency_key TEXT;

UPDATE approval_stage_template SET step = position WHERE step = 1;
UPDATE approval_stage SET step = position WHERE step = 1;

CREATE UNIQUE INDEX approval_request_org_idempotency_idx
  ON approval_request(organization_id, idempotency_key);

CREATE TABLE approval_comment (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL REFERENCES approval_request(id) ON DELETE CASCADE,
  stage_id TEXT REFERENCES approval_stage(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX approval_comment_request_idx ON approval_comment(organization_id, request_id);

CREATE TABLE approval_event (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL REFERENCES approval_request(id) ON DELETE CASCADE,
  stage_id TEXT REFERENCES approval_stage(id) ON DELETE SET NULL,
  actor_user_id TEXT NOT NULL REFERENCES user(id),
  action TEXT NOT NULL,
  payload_json TEXT,
  idempotency_key TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX approval_event_request_idx ON approval_event(organization_id, request_id);
CREATE UNIQUE INDEX approval_event_idempotency_idx ON approval_event(request_id, idempotency_key);
