# ADR 0004: Contract repository and private document storage

- Status: Accepted (Phase 6)
- Date: 2026-10-27

## Context

Phase 5 stored document metadata only (`storage_key` null). The product needs a real repository:
upload PDF/DOCX, private bytes, contract records, versions, filters, authorized download, and
visible processing failures — without AI extraction yet.

## Decision

- Add `@accordiq/storage` with a local filesystem adapter under `STORAGE_LOCAL_DIR` (default
  `.data/uploads`, gitignored) and an in-memory adapter for tests. `STORAGE_DRIVER=s3` is refused
  until an S3 adapter is wired.
- Validate type, size and magic bytes on the server. Default max size is 25 MB.
- Keep document processing states (`UPLOADING`, `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`)
  separate from contract lifecycle states (`DRAFT`, `IN_REVIEW`, …).
- Never return `storageKey` in JSON. Bytes leave storage only through an authorized
  `/api/documents/:id/file` handler (`Cache-Control: private, no-store`). PDF preview uses a blob
  URL from that response because `X-Frame-Options: DENY` blocks framing the API URL.
- Duplicate _submissions_ are stopped with `Idempotency-Key` (unique per organization). Duplicate
  _content_ is detected via SHA-256 and returned as a warning; it does not block the upload.
- Related agreements live in `contract_relation` (amendment, renewal, related, supersedes).
- `DocumentProcessor.extraction` is always `null`. Phase 7 can wrap `createBasicProcessor` without
  treating uploaded bytes as model instructions.

## Consequences

- Existing SQLite files gain columns via additive migration `0003_contract_repository`. Pending
  documents become `QUEUED`; previously `AVAILABLE` rows become `COMPLETED`.
- Local files are not a production object store. Do not put customer contracts in the SQLite file
  or the `.data/uploads` directory if this machine is shared.
