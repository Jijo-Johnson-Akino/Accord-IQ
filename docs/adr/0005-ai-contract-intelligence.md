# ADR 0005: AI contract intelligence

- Status: Accepted (Phase 7)
- Date: 2026-10-27

## Context

Phase 6 stored real PDF/DOCX bytes. The product needs extraction, summaries, Q&A, and version
comparison without treating uploaded files as instructions, without mixing suggestions into
verified contract facts, and without pretending a live model is connected when it is not.

## Decision

- Add `@accordiq/ai` as a server-side adapter (`none`, `fixture`, `openai`, `anthropic`). The web
  app never calls a model from the browser.
- Default `LLM_PROVIDER=none`. Record `UNAVAILABLE` instead of fabricating fields. The Studio page
  shows setup steps. `fixture` is a labeled-sample evaluator only and is refused in production.
- Validate provider JSON against Zod schemas, then ground citations and dates in the source text.
  Quotes that are not verbatim (normalized, minimum 8 characters) are dropped. Conflicting end
  dates null the field and store a conflict. Missing information stays null.
- Wrap document text in `<<<UNTRUSTED_CONTRACT_DOCUMENT>>>` delimiters. System prompts treat the
  file as data, not instructions.
- Store runs, suggestions, Q&A and comparisons in additive tables (`0004_ai_intelligence`). Copy
  onto `contract` / `obligation` / `contract_party` only after `VERIFIED` or `CORRECTED`.
- Log provider, model, status, duration and source character count — never document text.
- Enforce `getDocumentFile` (RBAC + tenant) before reading bytes. `contracts:write` starts
  analysis, corrects fields, applies facts and compares versions. `contracts:read` can view
  results and ask questions.
- Keep `DocumentProcessor.extraction` null. Analysis is on-demand, not a side effect of upload.

## Consequences

- Existing SQLite files gain extraction tables via `0004_ai_intelligence`. No tables are dropped.
- Fixture accuracy is exact on labeled samples and undefined on other files (those runs fail).
- Live providers still cannot invent citations that are not in the source, but they can miss
  clauses, mis-label parties, and fail on scanned or compressed PDFs.
- Connecting OpenAI or Anthropic is an operations step (`LLM_PROVIDER` + `LLM_API_KEY`). Until
  that is done, the product must not claim live AI is working.
