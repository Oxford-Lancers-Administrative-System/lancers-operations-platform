# Frozen workflow inventory — M-GRANULAR-ROLES-AND-PERMISSIONS

**Status: draft, pending Brian's approval.** Not frozen. Proposed by the LAN-424
design sprint on 2026-09-25 from the definition recorded on LAN-424.

Definition: one primary actor's end-to-end journey from trigger and entry point to
one user-visible result.

Outcome (LAN-424): every seat gets exactly the access its job needs, and the club
changes it on the Roles page without a code change.

1. `W1` — Administer a seat's grants on the Roles page: President, General Manager or IT Officer (`role_management`) → a seat's roster, switch and event grants changed, each change audited
2. `W2` — Manage template categories on the event templates page: a calendar manager (`event_calendar_management`) → one colour per fixed category, and every template carrying a category instead of a swatch
3. `W3` — Work the roster within granted categories, board and record: any seat with a roster grant → the board and record show only granted groups, editable only where Edit is granted
4. `W4` — Work events of a granted category, view or manage: any seat with an event grant → only granted categories' events appear, manageable only where Manage is granted

## Cross-cutting invariants and exclusions

- Event categories are fixed at seven — Practice, Strength and conditioning, Chalk,
  Game, Social, Recruitment, Meeting — the existing `event_type` class. No creating
  or renaming categories.
- Roster categories are the board's ten groups on `main` plus Contact & emergency
  (record-only) plus Recruits. None / view / edit each. Three per-seat switches:
  open roster records, open recruit records, add to the roster.
- Event grants are none / view / manage per category. None hides the event from
  the list, calendar, delivery board, attendance list and report.
- Attendance is not in the matrix; recording stays as today and the attendance
  surface lists every event.
- Floor: President, General Manager and IT Officer are full and fixed. Vice-President
  and Secretary start full and are removable one grant at a time. Every other seat
  starts with what `src/lib/auth/capabilities.ts` gives it when the migration runs.
- One matrix row per seat, all twenty, coaching seats included. Every grant change
  is audited in `audit_events`.
- Excluded: per-group scoping for coaches; who may pause messaging (LAN-407);
  erasure; the Roles page's seat-replacement rules; the generalised messaging module.

## Inventory amendments

None.

## Brian approval

- Exact approved list/count: pending
- Exact words: pending
- Date: pending
