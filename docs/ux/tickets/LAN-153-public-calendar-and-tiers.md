# LAN-153 — The public calendar, three access tiers, and one continuous Oxford year

**Workflow:** `W1 — Find and read events`
**Routes:** `/calendar`, `/calendar/view`, `/calendar/[id]`, `/operate/events`, `/operate/events/calendar`
**Shared contract:** [`../slice-ux.md`](../slice-ux.md) · [`../standards.md`](../standards.md)
**Supersedes:** [`LAN-114-event-calendar.md`](LAN-114-event-calendar.md) § Authorization and § UX-35

## Why this contract exists

The mission packet's `W1` specification and its mockup were the approved design,
and the packet is not a durable repository contract. This records what was built
from them, so a later issue does not have to re-derive it from the code, and so
the two places the implementation departs from the mockup are written down rather
than discovered.

Sources, in the authority order `slice-ux.md` § 1 sets:

- `LAN-153` in Linear, and the owner decisions it cites (D1–D11, D57, D62,
  D65, D72–D74, D83–D86).
- `missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/workflows/W1-find-and-read-events.md`,
  approved by Brian on 20 August 2026, with correction C1 of 21 August.
- `missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/mockups/W1-find-and-read-events.html`,
  a separate approval — screens `W1-01` to `W1-06`, desktop 1280 and 375.
- Stewart Humble's transcript of 17 August 2026, for the club's own vacation
  vocabulary.

## The three tiers

| Tier          | Sees                                                    | Reached by                                    |
| ------------- | ------------------------------------------------------- | --------------------------------------------- |
| **Public**    | the event record                                        | `/calendar`, no account                       |
| **Club link** | plus audience, RSVP, attendance, the participation view | not yet issued — `WP-participation-club-link` |
| **Operator**  | plus delivery                                           | `/operate/events`, a linked, active operator  |

Delivery is the only operator-locked element (D2, D3, D65).

**Authorisation is enforced in the service layer, never by route visibility**, and
this package is where that stops being a slogan: it opens the application's first
genuinely anonymous read surface, so "the page is under `/operate`" is no longer
even an approximation of who is reading. Two mechanisms carry it, and neither is
a rendering decision:

1. **The projection.** `listPublicSeasonEvents` and `readPublicEvent` select
   different columns from `listCurrentSeasonEvents` and `readEvent`. A joining
   URL, a count or a status is not withheld from the public payload — it is never
   read out of the database, and the public types have no field for one.
2. **The guard.** The elevated projection is reached only through
   `listEventsForOperator`, which calls `requireEventOperatorTier()` before it
   reads anything. Deleting a gate from a page cannot grant it.

`src/lib/auth/event-tier.ts` holds the vocabulary and the guard.
`src/proxy.ts` is unchanged: `PROTECTED_PREFIXES` is `/dashboard` and `/operate`,
so `/calendar` is unprotected by the rule that has always governed the others
rather than by an exception written for it.

## Navigation

| Choice          | Public                          | Operator                                  |
| --------------- | ------------------------------- | ----------------------------------------- |
| **List**        | `/calendar`                     | `/operate/events`                         |
| **Calendar**    | `/calendar/view?mode=gregorian` | `/operate/events/calendar?mode=gregorian` |
| **Oxford View** | `/calendar/view?mode=oxford`    | `/operate/events/calendar?mode=oxford`    |
| **One event**   | `/calendar/<id>`                | `/operate/events/<id>`                    |

Both switches are `nav` elements containing links, with `aria-current="page"` on
the active choice. The selected view, period, filters and sort all live in the
URL, so a view is a link somebody can send, the back button works, and a refresh
lands where it was. Every tile and every row leads to the event page **of its own
tier** — `src/app/calendar/routes.ts` is the one place either is built.

## One query, three arrangements

The list, Calendar View and Oxford View read one call per tier, so they cannot
disagree about which events exist or when they are. **When** an event is comes
from one built academic year (`src/lib/services/oxford-year.ts`), which the
list's _Term and week_ column, the Oxford View's row labels and the list's _This
term_ bucket all read. Deriving a second answer anywhere would drift exactly
where the club cares: a vacation event would read "Outside term" in the list and
"Christmas Vacation 2" on the calendar.

Nothing reads `events.term_id` or `events.week_number` for display. Both are
derived from the date, and `week_number` is constrained to −1..8 — it cannot hold
"Long Vacation 22" and never will.

## The list

- **Opens on `This month`**, grouped into discrete tables by period (D84). The
  periods are `This week`, `This month`, `This term`, `All upcoming`,
  `All events`; the longest bucket is the **term**, not a calendar quarter
  (Brian, 20 August 2026: "Use term."). Past events live in `All events` and are
  never the default view.
- At 375px the period buttons collapse to one select, so events start within a
  screen of the top (Brian, 21 August 2026).
- **Every column sorts**, and **Term and week resolves to the same SQL
  expression as Date** — one ordering asked for two ways, not two that agree.
- Search by name or venue; the filters apply as they change and there is **no
  Apply button** (§4.4).
- The default direction is **soonest first**, since the list opens on upcoming.
  One sort control governs the whole page, so `Already happened` reads in the
  same direction as the tables above it rather than reversing itself.

| Column                                | Public       | Operator               |
| ------------------------------------- | ------------ | ---------------------- |
| Name (a link to the event)            | ✅           | ✅                     |
| Type                                  | ✅           | ✅                     |
| Date (Europe/London)                  | ✅           | ✅                     |
| Term and week                         | ✅           | ✅                     |
| Where — address, or `Online`          | ✅           | ✅                     |
| The joining URL of an online event    | ❌ **never** | ✅ (on the event page) |
| Status                                | ❌           | ✅                     |
| Invited · Said yes · Showed / Invited | ❌           | ✅                     |

`Showed / Invited` reads `—` until a register has been saved and `0 / 47` once one
has been saved with everybody absent (D73, D74) — the two are a different fact and
must be distinguishable at a glance. It is formatted by
`formatShowedAgainstInvited`, the same function the register and the event page
use. Counts are raw pairs, never percentages (D62).

A **cancelled** event stays on the public list, marked cancelled (D57, and
correction C1 to `W1`): `W2` keeps it in the subscription feed, so hiding it here
would make two public surfaces disagree. That is one bit — `isCancelled` — and not
the status column: a public reader learns the event is off and nothing about
drafts.

## Calendar View

**Unchanged**, by Brian's instruction of 20 August 2026: "The Gregorian calendar
is fine as it is." LAN-114's month grid, moved to `src/app/calendar/` so both
tiers render the same one.

## Oxford View — one continuous academic year

Long Vacation → Michaelmas → Christmas Vacation → Hilary → Easter Vacation →
Trinity → Long Vacation, in one scroll, with a **jump control** and **no season
selector** (D85; Stewart Humble and Brian, 17 August 2026; Brian, 21 August).

- **A vacation belongs to neither adjacent term.** Stewart, asked directly: "It's
  neither." `YearSegment.termId` is `null` for one, and there is deliberately no
  field naming the term either side.
- **Vacation weeks are numbered forward from 1** — "Christmas Vacation 1, 2, 3 …"
  — and run until the next term's **own first configured week**. That is −1st for
  Michaelmas and 0th for Hilary and Trinity, because `terms.first_week` decides
  (LAN-114's contract already required this: "Nothing assumes weeks 1 to 8").
- The **leading Long Vacation** is numbered from the day after the previous
  academic year's last term ends — the only place its week 1 can come from. The
  **trailing** one runs to the next Michaelmas where one is configured, and
  otherwise to the season's `ends_on`, the last dated event, or one week at
  minimum, so the segment always exists.
- The academic year is derived from the term dates — the year whose terms span
  today, else the season's start, else the latest configured — and **never** from
  heading text.
- Every dated event in the year lands in exactly one cell. A date the year does
  not reach, and an event with no date at all, are listed rather than dropped.

## Where the implementation departs from the approved mockup, and why

Two places, both recorded rather than left to be found as a contradiction.

1. **The mockup draws Christmas Vacation 1–4 and then a −1st week of Hilary.**
   Hilary has no −1st week: the HT27 term card starts it at 0th week on 10
   January, and `terms.first_week` is `0`. The vacation therefore runs to
   Christmas Vacation 5 and meets Hilary at its 0th week. The term data is the
   authority; the mockup's extra row is a drawing detail.
   `src/lib/services/oxford-year.test.ts` asserts it.
2. **The mockup's explanatory captions are not in the product.** "anyone can read
   this page", "Applied as you type — no Apply button", "One continuous column —
   jump, don't switch calendars", "Past events are history… never the default
   view", and "Joining details are sent to the people invited". Brian, 21 August
   2026: "I hate the callouts … That should not be in the real UI", and the
   decision table records that explanatory callouts belong to the review artifact
   and never to the product. The last of them would also have been false: this
   mission stores the joining URL and shows it to operators, and delivering it is
   deliberately unsolved.

The same rule removed the operator calendar's read-only note ("Every linked,
active operator can read this calendar…"). The absence of the **Create event**
action is the fact; narrating the rule is not the screen's job.

## One season, and no way to leave it

One season is open and this mission knows no other (`REQ-one-open-season`; Brian,
21 August 2026). Every surface reads it, the page header names it, and no control
anywhere offers another. `readPublicEvent` is scoped to it, so a public address
for an event in a season the club is not operating reads as gone — in the same
words as an id that never existed.

## Empty and exception states, which must not read alike

`slice-ux.md` § 9, and `W1`'s exception table. Each says what is true and, where
there is one, the smallest recovery the reader is authorized to take.

| Situation                                           | What is shown                                                |
| --------------------------------------------------- | ------------------------------------------------------------ |
| No events in the season at all                      | `events-empty` / `public-season-empty`                       |
| Nothing in the period being viewed                  | `events-period-empty` / `public-period-empty`                |
| Nothing matching the filter                         | `events-filter-empty` / `public-filter-empty`                |
| No event in the month being viewed                  | `month-empty` / `public-month-empty`                         |
| A week row with nothing in it                       | The row still renders, with its exact date range             |
| An event with a date but no time                    | Shown on its date, without an invented time                  |
| An event with no date                               | Listed beneath the calendar, never dropped                   |
| A date outside the academic year                    | Listed beneath the calendar, never dropped                   |
| No term windows configured                          | A **warning** — a configuration fault, not an empty calendar |
| `?month=banana`, `?period=banana`, `?sort=said_yes` | Falls back to where it would have opened anyway              |

## Responsive

- Desktop is the scannable command view; below `md` both lists become one
  condensed card per event and both calendars become stacked week cards.
- Every week the desktop grid holds is present on the phone, empty ones included:
  a week with nothing in it is a fact about the week (§ 7).
- The period control collapses to one select at 375px, and no data needed for the
  task is dropped.

## What this package deliberately does not build

The **subscription feed** and the **Add to your calendar** action
(`WP-subscription-feed`, `W2`); the **participation view** and **club-link
issuance** (`WP-participation-club-link`, `W7`); the CSV import, the authoring
form and the templates. The club-link tier's seam exists in
`src/lib/auth/event-tier.ts` so that work adds a resolver rather than inventing a
second vocabulary.

**How an invited person receives an online event's joining URL is unsolved and
must not be forgotten** — carried as a nonblocking unknown in `W1` with its
handling rule. This mission stores it and shows it to operators; it neither
publishes nor delivers it.
