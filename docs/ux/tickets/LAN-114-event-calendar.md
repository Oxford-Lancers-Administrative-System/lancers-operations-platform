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
- **Events the card cannot hold are stated, never omitted.** Below the card:
  events in another configured term, grouped by term with a link to that term's
  card; events in no configured term at all; and events with no date recorded.
- **Phone (below `md`):** the same weeks become sections, each listing its seven
  days. Every week, day and event the desktop card shows is present.

## Status, and colour

Every tile prints its status in words — Draft, Pending approval, Approved,
Occurred, Not held, Cancelled, Rejected, Withdrawn. The tinted left edge assists
scanning and carries nothing the text does not already say. Each tile's
accessible name repeats its date, time and status, because a tile is read out of
the grid's visual context.

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
