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
- Entry point: a Recruits item in the Administration group of the left navigation,
  directly beneath People.
- Route/placement: `/operate/recruits`.
- Controlling source: Task 09 D4 and D9; portfolio row 6's "recruits list beside
  the roster"; Brian's 2026-08-28 board decision and his 2026-08-31 confirmation
  that it is recruitment's own board modelled on the roster board.
- User-visible result: a board of one line per recruit for the open season, in the
  club's existing board language, that can be searched, filtered, sorted and acted
  on.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue: `/operate/roster` at
  `main@e669331`, photographed as `W1-01`. `/operate/people` is photographed as
  `W1-02` for its list-and-search language.
- Reused component, language, interaction, and permission patterns: the banded
  board built by LAN-186 — `src/app/operate/roster/board-columns.ts` supplies the
  band model, the 28px band-header row, the 16px band label inset, the pinned
  first column, per-column filter chips, and in-cell editing for facts this
  mission owns against read-only cells that route to the person record. The
  authority gate is the same `person_record_authority` the roster board reads.
- Desktop and 375px evidence: `W1-01` and `W1-02`, both sides, each photographed
  at a browser-measured 1280px and a browser-measured 375px.
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

| Band            | Colour            | Why                                                                                        |
| --------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| **Person**      | `#455a64`, as-is  | The same person facts, read-only, routing to the person record exactly as the roster does. |
| **Recruitment** | `#00695c`, new    | This mission's own facts. A new band because it is a new kind of fact, not a recolour.     |
| **Events**      | `#0b3d91`, reused | One appended column per recruitment event, in the Season band's blue.                      |

The Recruitment band's teal is the one genuinely new colour. It is proposed rather
than locked: it sits beside slate and blue without competing, and it is not the
amber that already means Onboarding. If Brian would rather the recruitment band
reuse the Season blue and the event columns take the new colour, that is a
one-line swap and changes nothing else.

## The columns

**Person band** — read-only, routes to the person record on click, exactly as the
roster board's person columns do.

| Column      | Source                    | Notes                                                              |
| ----------- | ------------------------- | ------------------------------------------------------------------ |
| Recruit     | `people`                  | Pinned first column. Display name, links to `W2`.                  |
| College     | `people`                  | `Not recorded` in grey where absent, as the roster does.           |
| Matric      | `people`                  |                                                                    |
| Contactable | derived                   | Mobile / Email pills, exactly the roster's indicators.             |
| On WhatsApp | seasonal channel presence | Already a row on the person record and empty today; `W3` fills it. |

**Recruitment band** — this mission's facts, edited in the cell.

| Column        | Source                  | Notes                                                                  |
| ------------- | ----------------------- | ---------------------------------------------------------------------- |
| Status        | `recruitment_prospects` | The seven-value ladder. Edited in the cell; `W14` intercepts `joined`. |
| Source        | `recruitment_prospects` | Which door they came through.                                          |
| First contact | `recruitment_prospects` | Date.                                                                  |
| Asked         | the `W4` request        | Whether the recruit-stage form is open, answered, or never sent.       |
| Last touch    | derived from messages   | When the club last said anything, and what.                            |
| Notes         | `recruitment_prospects` | Prose. Never scored, never ranked — Task 09 D9 and 8/5.                |

**Events band** — one column per recruitment event, appended at the right end in
date order, oldest first, so the term reads left to right. Each column is headed
by a compact handle carrying the event's name and date. Each cell shows three
things in one glyph group: invited, answered and what they said, attended.

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

| Decision                                                                           | Classification                | Governing evidence or recommended default                                         | Status  |
| ---------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- | ------- |
| The board is recruitment's own, modelled on the roster board, not a list beside it | `locked`                      | Brian, 2026-08-28 and 2026-08-31                                                  | Settled |
| Structure, grouping and colour language carried from `/operate/roster`             | `locked`                      | Brian, 2026-08-31: "similar colors, if we can keep them consistent"               | Settled |
| Route is `/operate/recruits`, in Administration beneath People                     | `delegated to Mission Lead`   | Matches `/operate/people` and `/operate/roster`; changes no intent                | Settled |
| Three bands: Person, Recruitment, Events                                           | `proposed for owner approval` | A recruit holds no membership, so Onboarding and Season describe nothing          | Open    |
| The Recruitment band is teal `#00695c`                                             | `proposed for owner approval` | Sits beside slate and blue without competing; not the amber that means Onboarding | Open    |
| The six recruitment columns above                                                  | `proposed for owner approval` | Drawn from the 2026-08-28 research and the boundary's signal items                | Open    |
| Event columns append oldest-first, left to right                                   | `locked`                      | Brian, 2026-08-28: appended at the right end, read as signals across the term     | Settled |
| Status is edited in the cell, except `joined`                                      | `proposed for owner approval` | Matches the roster board's in-cell season editing; `joined` is `W14`'s            | Open    |
| Default sort is ladder order, then most recent first contact                       | `delegated to Mission Lead`   | Reversible, changes no meaning                                                    | Settled |

## Brian approval

- Exact words:
- Date:
