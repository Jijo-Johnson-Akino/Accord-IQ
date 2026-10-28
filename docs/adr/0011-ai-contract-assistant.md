# ADR 0011: AI contract assistant

- Status: Accepted (Phase 13)
- Date: 2026-10-28

## Context

Studio needed an organization-wide research assistant: questions, search, comparison, upcoming
commitments, playbook drafts, policy exceptions, and negotiation language. Per-contract Q&A already
existed. The assistant must not retrieve another tenant's files, treat contract text as
instructions, skip confirmation, or present generated language as legally validated.

## Decision

- Keep the surface on `/studio`. Do not add a 14th navigation item.
- Classify intent on the server. Every retrieval re-runs `scopedContract` / `getDocumentFile` using
  the session organization. Client `organizationId` values are ignored. LLM-supplied identifiers are
  not trusted.
- Threads are scoped to `createdByUserId` within the organization. `contracts:read` can research.
  Creating a draft contract from a proposal requires explicit confirmation and `contracts:write`.
- Ground document and playbook citations in source text. If a required quotation is missing, refuse
  with insufficient evidence.
- Wrap retrieved files as untrusted data (existing document delimiters). Log tool name, identifiers,
  counts, and status — never document text or completions.
- Default `LLM_PROVIDER=none` still answers from stored contract, obligation, renewal, and approved
  playbook records. Live or fixture models are used only after access checks.

## Consequences

- Additive migration `0010_ai_assistant` adds threads, messages, citations, tool logs, and
  proposals. Existing databases are not dropped.
- Generated drafts start as `PENDING_CONFIRMATION` and are labeled as not legally validated.
- Evaluation covers citation accuracy, unsupported answers, tenant isolation, ambiguous questions,
  and prompt injection.
