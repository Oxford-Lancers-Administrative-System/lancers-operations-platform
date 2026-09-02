# LAN-204 — The recruit board, the record, the exits and the flip

**Workflows:** `W1 — The recruit board`, `W2 — One recruit's record`,
`W13 — Take a recruit off the board`, `W14 — Flip a recruit to joined`
**Routes:** `/operate/recruitment`, `/operate/recruitment/[prospectId]`,
`/operate/recruitment/qr`, `/operate/recruitment/new`
**Shared contract:** [`../slice-ux.md`](../slice-ux.md) · [`../standards.md`](../standards.md)

## Why this contract exists

`LAN-204`'s own Linear body and its 2026-09-01 amendment ("this package builds
its own send machinery") are the approved design; Linear is not a durable
repository contract. This records what was built from them and from `W1`,
`W2`, `W13` and `W14`, so a later package (`LAN-206`, the messaging schedule,
Mission 5's roster) does not have to re-derive it.

**2026-09-02 correction.** Brian's walkthrough rejected the surfaces this
contract first described: "The UI here is completely different from how
it's done for the events and how it's done for roster… it reinvented the
shit." The board and record were rebuilt on the roster board's and player
record's own shared controls rather than lookalikes of them — extracted to
`src/app/operate/board-filter-controls.tsx` (the status-pill formula, the
column-header sort/filter funnel, the banded-header grouping) and
`src/app/operate/record-shell.tsx` (the banded `Section`/`Row`/`RecordField`
shell) so the roster imports the identical code, not a copy that could
drift. The same walkthrough surfaced a real design defect — the consent
deadlock, item 9 below — fixed in the same round. What follows describes the
corrected surfaces; the departures section names what changed and why.

**2026-09-02 correction, round 2.** Brian approved the corrected surfaces
above subject to exactly two further fixes, both restoring the approved
`W2-01`–`W2-04` and `W1` frames rather than departing from them: the record's
Person and Recruitment cards now stack full width instead of sharing a
two-column row ("The bands are side by side when really they should be
layered on top of each other"), and the board's per-event RSVP and
Attendance columns now sort through the same `TableSortLabel` idiom every
other column already used ("RSVP in attendance should be sortable here").
Nothing else changed in this round — see the "What is deliberately not here"
section for the coverage findings Brian named and left alone.

Sources, in `slice-ux.md` §1's authority order:

- `LAN-204` in Linear, its amendment, and the answered owner decisions it
  records (no duplicate queue; declined/disengaged stay on the board; the
  exits carry no confirmation; consent is season-scoped;
  `requireGrantedSeasonMessagingConsentIn` is the one gate).
- `chore/recruitment-fidelity-mockup` (LAN-200), the surface `W1`/`W2` were
  built for.
- `missions/intake/M-RECRUITMENT/mockups/shots/` — `W1-01`–`W1-04`,
  `W2-01`–`W2-04`, `W13-01`–`W13-02`, `W14-01`–`W14-03`.
- `missions/intake/M-RECRUITMENT/workflows/W1-the-recruit-board.md`,
  `W2-one-recruits-record.md`, `W13-take-a-recruit-off-the-board.md`,
  `W14-flip-a-recruit-to-joined.md`.
- Appearance authority: `../roster/board-columns.ts` and
  `roster-board.tsx` (`LAN-186`), the player record (`LAN-187`), and their own
  contracts `LAN-186-roster-board.md` and `LAN-187-player-record.md`.

## The board (`W1`)

One line per recruit in the open season, banded exactly as `W1`'s own table
says: **Person** (slate `#455a64`, unchanged from the roster), **Recruitment**
(teal `#00695c`, this mission's own facts), and one **Events** band per
recruitment event (blue `#0b3d91`, the roster's own Season colour), over an
RSVP column and an Attendance column side by side, plain text.

Columns, left to right, exactly `W1`'s table — no column invented outside it:
Recruit (pinned) · College · Matric · Grad · Degree field · Contactable ·
Status · Source · First contact · Personal sent · Recruitment sent · Consent ·
Played before · Watched before · Position interest · Gear owned · How they
heard · Anything else · one RSVP/Attendance pair per event.

- **Person-band cells route to the recruit's own record** on click, exactly
  as the roster board's own `edit: "record"` cells route to that row's own
  record page rather than a bare `/operate/people/[personId]` — the same
  distinction the roster board itself draws between `edit: "record"`
  (College, Matric, Grad, Degree field) and `edit: "none"` (Contactable).
- **Source carries no filter and is never edited in the cell** — Brian,
  2026-09-01.
- **Status is the roster's own status-pill formula** — a colour-coded pill by
  default (`StatusPill`, `board-filter-controls.tsx`; recruitment's own seven
  colours, one MUI semantic keyword per ladder value), click-to-edit opening
  the same generic `Select` every in-place edit uses. The one item the
  2026-09-02 walkthrough named directly: "Today the board renders a bare MUI
  dropdown in the cell — that is the reinvention." Every value is always
  offered and no transition through this control is ever refused
  (`Q-every-status-reachable`); reaching `joined` is intercepted into `W14`'s
  confirmation rather than written directly.
- **"Personal sent" / "Recruitment sent" read `delivery_attempts.accepted_at`**
  for that track's jobs, never `notification_jobs.status` alone and never an
  optimistic field this package writes — see "The send machinery" below.
- **Default sort is ladder order, then most recent first contact** — `W1`'s
  own rule, and what sinks the three exits toward the bottom without ever
  removing them from the board (superseding `W13`'s and `W14`'s earlier
  "off-the-board" language, per the approved `W1-01`/`W13-01` frames).
  Every sortable column carries the roster's own `TableSortLabel` indicator —
  **including each event's own RSVP and Attendance pair** (2026-09-02
  correction, round 2; shipped non-sortable, against this rule, until
  then).
- **Search** matches name and alias, identically to the roster board.
- **Filters are the roster's own two-part mechanism**, not a bespoke row:
  a pinned control (Search plus five `PinnedSelect`s — Status, WhatsApp
  consent, Personal sent, Recruitment sent, Attended an event) always
  reachable, plus the identical `FilterButton`-and-menu funnel every
  filterable column header carries on desktop, both writing the one
  `filters` object — the same "one filter, two controls" relationship the
  roster board's own pinned selects and column funnels have. A phone
  `Filters` button opens the pinned controls in a bottom drawer, matching
  the roster board's own mobile affordance. Status, WhatsApp consent,
  Personal sent and Recruitment sent are combinable, immediate, and
  client-side over the one dataset the page reads; Attended an event has no
  column of its own (no single column names it) and is pinned-only, the one
  place this board's filter set cannot be a literal column-for-column copy
  of the roster's. No season picker; the board reads the one open season.
- **Empty state** names the doors (QR, walk-up, operator add) rather than
  saying "no results" — `W1`'s own exception.
- **`ADD RECRUIT`** (contained) points at `/operate/recruitment/new`, a
  minimal wired stub — `LAN-206` (E-4) builds the form. **`QR CODE`**
  (outlined) opens `/operate/recruitment/qr`.

## The QR page (`W1-04`)

One live sign-up code per season, pointing at `W7`'s own door
(`/join/[code]`, `LAN-202`). A `DOWNLOAD` control for the rendered code and a
clipboard control that copies the sign-up URL to it, the season's sign-in
count, and a mint action that deactivates the live code and mints a
replacement in one call (`mintRecruitmentSignupCodeIn`, already built by
`LAN-202` for exactly this page) — Brian, 2026-08-31.

The rendered code is an inline SVG built by a hand-rolled encoder
(`src/lib/qr/qr-matrix.ts`) — no QR-generating dependency exists anywhere in
this repository and `package.json` is closed to a new one for this package.
See the package receipt for what is and is not proved about it.

## The record (`W2`)

`/operate/recruitment/[prospectId]`, on the shipped player record's own
banded-card shell — `record-shell.tsx`'s `Section`/`Row`/`RecordField`,
extracted from `../roster/[membershipId]/record-view.tsx` (LAN-187) rather
than a lookalike `Card`/`CardHeader` layout (the 2026-09-02 correction; the
first shipped version built its own cards). Every card is a shipped card
with its content replaced, per `W2`'s own table:

| Card                   | Colour | Holds                                                                                                                                                                                                                                                                        |
| ---------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Person**             | slate  | Person facts, read-only, no "open the person record" link — Brian, 2026-09-01. The personal questionnaire's send line sits here.                                                                                                                                             |
| **Recruitment**        | teal   | Status (the roster's own click-to-edit status pill, `StatusCell`), source, first contact, committed on, WhatsApp consent, and all six recruitment-questionnaire answers — one merged card, not two (Brian, 2026-09-01). The recruitment questionnaire's send line sits here. |
| **Recruitment events** | blue   | The shipped attendance table's own shape, reused: Event, Date, RSVP, Attendance, **Event status** (`Mandatory` dropped — a recruit has no mandatory events).                                                                                                                 |
| **Notes**              | slate  | Prose, attributed and dated, with a place to write the next one.                                                                                                                                                                                                             |
| **Status history**     | slate  | Recruitment's own status changes, not membership's.                                                                                                                                                                                                                          |

The header keeps a glance-only status pill beside the recruit's name — the
same read-only-summary-plus-editable-Section-field duality the roster
record's own `Headline` and Season section carry — so the actual control
lives in exactly one place, the Recruitment card.

**Every card is full width, stacked one above the other, in table order**
(2026-09-02 correction, round 2, above) — the approved `W2-01`–`W2-04` frames
always showed this; the shipped rebuild put Person and Recruitment in a
two-column `Grid` instead, a defect Brian's second walkthrough caught: "The
bands are side by side when really they should be layered on top of each
other." Fixed without touching `record-shell.tsx` — the shared shell supplies
`Section`/`Row`/`RecordField` only, never the page's own outer layout, so the
player record (which was already correct) needed no change.

**SEND / RESEND**, one button per questionnaire, each opening a dialog naming
the last-sent date or that it has never been sent — see "The send machinery."
Whether either button is reachable now differs by track — see item 9 below.

## The exits (`W13`)

`declined`, `disengaged`, `void` — one status-select value each, **no
confirmation and no callout**, on the same control everywhere it appears
(board cell, record header). `void` alone asks for the reason the schema
requires (`recruitment_prospect_status_events_void_is_explained`) in a small
text field at the moment of selecting it — a required-input capture, not a
confirmation dialog; nothing is asked "are you sure?" and the write commits on
submit. `disengaged`'s reason is `W13`'s own "recommended, not required," so
no prompt interrupts it at all. Every exit cancels every currently queued
recruit-cycle job outright (`status in ('pending','ready','failed')` →
`cancelled`), not merely refuses new ones — proved directly against the
database, not inferred from the dispatcher's own re-check.

## The flip (`W14`)

Selecting `joined` on the same status control opens the mission's one
interruption: what it will create (a season membership for the season, a
roster row, onboarding), what it will not do (make them active), Confirm or
Cancel. Cancel writes nothing. Confirm is one transaction: the membership
(`status: 'onboarding'`, `entry: 'new'`), its own status event, its
onboarding items (`generateOnboardingItems`, reused from the roster's own
returner intake — never a second implementation), the prospect's own status
event, and one `audit_events` row. `season_memberships_one_per_person_per_season`
refuses a second flip with an existing, named message
(`src/lib/db/errors.ts`); no duplicate check of any other kind runs at the
flip, per Task 09 D7.

## The send machinery — the 2026-09-01 amendment

`sendRecruitmentQuestionnaireIn` (`src/lib/services/recruitment-prospect.ts`)
is the record's SEND/RESEND action. It calls `declareRecruitmentCycleJobsIn`
(`LAN-203`) directly — never duplicated, never a second template registry —
and is proved end to end: the job is created, the real sweep
(`runMessagingSweep`) claims it, the dispatcher renders the recruit-cycle
template, and the local delivery sink accepts the Meta-shaped payload
(`recruitment-prospect.test.ts`'s own suite). Prospect status and the
two-ask cap are honoured by the function being called, not re-implemented:
an ineligible status means nothing is declared for either track; the cap is
structural (one ask, one reminder, never a third slot to schedule into).
Consent is honoured **per track** — see item 9 below, the 2026-09-02
correction. "Last sent" always reads `delivery_attempts.accepted_at`, never a
field this package writes optimistically.

## The consent deadlock — item 9, and its fix (2026-09-02 correction)

Brian, walking a recruit with no consent: "The personal questionnaire is how
we get consent. If consent is not given, sending the personal questionnaire
is how we get it… The fucking app is deadlocked now." Both cycle tracks had
shipped behind one gate, `hasGrantedSeasonMessagingConsentIn` — including the
welcome track, whose own message carries the link to the sign-up form. An
unconsented recruit could therefore never receive the one message that would
let them grant consent.

The fix splits the gate by track, in `recruitment-cycle.ts`'s
`declareRecruitmentCycleJobsIn` and `messaging-scheduler.ts`'s
`dispatchRecruitmentCycleJob` re-check alike:

- **Welcome track** (`welcome` + `details_reminder`, the personal
  questionnaire) — `messaging-consent.ts`'s new `mayReceiveWelcomeContactIn`:
  allowed for every consent state except an explicit `refused` or
  `withdrawn`. This is the one channel in the whole codebase allowed to
  establish consent rather than require it; every other send, including the
  interest track below, is unaffected.
- **Interest track** (`interest_ask` + `interest_reminder`, Questionnaire B)
  — `hasGrantedViaSignupFormIn`, narrower than a bare granted check:
  `Q-read-back-authorises-how-much` (Brian, 2026-09-02, answered narrow) —
  the state must be `granted` **and** the source must be `qr_self_entry`
  specifically. A touchline `walk_up_read_back` grant, or an
  `operator_recorded` one, authorises the welcome track alone; neither is the
  recruit completing the sign-up form themselves, which is what unlocks this
  track. `requireGrantedSeasonMessagingConsentIn`/
  `hasGrantedSeasonMessagingConsentIn` — every ordinary send elsewhere in the
  codebase — are unchanged.

The record's own SEND buttons tell the same story: `RecruitmentProspectRecord`
now carries `consentSource`, and the recruitment-questionnaire button's own
disabled reason names the reason precisely ("recorded another way, not
through the sign-up form") rather than the generic "not granted" text the
personal button still uses for its own, differently-shaped refusal.

A recruit who has explicitly `refused` or `withdrawn` still receives nothing
at all, on either track — `mayReceiveWelcomeContactIn` refuses both states
outright, and `hasGrantedViaSignupFormIn` requires `granted`, which neither
state ever is. `declined` status blocks both tracks even earlier, at the
eligibility check, before either consent gate is ever read.

## Departures from the mockups, and why they are decidable rather than escalated

1. **`declined`/`disengaged` stay on the working board, sunk by ladder order.**
   Superseded by Brian, 2026-09-01, against the approved `W1-01`/`W13-01`
   frames — recorded in the issue, not a departure this package introduces.
2. **The Questionnaire B six-column codebook (`B1`–`B6`) is this package's own
   reading of an open decision.** The real field list is `LAN-206`'s to
   settle; see `src/lib/services/recruitment-vocabulary.ts`'s own comment for
   the mapping and the reasoning.
3. **Board vocabulary and record vocabulary live in one plain module**
   (`recruitment-vocabulary.ts`, no `"server-only"` tag) rather than each
   surface inventing its own wording, because a client component cannot
   import a value export from a module tagged `"server-only"` — an
   architectural necessity, not a design choice, and it changes no visible
   word.

## What is deliberately not here

- **No duplicate-capture review queue and no `/operate/recruitment/review`.**
  `REQ-duplicate-queue` is superseded; a slipped-through duplicate goes to the
  shipped people merge (`/operate/people/[personId]/merge`, Mission 5's).
- **No form behind `ADD RECRUIT`.** `LAN-206` (E-4) builds it; this package
  wires the button and lands a minimal target.
- **No channel-presence row on the record.** `W2`'s own open question
  (`AM-presence`/`T08-row8` vs. `On WhatsApp` struck from the board) is
  unanswered upstream; this package renders nothing for it rather than
  inventing an answer.
- **Button placement on `W2` is not defended as final.** The approval note
  explicitly reserves it for later: "I'm going to want to update the button
  placement... I can't spend any more time on this." Shipped as approved to
  date.
- **Four coverage findings from round 2's review — `StatusPill`,
  `FilterButton`, `Section` and `bandBoundaryKeys` can each be broken without
  the roster's test suite noticing — are deliberately unaddressed.** Brian
  was told directly and said "just change those two things" (the record's
  card stacking and the event columns' sort); nothing else in this package's
  round-2 correction touched them.

## Visual evidence

The board (with the seeded twelve recruits present — item 6, spread across
all seven ladder values and all four capture sources, three of them carrying
real event RSVP/attendance rows), the record (the `W2-02` "something on it"
case — Tobias Wrenfield, engaged, notes present) and the QR page were proved
at desktop (1440px) and a Playwright-measured 375px via
`npm run visual:preflight`, real login through the shared review account, at
this package's exact head SHA. The flip's confirmation is a client-side
dialog on the board/record route rather than a route of its own, so it was
exercised functionally (`recruitment-prospect.test.ts`'s flip suite) rather
than screenshotted as a separate state. See the package receipt for the exact
commands and the
gitignored evidence path.

**Round 2** re-proved the record (Tobias Wrenfield again, at
`/operate/recruitment/bdbf0f77-2bd2-4418-9bf5-dcb43d9b9879`) and the board at
the same two viewports via the same command, at this correction's own exact
head, and additionally rendered `/operate/roster` and
`/operate/roster/[membershipId]` unchanged — the shared `record-shell.tsx` is
what the record's own fix runs through, and the roster is Brian's live
working surface, so both were re-confirmed rather than assumed.
