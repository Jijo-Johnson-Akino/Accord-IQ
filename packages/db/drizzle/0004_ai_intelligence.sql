-- AccordIQ 0004: AI extraction runs, citations, Q&A and version comparison.
-- Additive only. Never DROP tables or existing columns.
-- Suggestions stay in these tables until a human verifies them onto contract/obligation rows.

CREATE TABLE extraction_run (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  version_id TEXT REFERENCES contract_version(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  error TEXT,
  conflict_json TEXT,
  source_char_count INTEGER NOT NULL DEFAULT 0,
  source_sha256 TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);
CREATE INDEX extraction_run_contract_idx ON extraction_run(organization_id, contract_id, created_at);

CREATE TABLE extracted_field (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES extraction_run(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  value_text TEXT,
  confidence INTEGER,
  citation_quote TEXT,
  citation_page INTEGER,
  verification TEXT NOT NULL,
  corrected_value TEXT,
  corrected_by_user_id TEXT REFERENCES user(id),
  corrected_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX extracted_field_run_idx ON extracted_field(run_id, field_key);

CREATE TABLE extracted_party (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES extraction_run(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  confidence INTEGER,
  citation_quote TEXT,
  citation_page INTEGER,
  verification TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX extracted_party_run_idx ON extracted_party(run_id);

CREATE TABLE extracted_clause (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES extraction_run(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  heading TEXT NOT NULL,
  summary TEXT NOT NULL,
  confidence INTEGER,
  citation_quote TEXT,
  citation_page INTEGER,
  verification TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX extracted_clause_run_idx ON extracted_clause(run_id);

CREATE TABLE extracted_obligation (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES extraction_run(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_on TEXT,
  confidence INTEGER,
  citation_quote TEXT,
  citation_page INTEGER,
  verification TEXT NOT NULL,
  promoted_obligation_id TEXT REFERENCES obligation(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX extracted_obligation_run_idx ON extracted_obligation(run_id);

CREATE TABLE contract_question (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT,
  supported INTEGER NOT NULL,
  refusal_reason TEXT,
  provider TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX contract_question_contract_idx ON contract_question(organization_id, contract_id, created_at);

CREATE TABLE question_citation (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES contract_question(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  page INTEGER
);
CREATE INDEX question_citation_question_idx ON question_citation(question_id);

CREATE TABLE version_comparison (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  left_document_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  right_document_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  summary TEXT,
  provider TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX version_comparison_contract_idx ON version_comparison(organization_id, contract_id, created_at);

CREATE TABLE comparison_change (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  comparison_id TEXT NOT NULL REFERENCES version_comparison(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  before_text TEXT,
  after_text TEXT,
  citation_a TEXT,
  citation_b TEXT
);
CREATE INDEX comparison_change_comparison_idx ON comparison_change(comparison_id);
