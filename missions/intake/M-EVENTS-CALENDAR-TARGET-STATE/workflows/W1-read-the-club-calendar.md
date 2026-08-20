# W1 — Read the club calendar

- **Primary actor:** anyone with a browser and no account. Members, coaches and
  operators read the same surface; the anonymous reader is the one who defines
  it, because they are the widest audience and the most constrained tier.
- **Trigger:** somebody wants to know when and where the club's events are — a
  player checking Wednesday's practice, a prospective member looking for a
  recruitment session, a parent looking for the Varsity fixture.
- **Entry point:** the club's public web address. No login, no signed link, no
  invitation.
- **Route/placement:** a public calendar route. Today the only calendar is
  `/operate/events/calendar`, behind the operator gate; see _Repository
  reconciliation_ below.
- **Controlling source:**
  [Events & Calendar brief](https://app.notion.com/p/3bc488886d5781138de8c03209ed6bcf)
  D1–D11 and D83–D85, forward records F3 and F4.
- **User-visible result:** they know when and where the club's events are, and
  can open any one of them for its details.

## Required actions

1. **Open the calendar** with no account and no prior contact with the club.
2. **Switch between the two views** — "Calendar View" (Gregorian month grid) and
   "Oxford View" (the term card), named exactly that (D6).
3. **Move through time** — month to month in Calendar View; across the
   continuous academic year in Oxford View, filtering to a single term or
   vacation (D85).
4. **See what kind of event each one is**, by the per-type colour scheme shared
   across both calendars and the event list, with the type also stated in words
   (D83).
5. **Open an event** and read its facts — name, type, date, time in
   Europe/London, venue or online destination, description, required equipment,
   whether attendance is mandatory.
6. **Reach the subscribe action** (`W2`) from the calendar.

## State transitions

**None.** This workflow changes nothing. That is a requirement rather than an
observation: LAN-114 already requires that no audience, invitation, RSVP,
attendance or automation record is created merely by viewing or navigating, and
D1 widens the traffic that must hold for to anonymous requests with no session
at all. The current implementation achieves this structurally — the calendar
module imports no server action and no write path — and the public surface must
keep that property rather than re-acquire it.

## Handoffs

- **→ `W2`** — the subscribe action lives on this surface.
- **→ the club-link tier** — a reader holding the signed club link sees the same
  event with audience, RSVP and attendance added (D2). Same route, more content.
- **→ `W7`** — an operator reading the calendar reaches the event page with
  everything, including the operator-only delivery flag (D3, D65).
- **← `W3`, `W4`, `W5`, `W6`** — every event this workflow displays arrives from
  one of those. Drafts appear the moment they are saved (D4).

## Exceptions and recovery

| Situation                                   | What the reader sees                                                                                                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No events in the season at all              | An empty state saying so, not an empty grid                                                                                                                                                     |
| No events in the month or term being viewed | A distinct empty state — "nothing this month" is not "nothing all season"                                                                                                                       |
| An Oxford week row with nothing in it       | The row still renders, with its exact Gregorian date range                                                                                                                                      |
| A deep-vacation date                        | Placed in the continuous academic-year projection under the club's own vacation naming, numbered forward (D85). The "Outside term" strip D10 created becomes unnecessary in the continuous view |
| An event with a date but no time            | Shown on its date without inventing a time                                                                                                                                                      |
| An event with no date                       | Cannot be placed on a calendar; the current implementation lists it separately rather than dropping it, and that behaviour is retained                                                          |
| No term windows configured                  | A warning state, because an Oxford view with no terms is a configuration fault, not an empty calendar                                                                                           |
| A malformed URL parameter — `?month=banana` | Falls back to where the calendar would have opened anyway, never an error page                                                                                                                  |

## Safety, privacy, consent, and authority boundaries

- **This is the application's first anonymous read surface.** Every existing
  route either requires an operator session or a signed token. The public
  calendar has neither.
- **The public tier shows event facts only** (D2). Audience, RSVP and attendance
  begin at the club link; delivery is operator-only (D3, D65). A public event
  page must therefore be able to render an event without touching participation
  data at all, not merely hide it after loading.
- **There are no private or hidden events** (D5). Every event is on the public
  calendar regardless of type, committee meetings included.
- **Authorisation is enforced in the service layer, never by route visibility**
  — the existing rule, and it matters more here than anywhere, because the same
  event resolves to three different documents depending on who asks.
- **Reading must be free of side effects for traffic with no session**, which
  also means it must be safe to be crawled, cached and hot-linked.
- **Consent is untouched.** Nothing here publishes a person; the public tier
  never names an invitee.

## Repository reconciliation

`src/app/operate/events/calendar/page.tsx` on `main` at `bc6770b` gates the
calendar behind the ordinary operator session, and records in its own comment
why: _"Opening a calendar to unauthenticated visitors would be a change to the
security posture rather than a calendar feature, and `AGENTS.md` reserves that
for Brian."_

That reservation is satisfied, not overridden: D1 and D5 are Brian's decision,
taken 2026-08-14 and owner-approved in the controlling brief. This is recorded
here so the change reads as an authorised posture change with a citation, rather
than as an agent quietly opening a route.

Two further facts from the same reading, both affecting the migration work
package rather than this specification:

- `events_week_number_valid` constrains `week_number` to −1..8. D8 wanted −5,
  and D85 supersedes the labelling with the continuous projection; either way
  the constraint or the derivation changes.
- `STATUS_LABELS` and `TYPE_LABELS` in `src/app/operate/events/presentation.ts`
  still carry all eight statuses and all ten types. The vocabulary this workflow
  displays narrows to three and seven.

## Acceptance evidence

- A request with no cookie, no session and no token renders the calendar and an
  event's facts, and creates no audience, invitation, RSVP, attendance or
  notification record — asserted by test, not by inspection.
- The same event has the same identity, date and time in Calendar View, Oxford
  View and the event list; the three are arrangements of one query.
- An anonymous request for an event page returns event facts and no
  participation data; the club-link and operator tiers add their content.
- The Oxford View renders the continuous academic year by default and filters to
  a single term or vacation, with each week row carrying its exact Gregorian
  date range.
- Reference boundaries MT26, HT27 and TT27 place correctly, including a
  vacation date and a term boundary, and the academic year is never derived from
  heading text.
- Type colour and type wording always agree, and no state is carried by colour
  alone.
- Times display in Europe/London with the zone explicit.
- Two events on the same day remain separately visible in both views.
- Desktop and 375px both usable without hiding dates or events.

## Core decisions

| Decision                                                                                                                                                                                                         | Classification                | Governing evidence or recommended default                                                                                                                                                                                                                                                                                                                                                                   | Status           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| The calendar is genuinely public — anyone in the world, no account                                                                                                                                               | `locked`                      | D1; widened by D5 to every event type                                                                                                                                                                                                                                                                                                                                                                       | Settled          |
| Three access tiers: public · club link · operator                                                                                                                                                                | `locked`                      | D2, D3                                                                                                                                                                                                                                                                                                                                                                                                      | Settled          |
| Drafts appear on the calendar the moment they are saved                                                                                                                                                          | `locked`                      | D4                                                                                                                                                                                                                                                                                                                                                                                                          | Settled          |
| No private or hidden events                                                                                                                                                                                      | `locked`                      | D5                                                                                                                                                                                                                                                                                                                                                                                                          | Settled          |
| Two views, named "Calendar View" and "Oxford View"                                                                                                                                                               | `locked`                      | D6                                                                                                                                                                                                                                                                                                                                                                                                          | Settled          |
| Oxford View is a continuous academic-year projection — Michaelmas → Christmas Vacation → Hilary → Easter Vacation → Trinity → Long Vacation — defaulting to the full year and filterable to one term or vacation | `locked`                      | D85, which supersedes D8–D10's uniform −5…8 labelling as the presentation rule                                                                                                                                                                                                                                                                                                                              | Settled          |
| One per-type colour scheme shared by both calendars and the list; colour never the sole carrier of meaning                                                                                                       | `locked`                      | D83                                                                                                                                                                                                                                                                                                                                                                                                         | Settled          |
| Europe/London times, zone shown explicitly                                                                                                                                                                       | `locked`                      | D86                                                                                                                                                                                                                                                                                                                                                                                                         | Settled          |
| Anonymous reading is side-effect-free                                                                                                                                                                            | `locked`                      | LAN-114 acceptance criterion, extended to sessionless traffic by D1                                                                                                                                                                                                                                                                                                                                         | Settled          |
| **What the public tier shows on an event page, and whether every type appears publicly**                                                                                                                         | `proposed for owner approval` | Brian, 2026-08-20: "We will confirm what goes into the public versus the private calendar." Recommended default: the public page shows exactly the event record's own facts — name, type, date, time, venue or online destination, description, required equipment, mandatory or optional — for all seven types, and never a person. Anything about who was invited or who answered begins at the club link | **Open — Brian** |
| **The public calendar's route**                                                                                                                                                                                  | `proposed for owner approval` | Recommended default: `/calendar` at the club's public hostname, with `/operate/events/calendar` retained for operators and both rendering from the same components. The final hostname is LAN-126's, not this mission's                                                                                                                                                                                     | **Open — Brian** |
| Whether the continuous projection widens the `week_number` check constraint or derives week labels without storing them                                                                                          | `delegated to Mission Lead`   | D85: "Exact week-label mechanics settle at the implementing issue"                                                                                                                                                                                                                                                                                                                                          | Delegated        |
| Caching, CDN and crawler policy for the public surface                                                                                                                                                           | `delegated to Mission Lead`   | Ordinary engineering, provided reads stay side-effect-free                                                                                                                                                                                                                                                                                                                                                  | Delegated        |
| Whether the grouped list projections (D84) are exercised from this workflow or only from the event list                                                                                                          | `delegated to Mission Lead`   | D84 attaches them to the list; the calendar's own switcher is unchanged                                                                                                                                                                                                                                                                                                                                     | Delegated        |

## Brian approval

- Exact words:
- Date:
