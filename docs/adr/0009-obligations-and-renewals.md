# ADR 0009: Obligation and renewal monitoring

- Status: Accepted (Phase 11)
- Date: 2026-10-28

## Context

After signature, teams still need to complete commitments and act on expiry. Dates must not depend
on the server's local timezone. A sweep that silently renews or terminates a contract would skip
authorization.

## Decision

- Civil dates are `YYYY-MM-DD` strings. "Today" is computed with `Intl` in the organization's IANA
  timezone (`organization.timezone`, default `UTC`). Tests inject `ClmOptions.clock`.
- Recurrence (`ONCE`, `WEEKLY`, `MONTHLY`, `QUARTERLY`, `YEARLY`) uses UTC civil arithmetic and
  clamps month-end and leap days. Completing a recurring obligation marks the current row `DONE`
  and inserts the next `OPEN` occurrence.
- Reminder receipts are unique on `(organization, entity type, entity id, kind, for_date)`. A
  second sweep on the same due date does not send another reminder.
- Each contract with an expiry date gets one renewal watch. Notice date is `expiresOn - noticeDays`.
  The terminate-by date is that notice date. Watch status may become `LAPSED` after expiry; the
  contract row is not changed by the sweep.
- Applying renew or terminate requires an explicit decision **and** an `APPROVED` workflow whose
  request was created after that decision. A prior approval cannot authorize the change.
  `auto_renew` is stored as a flag only.
- Owners may complete their own obligations without `contracts:write`. Create, assign, cancel, and
  renewal decisions still require `contracts:write`.

## Consequences

- Additive migration `0008_obligations_renewals` extends `obligation`, adds timezone on
  `organization`, notice fields on `contract`, and introduces `obligation_event`, `renewal_watch`,
  `renewal_event`, and `reminder_receipt`. Existing databases are not dropped.
- Overview metrics stay empty unless demo data is explicitly enabled. Obligation counts are not
  invented on the dashboard.
- Email delivery is still not connected. Reminders land in the in-app notification inbox.
