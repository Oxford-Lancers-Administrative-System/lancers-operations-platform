# LAN-114 — Gregorian and Oxford term-card event calendar views

**Screens:** UX-34 (Gregorian calendar), UX-35 (Oxford term card)
**Route:** `/operate/events/calendar`
**Shared contract:** [`../slice-ux.md`](../slice-ux.md)

## Why this contract exists instead of a wireframe

LAN-90's approved UX package predates this work. Its post-approval owner
reconciliation of 12 August 2026 moved Gregorian and Oxford term-card calendar
views out of "deferred ideas" and into LAN-114 as MVP work, but produced no
wireframe for either. LAN-114's own description specifies the structure in
detail — the term-card grid, the week rows, the Sunday–Saturday columns, the
date ranges, the outside-term treatment — and names three source spreadsheets.
That description is the contract, and this document records what was built from
it so a later issue does not have to re-derive it from the code.

The three sources inspected before implementation:

- `260720 OULAFC MT26 Term Card v0.xlsx`
- `260720 OULAFC HT27 Term Card v0.xlsx`
- `260720 OULAFC TT27 Term Card v0.xlsx`

## Navigation

The Events area has one list and one calendar, and the calendar has two modes:

| Choice          | Where it goes                             |
| --------------- | ----------------------------------------- |
| **List**        | `/operate/events` — unchanged             |
| **Calendar**    | `/operate/events/calendar?mode=gregorian` |
| **Gregorian**   | `?mode=gregorian&month=YYYY-MM`           |
| **Oxford term** | `?mode=oxford&term=<term id>`             |

Both switches are `nav` elements containing links, with `aria-current="page"` on
the active choice. The selected view lives in the URL, so it is shareable,
survives a refresh, and works with the back button. There is no stored
preference and no client state to fall out of step with what is rendered.

Every event tile in either calendar links to `/operate/events/<id>` — the same
detail record the list row opens.

## Authorization

The ordinary operator gate, exactly as the event list uses it: **any linked,
active operator may read the calendar**, including saved drafts and pending
events. Only the President, Vice President, Secretary and General Manager see
the Create control, and every write behind it guards itself.

LAN-114 asks for "a club-wide read surface for everyone the calendar serves".
In this slice the widest audience the application has is the linked, active
operator: players hold no account and reach the application only through the
no-login RSVP token in LAN-79. Opening a calendar to unauthenticated visitors
would change the security posture rather than add a calendar, which `AGENTS.md`
reserves for Brian. If he wants a genuinely public or player-authenticated
calendar, that is a follow-up issue and a posture decision.

Viewing or navigating the calendar creates and changes nothing. The page reaches
only reads; there is no server action on it, and a screen test asserts that no
write in the event, audience or approval services is called by any of its
views.

## UX-34 — Gregorian calendar

- A conventional month, weeks running **Sunday to Saturday** to match the term
  card, so an operator moving between the two reads the same shape of week.
- **Previous month**, **Next month**, **Today**, and a native month field for
  direct navigation.
- Days borrowed from the adjacent months are dimmed but not blank, and they
  carry their events.
- Two or more events on one day are listed separately, earliest start first; an
  untimed event sorts after the timed ones.
- Opens on today's month when the season has events in it, otherwise on the
  month of the nearest event — the club spends the summer outside its season and
  an empty August grid says nothing true.
- **Phone (below `md`):** the same days become a vertical agenda. Every day the
  desktop grid contains is present, including empty ones, stated compactly.

## UX-35 — Oxford term card

- Academic-year and Oxford-term selectors. Choosing a year moves to the
  same-named term in that year where it exists.
- Rows are the term's **configured** weeks, from `terms.first_week` to
  `terms.last_week` — Michaelmas from −1st week, Hilary and Trinity from 0th.
  Nothing assumes weeks 1 to 8.
- Columns are Sunday through Saturday.
- Every week row states its exact Gregorian range. The month is repeated when a
  week crosses one and the year when it crosses that, so a row is readable
  without reference to any other row.
- **The card reaches past the term.** Every dated event attaches to its nearest
  term, and the card emits whole Sunday–Saturday **context rows** before its
  first week and after its last until it covers them. Those rows are labelled
  "Before term" / "After term" with their dates, and are visually quieter than a
  real Oxford week — the club has no name for the week before −1st week, and
  `week_number` is constrained to −1 through 8, so inventing "−2nd" would assert
  a week the rest of the system would refuse to store. A term with nothing
  around it renders exactly its own weeks.
- **Reach is bounded at six weeks** (`MAX_CONTEXT_WEEKS`). The longest gap
  between consecutive Oxford terms in a real club year is the five-week
  Christmas vacation, so six reaches any event in any real vacation from either
  side while stopping an event a year adrift from dragging fifty empty rows onto
  the screen.
- **What is left is stated quietly, not omitted.** One line says events in the
  season's other terms are on those terms' cards. Below it, and only when they
  exist: events with no date, and dated events too far from any term to reach.
- **Phone (below `md`):** the same weeks become sections, each listing its seven
  days. Every week, day and event the desktop card shows is present.

## Colour is type; words are status

The two carry different questions, which is why they do not compete.

**Colour means `event_type`, and nothing else.** The club's own term cards
colour by what the event is, and the first implementation rendered every tile
grey. Owner review, 14 August 2026: _"I really like the type colour coding here
… every event is grey versus by type."_ Each type has a tint and a saturated
left edge (`EVENT_TYPE_COLOURS`), and every tile also **prints its type in
words**, so nothing depends on separating two hues. A legend above each calendar
names the colours — and only the types actually in view, so it stays short and
does not reshuffle between months.

The palette is chosen for separation and for legible dark text on the tint, not
sampled from the spreadsheet: reproducing the source's colours pixel for pixel
is out of scope, and `src/theme.ts` is still a neutral placeholder with no
branded palette to draw from. A test asserts every type in the club's vocabulary
has a distinct colour and that every tint stays light enough for body text.

**Status is words, when it has anything to say.** A tile prints Draft, Pending
approval, Cancelled, Not held, Rejected or Withdrawn. The two statuses meaning
_this is proceeding normally_ — `approved` ahead of us, `occurred` behind us —
are silent. Owner review, same day: _"if an event is in draft, I think it's
important. If it happened in the past, that's fine. We don't need to see that."_

The four statuses meaning the event **did not or will not happen** also strike
the name through. That is the one non-colour visual treatment on a tile, so it
neither competes with the type palette nor disappears in black and white.

Each tile's **accessible name always carries everything** — date, time, status,
type and venue — including the status the tile stays quiet about. Quieting a
tile is a presentation choice; hiding it from a screen reader would be a loss of
information.

## Date authority

The event's `scheduled_on` is the only operator-entered scheduling fact. Oxford
term, week and day are **derived projections**, computed by the same
`deriveTermCoordinate` LAN-76 uses when a draft is saved — so the card and the
stored coordinate cannot disagree. This issue introduced no editable term or
week field, and no migration: `public.terms` already carries `academic_year`,
`starts_on`, `ends_on`, `first_week` and `last_week`, which is exactly the
configuration the mapping needs for any academic year.

Which day is _today_ is asked once, in the club's zone, in `src/lib/club-time.ts`.
The calendar components never consult a clock themselves.

## Deliberately out of scope

Drag-and-drop rescheduling; creating an event from a calendar cell; recurrence;
calendar subscriptions or external feeds; templates and bulk changes; RSVP
monitoring; reproducing the spreadsheets' branding; and a production term
administration UI.
