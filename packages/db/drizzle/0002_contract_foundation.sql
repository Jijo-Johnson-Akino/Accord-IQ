-- AccordIQ 0002: contract lifecycle foundation. Additive only. Never DROP existing tables.

ALTER TABLE audit_event ADD COLUMN entity_type TEXT;
ALTER TABLE audit_event ADD COLUMN entity_id TEXT;
ALTER TABLE audit_event ADD COLUMN metadata TEXT;
CREATE INDEX IF NOT EXISTS audit_event_entity_idx ON audit_event(organization_id, entity_type, entity_id);

CREATE TABLE vendor (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  status TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX vendor_org_name_idx ON vendor(organization_id, name);
CREATE INDEX vendor_org_idx ON vendor(organization_id);

CREATE TABLE contract (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  vendor_id TEXT REFERENCES vendor(id) ON DELETE SET NULL,
  owner_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  current_version_id TEXT,
  effective_on TEXT,
  expires_on TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX contract_org_idx ON contract(organization_id);
CREATE INDEX contract_org_status_idx ON contract(organization_id, status);
CREATE INDEX contract_vendor_idx ON contract(vendor_id);

CREATE TABLE contract_version (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX contract_version_number_idx ON contract_version(contract_id, version_number);
CREATE INDEX contract_version_org_idx ON contract_version(organization_id, contract_id);

CREATE TABLE document (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  version_id TEXT REFERENCES contract_version(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  storage_key TEXT,
  status TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX document_contract_idx ON document(organization_id, contract_id);

CREATE TABLE contract_party (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  vendor_id TEXT REFERENCES vendor(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX contract_party_contract_idx ON contract_party(organization_id, contract_id);

CREATE TABLE risk_rule (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX risk_rule_org_code_idx ON risk_rule(organization_id, code);
CREATE INDEX risk_rule_org_idx ON risk_rule(organization_id);

CREATE TABLE risk_assessment (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  version_id TEXT REFERENCES contract_version(id) ON DELETE SET NULL,
  overall_severity TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX risk_assessment_contract_idx ON risk_assessment(organization_id, contract_id);

CREATE TABLE approval_workflow_template (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX approval_template_org_idx ON approval_workflow_template(organization_id);

CREATE TABLE approval_stage_template (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES approval_workflow_template(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  required_role TEXT NOT NULL
);
CREATE UNIQUE INDEX approval_stage_template_pos_idx ON approval_stage_template(template_id, position);

CREATE TABLE approval_request (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES approval_workflow_template(id),
  status TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX approval_request_org_idx ON approval_request(organization_id, contract_id);

CREATE TABLE approval_stage (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL REFERENCES approval_request(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  required_role TEXT NOT NULL,
  status TEXT NOT NULL,
  decided_by_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  decided_at INTEGER,
  comment TEXT
);
CREATE UNIQUE INDEX approval_stage_pos_idx ON approval_stage(request_id, position);

CREATE TABLE obligation (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_on TEXT,
  status TEXT NOT NULL,
  owner_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX obligation_org_idx ON obligation(organization_id);
CREATE INDEX obligation_contract_idx ON obligation(organization_id, contract_id);
CREATE INDEX obligation_due_idx ON obligation(organization_id, due_on);

CREATE TABLE notification (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX notification_user_idx ON notification(organization_id, user_id, status);
