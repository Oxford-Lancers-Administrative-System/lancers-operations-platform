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

## Decision history relocated from source (LAN-300)

### src/app/operate/events/[id]/roster-form/actions.ts — module header

> The one write this surface makes — LAN-267: "A one-line audit event when a
> form is generated (who, which event, when)."
>
> Nothing is stored beyond that row. The form itself is the page, printed; the
> ticket puts storing generated PDFs and a document library explicitly out of
> scope, and a copy of a dozen student numbers sitting in object storage is
> exactly the thing a generated-on-demand form avoids.
>
> `event_calendar_management` is the gate — the same capability every other
> deliberate act on a game already requires, and the narrowest existing one
> that fits. It is deliberately not a new capability: the capability map is a
> recorded authority decision (`capabilities.ts`, and
> `tests/capability-map-single-source.test.ts` makes it the only place a role
> code decides anything), and adding a row to it is Brian's, not this
> package's.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/person-required.ts — module header

> Pure. No database, no `server-only`. `docs/architecture/data-model.md`'s
> field inventory records the table this module is: required-ness depends on
> where a person stands, approved by Brian on 2026-08-26 and amended the same
> day, and it is data rather than a chain of `if`s for the same reason
> `membership.ts`'s transition table is — a rung a reader cannot find by
> reading `REQUIRED_FIELDS_BY_TIER` is a rung this module does not enforce.
>
> **Last name is required at every tier**, amended 2026-08-27 — the field
> inventory's own words: "roughly a quarter of the club flags for a missing
> last name the day the queue opens, and the queue is where they get chased."
> That is the intent, not a defect in this module.
>
> ## College email, and the one place the tiers stopped nesting (LAN-268)
>
> Brian, 2026-09-09: "The required set on both the onboarding questionnaire
> and the recruitment forms is four things: first name, last name, phone
> number, college email." It is the club's own proof that somebody is
> actually at the university — "I had a weird online guy trying to join one
> year and he wasn't a student" — so it joins the recruit tier, superseding
> LAN-246's three-field sign-up minimum, and it is required of a player for
> the whole of their season.
>
> It is **not** required of the everyone-else tier, and that is a decision
> rather than an omission. Until now every tier nested inside the next, so
> `everyoneElse` was written as "recruit's set plus personal email". A
> recruit's set now contains a fact that the everyone-else rung must not
> inherit, so the three lists are spelled out from a shared base instead.
>
> Two reasons, both in sources this module already answers to. The
> everyone-else rung is where a coach, a committee member and an **alumnus**
> land, and `docs/architecture/data-model.md`'s own contact-details note says
> a college address "expires around graduation" — chasing an alumnus for one
> would be chasing them for an address the university has taken away. And
> neither door that collects a college email is a door those people ever walk
> through: a coach is invited and given a role assignment, and never sees the
> player questionnaire (LAN-267 makes exactly that point about the BAFA
> number), so a required fact nothing can collect is a queue row nobody can
> clear.
>
> Required-ness is not the same question as validity. `validateCollegeEmail`
> in `person-validation.ts` refuses a non-Oxford address from _anybody_,
> including a coach, because a value stored as a college address has to be
> one. This table only decides who is chased for having none.
>
> ## Which assembled status maps to which tier
>
> `AssembledStatus` is the six-rung ladder `person-record.ts` assembles:
> `"recruit"` from a prospect with no membership, the five stored
> `membership_status` values from a membership, or `null` for a person who is
> neither — a coach or committee member holding no season tie at all
> (`REQ-create-without-roles`: the add-person path "creates people and
> nothing else… a person created here has no tie to any season").
>
> The field inventory's "Onboarding, active or inactive" row is the mission's
> name for a **player working through the season**, and its "Everyone else
> (coach, committee, alumnus)" row is every other standing a person can hold.
> This module reads that distinction off the assembled status rather than off
> a role or a job title — nothing in this mission's substrate records "this
> person is a coach" as a fact about the _person_; a coaching seat is an
> operator role assignment, which this package does not touch
> (`REQ-create-without-roles`, and the boundary that "no login, seat or club
> role is granted or changed anywhere in this mission"). So `departed`,
> `archived` and no membership at all all fall to `everyoneElse` — the same
> tier the field inventory gives an alumnus or a coach, and for the same
> reason: none of them is a player currently working through a season's
> onboarding, so none of them owes the club matriculation year or a date of
> birth to keep their record current. Recorded here as the reading this
> package makes, cheap for a later mission to narrow if a source ever ties a
> person to a coaching role structurally.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/roster-form.ts — module header

> > "The club has to hand the officials a BAFRA roster form at every game.
> > Today it is a Word document filled in by hand. The ask is to generate it
> > from the app."
>
> ## What the form's three tables come from
>
> | Column            | Source                                                               |
> | ----------------- | -------------------------------------------------------------------- |
> | Team              | Constant. There is one club.                                         |
> | Date              | `events.scheduled_on`                                                |
> | Opponent          | The event's name — see below                                         |
> | Surname, Forename | `people.family_name`, `people.given_name`                            |
> | Student no        | `people.student_number` (LAN-275's migration)                        |
> | Jersey no         | `jersey_assignments`, per kit, current rows only                     |
> | BAFA no           | `people.bafa_registration_number` (LAN-275's migration)              |
> | Role              | `role_assignments` → `roles` → `role_groups.code = 'coaching_staff'` |
>
> ## The opponent is not a column, and the ticket says it is
>
> LAN-267 reads "`events.event_date` and `events.opponent` on a game event (D14
> made opponent a real field)". That is the wrong way round: D14 **removed**
> `events.opponent`. `20260822120000_events_target_state.sql` drops it —
> "There is no opponent field, and there never was a real second one" — and
> the event form has said "The opponent goes in the name." for a game ever
> since. There is no column to read.
>
> So the generation screen offers an **Opponent** box that starts from the
> event's own name and the operator can correct before printing. Nothing is
> stored: the club's record of who it played is still the event's name, and
> inventing a column to hold a second copy of it would be a schema change this
> package has no owner decision for. The one thing that must not happen is the
> officials being handed a form whose Opponent line says "Game vs" and a date.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
