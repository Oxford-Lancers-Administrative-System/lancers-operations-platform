# LAN-267 — the BAFRA roster form, generated from a game

The surface contract for `/operate/events/[id]/roster-form`, built in LAN-275
(package G6). Decisions are Brian's, 2026-09-09, recorded on LAN-267.

## Why this contract exists

The club has to hand the officials a roster form at every game. Today it is a
Word document filled in by hand, from a template a former official shared with
the club. Brian's ask: generate it from the record instead.

That template carries the current coaching staff's real names and real BAFA
registration numbers. **Nothing from it is in this repository** — not in code,
fixtures, tests, screenshots or this file. The generated form fills those
columns from the database at run time.

## The route, and who reaches it

`/operate/events/[id]/roster-form`, reached from a **Roster form** action on an
approved game's own page. The action appears on a game and on nothing else: a
practice has no officials to hand a form to.

The gate is `event_calendar_management` — the four offices plus the IT officer,
the same capability every other deliberate act on a game already requires. It is
deliberately not a new capability: the capability map is a recorded authority
decision, and widening it (a kit manager, say) is one row there, not something
this surface decides.

A draft game is refused with a sentence, not a form. The audience, the date and
the venue can all still move, and a form generated from a draft would be one the
officials are handed against a fixture the club has not committed to.

## Two states, one page

**Picking.** The operator chooses the kit, filters by RSVP answer, corrects the
opponent, and ticks and unticks the squad. Everybody with a number in the chosen
kit starts ticked — the common case is the whole dressed squad, and unticking
two is less work than ticking forty.

**The form.** Generating swaps the same page for the printed three-table form.
Nothing is re-fetched, so the form can never disagree with what was just ticked.
**Print → Save as PDF** produces the page the officials expect; there is no
document-generation library and no stored file.

## The filters

- **Kit** — blue or white. It is not cosmetic: a player's number differs between
  the two sets, so changing it re-reads the roster and, deliberately, resets the
  ticks. A selection made against the blue numbers says nothing about who is
  dressing in white.
- **RSVP** — everyone, said yes, said no, or unanswered. It narrows who is
  offered for ticking; it never decides who is dressed. That is the operator's
  call, on the screen.
- **Opponent** — see below.

## The opponent, and the one departure from the ticket's own text

LAN-267 says to read "`events.event_date` and `events.opponent` on a game event
(D14 made opponent a real field)". That is the wrong way round. **D14 removed
`events.opponent`**: `20260822120000_events_target_state.sql` drops the column —
"There is no opponent field, and there never was a real second one" — and the
event form has said "The opponent goes in the name." for a game ever since.

So the screen offers an **Opponent** box that starts from the event's own name
and the operator may correct before printing. Nothing is stored. The club's
record of who it played is still the event's name; adding a column to hold a
second copy of it would be a schema change with no owner decision behind it.
The date comes from `events.scheduled_on`, which does exist.

## The three tables

1. **Header** — Team (always Oxford Lancers), Date, Opponent.
2. **Players** — Surname, Forename · Student no · Jersey no, **one row per
   jersey number 1 to 94**, in jersey order. Only dressed players appear; every
   other row stays blank. A dressed player with no student number prints with a
   blank in that column rather than being left off.
3. **Coaches / sideline personnel** — Surname, Forename · BAFA no · Role, with
   blank rows to twelve.

`Surname, Forename` is a formatting choice, not a stored one. A first-name-only
record — 26% of the club's real rows — prints the forename alone rather than a
row beginning with a comma.

## The role codes

Head coach → **HC**. Every other coaching seat → **AC**. That is Brian's own
derivation, from the role catalogue's `coaching_staff` group.

**TR** (trainer or physio) and **SL** (other sideline personnel) print blank,
and will until the club decides otherwise. The role catalogue is closed at
twenty seats and none of them is a trainer, a physio or a team manager, so no
person can be derived into either code. Inventing a seat to fill those rows
would be adding a club concept, which is an owner decision.

## The warning line

Above the form, and printed with it, because an operator can fill a blank in by
hand at the ground and cannot do that if the page never said which blanks there
are. Three separate lists, because they are three different problems:

- dressed players with no student number on file;
- coaches with no BAFA number on file;
- **players who were ticked but have no number in this kit**, and so appear
  nowhere on the form at all. That is the one that silently loses somebody, so
  it is named separately rather than folded in with the blanks.

## What is recorded

One audit row per generation — who, which event, when, which kit, and how many
players and coaches were on it. Nothing else. Storing generated PDFs and a
document library are both explicitly out of scope, and a copy of a dozen student
numbers sitting in a second place is exactly what generating on demand avoids.

## Responsive

The printed page is not a 375 target and LAN-267 says so. The picking screen is,
and it is a stack of rows with one tick box each rather than a table, for that
reason.

## Visual evidence

`docs/ux/review/LAN-275/` — the picking screen at desktop and at a measured
375px, and the generated form printed to PDF.
