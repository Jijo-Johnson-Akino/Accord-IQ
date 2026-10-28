-- AccordIQ 0010: AI contract assistant threads, citations, tool logs, and draft proposals.
-- Additive only. Never DROP tables or existing columns.
-- Tool logs store identifiers and counts — never document text or model completions.
-- Drafts stay PENDING_CONFIRMATION until an authorized user confirms.

CREATE TABLE assistant_thread (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX assistant_thread_user_idx
  ON assistant_thread(organization_id, created_by_user_id, updated_at);

CREATE TABLE assistant_message (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES assistant_thread(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  intent TEXT,
  status TEXT NOT NULL,
  insufficient_evidence INTEGER NOT NULL DEFAULT 0,
  disclaimer TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX assistant_message_thread_idx
  ON assistant_message(organization_id, thread_id, created_at);

CREATE TABLE assistant_citation (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES assistant_message(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL,
  quote TEXT,
  page INTEGER,
  contract_id TEXT REFERENCES contract(id) ON DELETE SET NULL,
  document_id TEXT REFERENCES document(id) ON DELETE SET NULL,
  clause_template_id TEXT REFERENCES clause_template(id) ON DELETE SET NULL,
  obligation_id TEXT REFERENCES obligation(id) ON DELETE SET NULL,
  href TEXT
);
CREATE INDEX assistant_citation_message_idx
  ON assistant_citation(organization_id, message_id);

CREATE TABLE assistant_tool_call (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES assistant_thread(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES assistant_message(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  input_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX assistant_tool_call_thread_idx
  ON assistant_tool_call(organization_id, thread_id, created_at);

CREATE TABLE assistant_proposal (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES assistant_thread(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES assistant_message(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  template_ids_json TEXT NOT NULL,
  created_contract_id TEXT REFERENCES contract(id) ON DELETE SET NULL,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  confirmed_by_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE INDEX assistant_proposal_thread_idx
  ON assistant_proposal(organization_id, thread_id);
