# W1 — Administer a seat's grants on the seat page

**Status: approved by Brian on 2026-09-25 (specification, mockups and acceptance).**

- Purpose/intended outcome: the committee decides what each seat may see and change, without a code change.
  "Set it and forget it" (Stewart, 2026-09-25).
- Primary actor: a holder of `role_management` — President, General Manager, IT Officer.
- Trigger: a seat changes hands, a job changes, the committee re-seats for a new year, or a seat is vacant and
  its work has to go to someone else.
- Entry point: Administration → Roles → a seat.
- Route/placement: access is edited on the seat page and nowhere else. `/operate/admin/roles` is unchanged
  (W1-01). `/operate/admin/roles/[roleId]` keeps the holder at the top; an Access section replaces today's
  Permissions list (W1-03).
- Controlling source: LAN-424 decisions (Brian, 2026-09-25) as amended by Brian's call with Stewart the same
  day ("That seems perfect.") and his amendments after it; parent LAN-423.
- User-visible result: the seat's grants read as changed on the seat page and in the seat's History, and the
  seat's holders see only what is granted from their next request.

## Current `main` grounding

- Locally rendered routes: `/operate/admin/roles` (Roles index with a read-only Permissions column) and
  `/operate/admin/roles/[roleId]` (Current holder, Permissions list from `permissionsSummary`, Role actions,
  Holder history via `AdministrationHistory`).
- Reused components: `Section`; `Notice` for the one outcome (standards rule 1); the recorder's exclusive
  `ToggleButtonGroup`; MUI `Switch`, `Chip`, `Dialog`, `TextField` select; `AdministrationHistory` `RowCard`
  entries; the app's outlined and contained Buttons (fetched live from `/operate/events` in the proposals).
  Gate: `gateShellPage(..., "role_management")`, unchanged.
- The template list is read from the running `/operate/events/templates`, each template in the colour its
  editor has selected: Chalk, Game, Meeting, Practice, Recruitment, Social, Strength and conditioning.
- Desktop and 375px evidence: `mockups/W1-administer-a-seats-grants.html`, screens W1-01, W1-03, W1-04,
  W1-05, W1-07, W1-08, all photographed on both sides at a browser-measured 1280 and 375.
- Retired in round 3: W1-02a to W1-02e (the five Access views) and W1-09 (time-limited delegation). Retired in
  round 2: W1-02 (full matrix) and W1-06 (Option B).

## Required actions

1. Open Roles; open a seat.
2. In Access, change one roster category (None / View / Edit), one recruiting category (None / View / Edit;
   Event details None / View), one event template (None / View / Manage), or one of the two switches
   (No / Yes). The change saves on press.
3. Or, for a whole seat at once: _Copy access from another seat_ (choose the seat, read every change,
   confirm) or _Grant everything_ (confirm).
4. Read the outcome Notice and the new History entry.

## State transitions

- Grant: None ↔ View ↔ Edit (roster, Person information, Recruit details), None ↔ View (Event details),
  None ↔ View ↔ Manage (each template), No ↔ Yes (switch). Any to any.
- A template created later arrives at None for every seat except the five full seats (Manage).
- Copy: every grant of the target becomes the source seat's value, with no end date.
- Grant everything: every grant becomes its maximum.
- Fixed seats (President, General Manager, IT Officer): no transition exists.

## Handoffs

- W3 and W4 read the grants on the holder's next request.
- The seat's History shows each change to anyone who can open the seat.

## Dependencies and mission boundaries

- `src/lib/auth/capabilities.ts`: the capabilities the access list governs become derived from grants; the
  rest stay in code and are not listed on the seat page.
- LAN-406 (interim elevation of named seats) is untouched: no time-limited delegation in this delivery.
- LAN-407 (who may pause messaging): out of scope; stays in code.

## Exceptions and recovery

- Attempt to reduce a fixed seat: no control exists; the server refuses regardless (Central rule).
- Copy from a fixed seat onto another seat: copies grants, never the fixed status.
- Two administrators change the same grant at once: last write wins, both audited. (Delegated.)
- A save fails: the control returns to the stored value and the Notice says the grant was not changed.
- A template is deleted: its grant lines go with it (audited).

## Safety, privacy, consent, and authority boundaries

- Only `role_management` holders reach W1. The floor cannot be removed, so no edit locks out access's own
  administrators.
- _Grant everything_ gives an ordinary seat full access, including Contact & emergency; the confirmation lists
  every grant that changes.
- Every change is append-only audited in `audit_events`: single changes as one entry each; a copy or grant
  everything as one entry with one line per grant.

## Acceptance evidence

- Each screen's behaviour walked on the built surface at 1280 and 375.
- A printed-access test pins the seed to the seed rule (delegated).

## Core decisions

| Decision                                                                                              | Classification            | Governing evidence or recommended default                            | Status    |
| ----------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------- | --------- |
| Access edited on the seat page only; Roles index unchanged                                            | locked                    | Brian and Stewart, 2026-09-25                                        | recorded  |
| Roster: ten board groups plus Contact & emergency, None/View/Edit                                     | locked                    | Round 3 brief, item 2                                                | recorded  |
| Recruiting group: Person information, Recruit details (None/View/Edit), Event details (None/View)     | locked                    | Round 3 brief, item 2                                                | recorded  |
| Events per template, None/View/Manage; no types, no categories                                        | locked                    | Round 3 brief, item 3                                                | recorded  |
| Two switches: may add to the roster, may add recruits; no records switch                              | locked                    | Round 3 brief, items 4–5                                             | recorded  |
| Attendance not in the access list                                                                     | locked                    | Round 3 brief, item 7                                                | recorded  |
| President, GM, IT Officer fixed full; VP and Secretary start full, removable; every other seat None   | locked                    | Round 3 brief, item 6                                                | recorded  |
| Seat page Access section, save on press, History carries access changes; groups fold at 375           | locked                    | Brian, round-1 and round-2 feedback                                  | recorded  |
| Permissions block removed from the seat page                                                          | locked                    | Brian, round-1 feedback on W1-03                                     | recorded  |
| Copy access from another seat (no expiry) and Grant everything, one audited action each, on seat page | locked                    | Approved with W1 as drawn on W1-03, W1-07, W1-08 (Brian, 2026-09-25) | recorded  |
| Roster count: eleven, not the brief's "twelve" (Recruits moved to Recruiting)                         | locked                    | Approved with W1 as drawn on W1-03 (Brian, 2026-09-25)               | recorded  |
| Table shapes, capability derivation, audit row shape, printed-access test, package split              | delegated to Mission Lead | LAN-424 "Delegated"                                                  | delegated |

## Brian approval

- Exact words: "W1 is approved." Then, approving the whole ledger: "Other than that, I think this is approved. We can go ahead and create the packet and push it."
- Date: 2026-09-25
- Copy access from another seat and Grant everything were on the approved W1-03 screen marked _Proposed for
  owner approval_; Brian raised no objection and approved the whole, so both are locked.
