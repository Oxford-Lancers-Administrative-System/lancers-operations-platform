# LAN-424 design sprint — handoff

Granular Roles & Permissions (parent LAN-423). Review artifacts only; no application code changed.
Baseline `main` @ `150a59c6`. Everything below is a draft pending Brian's approval.

## First decision: where the matrix lives

### Option A — recommended: a Holders | Access switch on Roles, plus an Access section on each seat

- **W1-01** — the Roles index gains a _Holders | Access_ switch (the Events page's _List | Calendar_ idiom).
  Holders stays the default; its Permissions column becomes a one-line Access summary.
- **W1-02** — _Access_ is the matrix: twenty seat rows grouped as the index groups them; a Roster table
  (twelve categories plus the three switches) and an Events table (seven categories). Cells edit in place.
- **W1-03 / W1-04 / W1-05** — each seat's own page swaps its read-only Permissions list for an _Access_
  section (toggle groups and switches), keeps what the matrix does not govern under _Other permissions_, and
  records every change in the seat's _History_. At 375 the matrix is one card per seat opening this page.

Why: the outcome is "every seat gets exactly the access its job needs", which is a comparison across seats,
and only a matrix shows twenty seats side by side. The seat page is still needed — it is the only honest
375px rendering, and it is where the audit trail already lives (`AdministrationHistory`). Nothing is added to
the sidebar, whose phone bottom bar is already full. It replaces nothing but the Permissions column and list,
which today describe code the matrix now controls.

Cost: two surfaces write the same grant (matrix cell and seat toggle); they must be pinned to each other by
test (standards rule 7). If that is unwelcome, the matrix can be read-only with every change made on the seat
page — a variant of A, same screens.

### Option B — seat pages only, no matrix

- **W1-06** — the Roles index keeps its holder tables with the Access summary column and a _Change access_
  action; there is no Access view. Every grant is changed on the seat page (W1-03 to W1-05 unchanged).

Cheaper, one writing surface. But no screen shows two seats' grants together, so "is the Kit Manager's access
right relative to the Gameday Secretary's?" needs twenty page visits.

### Option C — considered, not drawn

A new Administration destination ("Access") for the matrix. Rejected: one more item in a bottom bar that
already truncates, and it separates a seat's holder from its access when the Roles page already joins them.

## Screens

Every screen is **photographed on both sides** (current via `shoot --route`, proposed via
`shoot --proposal`), at a browser-measured 1280 and 375. Nothing is drawn. Records: `mockups/shots/shots.json`
(head `150a59c6`, slot primary, proposal SHA-256 matching each committed `mockups/proposals/Wn-nn.js`).

| ID    | Page                               | Shows                                                                                                                                                         |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1-01 | `/operate/admin/roles`             | Roles index with the Holders/Access switch and Access summary column; Central rule chips on the three fixed seats                                             |
| W1-02 | `/operate/admin/roles?view=access` | The matrix: Roster table (12 + 3 switches) and Events table (7); fixed rows locked with `Central rule · LAN-423`; VP and Secretary editable; 375 = seat cards |
| W1-03 | Kit Manager seat page              | Access section after Kit None → Edit; success Notice; three _Access changed_ entries in History                                                               |
| W1-04 | Vice-President seat page           | One seat at a time, full and removable; the 375 path; Other permissions narrowed                                                                              |
| W1-05 | President seat page                | Fixed seat: locked controls, Central rule chip and the enabling rule sentence                                                                                 |
| W1-06 | `/operate/admin/roles`             | Option B: index with Access summary and _Change access_, no matrix                                                                                            |
| W2-01 | `/operate/events/templates`        | _Template categories_ section (7 fixed rows, colour select, template count); Category column on templates                                                     |
| W2-02 | Social template form               | Colour section replaced by a Category field, disabled once events exist                                                                                       |
| W2-03 | `/operate/events/templates/new`    | Category select open with the seven categories                                                                                                                |
| W3-01 | `/operate/roster`                  | Board as the Kit Manager: only Person (view) and Kit (edit) columns; no Add players or ungranted filters; 375 cards stripped of ungranted chips               |
| W4-01 | `/operate/events?period=term`      | Events list as a Social Secretary managing Social only: four socials, bucket counts follow                                                                    |

Mockup pages: `mockups/W1-administer-a-seats-grants.html`, `mockups/W2-manage-template-categories.html`,
`mockups/W3-work-the-roster-within-granted-categories.html`, `mockups/W4-work-events-of-a-granted-category.html`.

**Photographed versus drawn:** all eleven photographed; none drawn. W3-01 and W4-01 are photographed signed
in as the local review account (every grant) and narrowed by the proposal script, because no Kit Manager or
Social Secretary login exists locally; the sidebar and signed-in name are changed to match. W3-01's proposal
opens the folded Kit group, copies the board and folds it again before drawing, so the review account's
stored fold preference is written back unchanged.

## Open questions, by screen

- **W1-01** — Keep the one-line Access summary on the Holders view once the Access view exists? (Recommended: keep.)
- **W1-02** — Matrix edited in place (shown, recommended) or read-only with changes on the seat page?
- **W1-02** — Treasurer seed: Edit on Membership and _Add to the roster_, None elsewhere (derived from
  `membership_activation` and `roster_bulk_import`; the Treasurer cannot open the roster today). Confirm.
- **W1-02** — Coaches' event seed: View on all seven (shown; what a coach reads today) or Practice and Game only
  (the definition doc's recommendation)?
- **W1-03** — Save on press with one audit entry per grant (shown), or a Save button per section?
- **W1-03** — Per-seat History enough, or also a club-wide access history?
- **W1-04** — At 375, fold Roster / Records and adding / Events so the page opens short (about 3,200px today)?
- **W1-05** — none; the floor is locked.
- **W2-01** — May two categories share a colour? (Recommended: no.) Recolouring a category recolours past events — intended?
- **W2-02** — Template category fixed once an event exists? (Recommended: yes, shown.)
- **W2-03** — New template defaults to Practice (shown) or must choose?
- **W3-01** — Move _Contactable_ under Contact & emergency and _Missing_ under Onboarding now each is its own grant?
- **W4-01** — Does Manage include approving and releasing invitations (`event_approval`)? (Recommended: yes.)
- **W4-01** — May a category manager edit that category's templates? (Shown: no.)
- **W4-01** — Type filter lists only granted categories? (Recommended: yes.)
- **Not in any screen** — the Monday report (`leadership_report`) is listed under Other permissions for VP and
  President; with category-scoped events, should the report scope to granted categories too? Decision says
  None hides from the report, so the report itself becomes grant-scoped — confirm who may open it at all.

## Ledger state and what could not be done

- `state.json`: `ledger_version` 3, baseline `150a59c6`, stage `boundary`, four workflows at `spec_draft`.
  The stage cannot advance without Brian's recorded words for boundary, overview and inventory, and none are
  recorded on LAN-424; none were invented.
- `npm run intake -- hub M-GRANULAR-ROLES-AND-PERMISSIONS --write` refused:
  `mission intake system not ready: M-GRANULAR-ROLES-AND-PERMISSIONS is a version 1 ledger before the workflow stage and generates no hub.`
  (The ledger is version 3; the CLI's message names the wrong reason. The real gate is the stage.) So
  `mockups/index.html` does not exist yet; generate it after the inventory approval. The workflows are held at
  `spec_draft` rather than `mock_draft` because `mock_draft` requires an approved specification.
- Specification files are `workflows/Wn-<slug>.md`, not `workflows/Wn.md`: the ledger validator requires the slug.
- Branch: creating `feat/lan-424-design-sprint` was refused by the auto-mode classifier
  ("[Modify Shared Resources]"); the work is committed on the worktree's own branch instead.

## Restart the environment to view the pages live

From this worktree (the role ids in the seat routes are regenerated by every reset, so read them from the
Roles page):

1. `npm ci`
2. `npm run db:acquire -- LAN-424`
3. `npm run db:start` (restores the synthetic dataset and the review login)
4. `npm run dev:slot`
5. Sign in at the slot's `/login` and open `/operate/admin/roles`, `/operate/events/templates`,
   `/operate/roster`, `/operate/events`.
6. To re-photograph a screen: `npm run intake -- shoot M-GRANULAR-ROLES-AND-PERMISSIONS --screen W1-02 --route "/operate/admin/roles?view=access" --proposal missions/intake/M-GRANULAR-ROLES-AND-PERMISSIONS/mockups/proposals/W1-02.js`
7. When finished: `npm run db:release`

The mockup pages themselves are static files; open them directly, no server needed.
