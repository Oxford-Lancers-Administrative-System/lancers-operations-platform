# Ground truth: the recruit journey on `main` at 349bb9b

Two read-only scout traces, 2026-08-25, run because Brian did not recognise the
claim that Mission 2 had closed Task 09 §9.1's gaps. Every line below is code
observed at `349bb9b`, spot-verified by the Lead. Provenance only — this file
decides nothing.

## A. Walk-up capture (Task 09 door 2)

Writes, and only these: `people` (given + family name) · `contact_points`
(phone preferred, `source='walk-on attendance'`, `normalised_value` null; email
only if typed) · `recruitment_prospects` (`status='identified'`,
`source='Walk-on at {event}'`) · `attendance_records` (`capacity='recruit'`,
`season_membership_id` null, `presence='present'`) · one `audit_events` row.
`src/lib/services/attendance.ts:851-880, 1019-1052`.

Absent on that path:

- **No message of any kind.** No `notification_jobs`, dispatch, or send call
  anywhere in the form, the action, or the service. Task 09 D3 requires the
  WhatsApp welcome + group invite at every door.
- **No duplicate check.** `attendance.ts:697` records Brian removing the
  roster-match path — "they know who's on their roster, there are only 40
  people. A walk-on is now always a new person; a duplicate is reconciliation's
  problem." Task 09 §3 records that exception only for coach-side LAN-110
  capture, so the shipped operator path is wider than the approved brief.
- **No consent, opt-in, or collection notice.** Task 07 §2 requires a versioned
  collection notice at walk-up capture; no column exists to record one.
- **No way back to the person.** They are reachable only from that one event's
  attendance board. No `people/`, `recruitment/` or `prospect/` route exists
  under `src/app/operate`.

## B. Recruit invitation and chase

Approving an event whose audience includes `recruits` does work end to end:
one `invitations` row per recruit, person-anchored with `season_membership_id`
null and `capacity='recruit'` (`event-approval.ts:408-409, 510-520`); one
`notification_jobs` row, `channel='whatsapp'`, `template_variables='{}'::jsonb`
(`:526-540`); dispatch attempted with no capacity filter
(`delivery.ts:584-655`). The signed RSVP path resolves through
`coalesce(i.person_id, m.person_id)` and works for a person with no membership
(`rsvp.ts:133, 222-328`).

What does not exist:

- **No reminder, chase, escalation or nonresponse machinery at all.** The
  `notification_job_type` enum carries `reminder` and `escalation`
  (`20260810120000_domain_types.sql`), and nothing outside tests writes either.
  This is Mission 4's unbuilt scope, not a defect.
- **No per-capacity or per-audience messaging policy anywhere.**
  `template_variables` is hard-coded `'{}'` for every recipient; channel is
  hard-coded `'whatsapp'`. A recruit and a squad member are indistinguishable
  to every operational code path.
- **`countByCapacity()` omits recruits** (`event-approval.ts:590-596` counts
  player, coach and committee only), so an approval's audit context undercounts
  who was actually invited. Audit-only, no operational effect.

## Consequence for Mission 4

Mission 4's approved packet contains the word "recruit" zero times, and its W5
defines one chase ladder for whoever has not answered. Its plan is approved
with six work packages, none dispatched. Unless a rule distinguishing recruits
from squad members exists before those packages are built, the ladder will be
built to hound recruits by default. Changing that after the fact requires a new
`packet_version` through a fresh intake-only PR.
