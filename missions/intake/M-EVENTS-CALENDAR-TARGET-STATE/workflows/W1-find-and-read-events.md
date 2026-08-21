# W1 — Find and read events

## What this workflow is for

Somebody who wants to know when and where the club is doing something can find
that out, without an account, without asking anyone, and get a straight answer.
Everything else in this mission changes events. This one only shows them.

- **Primary actor:** anyone with a browser and no account. Members, coaches and
  operators read the same surfaces; the anonymous reader defines them, because
  they are the widest audience and the most constrained tier. An operator
  reading the same list sees more columns, not a different page.
- **Trigger:** a player checking Wednesday's practice · a prospect looking for a
  recruitment session · a parent looking for the Varsity fixture · an operator
  scanning what is coming up before the Monday meeting.
- **Entry point:** the club's public web address for the public tier; the
  Events area of the operator shell for an operator.
- **User-visible result:** they know when and where the club's events are, and
  can open any one of them for its details.
- **Controlling source:**
  [Events & Calendar brief](https://app.notion.com/p/3bc488886d5781138de8c03209ed6bcf)
  D1–D11, D83–D86, §4.1–§4.6; Brian 2026-08-20; the
  [Proof of Life transcript](https://docs.google.com/document/d/1Lnw4BTLbMR0RH9r4fJo-VuMBhSnm4mIfglHjDUv1GTs)
  of 2026-08-17 for the club's own vacation vocabulary.

## One query, three arrangements

This is the shape the implementation already has and the shape the target state
keeps. `/operate/events` and `/operate/events/calendar` read the same call, so
the arrangements cannot disagree about which events exist or when they are, and
every tile and row leads to the same event page.

| Arrangement                   | What it is for                                              |
| ----------------------------- | ----------------------------------------------------------- |
| **List**                      | Working through what is coming up — scan, filter, sort, act |
| **Calendar View** (Gregorian) | Where an event falls in an ordinary month                   |
| **Oxford View**               | Where an event falls in the club's own year                 |

The switch between them carries where you are, so re-selecting the arrangement
you are already in does not silently return you to the default month or term.

## The list

The list is the one an operator lives in, and it is being simplified.

- **It opens on what is upcoming.** Not the whole season, not history.
- **It breaks out by period** — this week, this month, this term — with grouped
  periods rendering as discrete tables rather than one flat run (D84). The
  longest bucket is the term, not a calendar quarter (Brian, 2026-08-20: "Use
  term.").
- **Past events remain reachable**, but they are history rather than the default
  view.

### What the list shows, by tier

| Column                                                            | Public       | Operator |
| ----------------------------------------------------------------- | ------------ | -------- |
| Name                                                              | ✅           | ✅       |
| Type, with its shared colour (D83)                                | ✅           | ✅       |
| Date, time (Europe/London)                                        | ✅           | ✅       |
| Term and week                                                     | ✅           | ✅       |
| Venue — the address when in person                                | ✅           | ✅       |
| Online or in person                                               | ✅           | ✅       |
| **The joining URL of an online event**                            | ❌ **never** | ✅       |
| Status — `Draft`, `Approved`, `Cancelled`, and `Occurred` derived | ❌           | ✅       |
| Invited                                                           | ❌           | ✅       |
| Said yes                                                          | ❌           | ✅       |
| Attended, where recorded                                          | ❌           | ✅       |

Brian, 2026-08-20: _"If I just see the public calendar, it should just see
public details that are naturally there, like the name, the venue, whether it's
online or not, or whatever. If it's online, there should not be a URL. The
online URL should not be there."_ And: _"If you're an operator, you get a
slightly different view of these because you should be able to see attendance
numbers in the list."_

The count columns are raw pairs, never percentages, and **`Showed / Invited`
renders "—" until an attendance sheet has been saved** (D73, D74) — an event
nobody has got round to must not read as a disaster.

- **Filters:** search by name or venue, status, and type, applied immediately
  and combining, with no Apply button (§4.4).
- **Sorting:** Name, Type, Date, Term + Week, Venue, Status and the count
  columns. **Term + Week sorts identically to Date** (§4.5).

## Calendar View (Gregorian)

Unchanged from the current implementation by Brian's instruction of 2026-08-20:
_"The Gregorian calendar is fine as it is."_ A month grid placing every event on
its actual date, with month navigation and a way back to today, whole
Sunday–Saturday weeks, and two events on one day both visible.

## Oxford View

### One continuous running column

Not three separate term calendars. Michaelmas runs into Christmas Vacation, into
Hilary, into Easter Vacation, into Trinity, into the Long Vacation, into the
next Michaelmas — one scroll, with a control at the top to jump to a season, a
term or a vacation.

Stewart Humble, 2026-08-17: _"you can do a continuous scroll and it's going to
merge from Michaelmas to Christmas vacation to Hilary to Easter vacation to
Trinity to long vacation to the next … you might say academic year 26/27, which
is all the vacations and all the terms."_ Brian, same conversation: _"it
defaults to the long calendar. I can then flip between the three terms or the
vacations or whatever, for that year."_

### The club's own vacation vocabulary

Taken verbatim from Stewart rather than invented:

| Segment                | Between                         |
| ---------------------- | ------------------------------- |
| **Christmas Vacation** | Michaelmas and Hilary           |
| **Easter Vacation**    | Hilary and Trinity              |
| **Long Vacation**      | Trinity and the next Michaelmas |

- **Vacation weeks are numbered forward from the start of the vacation** —
  "Christmas Vacation 1, 2, 3 …" — and run _"until it'll match perfectly up
  until minus one week of Hilary"_ (Stewart). The Long Vacation is long, and its
  numbering reaches the twenties; Stewart's own example was _"long vacation term
  week 20, 21, 22, 23, 24, 25 … and then it's minus one week Michaelmas."_
- **A vacation belongs to neither adjacent term.** Asked directly whether the
  Christmas vacation was part of Michaelmas or part of Hilary, Stewart answered
  _"It's neither."_ Vacations are their own named segments.
- This supersedes D9's rule that an out-of-term event belongs to the term that
  follows it as a negative week, and retires D10's "Outside term" strip: in a
  continuous column with named vacation segments, every date in the academic
  year has a home and nothing needs a catch-all. D85 already recorded the
  supersession; the transcript supplies the club's naming.
- Stewart's reason for wanting this, recorded because it is the acceptance test:
  _"it's actually really important because we sometimes have out of term s---
  that we need to like know is out of term."_

### The season a calendar belongs to

- **A calendar is a season's calendar.** Opening the calendar for 2026–27 shows
  the 2026–27 season.
- **A season's window opens in the Long Vacation before Michaelmas**, at the
  AGM. Brian, 2026-08-17: _"the 2026 season, 2027 season starts with AGM more or
  less … It doesn't hold any of last year's events, but that's when the calendar
  opens up because presidents need to do the handover."_ So the 2026–27
  arrangement runs Long Vacation 2026 → Michaelmas 2026 → Christmas Vacation →
  Hilary 2027 → Easter Vacation → Trinity 2027 → Long Vacation 2027.
- **An event belongs to exactly one season and appears on exactly one season's
  calendar.** Brian, 2026-08-20: _"If there's overlap and there are two seasons,
  let's say 2026-2027 is open and 2027-2028 is open, those are two separate
  calendars. If you put an event in one, it doesn't necessarily show up in the
  other … Events are owned by one calendar season."_ The implementation already
  agrees: `events.season_id` is `not null`.
- **Every season carries its own Long Vacation at each end.** Brian, 2026-08-20:
  "They will share the exact same term. Each season will have the 2026 long
  vacation, and then there will be a 2027 long vacation. Each season has one."
  Two consecutive seasons therefore render the same calendar weeks, and each
  shows only the events it owns.
- **There is no event overlap between seasons at all.** "If an event is put on
  the 2026-2027 season for summer 2027, it will only show up for the 2026-2027
  season. It will not show up for the next season. Events are literally owned
  only by one season. This is going to be something that's going to be
  consistent across the board."

## State transitions

**None.** This workflow changes nothing, and that is a requirement rather than
an observation. LAN-114 already requires that no audience, invitation, RSVP,
attendance or automation record is created merely by viewing or navigating, and
D1 widens that to requests carrying no session at all. The current calendar
achieves it structurally — the module imports no server action and no write
path — and the public surfaces must keep that property rather than re-earn it.

## Handoffs

- **→ `W2`** — the subscribe action lives on these surfaces.
- **→ `W7`** — opening an event as a club-link holder or operator.
- **→ `W4`, `W5`, `W6`** — an operator acts on an event from here.
- **← `W3`–`W6`** — every event displayed arrives from one of them. Drafts
  appear the moment they are saved (D4).

## Exceptions and recovery

| Situation                                     | What the reader sees                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| No events in the season at all                | An empty state saying so, not an empty grid                                              |
| No events in the period or month being viewed | A distinct empty state — "nothing this month" is not "nothing all season"                |
| No events matching the filter                 | Distinct again from both of the above (§4.8)                                             |
| A week row with nothing in it                 | The row still renders, with its exact Gregorian date range                               |
| An event with a date but no time              | Shown on its date without an invented time                                               |
| An event with no date                         | Cannot be placed on a calendar; listed separately rather than dropped                    |
| No term windows configured                    | A warning — an Oxford view with no terms is a configuration fault, not an empty calendar |
| A deep-vacation date                          | Lands in its named vacation segment; no catch-all strip is needed                        |
| A malformed URL parameter — `?month=banana`   | Falls back to where the calendar would have opened anyway, never an error page           |

## Safety, privacy, consent, and authority boundaries

- **This is the application's first anonymous read surface.** Every existing
  route requires either an operator session or a signed token.
- **The public tier shows the whole event record and no participation data.**
  Brian, 2026-08-20: _"people who see the calendar should see a normal calendar
  of events … descriptions, what gear to bring, what type of events, everything
  like that … They shouldn't be able to see other details about it. There are
  going to be private details per event, like RSVP attendance and things of that
  nature, that shouldn't be on the public calendar."_ A public page must
  therefore render an event without touching participation data at all, not
  merely hide it after loading.
- **An online event's joining URL is never public.** The club's most frequent
  recurring event, Chalk, is on Teams (D20). A publicly readable joining link is
  an open door into a club meeting for anyone who finds the page, so the public
  tier learns that an event is online and where it is _called_, and not how to
  join it.
- **Getting the joining URL to the people who should have it is deliberately
  unsolved here, and must not be forgotten.** A player invited to Chalk still
  needs the link. This mission stores it and shows it to operators; it does not
  deliver it. Brian, 2026-08-20: "we'll figure out how to get it to them later,
  so we're not shipping anything." Carried as a nonblocking unknown in the
  decision table with its handling rule, so the packet states it rather than
  leaving a player with an event they cannot attend.
- **There are no private or hidden events** (D5). Every event appears, committee
  meetings included.
- **Authorisation is enforced in the service layer, never by route visibility.**
- **Where participation data becomes visible is `W7`'s question.**
- **Consent is untouched.** The public tier never names a person.

## Repository reconciliation

`src/app/operate/events/calendar/page.tsx` on `main` at `2072ecd` gates the
calendar behind an operator session and records why in its own comment:
_"Opening a calendar to unauthenticated visitors would be a change to the
security posture rather than a calendar feature, and `AGENTS.md` reserves that
for Brian."_ That reservation is satisfied, not overridden — D1 and D5 are
Brian's decision, owner-approved 2026-08-14.

Three further facts from the same reading, all landing on the migration work
package rather than on this specification:

- `events_week_number_valid` constrains `week_number` to −1..8. Named vacation
  segments numbered forward past 20 do not fit inside that constraint, so either
  it widens or vacation coordinates are derived rather than stored.
- `STATUS_LABELS` and `TYPE_LABELS` in `src/app/operate/events/presentation.ts`
  still carry all eight statuses and all ten types. What this workflow displays
  narrows to three and seven.
- The current Oxford view is term-by-term with a term dropdown — the exact thing
  Stewart asked to replace with a continuous scroll.

## Acceptance evidence

- A request with no cookie, session or token renders the list and both
  calendars and creates no audience, invitation, RSVP, attendance or
  notification record — asserted by test, not by inspection.
- One event has the same identity, date and time in all three arrangements.
- An anonymous reader never receives an online event's joining URL, in the page
  or in any payload behind it.
- An anonymous reader never receives a status, an invited count, a said-yes
  count or an attendance count.
- The list opens on upcoming events and groups by period into discrete tables.
- `Showed / Invited` reads "—" for an event whose sheet has never been saved,
  and `0 / 30` for one saved with everyone absent (D74) — the two are
  distinguishable at a glance.
- The Oxford View renders one continuous column across the season, naming
  Christmas Vacation, Easter Vacation and Long Vacation, with vacation weeks
  numbered forward and meeting the next term at its −1st week.
- Reference boundaries MT26, HT27 and TT27 place correctly, including a
  vacation date and a term boundary, and the academic year is never derived
  from heading text.
- An event created in one season does not appear on another season's calendar,
  including an event dated inside a Long Vacation that two consecutive seasons
  both render.
- No anonymous or club-link response carries an online event's joining URL.
- Type colour and type wording always agree; no state is carried by colour
  alone.
- Term + Week sorts identically to Date.
- Desktop and 375px both usable without hiding dates or events.

## Core decisions

| Decision                                                                                                                                                                                                       | Classification                | Governing evidence or recommended default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Status                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| The calendar is genuinely public — anyone in the world, no account                                                                                                                                             | `locked`                      | D1, D5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Settled                     |
| Three access tiers: public · club link · operator                                                                                                                                                              | `locked`                      | D2, D3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Settled                     |
| The public tier shows the whole event record and no participation data                                                                                                                                         | `locked`                      | Brian 2026-08-20                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Settled                     |
| An online event's joining URL is never shown publicly                                                                                                                                                          | `locked`                      | Brian 2026-08-20: "If it's online, there should not be a URL"                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Settled                     |
| The operator list adds status, invited, said yes and attended                                                                                                                                                  | `locked`                      | Brian 2026-08-20                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Settled                     |
| The list opens on upcoming and groups by period into discrete tables                                                                                                                                           | `locked`                      | Brian 2026-08-20; D84                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Settled                     |
| Drafts appear on the calendar the moment they are saved                                                                                                                                                        | `locked`                      | D4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Settled                     |
| Two views named "Calendar View" and "Oxford View", plus the list                                                                                                                                               | `locked`                      | D6; §4.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Settled                     |
| Calendar View is kept as built                                                                                                                                                                                 | `locked`                      | Brian 2026-08-20: "The Gregorian calendar is fine as it is"                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Settled                     |
| Oxford View is one continuous running column with a jump control, not three term calendars                                                                                                                     | `locked`                      | Stewart and Brian, 2026-08-17; D85                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Settled                     |
| Vacation segments are named Christmas Vacation, Easter Vacation and Long Vacation, belong to neither adjacent term, and number their weeks forward from 1                                                      | `locked`                      | Stewart Humble, 2026-08-17, verbatim. Supersedes D9's following-term rule and retires D10's "Outside term" strip                                                                                                                                                                                                                                                                                                                                                                                                         | Settled                     |
| A season's window opens at the AGM in the Long Vacation before Michaelmas                                                                                                                                      | `locked`                      | Brian, 2026-08-17                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Settled                     |
| An event belongs to exactly one season and appears on one season's calendar                                                                                                                                    | `locked`                      | Brian 2026-08-20; `events.season_id` is already `not null`                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Settled                     |
| Europe/London times, zone shown explicitly                                                                                                                                                                     | `locked`                      | D86                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Settled                     |
| Anonymous reading is side-effect-free                                                                                                                                                                          | `locked`                      | LAN-114, extended by D1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Settled                     |
| The longest list bucket is the **term**, not a calendar quarter                                                                                                                                                | `locked`                      | Brian, 2026-08-20: "Use term." Matches D84, the list's Term + Week column, and the club's own year                                                                                                                                                                                                                                                                                                                                                                                                                       | Settled                     |
| Every season carries its own Long Vacation at each end — 2026–27 has both Long Vacation 2026 and Long Vacation 2027 — and consecutive seasons render the same calendar weeks, each showing only its own events | `locked`                      | Brian, 2026-08-20: "They will share the exact same term. Each season will have the 2026 long vacation, and then there will be a 2027 long vacation. Each season has one."                                                                                                                                                                                                                                                                                                                                                | Settled                     |
| There is no event overlap between seasons at all. An event placed on 2026–27 for summer 2027 appears only on 2026–27                                                                                           | `locked`                      | Brian, 2026-08-20: "There is literally no overlap in events … Events are literally owned only by one season. This is going to be something that's going to be consistent across the board." Already true in the schema: `events.season_id` is `not null`                                                                                                                                                                                                                                                                 | Settled                     |
| How an invited person receives an online event's joining URL                                                                                                                                                   | `nonblocking unknown`         | Brian, 2026-08-20: "we will have to figure out how to get the URL to them … We'll figure out how to get it to them later, so we're not shipping anything … before the event, they get a URL for it, or they'll share it through some other means." **Handling rule:** this mission stores the joining URL on the event and shows it to operators; it neither publishes nor delivers it. Getting it to an invited person is a later decision whose likely home is Mission 4's message content. Nothing in `W1` is blocked | **Deferred — Brian, later** |
| The public list's default period and how far back history is reachable                                                                                                                                         | `delegated to Mission Lead`   | Ordinary engineering within "opens on upcoming"                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Delegated                   |
| Whether vacation coordinates are stored or derived, and whether `week_number`'s check constraint widens                                                                                                        | `delegated to Mission Lead`   | D85: "Exact week-label mechanics settle at the implementing issue"                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Delegated                   |
| Caching, CDN and crawler policy for the public surfaces                                                                                                                                                        | `delegated to Mission Lead`   | Provided reads stay side-effect-free                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Delegated                   |
| The operator list offers **All events** beside the period buckets, and every sort and every filter works there                                                                                                 | `locked`                      | Brian, 2026-08-21: "we do need an all events thing where we can just do that. That has all the sorts and everything. All the sorts should work here. All the filters should work here as well."                                                                                                                                                                                                                                                                                                                          | Settled                     |
| An event's name is a hyperlink to that event                                                                                                                                                                   | `locked`                      | Brian, 2026-08-21: "the event itself should be a hyperlink that leads to the event page itself"                                                                                                                                                                                                                                                                                                                                                                                                                          | Settled                     |
| The calendar carries no season selector. The page header states which season is being read                                                                                                                     | `locked`                      | Brian, 2026-08-21: "that filter should be removed entirely from the calendar … we know what calendar we're looking at." Supersedes his 2026-08-20 "I should be able to jump to the different seasons at the very top" for the calendar's own controls                                                                                                                                                                                                                                                                    | Settled                     |
| An operator can subscribe to the calendar too — **Add to your calendar** sits beside **Create event**                                                                                                          | `locked`                      | Brian, 2026-08-21: "in addition to Create Event, they should also be able to subscribe to the calendar"                                                                                                                                                                                                                                                                                                                                                                                                                  | Settled                     |
| The public list shows "Online" and says nothing about the absent joining link                                                                                                                                  | `locked`                      | Brian, 2026-08-21: "When it says online, you do not need to show no link shown. That's not important."                                                                                                                                                                                                                                                                                                                                                                                                                   | Settled                     |
| At 375 the period control collapses to a single control and each event renders as one condensed card                                                                                                           | `locked`                      | Brian, 2026-08-21: the period buttons were "just too much at the very top. I should see the events pretty quickly after that."                                                                                                                                                                                                                                                                                                                                                                                           | Settled                     |
| Explanatory callouts belong to the review artifact, never to the product                                                                                                                                       | `locked`                      | Brian, 2026-08-21: "I hate the callouts … That should not be in the real UI." Retained only on `W1-06`, whose subject is the empty and refusal states themselves                                                                                                                                                                                                                                                                                                                                                         | Settled                     |
| **How a reader reaches a season other than the one they are in**                                                                                                                                               | `proposed for owner approval` | Removing the calendar's season selector leaves no control anywhere in `W1` that changes season, so only the current season is reachable. Recommended default: season is context rather than a filter — set once in the Events header for every arrangement, not repeated per calendar — and reading a closed season is a `W1` capability rather than a new surface                                                                                                                                                       | **Open — Brian**            |
| Does the club-link tier survive as approved?                                                                                                                                                                   | **deferred to `W7`**          | D2/D3 give the club link audience, RSVP and attendance. Brian's 2026-08-20 wording may collapse that tier. It is a question about who sees participation data, which is `W7`'s subject                                                                                                                                                                                                                                                                                                                                   | Deferred — `W7`             |

## Correction C1 — cancelled events on the public list, 2026-08-21

The approved `W1-03` blurb read _"Cancelled events are simply absent from what is
on."_ That was written here and is wrong on the authority:

- **D57** keeps a cancelled event visible, with its history, on the calendar, in
  the list and on its own page.
- **`W2` keeps it in the subscription feed**, marked cancelled, on Brian's
  decision of 2026-08-21 — an event that silently disappears from somebody's
  calendar reads as a sync failure.

Hiding it on the public list would therefore have made two public surfaces
disagree: absent from the list a reader is looking at, present in the calendar
they subscribed to from that same list.

**Corrected:** a cancelled event stays on the public list, marked cancelled.
Applied as a correction to authority rather than as a product decision, and
recorded here because it changes an approved workflow.

## Brian approval

- **Exact words:** "Approved."
- **Date:** 2026-08-20
- **What it approved:** this specification of `W1 — Find and read events`,
  covering all three arrangements, the public and operator tiers, the continuous
  Oxford column and the season-ownership rule, with nineteen locked decisions,
  four delegated to the Mission Lead, one deferred to `W7` and one nonblocking
  unknown carrying its handling rule. The mockup is a separate approval.
