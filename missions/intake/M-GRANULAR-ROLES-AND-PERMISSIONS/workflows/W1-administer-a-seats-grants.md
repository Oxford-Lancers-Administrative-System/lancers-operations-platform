# W1 — Administer a seat's grants on the Roles page

**Status: specification draft, pending Brian's approval.**

- Purpose/intended outcome: the committee decides what each seat may see and change, without a code change.
- Primary actor: a holder of `role_management` — President, General Manager, IT Officer.
- Trigger: a seat changes hands, a job changes, or the committee re-seats for a new year.
- Entry point: Administration → Roles.
- Route/placement: **proposed for owner approval.** Option A (recommended): `/operate/admin/roles` gains a
  _Holders | Access_ switch; Access is the matrix; each seat's page `/operate/admin/roles/[roleId]` gains an
  Access section. Option B: no matrix; the index summarises; edits on the seat page only. See `HANDOFF.md`.
- Controlling source: LAN-424 "Decisions recorded (Brian, 2026-09-25)"; parent LAN-423.
- User-visible result: the seat's grants read as changed on the matrix, on the seat page and in the seat's
  history, and the seat's holders see only what is granted from their next request.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue: `/operate/admin/roles` (Roles index, read-only
  Permissions column from `permissionsPreview`) and `/operate/admin/roles/[roleId]` (Current holder,
  Permissions list from `permissionsSummary`, Role actions, Holder history via `AdministrationHistory`).
- Reused component, language, interaction, and permission patterns: `TableFrame`/`DesktopOnly` table with
  `RowCardList` cards below `md`; `Section`; `Notice` for the one outcome (standards rule 1); the events page's
  two-button view switch; the recorder's exclusive `ToggleButtonGroup`; MUI `Switch`; the roster board's
  dotted-underline editable cell and banded group header; `AdministrationHistory` `RowCard` entries.
  Gate: `gateShellPage(..., "role_management")`, unchanged.
- Desktop and 375px evidence: `mockups/W1-administer-a-seats-grants.html`, screens W1-01 to W1-06, all
  photographed on both sides at a browser-measured 1280 and 375 (`mockups/shots/shots.json`).
- Reason for any departure from the implemented application: the matrix is new; it is built from the
  components above, and the Permissions list is narrowed to what the matrix does not govern.

## Required actions

1. Open Roles; switch to Access (A) or open a seat (A and B).
2. Change one roster category (None / View / Edit), one switch (No / Yes) or one event category
   (None / View / Manage). The change saves on press.
3. Read the outcome Notice and the new history entry.

## State transitions

- Grant: None ↔ View ↔ Edit (roster), No ↔ Yes (switch), None ↔ View ↔ Manage (events). Any to any.
- Fixed seats (President, General Manager, IT Officer): no transition exists.

## Handoffs

- W3 and W4 read the grants on the holder's next request. No session refresh is needed from the holder.
- The seat's history shows the change to anyone who can open the seat.

## Dependencies and mission boundaries

- `src/lib/auth/capabilities.ts` thirteen keys: some become derived from grants (delegated), some stay in
  code and are listed under _Other permissions_. Independently walkable.
- LAN-406 (interim elevation of named seats) seeds whatever the capability map holds at migration time.
- LAN-407 (who may pause messaging): out of scope; stays in code.

## Exceptions and recovery

- Attempt to reduce a fixed seat: no control exists; server refuses regardless (Central rule).
- Two administrators change the same grant at once: last write wins, both audited. (Delegated.)
- A save fails: the toggle returns to the stored value and the Notice says the grant was not changed.

## Safety, privacy, consent, and authority boundaries

- Only `role_management` holders reach W1. The floor cannot be removed, so the matrix cannot lock out its
  own administrators.
- Contact & emergency is its own category: date of birth and emergency contact are no longer implied by
  any other grant.
- Every change is append-only audited in `audit_events` with actor, before, after and time.

## Acceptance evidence

- Each of the six screens' behaviour walked on the built surface at 1280 and 375.
- A printed-matrix test pins the seed to today's capability map (delegated, from LAN-424).

## Core decisions

| Decision                                                                                    | Classification              | Governing evidence or recommended default                         | Status    |
| ------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------- | --------- |
| Twelve roster categories, None/View/Edit                                                    | locked                      | LAN-424 decision 2                                                | recorded  |
| Three per-seat switches, independent                                                        | locked                      | LAN-424 decision 3                                                | recorded  |
| Seven event categories, None/View/Manage; None hides everywhere                             | locked                      | LAN-424 decisions 1, 4                                            | recorded  |
| Attendance not in the matrix                                                                | locked                      | LAN-424 decision 4                                                | recorded  |
| President, GM, IT Officer fixed full; VP and Secretary start full, removable                | locked                      | LAN-424 decision 5                                                | recorded  |
| Seed from the capability map at migration time                                              | locked                      | LAN-424 decision 6                                                | recorded  |
| One row per seat, twenty rows                                                               | locked                      | LAN-424 decision 7                                                | recorded  |
| Edited by `role_management` holders; every change audited in `audit_events`                 | locked                      | LAN-424 brief; parent LAN-423                                     | recorded  |
| Placement: Option A (Holders/Access switch + seat-page Access) vs Option B (seat page only) | proposed for owner approval | W1-01, W1-06; recommend A                                         | open      |
| Matrix split into Roster and Events tables, headers written down the column                 | proposed for owner approval | W1-02                                                             | open      |
| Matrix cells edited in place at desktop                                                     | proposed for owner approval | W1-02                                                             | open      |
| Save on press, one audit entry per grant, success Notice                                    | proposed for owner approval | W1-03                                                             | open      |
| Holder history renamed History and carries access changes                                   | proposed for owner approval | W1-03                                                             | open      |
| Permissions list becomes Other permissions (only what the matrix does not govern)           | proposed for owner approval | W1-03 to W1-05                                                    | open      |
| Treasurer seed: Edit Membership + Add to the roster                                         | proposed for owner approval | W1-02; derived from `membership_activation`, `roster_bulk_import` | open      |
| Coaches' event seed: View all seven                                                         | proposed for owner approval | W1-02; alternative Practice and Game only                         | open      |
| Table shapes, capability derivation, audit row shape, printed-matrix test, package split    | delegated to Mission Lead   | LAN-424 "Delegated"                                               | delegated |

## Brian approval

- Exact words: pending
- Date: pending
