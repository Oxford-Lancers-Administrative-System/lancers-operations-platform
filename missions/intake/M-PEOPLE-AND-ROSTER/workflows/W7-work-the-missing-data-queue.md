# W7 — Work the missing-data queue

- Purpose/intended outcome: an operator finds out who the club is missing
  something about, and what — as a real, workable list rather than a number on a
  dashboard — and goes and fixes it.
- Primary actor: a four-role operator — President, Vice-President, Secretary,
  General Manager.
- Trigger: the week before a fixture and nobody knows who has an emergency
  contact; the Secretary has an hour and wants it spent usefully; the roster
  shows a flag against eleven people.
- Entry point: **both routes, settled 2026-08-27** as amendment `W1-A1`. The
  Missing count on the roster and on `W1-01`'s People list is a link into this
  queue, and **Missing data** is an entry in the Administration group. The count
  is the route an operator falls into; the entry is the route for an hour spent
  usefully. This specification previously asserted the entry alone, and no screen
  drew it.
- Route/placement: `/operate/people/missing`. Neither the route nor its parent
  exists on `main`; nothing occupies the path.
- Controlling source: Task 08 §5 (missing required data); Task 08 §6 (`not
recorded` explicit, visible and never defaulted); the field inventory's
  required set, approved 2026-08-26 and amended the same day; the portfolio row,
  which defines the queue here, chases it in Mission 7 and surfaces it in
  Mission 10.
- User-visible result: a filtered list of people, each row saying exactly which
  required facts are absent, and a way into correcting each one.

## Required actions

- List every person with at least one required fact `not recorded`, scoped to
  the season in view, with the same widen-to-outside action `W1` carries.
- **Say which facts, per row.** A count alone sends the operator to the record to
  find out; the point of the queue is that they already know.
- Filter by **which fact is missing** — everybody with no emergency contact,
  everybody with no personal email — because that is how the work actually gets
  batched.
- Filter by where the person stands, since the required set depends on it.
- Sort by how much is missing, and by name.
- Go straight to correction (`W2`) and come back to the next row.
- Show the total, and the total for the current filter.

## State transitions

**None. This workflow is read-only.** It writes nothing; every change is `W2`'s.
A row leaves the queue when the fact it was missing is recorded, and that
happens because somebody corrected the record, not because anything here moved.

## Handoffs

- To `W2` for every fix, returning to the queue afterwards.
- To `W1` when the operator wants the whole record rather than the gap.
- To Mission 7 for the chase itself — the request, the cadence, the reminder, and
  a per-fact `refused` state. Task 11 §1 states the division outright and §7
  consumes this queue rather than redefining it.
- To Mission 10 for surfacing the queue's totals in the leadership report.

## Dependencies and mission boundaries

- **The required set is this mission's**, keyed to where the person stands:
  a recruit needs a first name, a last name and a mobile; a coach, committee
  member or alumnus adds a personal email; an onboarding, active or inactive
  player adds the four academic fields, date of birth and emergency contact.
  Amended 2026-08-26 to require a last name at every rung.
- **About a quarter of the club will flag for a missing last name** the day this
  opens. That is the intent, not a defect: it is where they get chased.
- **`disputed` is not a category in this queue.** The frozen inventory's line for
  this workflow says "`not recorded` or `disputed`"; the disputed state was
  struck on 2026-08-26 and this queue is incompleteness only. **That line needs a
  dated amendment.**
- Onboarding items are not required facts and are not in this queue. Their
  completeness is Mission 7's rollup and appears on the roster as its own
  column.
- Formalwear is asked each season through Mission 7's checklist, not chased here.
- Aliases and Blues are recorded when known and never chased.

## Exceptions and recovery

- **Nobody is missing anything.** The empty state says so plainly and is a good
  outcome, not a failure. It offers the widen action, because the season in view
  may simply be complete.
- **A filter matches nothing.** Different copy, and a way to clear the filter,
  matching the roster's own distinction between a filtered empty and a real
  empty.
- **A person missing everything.** They render as one row with the whole list of
  absent facts, not as one row per fact. The unit of work is a person.
- **A fact that cannot be collected.** There is no `refused` or `not applicable`
  state here, so somebody who genuinely has no personal email sits in the queue
  forever. **This is a known gap**: the per-fact `refused` state is Mission 7's,
  and until it exists the queue has no way to retire a row it can never satisfy.
- **An operator outside the four-role group.** The destination is absent from
  their navigation and the query refuses, exposing nothing.

## Safety, privacy, consent, and authority boundaries

- Four-role only.
- **The queue names an absence, never a value.** A row says "no emergency
  contact"; it never shows an emergency contact, a date of birth or a phone
  number. That keeps the most disclosing screen in this mission out of the most
  routine one.
- Nothing here sends a message or records a lawful basis. The chase is Mission
  7's precisely because it sends things.
- No destructive action.

## Acceptance evidence

Against seeded synthetic data, an operator can:

1. see a **real list**, not a count, with the missing facts named on every row;
2. filter to **everybody with no emergency contact** and get a workable batch;
3. see that the **required set differs by rung** — a recruit missing only a last
   name sits beside a player missing seven things;
4. confirm the **first-name-only cohort appears**, roughly a quarter of the
   people in view;
5. go to correction and **return to the queue** with that row gone;
6. see the **empty state** when a filter matches nothing, distinguished from the
   queue genuinely being empty;
7. confirm **no value is ever displayed**, only the name of what is absent;
8. confirm an operator **outside the four-role group** is refused.

## Deferred 2026-08-27 — where missing data belongs

Brian: _"Missing data as its own column doesn't make sense. I think there's a
better place to put this. I can't think of one right now. We'll just keep it on
the sidebar right now."_

So it stays as drawn: the **Missing data** entry in the Administration group is
the route, and the linked count on the roster and the People list is the second
one. Recorded as deferred rather than settled, because he named a dissatisfaction
without a replacement and it should not quietly become a decision.

**What is not in question:** the queue's own **Missing** column, which names the
absent facts per row. That is the surface's whole point and he approved it —
_"I like the missing field."_

**Standing stays on the queue** because the required set depends on it: a recruit
needs a first name, a last name and a mobile; a coach or alumnus adds a personal
email; an active player adds the academic fields, date of birth and emergency
contact. Without it, `3 missing` cannot be judged. If the word is not carrying
that meaning it is worth renaming on every surface rather than only this one.

## Core decisions

| Decision                                                                                | Classification                | Governing evidence or recommended default                                                                                                                                         | Status                      |
| --------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| The queue names which facts are missing per row, not a count                            | `proposed for owner approval` | A count sends the operator to the record to find out what the queue already knows                                                                                                 | Recommend as drawn          |
| `disputed` is not a category here                                                       | `locked`                      | Brian, 2026-08-26, struck the state. The frozen inventory's line for this workflow needs the dated amendment                                                                      | Settled, amendment pending  |
| The queue shows an absence and never a value                                            | `proposed for owner approval` | It keeps date of birth and emergency contact off a routine screen entirely                                                                                                        | Recommend yes               |
| Filter by which fact is missing                                                         | `proposed for owner approval` | It is how the work batches — one afternoon of emergency contacts, not one person at a time                                                                                        | Recommend yes               |
| The queue's entry point: a linked count, an Administration entry, or both               | `proposed for owner approval` | Neither exists today. The count is the route an operator falls into; the entry is the route the trigger describes — an hour to spend usefully, starting from nobody in particular | Recommend both              |
| Season-scoped by default, with the same widen action as People                          | `locked`                      | Brian, 2026-08-26, on People; the queue is the same population                                                                                                                    | Settled                     |
| No `refused` or `not applicable` state; a row that cannot be satisfied persists         | `proposed for owner approval` | Task 11 §1 puts the per-fact refused state in Mission 7. Inventing one here would pre-empt it                                                                                     | Recommend accepting the gap |
| Onboarding completeness is not in this queue                                            | `locked`                      | Mission 7 owns it; the roster carries it as its own column                                                                                                                        | Settled                     |
| Page size, ordering within an equal count, and the flag's exact placement on the roster | `delegated to Mission Lead`   | No product meaning                                                                                                                                                                | Delegated                   |

## Brian approval

- Exact words:
- Date:
