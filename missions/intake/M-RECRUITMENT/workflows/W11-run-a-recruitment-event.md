# W11 — Run a recruitment event

- Purpose/intended outcome: an operator schedules a session recruits are invited
  to, invites recruits and players together where that is what the session is, and
  approves it knowing exactly what it will send to each audience.
- Primary actor: an operator holding the core four authority.
- Trigger: a taster, a come-and-try session, a Freshers' Fair slot, a recruitment
  social.
- Entry point: the existing event creation flow.
- Route/placement: `/operate/events/new` and `/operate/events/[id]`, unchanged.
- Controlling source: Task 09 D11 and D8; Brian's 2026-08-31 direction that one
  event may carry both audiences and that each is chased on its own terms.
- User-visible result: an approved event whose audience the operator understood
  before approving it.

## The two ladders

Brian, 2026-08-31: _"If a player is invited to that as well, they get the normal
chase, right, the thing there. Recruits get a recruit chase, and that's an
entirely separate thing where they get set the invite once and maybe a polite
follow-up. That's up to them, but it needs to be a totally separate thing. We need
to look at it separately. But we should be able to invite players and recruits,
but recruits get treated differently."_

This is the sharpest correction the mission makes to shipped behaviour, and it is
not suppression. At `main@e669331`:

- `scheduleEventLadder` in `messaging-scheduler.ts` inserts a reminder job for
  **every** invitation on an event, filtered only by `event_id`. A recruit invited
  today receives the full player reminder-and-escalation ladder.
- `countByCapacity` in `event-approval.ts` omits recruits from the approval audit
  counts, so an operator approving a recruitment event is not told how many
  recruits it reaches — precisely the number they care about most.

The work is therefore two things: keep the player ladder off a recruit
invitation, and build recruitment's own — one invitation and at most one polite
follow-up — beside it.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue: the real thing.
  `/operate/events/new` photographed as `W11-02` for the Type control, and
  `/operate/events/[id]?step=audience` photographed as `W11-01` against the
  seeded draft recruitment event, both at `main@e669331`.
- **The separation Brian asked for already ships.** He said the mockup carried
  _"none of the machinery to explain how we separate out recruitment recruits
  from non-recruits."_ The first draft answered with an invented audience table.
  It should not have: `audience-builder.tsx` offers a Capacity filter whose
  `Recruits` option appears on a Recruitment event and nowhere else — D46, in
  running code at the baseline. `W11-01` sets that shipped control to `Recruits`
  and points at it rather than drawing a replacement for it. `W11-02` shows the
  Type control that makes the group exist at all, and was captured on 2026-08-31
  but never placed on the review page, so the one screen explaining why a
  Recruits audience exists was invisible.
- Reused component, language, interaction, and permission patterns: Mission 2's
  event machinery entirely — types, statuses, the 2-day recruitment RSVP deadline,
  the audience builder, the approval summary.
- Desktop and 375px evidence: `W11-01` and `W11-02`, both sides, measured.
- Reason for any departure from the implemented application: the approval summary
  must state both audiences and both ladders. Today it states one number and
  omits recruits from it.

## Required actions

1. Create a recruitment event using the existing flow.
2. Choose an audience that may include recruits, players, or both.
3. **Before approving, see what will be sent to each audience** — how many
   players and what ladder they get, how many recruits and what ladder they get.
4. Approve, and have exactly that happen.

## State transitions

Invitation issued moves nothing on its own. An RSVP or an attendance record is an
interaction and moves `identified → engaged`.

## Handoffs

- To `W12` for the sheet on the day.
- To `W1`, where the event becomes an appended column.
- To `W9` for a personal word to one recruit before the day.
- To Mission 2 for everything about events themselves.

## Dependencies and mission boundaries

- **Mission 2 / events:** this mission's side is the recruit audience, the recruit
  ladder and what the approval summary says about them; Mission 2's side is
  events, calendars, types, statuses and the audience builder. Independently
  walkable.
- **Mission 4 / the scheduler:** this mission's side is the correction — the
  capacity filter on the player ladder and the recruit ladder beside it; Mission
  4's side is the scheduler that runs both. Independently walkable, and the
  correction is this mission's by the owner decision of 2026-08-26.

## Exceptions and recovery

- **An event carries both audiences.** The normal case, not an exception. Each is
  chased on its own terms.
- **A recruit is invited to a non-recruitment event.** The Recruits group is
  restricted to recruitment events by D46 and the shipped constraint. A person
  invited by name is a different matter and stays possible.
- **The event is cancelled.** Recruits are told once, politely, and never chased
  about it.
- **A recruit RSVPs no.** Recorded, and nothing follows. No reason is demanded of
  a recruit; R5's reason-on-no is a member obligation.

## Safety, privacy, consent, and authority boundaries

- A recruit sees only the event's **public details** — never attendance, never who
  else was invited or answered, never roster or member data. Invariant 8, Brian
  2026-08-31.
- A recruit with no recorded communication approval is not invited at all.
- Four-role only for approval, unchanged.

## Acceptance evidence

- `grounding: photograph`. Both routes at measured 1280px and 375px, against the
  seeded recruitment events, one of which already carries the shipped Recruits
  audience.

## Core decisions

| Decision                                                               | Classification                | Governing evidence or recommended default                                     | Status  |
| ---------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------- | ------- |
| One event may carry players and recruits together                      | `locked`                      | Brian, 2026-08-31                                                             | Settled |
| Two separate ladders, not one suppressed ladder                        | `locked`                      | Brian, 2026-08-31                                                             | Settled |
| The recruit ladder is one invitation plus at most one polite follow-up | `locked`                      | Brian, 2026-08-31; the never-harsh rule                                       | Settled |
| `countByCapacity` is fixed so approval counts recruits                 | `locked`                      | Owner decision 2026-08-26; verified as a real defect at the baseline          | Settled |
| The approval summary states both audiences and both ladders            | `proposed for owner approval` | Approving blind to what an event sends is the failure this fixes              | Open    |
| A recruit is never asked for a reason on a No                          | `proposed for owner approval` | R5's reason-on-no is a member obligation; demanding one of a recruit is harsh | Open    |

## Brian approval

- Exact words:
- Date:
