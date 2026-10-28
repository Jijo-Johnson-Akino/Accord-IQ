-- AccordIQ 0005: deterministic risk findings, org policy, and clause library.
-- Additive only. Never DROP tables or existing columns.
-- Historical risk_assessment rows stay. New scoring columns default so old rows remain readable.

ALTER TABLE risk_rule ADD COLUMN category TEXT;
ALTER TABLE risk_rule ADD COLUMN predicate_json TEXT;
ALTER TABLE risk_rule ADD COLUMN weight INTEGER NOT NULL DEFAULT 10;
ALTER TABLE risk_rule ADD COLUMN remediation TEXT;
ALTER TABLE risk_rule ADD COLUMN explanation_template TEXT;
ALTER TABLE risk_rule ADD COLUMN version_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE risk_assessment ADD COLUMN assessment_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE risk_assessment ADD COLUMN score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE risk_assessment ADD COLUMN score_method TEXT NOT NULL DEFAULT 'SUM_WEIGHTS_CAPPED_100';
ALTER TABLE risk_assessment ADD COLUMN policy_json TEXT;
ALTER TABLE risk_assessment ADD COLUMN rule_set_hash TEXT;
ALTER TABLE risk_assessment ADD COLUMN stale INTEGER NOT NULL DEFAULT 0;
ALTER TABLE risk_assessment ADD COLUMN engine_version TEXT;

CREATE TABLE risk_policy (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  high_min INTEGER NOT NULL,
  medium_min INTEGER NOT NULL,
  expiry_urgent_days INTEGER NOT NULL,
  expiry_warn_days INTEGER NOT NULL,
  auto_renew_notice_days_min INTEGER NOT NULL,
  max_term_days INTEGER NOT NULL,
  source TEXT NOT NULL,
  updated_by_user_id TEXT REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX risk_policy_org_idx ON risk_policy(organization_id);

CREATE TABLE risk_finding (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  assessment_id TEXT NOT NULL REFERENCES risk_assessment(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  rule_id TEXT REFERENCES risk_rule(id) ON DELETE SET NULL,
  rule_code TEXT NOT NULL,
  rule_version INTEGER NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  weight INTEGER NOT NULL,
  contract_text TEXT,
  explanation TEXT NOT NULL,
  ai_explanation TEXT,
  remediation TEXT,
  review_status TEXT NOT NULL,
  reviewed_by_user_id TEXT REFERENCES user(id),
  reviewed_at INTEGER,
  review_note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX risk_finding_assessment_idx ON risk_finding(assessment_id);
CREATE INDEX risk_finding_contract_idx ON risk_finding(organization_id, contract_id);

CREATE TABLE clause_template (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  jurisdiction TEXT,
  contract_types TEXT,
  status TEXT NOT NULL,
  current_version_id TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX clause_template_org_code_idx ON clause_template(organization_id, code);
CREATE INDEX clause_template_org_idx ON clause_template(organization_id, status);

CREATE TABLE clause_version (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES clause_template(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  body TEXT NOT NULL,
  change_summary TEXT,
  status TEXT NOT NULL,
  approved_by_user_id TEXT REFERENCES user(id),
  approved_at INTEGER,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX clause_version_number_idx ON clause_version(template_id, version_number);
CREATE INDEX clause_version_template_idx ON clause_version(organization_id, template_id);

CREATE TABLE clause_alternative (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES clause_template(id) ON DELETE CASCADE,
  alternative_template_id TEXT NOT NULL REFERENCES clause_template(id) ON DELETE CASCADE,
  note TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX clause_alternative_pair_idx ON clause_alternative(template_id, alternative_template_id);

CREATE TABLE clause_usage (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES clause_template(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES clause_version(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX clause_usage_unique_idx ON clause_usage(template_id, contract_id);
CREATE INDEX clause_usage_contract_idx ON clause_usage(organization_id, contract_id);
