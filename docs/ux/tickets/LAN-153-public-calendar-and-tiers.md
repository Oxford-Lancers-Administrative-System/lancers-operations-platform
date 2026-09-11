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
   different columns from `listCurrentSeasonEvents` and `readEvent`. A count or a
   status is not withheld from the public payload — it is never read out of the
   database, and the public types have no field for one. An online event's
   joining URL was on that list until LAN-284; it is now read and published, and
   nothing else about the projection moved.
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

| Column                                | Public                 | Operator               |
| ------------------------------------- | ---------------------- | ---------------------- |
| Name (a link to the event)            | ✅                     | ✅                     |
| Type                                  | ✅                     | ✅                     |
| Date (Europe/London)                  | ✅                     | ✅                     |
| Term and week                         | ✅                     | ✅                     |
| Where — address, or `Online`          | ✅                     | ✅                     |
| The joining URL of an online event    | ✅ (on the event page) | ✅ (on the event page) |
| Status                                | ❌                     | ✅                     |
| Invited · Said yes · Showed / Invited | ❌                     | ✅                     |

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

The jump control is **a row of buttons, one per segment** — Brian, at the visual
gate: _"A drop down doesn't really make sense. Maybe some buttons there to 'jump'
to the right place?"_ They wrap at 375px and carry the 44px touch minimum, because
on a phone they are the only navigation a very tall page has. Each resolves
**whichever anchor is actually laid out** — the week grid above `md` and the
stacked week cards below carry different ids, and resolving only the first left
the control inert at every width below 900px while the address bar still updated
(W153-F1).

- **A vacation belongs to neither adjacent term.** Stewart, asked directly: "It's
  neither." `YearSegment.termId` is `null` for one, and there is deliberately no
  field naming the term either side.
- **Vacation weeks are numbered forward from 1** — "Christmas Vacation 1, 2, 3 …"
  — and run until the next term's **own first configured week**, whatever that
  row declares it to be (LAN-114's contract already required this: "Nothing
  assumes weeks 1 to 8"). On the seed today that is −1st for Michaelmas and 0th
  for Hilary and Trinity, which is a fact about the data rather than a decision
  — see § Where the implementation departs, which does not close it.
- The **leading Long Vacation** is numbered from the day after the previous
  academic year's last term ends — the only place its week 1 can come from. The
  **trailing** one runs to the next Michaelmas where one is configured, and
  otherwise to the season's `ends_on`, the last dated event, or one week at
  minimum, so the segment always exists.
- **The two Long Vacations are drawn only as far as the club's records reach**
  (Brian, at the visual gate on `2d4fc02`: a full-length leading vacation
  _"just shows a really dead calendar, and that's not what I want to see."_).
  The **last five** weeks of the vacation before the year's first term and the
  **first one** after its last are drawn, each **extended, never shortened**, to
  include an event further out — his examples: an event seven weeks before term
  draws seven weeks, one three weeks after the season draws weeks 1, 2 and 3. A
  vacation shorter than the default is drawn whole; nothing is padded.

  **This does not renumber anything, and the visible consequence is worth
  expecting.** Vacation weeks are numbered forward from 1 from the vacation's
  real start (D85, Stewart Humble), so a fourteen-week leading vacation drawn to
  its last five **opens at "Long Vacation 10"**. That is the correct absolute
  position, not an off-by-nine. Brian's "7, 6, 5, 4, 3, 2, 1" describes a
  distance from the term boundary — how far to extend — and is not a request to
  relabel.

  **Terms are untouched.** Michaelmas, Hilary and Trinity keep every configured
  week, empty or not: an empty term week is the term card. **Christmas and Easter
  need no rule of their own** — they sit between terms, so the trim does not
  reach them, which is the outcome Brian asked for without a special case.

- The academic year is derived from the term dates — the year whose terms span
  today, else the season's start, else the latest configured — and **never** from
  heading text.
- Every dated event in the year lands in exactly one cell. A date the year does
  not reach, and an event with no date at all, are listed rather than dropped.

## Where the implementation departs from the approved mockup, and why

Two places, both recorded rather than left to be found as a contradiction.

1. **The run-up week: an open data question, not a settled design decision.**

   The renderer emits exactly the weeks a term row declares, from
   `terms.first_week` to `terms.last_week`, and invents nothing. **That principle
   is settled and should stay settled:** a calendar must not manufacture a run-up
   week the club's own term record does not declare, because the number it made
   up would be an Oxford week the schema would then refuse to store.

   **What is not settled is the data.** In the seeded 2026–27 season
   `first_week` is `-1` for Michaelmas and `0` for **both** Hilary and Trinity,
   so the column renders Michaelmas `−1st … 8th`, Hilary `0th … 8th`, Trinity
   `0th … 8th`. The approved mockup draws a `−1st week` at 3–9 Jan 2027 and
   summarises Trinity as `−1st – 8th`, and Stewart Humble's own words expect the
   vacation to run _"up until minus one week of Hilary"_.

   So the mockup and the product **do not disagree about behaviour** — they
   disagree about what the term rows say, and the difference disappears the
   moment real term data declares `first_week = -1` for Hilary and Trinity. The
   seed currently disagrees with itself across three terms of one season, which
   is a data question for whoever owns the term windows; **LAN-153 did not change
   the seed and does not close this.**

   `src/lib/services/oxford-year.test.ts` pins the _rule_ — a vacation runs up to
   the next term's own first configured week, whatever that is — and not the
   particular numbers the current seed produces.

2. **The mockup's explanatory captions are not in the product.** "anyone can read
   this page", "Applied as you type — no Apply button", "One continuous column —
   jump, don't switch calendars", "Past events are history… never the default
   view", and "Joining details are sent to the people invited". Brian, 21 August
   2026: "I hate the callouts … That should not be in the real UI", and the
   decision table records that explanatory callouts belong to the review artifact
   and never to the product. The last of them would also have been false: the
   joining URL is published on this page (LAN-284), not sent separately.

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

**How an invited person receives an online event's joining URL** was carried as a
nonblocking unknown in `W1`, on the premise that the link could not be published.
LAN-284 removed the premise (Brian, 2026-09-09): the link is on the public event
page and in the subscription feed, so an invited person reaches it the same way
anybody else does. What is published is a link that admits nobody on its own —
the meeting requires its own passcode, shared privately, on top of the
Oxford-domain approval — and the application cannot verify that a given meeting
has one. That is accepted knowingly; the event editor warns the operator, and the
control is operator discipline. A passworded calendar was proposed on the same
call and is **not** in this release.

## Decision history relocated from source (LAN-300)

### src/app/operate/events/page.tsx — `EventsPage` (module header)

> ## It opens on what is upcoming, and it groups
>
> D84 and Brian, 20 August 2026. The list no longer renders the whole season in
> one flat run: it opens on **This month**, breaks what is in view into discrete
> tables by period, and offers **All events** as the widest bucket with every
> sort and every filter working there. Past events stay reachable and are never
> the default. `@/lib/services/event-periods` owns the buckets, and the public
> list is grouped by the same ones.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/page.tsx — `EventsPage` (module header)

> ## Season-scoped, and no way to leave it
>
> The line under the heading names the season the club is operating, and there
> is no season selector — `REQ-one-open-season`, and Brian, 21 August 2026: "we
> know what calendar we're looking at." Which season that is comes from
> `readCurrentSeason()`, and a club with none gets a refusal rather than last
> year's events.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/page.tsx — `EventsPage` (module header)

> ## Term and week comes from the calendar, not from the row
>
> `REQ-three-arrangements` requires the list and the Oxford View to agree about
> when an event is, so both read one built academic year (`@/app/calendar/year`).
> Reading `events.week_number` here instead would say "Outside term" for a
> vacation event the calendar happily calls "Christmas Vacation 2" — the stored
> column is constrained to −1..8 and cannot hold the second.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/page.tsx — `EventsPage` (module header)

> ## Authorisation is in the service layer
>
> `listEventsForOperator` guards itself (`@/lib/auth/event-tier`). The gate below
> and the layout's own check remain, and this is the third of three independent
> refusals rather than a replacement for either — which is what `slice-ux.md`
> § 4's "routes do not authorize" has to mean now that a public calendar exists.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/labels.ts — module header

> Turning a stored value into the club's word for it.
>
> Every operate screen keeps its own label maps — the roster's statuses, the
> events screens' types, the report's onboarding states — because those
> vocabularies belong to their screens and have no business being one shared
> dictionary. The _lookup_, though, was written out three times, identically,
> in `roster/presentation.ts`, `events/presentation.ts` and
> `report/presentation.ts`. Three copies of one expression is three places for
> the fallback to be forgotten, and the fallback is the whole point: a value
> the map has never heard of has to render as itself rather than as a blank
> cell, because a blank cell reads as "no status" instead of "a status nobody
> has written a label for yet".
>
> The maps stay where they are. Only this is shared.
>
> ## Where it lives now
>
> The implementation moved to `@/lib/services/event-vocabulary` when LAN-153
> opened a public calendar: the vocabulary that calendar needs had to leave
> `/operate`, and it needs this lookup, so a module under `src/lib/` could not
> go on importing from `src/app/`. This file is the re-export, so the five
> `/operate` screens that have always imported `labelFor` from here still do.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/list-filters.tsx — carry prop

> Other query keys this bar does not own, kept as the reader narrows.
>
> LAN-153: the event lists put the chosen period in the query string, and it
> is not a filter this bar offers — but typing in the search box must not
> silently move the reader back to the default period. Every control here
> carries these through, and they are mirrored as hidden inputs so a native
> form submit does not drop them either.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/events/shared.ts — EVENT_SORT_COLUMNS.date

> Soonest first by default, since LAN-153.
>
> It was newest-first while the list rendered the whole season in one run and
> the useful end was the recent past. The list now **opens on what is
> upcoming** (D84), and the useful end of an upcoming list is the near future
> — an operator scanning before the Monday meeting wants Wednesday's practice
> at the top, not last June's.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/events/public-tier.ts — PublicEventListEntry header

> ## Except `isCancelled`, which is not a status
>
> Correction C1 to `W1`: a cancelled event stays on the public list, marked
> cancelled. D57 keeps it visible with its history, and `W2` keeps it in the
> subscription feed marked cancelled — so hiding it here would make two public
> surfaces disagree, and an event that silently disappears from somebody's
> calendar reads as a sync failure.
>
> That needs one bit, not the status column. A reader learns whether the event
> is off; they do not learn whether it is a draft, which is the operator tier's
> (`W1`'s tier table, Brian 20 August 2026).

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-vocabulary.ts — file header (why this moved)

> ## Why this moved out of the operator screens
>
> All of this used to live in `src/app/operate/events/presentation.ts`, which
> was the right place while `/operate` was the only place an event was ever
> displayed. LAN-153 opens a public calendar, and the club calls a practice a
> **Practice** whoever is reading — the vocabulary is a fact about the domain,
> not about the operator's screens. Leaving it under `/operate` would have meant
> either a public surface importing from the operator's, or a second copy of the
> seven type names; `docs/ux/standards.md` rule 7 is exactly about the second.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/calendar.ts — status removal note

> `status` used to be here and is deliberately gone — LAN-153.
>
> Nothing in this module or in `./oxford-year` ever read it: placing an event on
> a date does not depend on what state the event is in, and D5 means no state
> hides an event from a calendar anyway. It was only ever passed through to the
> tile, which is now handed the word it should print (`CalendarEntry`'s
> `statusWord`) rather than deriving one.
>
> That is what lets these projections serve both tiers from one implementation.
> The public tier has no status to give — `REQ-three-tiers` puts the status
> column on the operator's side of the line — so a `CalendarEvent` that required
> one would have forced the public list to invent a value, and "approved" for a
> draft is exactly the kind of quiet lie a screen reader would then read out.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/oxford-year.ts — module header

> The Oxford View — one continuous academic year. LAN-153, `REQ-oxford-continuous`.
>
> ## What replaced the term card, and why
>
> LAN-114 built three separate term cards behind an academic-year selector and
> an Oxford-term selector. Stewart Humble asked for the opposite on 17 August
> 2026: _"you can do a continuous scroll and it's going to merge from Michaelmas
> to Christmas vacation to Hilary to Easter vacation to Trinity to long vacation
> to the next … you might say academic year 26/27, which is all the vacations
> and all the terms."_ D85 recorded it, and this module is that column.
>
> The difference is not cosmetic. A term card can only show a term, so the weeks
> between terms had to be borrowed by whichever card was nearest — which is why
> LAN-114 needed `nearestTerm`, a six-week reach, an ownership question asked at
> every cell to stop one event appearing on two cards, and a leftover panel for
> the events no card could reach. A continuous year has none of those problems
> to solve, because **every date in the year is already inside exactly one
> segment**. All of that machinery went with the term card.
>
> ## A vacation belongs to neither adjacent term
>
> Asked directly whether the Christmas vacation was part of Michaelmas or part
> of Hilary, Stewart answered _"It's neither."_ So a vacation is its own
> segment, with its own name and its own week numbering, and `YearSegment.termId`
> is `null` for one — not the term before it and not the term after it. That is
> what retires D9's "an out-of-term event belongs to the term that follows it as
> a negative week" and D10's "Outside term" strip: there is nothing left for a
> catch-all to catch.
>
> ## Vacation weeks are numbered forward, and are not Oxford weeks
>
> _"Christmas Vacation 1, 2, 3 …"_, running _"until it'll match perfectly up
> until minus one week of Hilary"_ — Stewart again, and the Long Vacation's
> numbering reaches the twenties. `events.week_number` is constrained to −1..8
> and could not hold "Long Vacation 22" even if somebody wanted it to, which is
> the other half of why these coordinates are **derived here and never stored**.
> Nothing in this module writes anything, and nothing reads `events.term_id` or
> `events.week_number`: the event's real date is the source of truth and the
> coordinate follows from it.
>
> ## Pure, like `./calendar`
>
> No database, no clock, no environment. The terms, the events, today's date and
> the season's window are all arguments, so the club's reference boundaries can
> be checked against this module directly and the same functions render in a
> client component.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/seasons.ts — Season.startsOn

> `YYYY-MM-DD`. The season's window opens in the Long Vacation before
> Michaelmas, at the AGM (Brian, 17 August 2026).

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
