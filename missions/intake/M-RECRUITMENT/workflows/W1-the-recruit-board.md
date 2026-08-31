# W1 — The recruit board

- Purpose/intended outcome: one surface where an operator reads the whole
  recruitment pipeline at a glance, finds any recruit, and acts on a row without
  leaving it. It is the mission's spine: its columns decide which recruit facts
  and which signals exist, and every other workflow puts something on this board
  or takes something off it.
- Primary actor: an operator holding the core four authority — President, Vice
  President, Secretary, General Manager.
- Trigger: the operator wants to know where recruitment stands, usually before a
  Monday conversation or before a recruitment event.
- Entry point: a **Recruitment** destination in the top group of the left
  navigation, directly beneath Roster. Brian, 2026-08-31: _"It's a new page on the
  sidebar underneath Roster, and it's under /operate. That's it. There's no factual
  thing: roster, recruitment, events, and whatever."_ It is deliberately **not**
  an Administration entry; the Administration group is unchanged.
- Route/placement: `/operate/recruitment`, its own page.
- Controlling source: Task 09 D4 and D9; portfolio row 6's "recruits list beside
  the roster"; Brian's 2026-08-28 board decision and his 2026-08-31 confirmation
  that it is recruitment's own board modelled on the roster board.
- User-visible result: a board of one line per recruit for the open season, in the
  club's existing board language, that can be searched, filtered, sorted and acted
  on.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue: `/operate/roster` at
  `main@e669331`. `W1-01` is that board with the proposal applied; `W1-02` is the
  same board scrolled to its right end, where the Events band lives. Both sides
  of both screens are photographs of the running application. (An earlier
  revision of this file claimed `W1-02` photographed `/operate/people`; it never
  did, and `shots.json` always said `/operate/roster`.)
- Reused component, language, interaction, and permission patterns: the banded
  board built by LAN-186 — `src/app/operate/roster/board-columns.ts` supplies the
  band model, the 28px band-header row, the 16px band label inset, the pinned
  first column, per-column filter chips, and in-cell editing for facts this
  mission owns against read-only cells that route to the person record. The
  authority gate is the same `person_record_authority` the roster board reads.
- Desktop and 375px evidence: `W1-01`, `W1-02` and `W1-03`, both sides, each
  photographed at a browser-measured 1280px and a browser-measured 375px.
  `W1-03` is the board's empty state, which names the doors rather than saying
  "no results".
- Reason for any departure from the implemented application: none in structure or
  colour. Brian, 2026-08-31: _"W1 and W2 are very similar to how the current board
  is set up on main right now, with similar structures. That's all really good,
  and similar colors, if we can keep them consistent."_ The departures are in
  **which** columns exist, because a recruit holds no membership and therefore has
  no Onboarding or Season band, and in the appended event columns, which the
  roster board has no equivalent of.

## The bands

The roster board carries three bands — Person `#455a64`, Onboarding `#b26a00`,
Season `#0b3d91`. A recruit holds no membership, so two of those three describe
nothing. The recruit board carries:

| Band            | Colour            | Why                                                                                              |
| --------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| **Person**      | `#455a64`, as-is  | The same person facts, read-only, routing to the person record exactly as the roster does.       |
| **Recruitment** | `#00695c`, new    | This mission's own facts. A new band because it is a new kind of fact, not a recolour.           |
| **Events**      | `#0b3d91`, reused | One band per recruitment event, over its RSVP and Attendance columns, in the Season band's blue. |

The Recruitment band's teal is the one genuinely new colour. It is proposed rather
than locked: it sits beside slate and blue without competing, and it is not the
amber that already means Onboarding. If Brian would rather the recruitment band
reuse the Season blue and the event columns take the new colour, that is a
one-line swap and changes nothing else.

## The columns

**Person band** — read-only, routes to the person record on click, exactly as the
roster board's person columns do.

| Column      | Source   | Notes                                                    |
| ----------- | -------- | -------------------------------------------------------- |
| Recruit     | `people` | Pinned first column. Display name, links to `W2`.        |
| College     | `people` | `Not recorded` in grey where absent, as the roster does. |
| Matric      | `people` |                                                          |
| Contactable | derived  | Mobile / Email pills, exactly the roster's indicators.   |

**`On WhatsApp` was struck on 2026-08-31.** It is not a recruit field: it is
seasonal channel presence on the person record, owned by Mission 5 and empty at
the baseline. Brian, on being shown it beside College and Matric: _"It doesn't
make any sense here."_ Group presence is a thing the club observes, not a column
of fact about a recruit, and it goes with the signal abstraction struck below.

**Recruitment band** — this mission's facts, edited in the cell.

| Column        | Source                  | Notes                                                                  |
| ------------- | ----------------------- | ---------------------------------------------------------------------- |
| Status        | `recruitment_prospects` | The seven-value ladder. Edited in the cell; `W14` intercepts `joined`. |
| Source        | `recruitment_prospects` | Which door they came through.                                          |
| First contact | `recruitment_prospects` | Date.                                                                  |
| Asked         | the `W4` request        | Whether the recruit-stage form is open, answered, or never sent.       |
| Notes         | `recruitment_prospects` | Prose. Never scored, never ranked — Task 09 D9 and 8/5.                |

**`Last touch` was struck on 2026-08-31**, with `On WhatsApp`, and for the same
reason. Brian: _"Instead of an innocuous signals thing, we should just take the
events as signals. Don't conflate those, right? Let's just make events events."_
So the board carries the recruit's own stored fields and the person facts it may
read, and derived signal columns are not among them. What the club said and when
lives on the recruit's record (`W2`), where it is a dated fact with a source.

`committed_on` is not a board column. Brian redefined it on 2026-08-31: it marks
the day the recruit reaches **joined**, not the day they reach `committed` —
_"the day that's joined, I would say."_ Whether it is also stamped at `committed`
is explicitly unsettled: _"maybe that field should be set. I think we'll figure
out how it needs to really work."_ Recorded as open below.

**Events band** — each recruitment event is **its own band**, appended at the
right end in date order, oldest first, so the term reads left to right. The band
header carries the event's name and date; beneath it sit **two columns, side by
side**:

| Column         | Values                                                            |
| -------------- | ----------------------------------------------------------------- |
| **RSVP**       | `Yes`, `No`, or `Not recorded` in grey                            |
| **Attendance** | `Present`, `Late`, `Excused`, `Absent`, or `Not recorded` in grey |

Brian, 2026-08-31: _"a heading for what the event was, RSVP, what the RSVP status
was, attendance right after that. I want to see them side by side."_ This uses
the shipped two-row banded header exactly as it already works — the event name is
a band over its two columns — so no third header row and no new structure.

**Invitation is deliberately not shown.** Brian: _"I don't care if they were
invited or not. I want to see if they intended, because they can always be added
as a walk-up, or they can always be added in the recruitment event as a walk-up.
If they show up, we can tag them."_ A walk-up therefore needs no special
rendering: it reads as RSVP `Not recorded` with an attendance of `Present`, which
is exactly what happened. The mismatches stay legible for the same reason —
Clementine Varrow says `Yes` and `Absent`; Ambrose Kittiwake says `No` and
`Present`.

### What this replaced, and the honesty note that goes with it

Two earlier treatments were wrong, and the second was wrong in a way worth
recording.

1. **The glyph triplet** — invited/answered/attended as three coloured letter
   boxes. Struck by Brian: _"completely fucking made up… the buckets don't even
   line up correctly… we don't do anything in the UI like that at all."_ It
   conflated intent with observation, which `attendance/presentation.ts` forbids
   in as many words (_"Attending is intent; Present is observed attendance"_); it
   carried state in colour alone, which `slice-ux.md` §7 forbids; and three dots
   could not hold four presence states.
2. **A two-line cell** — a filled presence chip stacked over a prefixed RSVP
   caption. This was **described to Brian as reuse of the shipped attendance
   vocabulary, and that was overstated.** The words were shipped; the composition
   was invented. Brian asked the right question — _"Where else are we using this
   particular UI element?"_ — and the answer was nowhere:
   - No grid cell in this application stacks a state over an RSVP. The only
     place RSVP sits under something is `attendance-row.tsx:143`, under a
     **person's name** in the sheet's list row.
   - No presence value is rendered as a filled pill anywhere.
     `PRESENCE_COLORS` is applied to the sheet's **toggle buttons**; the only
     chips nearby are the outlined mismatch chip and the amber walk-up chip.

The treatment now in place is the genuinely reused one: plain text in two
columns, exactly as the person record's per-event table renders the same two
facts (`[membershipId]/attendance-section.tsx:280`, `RSVP_LABEL` and
`ATTENDANCE_LABEL`). That table is the closest shipped analogue to this problem —
one person, many events, in a grid — and it is what boundary item 36 asked for:
_"almost copy how normal event attendance works, except for recruitment."_

## Required actions

1. **Read the board.** One line per recruit in the open season. Default sort:
   status ladder order, then most recent first contact.
2. **Search** by name and alias, matching the roster board's search exactly.
3. **Filter** by status, by source, by whether the ask is outstanding, and by
   whether they attended any event. Filters are combinable and immediate.
4. **Sort** every column.
5. **Act from the row** — open the recruit (`W2`), follow up (`W9`), change status
   (`W13`, and `W14` where the change is to `joined`).
6. **Scroll sideways** through the event columns without losing the pinned Recruit
   column, exactly as the roster board scrolls through its eighteen.

## State transitions

The board writes one thing directly: the status cell. Every value except `joined`
is a direct in-cell change, audited, with no interruption. `joined` is intercepted
by `W14`'s confirmation and is never a silent cell edit — the schema already binds
it to a real membership for the same person and season through composite foreign
keys, so it cannot be reached without the process. Everything else the board
displays is written elsewhere and read here.

## Handoffs

- To `W2` on clicking a recruit, and to the person record on clicking a person
  fact — the same split the roster board already makes.
- To `W9` on the follow-up action.
- To `W13` and `W14` on a status change.
- From `W3`, `W4`, `W5`, `W6`, `W7`, `W11` and `W12`, each of which puts something
  on this board.

## Dependencies and mission boundaries

- **Mission 5 / the person record:** this mission's side is every recruitment fact
  and every control that moves a recruit; Mission 5's side is the person facts,
  read-only here, and the Recruit rung shown on the person record with no control
  that moves it. Independently walkable — both surfaces exist at the baseline.
- **Mission 11 / the season:** the board reads the one open season and offers no
  season picker, exactly as every other surface does. Independently walkable.
- **Mission 10 / the Monday report:** this board is the week's working surface; the
  report is Mission 10's and is not built here. Independently walkable.

## Exceptions and recovery

- **No recruits yet.** The empty state names the doors rather than saying "no
  results" — a board with nothing on it should tell an operator how somebody gets
  onto it.
- **No recruitment events yet.** The Events band is absent rather than empty; a
  band header over no columns is noise.
- **A recruit with almost nothing recorded.** Expected, not exceptional. `Not
recorded` in grey, never blank, never defaulted — the roster board's rule and the
  lesson of the 2023 workbook's defaulting Rookie column.
- **A status change that would reach `joined`.** Intercepted, not refused.

## Safety, privacy, consent, and authority boundaries

- Four-role only, for the grid and every column on it, reading the same
  `person_record_authority` gate as the roster board. A coach never sees this
  board.
- Raw contact values never appear on the grid — contactability indicators only,
  exactly as Task 08 §5 requires and the roster board implements.
- Date of birth and emergency contact are absent from this board, as they are from
  every list, board and queue. Non-negotiable.
- Notes are prose and operator-visible only. Never scored, never ranked, never
  surfaced to a coach or a player.

## Acceptance evidence

- `grounding: photograph`. `W1-01` and `W1-02` are photographs of the running
  application at `main@e669331`, both sides, at a browser-measured 1280px and
  375px, with the proposal evaluated into the live DOM so both sides differ only
  by the change.
- The seeded recruits Rosalind Penhaligon (`identified`) and Tobias Wrenfield
  (`engaged`) render on the board with their real seeded facts, including the
  empty `On WhatsApp` cell.

## Core decisions

| Decision                                                                            | Classification                | Governing evidence or recommended default                                                     | Status  |
| ----------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- | ------- |
| The board is recruitment's own, modelled on the roster board, not a list beside it  | `locked`                      | Brian, 2026-08-28 and 2026-08-31                                                              | Settled |
| Structure, grouping and colour language carried from `/operate/roster`              | `locked`                      | Brian, 2026-08-31: "similar colors, if we can keep them consistent"                           | Settled |
| Route is `/operate/recruits`, in Administration beneath People                      | `delegated to Mission Lead`   | Matches `/operate/people` and `/operate/roster`; changes no intent                            | Settled |
| Three bands: Person, Recruitment, Events                                            | `proposed for owner approval` | A recruit holds no membership, so Onboarding and Season describe nothing                      | Open    |
| The Recruitment band is teal `#00695c`                                              | `proposed for owner approval` | Sits beside slate and blue without competing; not the amber that means Onboarding             | Open    |
| Status, Source and First contact as columns                                         | `locked`                      | Brian, 2026-08-31: "Statuses are fine, source is fine, first interest system is great"        | Settled |
| `On WhatsApp` and `Last touch` struck from the board                                | `locked`                      | Brian, 2026-08-31: "let's just make events events"; neither is a recruit field                | Settled |
| `Asked` remains a column                                                            | `proposed for owner approval` | The only recruitment column Brian has not spoken to either way                                | Open    |
| `committed_on` marks reaching `joined`, not `committed`                             | `locked`                      | Brian, 2026-08-31: "the day that's joined, I would say"                                       | Settled |
| Whether `committed_on` is also stamped at `committed`                               | `proposed for owner approval` | Brian: "maybe that field should be set. I think we'll figure out how it needs to really work" | Open    |
| Notes belong on the membership                                                      | `proposed for owner approval` | Brian, 2026-08-31: "that should be in the membership" — placement not yet worked through      | Open    |
| Event cells are plain text in two columns, as `attendance-section.tsx` renders them | `locked`                      | Brian, 2026-08-31; the two-line chip cell it replaced existed nowhere in the application      | Settled |
| Each event is a band over an RSVP column and an Attendance column, side by side     | `locked`                      | Brian, 2026-08-31: "I want to see them side by side"                                          | Settled |
| Invitation is not shown on the board                                                | `locked`                      | Brian, 2026-08-31: "I don't care if they were invited or not"                                 | Settled |
| Event columns append oldest-first, left to right                                    | `locked`                      | Brian, 2026-08-28: appended at the right end, read as signals across the term                 | Settled |
| Status is edited in the cell, except `joined`                                       | `proposed for owner approval` | Matches the roster board's in-cell season editing; `joined` is `W14`'s                        | Open    |
| Default sort is ladder order, then most recent first contact                        | `delegated to Mission Lead`   | Reversible, changes no meaning                                                                | Settled |

## Owner feedback, and how each item was resolved

Every item below is Brian's own words on 2026-08-31, with what was done about
it. Retained here because the ledger's feedback array tracks _open_ items and
these are closed.

### W1-01

> On WhatsApp. It doesn't make any sense here as far as doing that. I need to know what the whole list of things is that are going to be on this for the recruitment. That's not explained anywhere.

On WhatsApp struck from the board; the complete recruit field set enumerated and put to Brian, who then settled status, source, first contact, committed_on and notes.

### W1-02

> The events and how they're shown are completely fucking made up. That is just absolute nonsense, what they created for the events, and the buckets don't even line up correctly for this. We don't do anything in the UI like that at all.

The invited/answered/attended glyph triplet replaced by the shipped attendance vocabulary: the presence state in words, with the prefixed RSVP beneath it.

### W1-01

> Instead of an innocuous signals thing, we should just take the events as signals. Don't conflate those, right? Let's just make events events.

The abstract signal columns (On WhatsApp, Last touch) struck. The board carries stored recruit fields and readable person facts only; events are events.

### W1-01

> It's a new page on the sidebar underneath Roster, and it's under /operate. That's it. There's no factual thing: roster, recruitment, events, and whatever. Don't change anything else.

Recruitment is a top-level destination second in the sidebar, route /operate/recruitment. The Administration group is unchanged and carries no Recruits entry.

### W1-02

> How was this UI proposed? Where else are we using this particular UI element?

nowhere. The two-line cell (presence chip over a prefixed RSVP) was invented and wrongly described as reuse; no grid cell in the application stacks a state over an RSVP, and no presence value is rendered as a filled pill. Rebuilt as Brian then specified: one band per event over an RSVP column and an Attendance column side by side, plain text, exactly as attendance-section.tsx renders the same two facts. Invitation is not shown at all — “I don't care if they were invited or not” — so a walk-up reads as RSVP Not recorded with an attendance of Present.

## Brian approval

- Exact words: _"Okay, workflow 1 is approved."_
- Date: 2026-08-31

One approval, given after the event columns were rebuilt as an RSVP column and
an Attendance column side by side under each event's own heading. It covers the
specification and the mockups together; it is recorded against both gates
because that is what he approved, not because he gave two answers.
