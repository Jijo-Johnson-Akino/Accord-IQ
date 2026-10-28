-- AccordIQ 0003: contract repository metadata, document processing, relations.
-- Additive only. Never DROP tables or existing columns.

ALTER TABLE contract ADD COLUMN category TEXT;
ALTER TABLE contract ADD COLUMN currency TEXT;
ALTER TABLE contract ADD COLUMN value_minor INTEGER;
CREATE INDEX IF NOT EXISTS contract_org_category_idx ON contract(organization_id, category);
CREATE INDEX IF NOT EXISTS contract_org_expires_idx ON contract(organization_id, expires_on);

ALTER TABLE document ADD COLUMN sha256 TEXT;
ALTER TABLE document ADD COLUMN processing_error TEXT;
ALTER TABLE document ADD COLUMN processed_at INTEGER;
ALTER TABLE document ADD COLUMN page_count INTEGER;
ALTER TABLE document ADD COLUMN idempotency_key TEXT;
ALTER TABLE document ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
UPDATE document SET updated_at = created_at WHERE updated_at = 0;
UPDATE document SET status = 'QUEUED' WHERE status = 'PENDING';
UPDATE document SET status = 'COMPLETED' WHERE status = 'AVAILABLE';
CREATE INDEX IF NOT EXISTS document_org_sha256_idx ON document(organization_id, sha256);
CREATE UNIQUE INDEX IF NOT EXISTS document_org_idempotency_idx ON document(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE contract_relation (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  from_contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  to_contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX contract_relation_pair_idx ON contract_relation(from_contract_id, to_contract_id, relation_type);
CREATE INDEX contract_relation_org_idx ON contract_relation(organization_id, from_contract_id);
CREATE INDEX contract_relation_to_idx ON contract_relation(organization_id, to_contract_id);
