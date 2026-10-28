-- AccordIQ 0007: e-signature envelopes, signers, and webhook events.
-- Additive only. Never DROP tables or existing columns.
-- Completion is recorded from authenticated provider events, never from a browser click.

CREATE TABLE signature_envelope (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES contract_version(id),
  source_document_id TEXT REFERENCES document(id) ON DELETE SET NULL,
  executed_document_id TEXT REFERENCES document(id) ON DELETE SET NULL,
  certificate_document_id TEXT REFERENCES document(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_envelope_id TEXT,
  status TEXT NOT NULL,
  title TEXT,
  message TEXT,
  test_mode INTEGER NOT NULL DEFAULT 1,
  sent_at INTEGER,
  completed_at INTEGER,
  declined_at INTEGER,
  expired_at INTEGER,
  failed_at INTEGER,
  cancelled_at INTEGER,
  failure_reason TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX signature_envelope_provider_idx
  ON signature_envelope(provider, provider_envelope_id);
CREATE INDEX signature_envelope_contract_idx
  ON signature_envelope(organization_id, contract_id);

CREATE TABLE signature_signer (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  envelope_id TEXT NOT NULL REFERENCES signature_envelope(id) ON DELETE CASCADE,
  party_id TEXT REFERENCES contract_party(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT,
  routing_order INTEGER NOT NULL DEFAULT 1,
  required INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  provider_signer_id TEXT,
  decline_reason TEXT,
  sent_at INTEGER,
  viewed_at INTEGER,
  signed_at INTEGER,
  declined_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX signature_signer_envelope_idx
  ON signature_signer(organization_id, envelope_id);

CREATE TABLE signature_event (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  envelope_id TEXT NOT NULL REFERENCES signature_envelope(id) ON DELETE CASCADE,
  signer_id TEXT REFERENCES signature_signer(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_hash TEXT,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER
);
CREATE UNIQUE INDEX signature_event_provider_idx
  ON signature_event(provider, provider_event_id);
CREATE INDEX signature_event_envelope_idx
  ON signature_event(organization_id, envelope_id);
