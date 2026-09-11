# LAN-186 - This season's squad as a twenty-column board

Status: implemented, as built. This is the contract the shipped surface was
built against, not a plan — see `../slice-ux.md` for the shared vocabulary,
authorization and responsive rules this ticket does not restate.

> **Synthetic scenario data:** all displayed people, positions, jersey numbers
> and onboarding states are synthetic and do not correspond to real members.

Authority: LAN-186 in Linear, `missions/intake/M-PEOPLE-AND-ROSTER/workflows/
W5-work-this-seasons-roster.md`, `acceptance/W5.md`, and the approved
photographs at `missions/packets/M-PEOPLE-AND-ROSTER/mockups/
W5-work-this-seasons-roster.html`. Three owner decisions taken 2026-08-28,
after W5's own approval, override the drawings and are recorded inline below
wherever they bind. A second owner walkthrough of the built surface, 2026-08-29
(`Q-11`, `Q-12` in the `M-PEOPLE-AND-ROSTER` mission journal), changed Status,
Positions, value rendering, filtering, layout and the condensed view again —
recorded inline below, dated, wherever it binds.

## Relationship to LAN-75's ticket

LAN-75's `UX-20` (the roster list) and `UX-23` (its filtered-empty state) are
superseded by this ticket, root and branch — "redesigned, not extended"
(portfolio rule 3). LAN-75's `UX-21` (the membership record) is opened, not
rebuilt, by this package's `/operate/roster/[membershipId]` route. Its `UX-22`
(the activation-override dialog) is **not** unchanged: the 2026-08-29
walkthrough removed it, and every other status-transition control the record
carried, in favour of the one free-form status control this ticket now
documents — see "Status" below. That control is shared code
(`membership-actions.tsx`'s `MembershipStatusControl`), so this is the one
place LAN-186 edits a screen LAN-75 owns, by explicit owner instruction: "That
means on the player page and the people page, too, both of them that drop that
mark inactive."

## Owned screen and route

| Screen | Route             | Audience                                                               |
| ------ | ----------------- | ---------------------------------------------------------------------- |
| W5     | `/operate/roster` | President, Vice-President, Secretary, General Manager, IT Officer only |

`REQ-authority`: "four-role only, for the grid and every column on it." Unlike
LAN-75's `UX-20`, this is **not** an ordinary operator surface — the page opens
with `person_record_authority`, the same capability LAN-183 gates the full
person record behind, and refuses everyone else before any board data is read.

## What renders

Twenty columns, Player pinned, in three labelled and tinted bands — **Person**
(College, Matric, Grad, Degree, Contactable, Missing), **Onboarding**
(one column, deliberately lonely — Mission 7 adds the rest), and **Season**
(Status, Entry, Offence, Defence, Special teams, Blue #, White #, Coach group,
Formalwear, Blues, Eligibility, Availability). The board scrolls sideways
inside its own container; the page never scrolls horizontally.

Raw email and phone are gone, replaced by a Contactable indicator (`Mobile` /
`Email` chips, never a value). Date of birth and emergency contact appear
nowhere on this board and cannot.

### The three decisions that override the drawings (2026-08-28)

- **Positions are three single-select columns**, not the mockup-branch's
  multiselect. Offence and Defence map onto `position_slot`'s own values;
  Special teams is one board-level concept spanning the schema's four
  independent special-teams slots — setting a new value closes whichever of
  the four was open and opens the chosen one. Every change supersedes the
  current row by effective dating (S4); a same-day correction (opened and
  changed within one calendar day) deletes the same-day row instead of
  superseding it, because `..._period_ordered` requires `effective_to >
effective_from` strictly and there is no history in a row that lived zero
  calendar days. Position options come from the season's own vocabulary
  (`position_vocabularies`, invariant S3) — never a hardcoded list. **Codes
  only in the cell** (2026-08-29): the cells read `T`, never "Tackle" — the
  club's own vocabulary is the code, and the cell, closed, shows it alone.
  **Code and full name together in the open dropdown** (2026-08-29
  walkthrough correction, superseding this item's original "codes only... in
  the dropdown" half): "In the dropdown, it shouldn't just be the name. If
  it says QB, it should be QB-quarterback." Each open option now reads
  `QB — Quarterback`, the full name still read from the season's own
  vocabulary and never hardcoded; the selected value, closed, is unchanged.
- **Blue # and White # are pickers** over every number 1-99, taking several
  numbers per kit, rendered under the player name (`chore/roster-fidelity-mockup`'s
  `jersey-picker.tsx`, kept exactly). A number held by another current
  membership this season is shown ticked, named, and cannot be clicked —
  refused at the point of choosing; the server refuses it again on a race, but
  the UI should never surface that as an error on save.
- **The column filter is a funnel in a bordered button**, not a caret.

**A value never echoes beside its label** (2026-08-29): one rendering path
produced `` `${value} · ${label}` `` — "eligible · Eligible" — everywhere a
select cell was open for editing. Every select cell, Status included, now
shows the label alone, both closed and open, matching the column header's own
filter chip. Availability additionally carries a colour swatch before the
label, both closed and open.

### Filtering — three cooperating parts, and where they run (2026-08-29)

A pinned set of three (Status, Availability, Missing onboarding data); a
funnel in every other column's own header; and a `Filtered by` chip bar
carrying every active filter, with `Clear all`. A pinned control and its
column header write to the same filter, so setting one moves the other.

Search, filter and sort all run **in the browser**, over the one set of rows
the page already fetched — `RosterBoard`'s own `applyBoard()` call, not a
round trip. Before 2026-08-29 every change called `router.push()`, which
re-ran the server component and re-queried the whole board for data the page
was already holding. The URL still carries the current search, filters and
sort (via `history.replaceState`, not a navigation), so a filtered view is
still a link and still survives a refresh — that refresh, and the page's first
load, are the one real fetch Brian accepted taking a few seconds:
"I'm okay if the first time it loads it's 5 seconds, but it should be snappy
and fast. Everything after that, as fast as we can."

### Editing

A season fact (every Season-band column) edits in the cell: one click opens
it, the change commits on its own with no confirmation, and an audit event is
written naming actor, field, before and after — no reason asked, because
nothing durable is being overwritten. A person fact (every Person-band column
except Contactable and Missing) renders and routes to the person record
instead, captioned "edit on the record" in its header.

**Status is no longer the one exception (2026-08-29).** It was built reusing
`membership.ts`'s own transition table and the record's reason-taking
controls — `onboarding → active` behind one button, `active ⇄ inactive` behind
a reason-taking form, both bespoke to Status alone. The owner walkthrough of
the built surface removed all of it: `MEMBERSHIP_TRANSITIONS` and
`transitionIsLegal` are gone from `src/lib/services/membership.ts`, and Status
is now an ordinary `select` column exactly like every other season fact — one
click opens a plain dropdown over all five statuses, picking one commits it,
no confirmation and no reason, `archived` included (previously unreachable by
any built path). Two database checks still apply and are honoured in code
rather than renegotiated: `status = 'active'` requires `activated_on`, and
`status = 'departed'` requires `departed_on`, both set in the same write
(`coalesce(existing, current_date)`, so flipping out of and back into either
status preserves the original date). Because this is shared code
(`MembershipStatusControl`), the player page's "Membership status" panel lost
its "Activate membership" / "Mark inactive" / "Mark active again" buttons the
same way, down to one select.

Q-12, verbatim, is the record of the decision: "Okay, then we just remove it.
We can flip to whatever status we want to go in." His own test for it: "We can
still get an audit history to know what happened, right?" — yes:
`season_membership_status_events` is append-only by privilege and records
every flip regardless of the sequence that produced it.

### Layout — even spacing between all three bands (2026-08-29)

`ONBOARDING` and `SEASON` used to butt straight against each other while
`PERSON` had visible breathing room — the 2px seam between bands existed only
in the sticky band-label row, never in the body cells, so only the boundary
beside the always-bordered pinned Player column ever read as separated. The
same seam now draws in the column-header row and every body cell, so all three
boundaries read with equal weight.

**The padding inside each band header, not only the seam between them
(2026-08-29 walkthrough correction).** `PERSON` sat with a left inset before
its label; `ONBOARDING` and `SEASON` sat flush against their own band's left
edge with none. The inset `PERSON` had was never real padding — it was an
artifact of the sticky label's own scroll-following offset, which only ever
coincided with a visible gap for the band immediately after the pinned Player
column. Every band header now carries the same explicit left inset from one
shared rule, so a fourth band inherits it automatically; the seam between
bands above is unrelated and stands as it was.

### Column visibility is grant-driven, not merely role-gated once

Every column carries the capability it requires (`person_record_authority`
today, for all twenty), and a viewer's redacted row never carries a field
their columns do not grant — proved structurally in
`src/app/operate/roster/board-columns.test.ts`, independent of whether any
role is narrowed today. Widening or narrowing a column's grant later is an
edit to one field in `src/app/operate/roster/board-columns.ts`.

### Both empty states

A season with no memberships at all reads "This season has no memberships
yet"; a filter matching nobody reads "No memberships match these filters" and
offers `Clear filters` alongside `Add player`. Not photographed: the
system-empty state needs a season with no memberships, which the seeded
dataset does not contain — the same limitation the approved mockup itself
records.

### The condensed view at 375px — a way in, not a miniature board (2026-08-29)

Superseded, root and branch, by the second owner walkthrough. Built first as a
name-led card carrying Status, Entry, positions, Availability and the missing
count — a miniature version of the desktop grid. Brian, walking the built
surface: "the mobile view is horrendous. Most of the time, the operators
aren't going to be using this as a mobile view anyway, so it should just be a
way to click in." That departs from Task 08 §5's condensed card, and the
departure is authorized because he asked for it directly, in his own words,
on the running screen.

The card now carries exactly three things — the player's **name**, their
**status**, and the **missing-data flag** when it is set — and nothing else
from the twenty columns. **The whole card is the tap target**: it is an anchor
into `/operate/roster/[membershipId]`, not a chevron or a "View" link in a
corner. **Voice call stays** — W5 locks it as the mobile quick action, and
nothing here composes, schedules or sends a message — as its **own**,
separately tappable control, positioned so a tap meant for one control can
never fire the other (two sibling tap targets, neither nested inside the
other). The call button uses the membership's phone number only to compose a
`tel:` link; the number is never rendered as text anywhere on this board.
**No in-cell editing at 375px** — editing is desktop work; the phone is for
finding somebody and opening them. The pinned filters and search stay above
the card list; per-column funnel filters do not belong at this width and are
not offered there. The call control itself is restyled alongside this
rebuild — a circular icon button rather than the first build's plain outlined
"Call" text button, which Brian called simply ugly; it keeps the same 44px
minimum touch target and the same accessible name.

## Explicitly not in this ticket

- Player detail (`/operate/roster/[membershipId]`) — LAN-187's, opened and not
  rebuilt.
- A season picker or any season lifecycle action — Mission 11's.
- What a position, jersey number, coach group or availability level _means_
  on the field — Mission 9's; this ticket gives each a place to live.
- Saved views — deferred by the approved workflow, not rejected.
- `is_predominant` jersey selection — player detail's fuller editor.

## LAN-259 — the three pinned filters carry an accessible name

Found by the LAN-239 QA sweep (walker M5, finding M5-04) and fixed under
LAN-273. `PinnedSelect` rendered `<InputLabel>` beside `<Select label=…>` with
no `id` on the label and no `labelId` on the Select. MUI derives a combobox's
`aria-labelledby` from `labelId` and from nothing else — `label` only reserves
the notch in the outline — so Status, Availability and Missing onboarding data
all reported `aria-labelledby: null` and read to a screen reader as three
unnamed comboboxes. Functionally they always worked; they had no name.

The pair is now `useId()`-derived, so two boards on one page, or a label whose
text repeats, still name their own control. `board-screens.test.tsx` asks for
each filter _by its accessible name_, which fails the moment the pair is
dropped again.

## Acceptance criteria

The twenty checkboxes under **Acceptance** on the live LAN-186 issue are
binding verbatim. This document does not restate them.

## Decision history relocated from source (LAN-300)

### src/components/pinned-select.tsx — `PinnedSelect` (moved from roster-board.tsx's local `PinnedSelect`)

> One pinned filter. LAN-259: the `<InputLabel>` carries an `id` and the
> `<Select>` points at it with `labelId`, which is what gives the rendered
> combobox an accessible name — MUI derives `aria-labelledby` from `labelId`
> and from nothing else. Without the pair the three filters reported
> `aria-labelledby: null` and read to a screen reader as three unnamed
> comboboxes, even though `label` was set: `label` only reserves the notch in
> the outline. The id comes from `useId()` so that two boards on one page —
> or a label whose text repeats — still name their own control.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/roster/roster-board-card.tsx — `PlayerCard` (moved from roster-board.tsx's local `PlayerCard`)

> The phone card — LAN-186's owner walkthrough, item 15.
>
> Not a miniature board. Brian, 2026-08-29: "the mobile view is horrendous.
> Most of the time, the operators aren't going to be using this as a mobile
> view anyway, so it should just be a way to click in." So the card carries
> exactly three things — the player's name, their status, and the missing-data
> flag when it is set — and nothing else from the twenty columns. There is no
> in-cell editing at 375px; editing is desktop work, and the phone is for
> finding somebody and opening them.
>
> The whole card is the tap target, not a chevron or a "View" link in a
> corner — the anchor wraps the name and the chips. The call button is the one
> deliberate exception: its own control, its own tap target, `stopPropagation`
> on both so a call can never fire from a tap meant for the card and a card
> navigation can never fire from a tap meant for the call. W5 locks voice call
> as the mobile quick action and nothing else — a one-tap WhatsApp link would
> be manual sending outside the pipeline's consent checks, which R12 and R15
> prohibit.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/roster-board.ts — module header

> ## Why this is a new module rather than an addition to `membership.ts`
>
> The mission's collision plan runs this package beside `WP-people-read`
> (LAN-184) on disjoint files, and both packages call the substrate LAN-183
> built rather than editing it. This module adds nothing to `membership.ts`,
> `person-record.ts` or any other existing service file — it is a new file
> that _reads_ `listCurrentSeasonRoster()` for the base roster and adds the
> seven columns Task 08 §5 puts on the board and LAN-186 takes as scope:
> positions, jersey numbers, coach group, formalwear, Blues, eligibility and
> availability. All seven have storage on `main` already (LAN-182); nothing
> here is a migration.
>
> ## The three decisions this module encodes, verbatim from the issue
>
> 1. **Positions are three single-select columns, not one multi-select one.**
>    `Q-9`, 2026-08-28: "Doesn't need to be multi-tick, but we do need one
>    offense, one defense, and one special teams in the columns as is."
>    Offence and defence map directly onto `position_slot`'s `offence` and
>    `defence` values — S1 already permits at most one current assignment per
>    slot, so nothing about the constraint changes. **Special teams is the one
>    genuine application decision this package takes**: the schema gives
>    special-teams positions four independent slots (`kickoff`, `kick_return`,
>    `punt`, `field_goal`), each individually one-current-per-slot under S1,
>    but Brian asked for _one_ Special-teams value in _one_ column. This module
>    therefore treats "this membership's special-teams assignment" as a single
>    board-level concept: setting a new value closes every currently-open
>    special-teams row for that membership (whichever of the four slots it
>    was in) and opens one new row in the slot the chosen position implies.
>    That is an application-level narrowing of what the schema would allow,
>    not a database change, and it is the reading the issue's own words call
>    for ("one special teams in the columns as is").
>
> 2. **The vocabulary is read from the season, never hardcoded.** Invariant
>    S3: a position's vocabulary is a foreign key to the season's own. Every
>    option this module offers comes from `readPositionOptions()`, which joins
>    `positions` to `seasons.position_vocabulary_id`.
>
> 3. **Every change supersedes by effective dating (S4); nothing is deleted.**
>    Positions and eligibility close the current row's `effective_to` before
>    opening a new one, inside the same transaction as the insert. Jersey
>    numbers do the same per number: unticking closes a row, it is never
>    dropped. Availability is append-only by the schema's own design (A1), so
>    a change is always a new row and never an update.
>
> ## What this module does not decide
>
> `is_predominant` (jersey), the football meaning of a coach group, and what a
> position _means_ on the field are Mission 9's. Where a value needs a
> sensible default with no UI of its own — `is_predominant` is one — this
> module keeps the schema honest (at most one predominant row per kit, per
> `jersey_assignments_one_predominant_per_kit`) by promoting the lowest
> current number automatically; it never asks the operator to choose one, and
> the README on `chore/roster-fidelity-mockup` is explicit that choosing it
> belongs on player detail's fuller editor.
>
> `Eligibility` is rendered against the `club_play` competition specifically —
> a documented reading of a column the mockup and photographs never populate,
> chosen because it is the one competition scope every player needs regardless
> of which representative sides they may also qualify for. Widening the column
> to show every competition is a later, deliberate UI decision, not a service
> limitation.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/membership.ts — module header

> ## Why this is a separate module from `roster.ts`
>
> `roster.ts` is intake: one operator entering one returning player, and the
> dedupe decision that precedes it. This is what happens to a membership
> afterwards — reading the season's roster, resolving onboarding, and declaring
> a player operationally ready. Two different questions, two different sets of
> rules, and only one of them is privileged.
>
> ## The transitions — a free ladder, LAN-186's owner walkthrough
>
> There is no transition table any more. `MEMBERSHIP_TRANSITIONS` and
> `transitionIsLegal` were removed on Brian's explicit decision at the
> walkthrough of `feat/lan-186-roster-board`, recorded verbatim as `Q-12` in
> the `M-PEOPLE-AND-ROSTER` mission journal: "Okay, then we just remove it. We
> can flip to whatever status we want to go in." Any of the five statuses may
> become any other, `archived` included — a status a membership could
> previously never reach by any built path. Nothing asks a reason and nothing
> confirms first (a warn-only confirmation on `onboarding → active` was
> proposed and then withdrawn in the same walkthrough, journal event 132's
> correction).
>
> What still governs a flip is not legality but two dated-field checks the
> database itself enforces and this module honours rather than renegotiates —
> see `setMembershipStatus()`. `season_membership_status_events` stays the
> complete, append-only record of every flip regardless of the sequence, which
> is what Brian's own test for the decision asked for: "We can still get an
> audit history to know what happened, right?"
>
> ## The one interpretation this module makes, and why
>
> The approved wireframes decide where onboarding items come into existence.
> UX-20 lists two memberships whose status reads **Confirmed** and whose
> onboarding column reads "2 outstanding" and "3 outstanding"; UX-21 shows a
> **Confirmed** membership with four of five items resolved and
> "Activate membership" as its primary action. So in the approved interface a
> membership carries its items while it is still `confirmed`, and activation
> starts from there.
>
> That is what is built:
>
> 1. **Items are generated at confirmation**, from the season's configured
>    types — `generateOnboardingItems()`, called inside the intake
>    transaction in `roster.ts`. LAN-75's first acceptance criterion is
>    "confirming a membership generates its onboarding items ... once,
>    idempotently", and this is that sentence, literally.
> 2. **The status stays `confirmed`** until somebody activates, which is what
>    the wireframes show and what LAN-74's already-accepted intake produces.
> 3. **Activation from `confirmed` writes both transitions** — the system's
>    `confirmed → onboarding` and then the operator's `onboarding → active`.
>    No state is skipped, so the status history reads exactly as §2.1's
>    machine says it must, and a membership already sitting in `onboarding`
>    (the seed has two) activates through the same call with one row instead
>    of two.
>
> The alternative — moving a membership to `onboarding` the instant it is
> confirmed — would have contradicted the approved screens and changed the
> terminal status LAN-74 shipped and had accepted. This reading satisfies both.
>
> ## Subscriptions are never a gate
>
> Register D10, and the frozen model's own emphasis: "subs are structurally
> _not_ a gate (invoices go out in second term; special arrangements exist)".
> `outstandingRequiredItems()` therefore excludes any item type flagged
> `is_subscription`, whatever its status and whatever `is_required` says about
> it. There is deliberately no configuration that could turn that back on, and
> a test proves an unpaid subscription does not appear in the outstanding set.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/destinations.ts — module header (DESTINATIONS)

> `docs/ux/slice-ux.md` § 3 is explicit: the shell exposes Roster, Events and
> Report, **and there is no Home destination**. That absence is a decision, not
> an omission, so this list is the whole navigation and adding a fourth entry
> is a UX change rather than a code change.
>
> `capability` is what the destination _requires_, read from the capability map
> rather than restated here:
>
> - Events is an ordinary operator surface (§ 8, first row). Any linked
>   active operator opens it; the privileged actions _inside_ it —
>   activation, approval — are guarded individually by the issues that build
>   them.
>
> - Roster stopped being ordinary on 2026-08-28 (LAN-186, `Q-4`,
>   `REQ-authority`): "Four-role only, for the grid and every column on it."
>   The redesigned board carries season-editing controls and restricted
>   categories no coaching seat or single-purpose committee role should
>   reach, so it now requires `person_record_authority` — the same four
>   offices plus the administrative seat LAN-183 already gates the full
>   person record behind. `/operate/roster/[membershipId]` is unchanged by
>   this package (LAN-187's), and stays open to any linked operator.
>
> - Report is not ordinary. § 8 restricts it to an "authorized report
>   operator" and does not say who that is, so `leadership_report` was an
>   empty grant that refused everybody — deliberately and visibly — until
>   LAN-81, the issue that owed the answer, resolved it to the four calendar
>   roles. `capabilities.ts` carries the reasoning and the reason it is
>   narrower than the ordinary operator floor: the snapshot leads with the
>   reasons people gave for not attending.
>
> Navigation is never authorization. Every destination guards itself, and this
> list is also used to decide which one the shell opens on — not what a page is
> allowed to render.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/roster/board-columns.ts — module header

> The board's column model — LAN-186. What `chore/roster-fidelity-mockup`'s
> `columns.ts` demonstrated, built for real: every column is one entry here,
> driving banding, pinning, sorting, filtering, which cells edit in place and
> which route to the person record — never a fifth `<TableCell>` copied around
> the file.
>
> ## `Four-role only, for the grid and every column on it` (REQ-authority)
>
> The whole surface is gated on `person_record_authority` before this module
> is ever reached — `page.tsx` refuses an operator who does not hold it, the
> same capability LAN-183 built `person-authority.ts` against. What this
> module adds is the mechanism the issue calls "moot while four-role — build
> it anyway": every column carries a `requires` capability, and
> `visibleColumns()` drops one a viewer's role codes do not hold **before** a
> row is ever built into a payload. Every column reads the same capability as
> the page today, so nothing is actually narrowed yet — but narrowing later,
> exactly as `person-authority.ts`'s categories do for the person record, is
> an edit to one column's `requires`, not a rewrite of this file.
>
> This repository has no `availability_read` capability of its own — Q-4's
> decision and LAN-124's administrative-seat rule both resolve to the same
> four offices `person_record_authority` already names, and inventing a new,
> narrower grant with nobody yet excluded from it would be a capability-map
> change this package does not own (`src/lib/auth/**` is LAN-183's). The
> mechanism is real and column-scoped; the grant it currently reads is shared
> with the page's own gate.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/roster/board-columns.ts — EditKind

> `record` — a person fact: renders and routes to the person record, W2's
> rules apply there. `select` / `multiselect` / `jersey` — a season fact,
> edits in the cell, commits on its own, audited, no reason asked. `none` is
> derived or owned elsewhere.
>
> Status used to be its own kind, gated by a legal-transition table
> `membership.ts` owned. LAN-186's owner walkthrough removed that table
> entirely (`Q-12`: "We can flip to whatever status we want to go in."), so
> Status is now an ordinary `select` column like every other season fact —
> the one in-cell dropdown Brian asked for, in place of the three bespoke
> controls the board used to render for it.
>
> ---
>
> `onboarding` joined under correction round 2, item 5
> (`WP-operator-record`, LAN-217): one of the seven operator-ticked
> onboarding items, cloning the record page's own asymmetric row. D-002
> (correction round 6) collapsed the closed cell's displayed status and the
> open cell's offered choices into one list, `allowedItemStates(itemCode)` —
> there is no separate resolution vocabulary any more, and no `reopen`: the
> open dropdown offers exactly the states the closed cell can show.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/roster/page.tsx — module header

> `/operate/roster` — W5, the season's squad as a twenty-column board. LAN-186.
>
> Redesigned, not extended (portfolio rule 3): this replaces the six-column
> list LAN-75 shipped, root and branch. Authority: LAN-186's own acceptance,
> `workflows/W5-work-this-seasons-roster.md`, `acceptance/W5.md`, and the
> approved photographs at `mockups/W5-work-this-seasons-roster.html`.
>
> ## `REQ-authority`: "Four-role only, for the grid and every column on it"
>
> The page opens with `person_record_authority` — the same capability LAN-183
> gates the full person record behind, and the four offices Q-4 names. A coach,
> or any operator outside those four roles plus the administrative seat, is
> refused **here**, before `listRosterBoard()` is ever called: not merely
> unrendered, absent. `visibleColumns()` and `redactRow()` then apply the same
> capability again per column, which is the mechanism the issue calls "moot
> while four-role — build it anyway", so a later, narrower grant on one column
> drops it from the payload automatically.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/roster/page.tsx — filters / redactedRows

> Every column key is a legal filter key. Anything else in the query string —
> including a filter naming a column this viewer's role does not grant — is
> ignored rather than trusted, matching the fail-closed posture
> `rosterOrderBy()` in `membership.ts` uses for `sort`.
>
> ---
>
> Redacted, full width. Search, filter and sort all happen client-side now
> (LAN-186 item 11) over this one fetch: `RosterBoard` calls `applyBoard()`
> itself for every interaction, rather than this page re-running for each
> one. The URL's own params seed only the client's _initial_ state below, so
> a bookmarked or refreshed link still opens already filtered — that first
> load is the one real fetch Brian accepted taking a few seconds; nothing
> after it does.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/roster/board-data.ts — optionLabel

> Display text for a column's option code — the label alone, never the code
> beside it (`REQ`, LAN-186 item 9: no `"eligible · Eligible"` anywhere).
>
> Positions are the deliberate exception, in the other direction: the club's
> vocabulary IS the code (`T`, `NT`, `KO` …), so this returns it unchanged —
> LAN-186 item 7's cell half, which Brian's walkthrough of the built board
> left standing: "letters in the grid" has not changed. Item 7's _dropdown_
> half is superseded by `optionListLabel` below, for the one context where a
> list of choices, not a selected value, is on screen.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/roster/board-data.ts — optionListLabel

> Display text for one entry in an _open list of choices_ — the in-cell edit
> dropdown and the column filter's own popover — as distinct from a value
> already chosen, which `filterOptionLabel` and `displayOf` still show as the
> label alone.
>
> Position columns are the one case where the two differ: Brian's walkthrough
> of the built board asked for the code _and_ the full name in the open
> dropdown ("If it says QB, it should be QB-quarterback"), while the selected
> value — the cell, the active-filter chip, the filtered column's own caption
> — stays the code alone, per item 7's cell half. The full name comes from
> `column.optionLabels`, itself read from the season's vocabulary (S3) in
> `readPositionOptions()`, never hardcoded here.
>
> Every other column's list already shows the label alone with nothing beside
> it, so this delegates straight to `optionLabel` for them — no `${value} ·
${label}` echo reappears (item 9), because eligibility and availability's
> value and label are the same word and doubling either would repeat it.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/membership/write-status.ts — setMembershipStatus header (onboarding seeding, dated fields)

> Two things still happen on the way through, and neither is a gate:
>
> - **Flipping to `active` seeds onboarding items when none exist yet** —
>   belt and braces for a membership confirmed before onboarding items
>   existed, or reached `active` by any path that never generated them.
>   `generateOnboardingItems()` is idempotent, so the ordinary case (items
>   already there) inserts nothing. Outstanding required items are never
>   asked about — they simply carry on being outstanding, visible on the
>   record, exactly as any other season fact would be.
> - **The two dated-field checks the database itself enforces are honoured,
>   not renegotiated**: `season_memberships_activation_is_dated` (`active`
>   needs `activated_on`) and `season_memberships_departure_is_dated`
>   (`departed` needs `departed_on`). Both use the same
>   `coalesce(existing, current_date)` pattern, so flipping out of and back
>   into either status preserves the original date rather than resetting it
>   on every visit.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
