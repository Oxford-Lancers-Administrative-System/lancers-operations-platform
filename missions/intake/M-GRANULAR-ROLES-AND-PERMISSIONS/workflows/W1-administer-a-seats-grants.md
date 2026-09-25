# W1 — Administer a seat's grants on the Roles page

**Status: specification draft (round 2), pending Brian's approval.**

- Purpose/intended outcome: the committee decides what each seat may see and change, without a code change.
- Primary actor: a holder of `role_management` — President, General Manager, IT Officer.
- Trigger: a seat changes hands, a job changes, the committee re-seats for a new year, or a seat is vacant and
  its work has to go to someone else.
- Entry point: Administration → Roles.
- Route/placement: `/operate/admin/roles` gains a _Holders | Access_ switch (accepted, W1-01) drawn with the
  app's own `ViewSwitch` (`src/app/calendar/view-switch.tsx`, the _List | Calendar_ control on
  `/operate/events`). The Access view's layout is **proposed for owner approval** among five alternatives,
  W1-02a to W1-02e; recommended B (collapsed matrix). Each seat's page `/operate/admin/roles/[roleId]` gains
  the Access section (accepted, W1-03) and is the editor in every alternative.
- Controlling source: LAN-424 "Decisions recorded (Brian, 2026-09-25)", Brian's round-1 feedback of the same
  day, and the Lead's round-2 decisions; parent LAN-423.
- User-visible result: the seat's grants read as changed on the Access view, on the seat page and in the
  seat's History, and the seat's holders see only what is granted from their next request.

## Current `main` grounding

- Locally rendered routes: `/operate/admin/roles` (Roles index, read-only Permissions column from
  `permissionsPreview`) and `/operate/admin/roles/[roleId]` (Current holder, Permissions list from
  `permissionsSummary`, Role actions, Holder history via `AdministrationHistory`).
- Reused components: `ViewSwitch` (fetched live from `/operate/events` in the proposals, so the photograph is
  the real component); `TableFrame`/`DesktopOnly` tables with `RowCardList` cards below `md`; `Section` and
  its disclosure indicator; `Notice` for the one outcome (standards rule 1); the recorder's exclusive
  `ToggleButtonGroup`; MUI `Switch`, `Chip`, `Dialog`, `TextField` select; `AdministrationHistory` `RowCard`
  entries. Gate: `gateShellPage(..., "role_management")`, unchanged.
- Desktop and 375px evidence: `mockups/W1-administer-a-seats-grants.html`, screens W1-01, W1-02a to W1-02e,
  W1-03 to W1-05, W1-07 to W1-09, all photographed on both sides at a browser-measured 1280 and 375
  (`mockups/shots/shots.json`).
- Removed this round: W1-02 (the full matrix, rejected as too busy) and W1-06 (Option B; Brian chose A).

## Required actions

1. Open Roles; switch to Access, or open a seat.
2. Change one roster category (None / View / Edit), one of the four switches (No / Yes), or one event category
   (None / View / Manage) on the seat page. The change saves on press.
3. Or, for a whole seat at once: _Copy access from another seat_ (choose the seat, read every change, confirm)
   or _Grant everything_ (confirm).
4. Read the outcome Notice and the new History entry.

## State transitions

- Grant: None ↔ View ↔ Edit (roster), No ↔ Yes (switch), None ↔ View ↔ Manage (events). Any to any.
- Copy: every grant of the target becomes the source seat's value, with no end date.
- Grant everything: every grant becomes Edit / Yes / Manage.
- Proposed for owner approval, not assumed (W1-09): a _Grant everything_ or copy may carry an _until_ date;
  on that date the seat's grants return to what they were, and the return is audited.
- Fixed seats (President, General Manager, IT Officer): no transition exists.

## Handoffs

- W3 and W4 read the grants on the holder's next request.
- The seat's History shows each change to anyone who can open the seat.

## Dependencies and mission boundaries

- `src/lib/auth/capabilities.ts` thirteen keys: those the matrix governs become derived from grants; the rest
  stay in code and are no longer listed on the seat page (the Permissions block is removed).
- LAN-406 (interim elevation of named seats) is the nearest existing idea to W1-09's time-limited delegation;
  if Brian approves W1-09 the two should be one mechanism.
- LAN-407 (who may pause messaging): out of scope; stays in code.

## Exceptions and recovery

- Attempt to reduce a fixed seat: no control exists; server refuses regardless (Central rule).
- Copy from a fixed seat onto another seat: allowed; it copies grants, never the fixed status.
- Two administrators change the same grant at once: last write wins, both audited. (Delegated.)
- A save fails: the control returns to the stored value and the Notice says the grant was not changed.

## Safety, privacy, consent, and authority boundaries

- Only `role_management` holders reach W1. The floor cannot be removed, so no edit locks out the matrix's own
  administrators.
- _Grant everything_ gives an ordinary seat full access, including Contact & emergency; the confirmation lists
  every grant that changes.
- Every change is append-only audited in `audit_events`: single changes as one entry each; a copy or grant
  everything as one entry with one line per grant.

## Acceptance evidence

- Each screen's behaviour walked on the built surface at 1280 and 375.
- A printed-matrix test pins the seed to the seed rule (delegated).

## Core decisions

| Decision                                                                                            | Classification              | Governing evidence or recommended default       | Status    |
| --------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------- | --------- |
| Twelve roster categories, None/View/Edit                                                            | locked                      | LAN-424 decision 2                              | recorded  |
| Four per-seat switches: open roster records, open recruit records, add to roster, add recruits      | locked                      | Brian, round-1 feedback on W1-03                | recorded  |
| Seven event categories, None/View/Manage; None hides everywhere                                     | locked                      | LAN-424 decisions 1, 4                          | recorded  |
| Attendance not in the matrix                                                                        | locked                      | LAN-424 decision 5                              | recorded  |
| President, GM, IT Officer fixed full; VP and Secretary start full, removable                        | locked                      | LAN-424 decision 6                              | recorded  |
| Seed rule wins: Treasurer nothing on the roster; coaches None on every event category               | locked                      | Lead decision, round 2                          | recorded  |
| Holders/Access switch is the app's `ViewSwitch`                                                     | locked                      | Brian, round-1 feedback on W1-01                | recorded  |
| Seat page Access section, save on press, History carries access changes                             | locked                      | Brian, round-1 feedback on W1-03 ("delightful") | recorded  |
| Permissions / Other permissions block removed from the seat page                                    | locked                      | Brian, round-1 feedback on W1-03                | recorded  |
| Seat page groups fold at 375                                                                        | locked                      | Brian, round-1 feedback on W1-04, W1-05         | recorded  |
| Option A placement (switch + seat page); Option B dropped                                           | locked                      | Brian chose A                                   | recorded  |
| Mass edits: Copy access from another seat (no expiry) and Grant everything, each one audited action | locked                      | Brian, round-1 feedback on W1-02                | recorded  |
| Access view layout: A category first, B collapsed matrix, C presets, D seat cards, E compare        | proposed for owner approval | W1-02a–e; recommend B                           | open      |
| Time-limited delegation ("until <date>")                                                            | proposed for owner approval | W1-09, drawn on B                               | open      |
| Presets as a stored concept (only if C is chosen)                                                   | proposed for owner approval | W1-02c                                          | open      |
| Table shapes, capability derivation, audit row shape, printed-matrix test, package split            | delegated to Mission Lead   | LAN-424 "Delegated"                             | delegated |

## Brian approval

- Exact words: pending
- Date: pending
