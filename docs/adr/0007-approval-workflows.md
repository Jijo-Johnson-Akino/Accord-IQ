# ADR 0007: Configurable approval workflows

- Status: Accepted (Phase 9)
- Date: 2026-10-28

## Context

Phase 5 stored a sequential Legal-then-Finance template and decided the first pending stage.
Organizations need parallel reviewers, value/type/department/risk gates, comments, one-hop
delegation, due dates, and a way back to review after rejection or material edits. The browser
must never be the authority for whether a contract can be approved.

## Decision

- Stages share a `step` integer. The same step runs in parallel. Later steps wait until every
  stage in every earlier step is `APPROVED` or `SKIPPED`. Existing templates are backfilled so
  `step = position`, preserving Legal then Finance as sequential.
- Optional JSON conditions (`VALUE_MINOR`, `CATEGORY`, `DEPARTMENT`, `RISK`) are evaluated
  fail-closed when a field is missing. Empty predicates always include the stage.
- Decisions are `APPROVED`, `REJECTED`, and `CHANGES_REQUESTED`. Reject closes the request,
  skips remaining pending stages, and sets the contract `IN_REVIEW`; a later start creates a
  new request. Changes freeze decisions until `resubmitApproval`, which reopens only
  change-requested stages unless the snapshot is stale.
- Material snapshot is `valueMinor`, `category`, `department`, `vendorId`, latest complete
  `overallSeverity`, and `currentVersionId`. `updateContract` and `createContractVersion`
  revalidate in-progress and changes-requested requests. Stale requests block decide; resubmit
  resets every stage from a new snapshot.
- `actionableStageIds` and `canActorDecide` run on the server. `stageId` is optional only when
  exactly one stage is actionable. Organization admins and SUPERADMIN may override an
  _actionable_ stage, not a future step. FINANCE has `approvals:act`. `workflows:manage` is
  required to create templates.
- Delegation is one hop to the same required role or an organization admin. Due dates are set
  when a step becomes current. Overdue reminder and escalation write in-app notifications on
  get; there is no outbound email in this phase.
- Start and decide accept `Idempotency-Key`. Unique keys are scoped to the organization
  (start) or request (decide). Comments and events form the visible history; `writeAudit`
  remains the append-only audit log.

## Consequences

- Additive migration `0006_approval_workflows` adds department, step/condition/due/delegation
  columns, and `approval_comment` / `approval_event`. Existing databases are not dropped.
- A hidden Approve button is not a grant. Clients that omit `stageId` or spoof `canAct` still
  hit prerequisite and role checks.
- Scoring and AI output from earlier phases do not approve a contract. Only this workflow does.
