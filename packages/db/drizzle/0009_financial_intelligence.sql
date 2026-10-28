-- AccordIQ 0009: payment milestones, imported transactions, escalations, savings.
-- Additive only. Never DROP tables or existing columns.
-- Contract-stated values stay on contract.value_minor. Imported spend is a separate table.
-- Estimated savings are stored with status ESTIMATE and are never implied as verified.

CREATE TABLE payment_milestone (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  due_on TEXT,
  paid_on TEXT,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  note TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX payment_milestone_contract_idx
  ON payment_milestone(organization_id, contract_id);

CREATE TABLE financial_transaction (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contract_id TEXT REFERENCES contract(id) ON DELETE SET NULL,
  vendor_id TEXT REFERENCES vendor(id) ON DELETE SET NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  reference TEXT,
  note TEXT,
  source TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX financial_transaction_org_idx
  ON financial_transaction(organization_id, occurred_on);
CREATE INDEX financial_transaction_contract_idx
  ON financial_transaction(organization_id, contract_id);
CREATE INDEX financial_transaction_vendor_idx
  ON financial_transaction(organization_id, vendor_id);

CREATE TABLE price_escalation (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  percent_bps INTEGER NOT NULL,
  effective_on TEXT,
  source TEXT NOT NULL,
  note TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX price_escalation_contract_idx
  ON price_escalation(organization_id, contract_id);

CREATE TABLE savings_opportunity (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contract_id TEXT REFERENCES contract(id) ON DELETE SET NULL,
  vendor_id TEXT REFERENCES vendor(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  amount_minor INTEGER,
  currency TEXT,
  status TEXT NOT NULL,
  explanation TEXT NOT NULL,
  verified_by_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  verified_at INTEGER,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX savings_opportunity_org_idx
  ON savings_opportunity(organization_id, status);
