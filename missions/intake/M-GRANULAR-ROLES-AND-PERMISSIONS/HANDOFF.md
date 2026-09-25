# LAN-424 design sprint — handoff, round 3

Granular Roles & Permissions (parent LAN-423). Review artifacts only; no application code changed.
Application code is `main` @ `0d4b6ce5`; round 3 is round 2 (`39aacf33`) merged onto it (`726c9346`) and
revised for Brian's call with Stewart (2026-09-25) and his amendments after it. Everything below is a draft
pending Brian's approval.

## The model now

- **Access is edited on the seat page and nowhere else.** The Roles index is unchanged. A seat page keeps the
  holder at the top; Access replaces today's Permissions list.
- **Roster**: the board's ten groups plus Contact & emergency, None / View / Edit. **Recruiting** is its own
  group: Person information, Recruit details (None / View / Edit), Event details (None / View).
- **Events per template**: every template on `main` (Chalk, Game, Meeting, Practice, Recruitment, Social,
  Strength and conditioning, read live from the templates page) is one line, None / View / Manage. No types,
  no categories; templates keep their own colour; the event templates page is unchanged.
- **Two switches**: may add to the roster, may add recruits. No records switch: records open for anyone who
  can reach the roster or recruits. Inside a record a None category is collapsed and locked (a lock in place
  of the chevron, cannot open, contents never sent); the name stays. View on the board is view in the record.
- **Floor**: President, General Manager, IT Officer hold everything, fixed. Vice-President and Secretary start
  full, removable one grant at a time. Every other seat starts with None on every category and template.
- Attendance is not in the access list. Copy access / Grant everything stay on the seat page, `Proposed for
owner approval`. No time-limited delegation.
- **Roster group colours become editable** from an _Edit categories_ control on the roster, with the palette
  change (Lancer Blue, Lancer Gold, Oxford Blue).

## What round 3 changed

- **Retired** (pages, proposals, shots and `shots.json` records removed): W1-02a, W1-02b, W1-02c, W1-02d,
  W1-02e (the five Access views), W1-09 (time-limited delegation), and round 1–2's W2-01, W2-02, W2-03
  (Template categories and the template form's Category field). W2-01 and W2-02 are reused with new meaning.
- **Renamed**: W2 is now "Edit roster group colours" (`workflows/W2-edit-roster-group-colours.md`,
  `mockups/W2-edit-roster-group-colours.html`); W4 is "Work events of a granted template"
  (`…-granted-template.*`); W3 covers recruits too. `state.json` names and `02-workflows.md` follow.
- **W3-04 split in two**: W3-04a (the recruits board) and W3-04b (a prospect record), because one shot is one
  route.
- Every revised screen re-photographed on both sides; the proposal scripts share one new prelude (the round-3
  grant model) and kit (the Access section, board narrowing, record locking).

## Screens

Every screen is **photographed on both sides** (current via `shoot --route`, proposed via
`shoot --proposal`) at a browser-measured 1280 and 375, at head `726c9346` on the primary slot. Nothing is
drawn. `mockups/shots/shots.json` has 18 records; all 18 proposal hashes match the committed files.

| ID     | Page                                 | Shows                                                                                                                                                 | Grounding    |
| ------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| W1-01  | `/operate/admin/roles`               | Roles index, **Existing**: nothing changes (identical pair; the proposal is a no-op)                                                                  | photographed |
| W1-03  | Kit Manager seat                     | Holder; Access: Roster 11, Recruiting 3, 7 templates, 2 switches, mass edits (Proposed for owner approval); Kit None → Edit notice; two History lines | photographed |
| W1-04  | Vice-President seat                  | Full and removable; groups folded at 375                                                                                                              | photographed |
| W1-05  | President seat                       | Locked controls, `Central rule · LAN-423`; no mass edits; folded at 375                                                                               | photographed |
| W1-07  | Treasurer seat                       | Copy access dialog from Vice-President: 23 changes with the new category list                                                                         | photographed |
| W1-08  | Treasurer seat                       | After the copy: one Notice, one History entry with 23 lines                                                                                           | photographed |
| W2-01  | `/operate/roster`                    | _Edit categories_ (outlined Button) top right, beside Add players                                                                                     | photographed |
| W2-02  | `/operate/roster`                    | _Roster categories_ dialog: ten groups, band preview + colour Select; Kit's menu open on the new palette                                              | photographed |
| W3-01  | `/operate/roster`                    | Board as the Kit Manager: Person (view) and Kit columns only; Add players absent                                                                      | photographed |
| W3-02  | `/operate/roster`                    | Board as a coach (example grants): Person view, six edit groups; Contactable and Missing in Person; rows open                                         | photographed |
| W3-03  | Alaric Brindlewood's record          | Record as the Kit Manager: Person and Kit open; Contact & emergency (new section) and every other section locked                                      | photographed |
| W3-04a | `/operate/recruitment`               | Recruits board, View on Recruit details only: Recruitment columns only; QR code, Add recruit absent                                                   | photographed |
| W3-04b | Persephone Wilding's prospect record | Person information and Event details locked; Recruitment read-only                                                                                    | photographed |
| W4-01  | `/operate/events?…period=term`       | Events list as the Social Secretary; Type menu open listing only Social                                                                               | photographed |
| W4-02  | Club social — hilary week 5          | Social as the Social Secretary: everything, every manage control                                                                                      | photographed |
| W4-03  | `/operate/events/calendar`           | Calendar as the Social Secretary: socials only, the Social template's own colour                                                                      | photographed |
| W4-04  | `/operate/admin/follow-ups`          | Follow-ups as the Social Secretary: social rows only                                                                                                  | photographed |
| W4-05  | vs Ivybridge Ravens                  | Game with View on the Game template: manage controls absent, not disabled                                                                             | photographed |

**Signed in as whom.** The shoot command signs in only as the local review account (Caspian Hallowfield: IT
Officer, Secretary, Media Secretary). Every W3 and W4 screen is that login narrowed by the proposal script;
the sidebar and signed-in name are the example seat's holder, and each screen head says so. W3-01 opens the
folded Kit group to copy the board and folds it again, so the account's stored fold preference ends as it
began; W3-03 opens Kit on a copy and writes nothing.

## The palette finding

- **Where the colours live.** Two separate sets today:
  - Template colours: `TEMPLATE_COLOUR_PALETTE` in `src/lib/services/event-template-input.ts` (twelve
    swatches, stored as keys in `event_templates.colour_key`). The migration
    `supabase/migrations/20260916090000_event_templates.sql` restates the key list in the check constraint
    `event_templates_colour_key_known`.
  - Roster group colours: `BAND_COLOURS` in `src/components/section.tsx`, hard-coded, read by the board
    (`src/app/operate/roster/board-columns.ts`) and the record. They use brand tokens from
    `src/theme-tokens.ts` (Oxford Blue `#002147`, Royal Blue `#1D42A6`, Old Gold `#8D7149`) and five custom
    tones, none of which is a palette swatch except Slate.
- **What constrains the set.**
  - The calendar feed (`src/app/calendar/feed.ics/route.ts`, `src/lib/services/calendar-feed.ts`) carries no
    colour at all, so it constrains nothing.
  - The database check constraint: adding `lancer_gold` and `oxford_blue` keys (if templates may use them)
    needs a forward migration replacing `event_templates_colour_key_known`.
  - **Contrast.** Band heads print white text. White on Lancer Gold `#C09723` is 2.7:1 and on Orange
    `#ef6c00` 3.1:1, both below AA; every other swatch passes (Cyan and Lime at 4.5). Each swatch needs its own
    band-text colour (charcoal on those two, drawn in W2-02). `src/theme.test.ts` recomputes contrast and
    would need the new pairs.
  - Editable group colours are a new stored fact (a club-level table or settings row): a data-model addition
    for `docs/architecture/data-model.md`, with RLS and narrow grants.
- **How the change was drawn** (the brief read literally): key `blue` is relabelled **Lancer Blue** and
  re-toned to the team blue, drawn as the brand board's Royal Blue `#1D42A6`; **Lancer Gold** `#C09723` (brand
  board Gold) added; the old blue `#1565c0` kept under the name **Oxford Blue**. Templates on the seat pages
  and the calendar are drawn in today's colours.

## Open questions, by screen

- **W1-03** — Brian's list said twelve roster categories; with Recruits moved to Recruiting the Roster group
  has eleven. Drawn as eleven. Confirm.
- **W1-03 / W1-07 / W1-08** — Copy access and Grant everything: adopt? (Proposed for owner approval.) Copy from
  a fixed seat copies grants, never fixed status.
- **W2-01** — Who may edit group colours? Proposed: `role_management` (President, GM, IT Officer).
- **W2-02** — Which hex is Lancer Blue (drawn `#1D42A6`)? Is "Oxford Blue" the old swatch `#1565c0` (drawn) or
  the brand board's Oxford Blue `#002147`, the navy the Person band wears today? The names collide.
- **W2-02** — Renaming key `blue` re-tones Practice (and any template on it) to Lancer Blue on the calendar.
  Accept, or move those templates to Oxford Blue so nothing on the calendar changes?
- **W2-02** — Starting colours: five groups' tones are not palette colours; drawn as the nearest swatch
  (Onboarding and Kit Lancer Gold, Membership Oxford Blue, Offensive Teal, Special teams Brown, Warmup Cyan,
  Person Lancer Blue, Coaching Indigo). Or add Old Gold to the palette?
- **W2-02** — Charcoal band text on Lancer Gold and Orange (white fails AA). Accept?
- **W3-02** — Contactable's _Mobile_ chip dials the number, so View on Person reveals mobiles while Contact &
  emergency is None. Keep, or make the chips plain indicators then?
- **W3-02** — Missing counts onboarding items but stays in Person as instructed, so a seat with None on
  Onboarding still sees the count. Confirm.
- **W3-03** — Attendance is not in the access list, but the record's Attendance section lists events of every
  template. Drawn locked with the rest; or always open?
- **W3-04b** — Notes, What changed and Status history drawn as Recruit details. Or Notes under Person
  information?
- **W4-01** — May a template manager edit that template itself? Shown no (_Edit templates_ absent).
- **W4-04** — Is the "delivery board" the Follow-ups queue (shown) or the per-event Delivery page?
- **W4-05** — _Event info link_ kept for View (it copies a public link, sends nothing). Confirm.
- **Not in any screen** — the Monday report scoped to granted templates, and who may open it at all.

## Ledger state and what could not be done

- `state.json`: `ledger_version` 3, stage `boundary`, four workflows at `spec_draft`, names updated for round 3. `npm run intake -- check` reports the ledger consistent. The stage cannot advance without Brian's recorded
  words for boundary, overview and inventory; none were invented. So `npm run intake -- hub --write` refuses,
  verbatim: `mission intake system not ready: M-GRANULAR-ROLES-AND-PERMISSIONS is a version 1 ledger before
the workflow stage and generates no hub.` `mockups/index.html` does not exist yet.
- Specifications rewritten: `02-workflows.md` (W2 is now "Edit roster group colours"; amendment recorded),
  `workflows/W1-*.md` to `W4-*.md`.
- Refusals this round, all from the worktree-isolation guard on compound shell commands (a heredoc, a
  multi-command line, a Python rewrite); each was re-done with the Write/Edit tools or plain separate commands,
  and nothing was left undone:
  - `This agent is isolated in the worktree …, but this command is too complex to verify that it stays inside
the worktree. Refusing to run it — a worktree-isolated agent's git operations must target its own worktree.
Split it into plain, separate commands and run them from ….`

## Restart the environment to view the pages live

From this worktree (seat ids are regenerated by every reset; read them from the Roles page):

1. `npm ci`
2. `npm run db:acquire -- LAN-424`
3. `npm run db:start` (restores the synthetic dataset and the review login)
4. `npm run dev:slot`
5. Sign in at the slot's `/login` and open `/operate/admin/roles`, `/operate/roster`, `/operate/recruitment`,
   `/operate/events`, `/operate/events/calendar`, `/operate/admin/follow-ups`.
6. To re-photograph a screen:
   `npm run intake -- shoot M-GRANULAR-ROLES-AND-PERMISSIONS --screen W2-02 --route /operate/roster --proposal missions/intake/M-GRANULAR-ROLES-AND-PERMISSIONS/mockups/proposals/W2-02.js`
7. When finished: `npm run db:release`

The mockup pages themselves are static files; open them directly, no server needed.
