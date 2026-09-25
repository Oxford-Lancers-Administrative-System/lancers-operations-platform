# Frozen workflow inventory — M-GRANULAR-ROLES-AND-PERMISSIONS

**Status: frozen, approved by Brian on 2026-09-25.** Proposed by the LAN-424 design
sprint on 2026-09-25 from the definition recorded on LAN-424; round 3 applies Brian's
call with Stewart (2026-09-25) and his amendments after it; round 4 his three
corrections.

Definition: one primary actor's end-to-end journey from trigger and entry point to
one user-visible result.

Outcome (LAN-424): every seat gets exactly the access its job needs, and the club
changes it on the seat's page without a code change.

1. `W1` — Administer a seat's grants on the seat page: President, General Manager or IT Officer (`role_management`) → a seat's roster, recruiting, template and adding grants changed on that seat's page, each change audited
2. `W2` — Edit roster group colours: the club, through a holder of `role_management` → each of the board's ten groups wears a colour chosen from the app's palette, set from an _Edit categories_ control on the roster
3. `W3` — Work the roster and recruits within granted categories, board and record: any seat with a roster or recruiting grant → the board shows only granted groups; the record shows every section, with None sections collapsed and locked
4. `W4` — Work events of a granted template, view or manage: any seat with a template grant → only granted templates' events appear, manageable only where Manage is granted

## Cross-cutting invariants and exclusions

- Access is edited on the seat page and nowhere else. The Roles index is unchanged.
- Roster categories: the board's ten groups on `main` (Person, Onboarding,
  Membership, Availability, Coaching, Offensive, Defensive, Special teams and Warmup
  assignments, Kit) plus Contact & emergency. None / view / edit each.
- Recruiting is its own group: Person information, Recruit details (none / view /
  edit) and Event details (none / view only).
- Events are granted per template, not per category: every event template on
  `main`, plus any the club adds later, is one line at none / view / manage. No
  event types, no categories, no "Template categories" section. Templates keep their
  own colour; the event templates page is unchanged by this delivery.
- Two switches per seat: may add to the roster; may add recruits. No records switch:
  records open for anyone who can reach the roster or recruits.
- Inside a record, a category the seat holds None on is collapsed and locked — a lock
  in place of the chevron, cannot be expanded, contents never sent to the browser.
  The name stays at the top. View on the board is view in the record.
- Attendance is not in the access list; recording stays as it is for every seat.
- Floor: President, General Manager and IT Officer hold everything and cannot be
  reduced. Vice-President and Secretary start full and are removable one grant at a
  time. Every other seat starts with None on every category and every template.
- Copy access from another seat and Grant everything are seat-page actions, each one
  audited action (approved with W1). No time-limited delegation.
- Every grant change and every group-colour change is audited in `audit_events`.
- Excluded: per-group scoping for coaches; who may pause messaging (LAN-407);
  erasure; the Roles page's seat-replacement rules; the generalised messaging module;
  any change to the event templates page; the Monday report; the attendance-sheet email.

## Inventory amendments

- Round 3 (2026-09-25): `W2` changed from "Manage template categories on the event
  templates page" to "Edit roster group colours" (Brian: events are per template;
  roster group colours become editable). `W4` renamed from "category" to "template".

## Brian approval

- Exact approved list/count: W1, W2, W3, W4 (four workflows, in this order)
- Exact words: "Other than that, I think this is approved. We can go ahead and create the packet and
  push it."
- Date: 2026-09-25
