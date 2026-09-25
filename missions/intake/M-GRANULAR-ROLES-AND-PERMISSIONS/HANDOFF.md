# LAN-424 design sprint — handoff, round 2

Granular Roles & Permissions (parent LAN-423). Review artifacts only; no application code changed. Application
code is `main` @ `150a59c6`; round 2 is built on round 1 (`c804a0b4`) and revises it on Brian's feedback of
2026-09-25. Everything below is a draft pending Brian's approval.

## What round 2 changed

- **W1-01 accepted, condition met.** The _Holders | Access_ switch is the app's own `ViewSwitch`
  (`src/app/calendar/view-switch.tsx`), the _List | Calendar_ control on `/operate/events` and
  `/operate/events/calendar`. The proposal fetches it from the running events page and relabels it, so the
  photograph is the component itself.
- **W1-02 retired** ("very, very busy"). Replaced by five Access-view alternatives, W1-02a to W1-02e, ranked
  below. Every one carries the two mass edits, drawn once for all of them in W1-07 (the copy dialog) and W1-08
  (the audit entry). W1-09 draws the recommended alternative with a time-limited delegation, marked
  `Proposed for owner approval`.
- **W1-03, W1-04, W1-05 kept.** Four switches now: _May open individual records (roster)_, _May open
  individual records (recruits)_, _May add people to the roster_, _May add recruits_. The Permissions / Other
  permissions block is removed (see W1-03's head for the one consequence). W1-04 and W1-05 fold their three
  groups at 375.
- **W1-06 removed** (Brian chose Option A): its proposal, shots and `shots.json` record are deleted.
- **Lead decisions applied.** Treasurer seeds nothing on the roster; coaches seed None on every event
  category (W1-01 and every summary). Category colours unique, template category fixed once events exist, and a
  new template has no default category: W2-03 re-photographed with the Category select empty and required;
  W2-01 and W2-02 texts record the decisions (their photographs are unchanged). Manage includes approving and
  releasing invitations and the Type filter lists only granted categories: recorded on W4-01 and in W4's spec.
- **New screens Brian asked for:** W3-02, W3-03, W3-04 (the roster with limited access) and W4-02 to W4-05
  (events with limited access).

## The decision this round asks for: which Access view

All five are photographed on both sides at 1280 and 375, as proposals scripted into the live Roles page.

1. **B — collapsed matrix (W1-02b). Recommended.** Twenty rows, three columns: Roster, Events, Records and
   adding, as counts (_Edit 1 · View 1_, _View all_, _1 of 4_). A row opens in place to chips for exactly what
   the seat holds and three actions: Open seat, Copy access from another seat, Grant everything. _Easy:_ the
   whole club reads on one screen without a single toggle on it, which answers "too busy"; it keeps the table
   and row-card shape of the accepted W1-01, so Holders and Access look like one page; categories are edited
   only on the seat page Brian called delightful, so there is one writing surface (round 1's two-surface
   worry disappears); it is the natural 375 layout. _Hard:_ counts do not say which categories, so "who can
   see Kit?" needs rows opened; comparing two seats' exact grants means opening both.
2. **E — compare two seats (W1-02e).** Two seats side by side, the first editable, copy-across arrows where
   they differ, and _Copy access from <seat>_ at the head. _Easy:_ matching one seat to another precisely,
   which is exactly the "club without a Secretary" case; every difference is visible. _Hard:_ no overview of
   twenty seats; one pair at a time; both columns of 23 rows is long. It is the best copy tool and would sit
   well inside B's seat page later, but not as the Access view itself.
3. **A — category first (W1-02a).** Choose a category; every seat's level for it in one list. _Easy:_ auditing
   and changing one category across all seats ("who may see Contact & emergency?"); short at 375. _Hard:_ a
   seat is never seen whole; setting up one new seat means visiting 23 categories; the mass edits act on a
   seat, so they need their own seat picker on a page organised by category.
4. **D — seat cards (W1-02d).** One card per seat with summary chips, the four switches and the actions.
   _Easy:_ each seat's summary and its switches at a glance, switches in one tap. _Hard:_ twenty cards with
   four switches each is busy again (the round-1 objection); switches become editable in two places; about
   7,000px at 375.
5. **C — presets (W1-02c).** Each seat gets a named bundle and is adjusted on its seat page. _Easy:_ setting up
   a new seat in one choice. _Hard:_ presets are a new club concept needing Brian's decisions on each bundle;
   the seed rule matches no preset, so on day one fifteen of twenty seats read _Custom_ (shown honestly); a
   preset and its adjustments drift apart, and "which preset is this seat on" stops meaning anything after the
   first adjustment. _Same as …_ and _Everything_ are just the two mass edits under other names.

**Recommendation: B**, with W1-07/W1-08 as the mass edits (Copy access has no expiry). W1-09 shows B with a
time-limited delegation (_Everything until 31 Oct 2026_, an _End now_ action, the return audited); it is
`Proposed for owner approval` and not assumed. If adopted, it should be the same mechanism as LAN-406's
interim elevation.

## Screens

Every screen is **photographed on both sides** (current via `shoot --route`, proposed via
`shoot --proposal`) at a browser-measured 1280 and 375. Nothing is drawn. `mockups/shots/shots.json` records
each screen's head, slot and the SHA-256 of its committed proposal; all 24 hashes match the committed files.
Round-2 screens were shot at head `c804a0b4` on the overflow slot; W2-01, W2-02, W3-01 and W4-01 keep their
round-1 photographs (head `150a59c6`, primary slot) because nothing in them changed.

| ID     | Page                                | Shows                                                                                  | Grounding           |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------------- | ------------------- |
| W1-01  | `/operate/admin/roles`              | Holders view: `ViewSwitch`, Access summary column, corrected seeds                     | photographed        |
| W1-02a | `/operate/admin/roles?view=access…` | A: category first (Kit)                                                                | photographed        |
| W1-02b | `/operate/admin/roles?view=access`  | B: collapsed matrix, Kit Manager row open — recommended                                | photographed        |
| W1-02c | `/operate/admin/roles?view=access`  | C: presets, Head Coach menu open                                                       | photographed        |
| W1-02d | `/operate/admin/roles?view=access`  | D: seat cards with switches                                                            | photographed        |
| W1-02e | `/operate/admin/roles?view=access…` | E: Treasurer compared with Secretary                                                   | photographed        |
| W1-03  | Kit Manager seat                    | One grant changed, audit line; four switches; no Permissions block                     | photographed        |
| W1-04  | Vice-President seat                 | Full and removable; groups folded at 375                                               | photographed        |
| W1-05  | President seat                      | Fixed: locked controls, Central rule; folded at 375                                    | photographed        |
| W1-07  | Treasurer seat                      | Copy access from another seat: dialog listing 23 changes, no expiry                    | photographed        |
| W1-08  | Treasurer seat                      | After the copy: one Notice, one History entry with 23 per-grant lines                  | photographed        |
| W1-09  | `/operate/admin/roles?view=access`  | B with _Everything until 31 Oct 2026_ — Proposed for owner approval                    | photographed        |
| W2-01  | `/operate/events/templates`         | Template categories section (unchanged photograph; decisions recorded)                 | photographed (rd 1) |
| W2-02  | Social template form                | Category field, fixed once events exist (unchanged photograph)                         | photographed (rd 1) |
| W2-03  | `/operate/events/templates/new`     | Category select open, empty and required — no default                                  | photographed        |
| W3-01  | `/operate/roster`                   | Board as the Kit Manager (unchanged)                                                   | photographed (rd 1) |
| W3-02  | `/operate/roster`                   | Board as a coach: Person view, six edit groups, rows open nothing                      | photographed        |
| W3-03  | Alaric Brindlewood's record         | Record as the Kit Manager: only Person and Kit exist                                   | photographed        |
| W3-04  | `/operate/recruitment`              | Recruitment board, View on Recruits, no record switch: reads, nothing edits or opens   | photographed        |
| W4-01  | `/operate/events?…period=term`      | Events list as the Social Secretary (unchanged photograph; decisions recorded)         | photographed (rd 1) |
| W4-02  | Club social — hilary week 5         | Social event as the Social Secretary: everything visible, every manage control present | photographed        |
| W4-03  | `/operate/events/calendar`          | Calendar as the Social Secretary: socials only, W2's Social colour                     | photographed        |
| W4-04  | `/operate/admin/follow-ups`         | Follow-ups (read as the delivery board) as the Social Secretary: social rows only      | photographed        |
| W4-05  | vs Ivybridge Ravens                 | Game with View on Game: create/edit/delete/send/schedule absent, not disabled          | photographed        |

Mockup pages: `mockups/W1-administer-a-seats-grants.html`, `mockups/W2-manage-template-categories.html`,
`mockups/W3-work-the-roster-within-granted-categories.html`, `mockups/W4-work-events-of-a-granted-category.html`.

**Signed in as whom.** The shoot command signs in only as the local review account (Caspian Hallowfield:
IT Officer, Secretary, Media Secretary). Every W3 and W4 screen, and W1's seat pages, are that login narrowed
by the proposal script; the sidebar and signed-in name are changed to the example seat's holder, and each
screen head says so. A local coach login exists (`db:link-coach`), but the shoot command cannot use it and
both sides must come from the same producer. W3-02 and W3-03 draw fold-held groups from a copy of the board
or disclosure, so the review account's stored fold preferences are never written.

Screen ids carry a lower-case suffix (W1-02a, not W1-02A): the intake CLI's screen-id grammar is
`W<n>-<nn>[a-z]`.

## Open questions, by screen

- **W1-02 (a–e)** — Which Access view? Recommended B.
- **W1-02c** — Only if C is chosen: the bundles themselves, including whether _Coach standard_ grants any event
  category.
- **W1-03** — Removing the Permissions block means role management, pausing messaging, the Monday report,
  erasure and the playbook are described on no seat page any more (the Guide still explains them). Accept?
- **W1-03 / W3-04** — Now that _May add recruits_ is its own switch, Edit on Recruits no longer includes adding
  a prospect or the QR sign-up. Confirm.
- **W1-07** — Copy from a fixed seat copies its grants but never its fixed status. Confirm.
- **W1-09** — Adopt time-limited delegation? If yes: also for Copy access? Merge with LAN-406?
- **W3-01 / W3-02** — Board columns _Contactable_ → Contact & emergency and _Missing_ → Onboarding (drawn so in
  W3-02, not in W3-01's round-1 photograph).
- **W3-02** — Coach grants shown are an example, not a seed; the seed still gives coaches nothing on the roster.
  Should the seed differ?
- **W3-03** — Without Membership, the record subtitle drops entry route and status. Confirm.
- **W3-04** — Does the recruitment board's _Contactable_ follow Contact & emergency or belong to Recruits?
  Shown kept.
- **W4-01** — May a category manager edit that category's templates? Shown no.
- **W4-04** — Is the "delivery board" the Follow-ups queue (shown) or the per-event Delivery page?
- **W4-05** — _Event info link_ kept for View (it copies a public link, sends nothing). _Roster form_ treated as
  Manage. Confirm both.
- **Not in any screen** — the Monday report scoped to granted categories, and who may open it at all.

## Ledger state and what could not be done

- `state.json` unchanged: `ledger_version` 3, stage `boundary`, four workflows at `spec_draft`. The stage cannot
  advance without Brian's recorded words for boundary, overview and inventory; none were invented. So
  `npm run intake -- hub --write` still refuses (round 1 recorded the exact message) and `mockups/index.html`
  does not exist yet.
- Specifications updated: `02-workflows.md` (four switches), `workflows/W1-*.md` (rewritten for round 2),
  `W2-*.md` (three decisions recorded), `W3-*.md` and `W4-*.md` (new screens and rules).
- Refusals this round, all from the worktree-isolation guard on compound shell commands; each was re-run as
  plain separate commands or a small Node script, and nothing was left undone:
  - `This agent is isolated in the worktree …, but this command runs sed with a value computed at runtime (the
variable f) … Split it into plain, separate commands …`
  - `… but this command is too complex to verify that it stays inside the worktree. Refusing to run it …`
  - `… but this command runs npm with the text /operate/admin/roles?view=access inside a construct too complex
to verify …`

## Restart the environment to view the pages live

From this worktree (seat, event and membership ids are regenerated by every reset; read them from the Roles
page, the events list and the roster):

1. `npm ci`
2. `npm run db:acquire -- LAN-424`
3. `npm run db:start` (restores the synthetic dataset and the review login)
4. `npm run dev:slot`
5. Sign in at the slot's `/login` and open `/operate/admin/roles`, `/operate/events/templates`,
   `/operate/roster`, `/operate/recruitment`, `/operate/events`, `/operate/events/calendar`,
   `/operate/admin/follow-ups`.
6. To re-photograph a screen:
   `npm run intake -- shoot M-GRANULAR-ROLES-AND-PERMISSIONS --screen W1-02b --route "/operate/admin/roles?view=access" --proposal missions/intake/M-GRANULAR-ROLES-AND-PERMISSIONS/mockups/proposals/W1-02b.js`
7. When finished: `npm run db:release`

The mockup pages themselves are static files; open them directly, no server needed.
