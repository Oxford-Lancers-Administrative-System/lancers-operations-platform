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
entirely separate thing where they get set the invite once and maybe one further
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
  `/operate/events/new` photographed as `W11-01` for the Type control, and
  `/operate/events/[id]?step=audience` photographed as `W11-02` against the
  shipped audience builder. **Renumbered on 2026-08-31**: the Type screen is the
  first step of the journey and was numbered second because it was captured after
  the audience screen and added to the review page afterwards. Brian: _"at the
  very least, the numbering is screwed up."_ Screen numbers follow the journey.

  `W11-01` sets the shipped Type control to `Recruitment` and points at it;
  `W11-02` sets the shipped Capacity filter to `Recruits` and points at that,
  rather than drawing replacements for either.

- Desktop and 375px evidence: `W11-01` and `W11-02`, both sides, measured.
- Reason for any departure from the implemented application: the approval summary
  must state both audiences and both ladders. Today it states one number and
  omits recruits from it.

## Audience is a group, not a capacity

Brian, 2026-08-31: _"Capacity? Since when is there fucking capacity at events?
No, what I need is a button to be able to do all active players, and I need all
active recruits, so I can invite both of them."_

Both buttons already exist on the shipped audience builder. The separation is a
**group you add**, not a filter you set, and individuals are picked out of the
list afterwards. The Capacity control is left alone.

**Nothing is added to that page.** An earlier draft put a "what each audience
receives" table at the top of it; Brian struck it — _"If it's not in the current
event flow, we shouldn't be adding new shit to it. The event page should be
acting identically."_ The two-ladder rule belongs in `W10`, where it is
configured.

## What the recruit sees — the yes page or the no page, and nothing else

Brian, 2026-08-31, after two wrong attempts at this: _"They do see the page. They
just see the yes page or the no page: yes, they're registered, or no, they're
registered. It needs to go to the page like we have in the app. There's no event
page for them. They don't click to go see the event. It's either yes or no, which
is already in the app. It's built in the app already."_

So the journey is:

1. **A WhatsApp message** carrying the invitation and the two answers.
2. They tap one **in WhatsApp**.
3. They land on **the shipped saved page** — `Your response is saved`, the answer
   and the event on one line, and `Change response`.

**There is no event page for a recruit.** `/rsvp/[token]`'s event view — venue,
response deadline, current answer — is the _player's_ screen. A recruit is not
asked to review an event; they were asked one question and answered it in
WhatsApp.

| Screen   | What it is                                            |
| -------- | ----------------------------------------------------- |
| `W11-03` | The yes page: `Your response is saved · Attending`    |
| `W11-04` | The no page: `Your response is saved · Not attending` |

Both are photographs of the running application. `rsvp_access_tokens` is empty in
the seed and the route requires a 43-character base64url token, so one was minted
into the local database and each response recorded in turn, purely so the shipped
pages could be photographed.

### A reason is never asked for, and the constraint still holds

`rsvp_responses_no_requires_a_reason` makes a non-acceptance without a reason
unsubmittable — checked in the form, again on the server, and again by the
database. That is the domain's rule and **it is not weakened**.

What changes is **who supplies it**. For a recruit the system writes
`No reason given` and the reason step never runs. Brian: _"they should be fine if
it's required, and no reason is ever given... the 'no reason' field is just going
to be put in for them... We never ask them for a reason."_

Attendance is not mandatory for somebody who is not a member, so there is nothing
to explain and nothing to chase. This is the never-harsh rule reaching the RSVP
surface.

**Later, and not drawn:** Brian's copy for the declined page — _"We'll miss
seeing you. If you want to change, go back here."_ The shipped words stand until
that flow is designed.

## The two ladders are configured in W10

A recruit event invitation is not the event-messaging chase. That one escalates
to the President; a recruit gets an invitation and at most one further template,
then silence. `W10`'s Recruitment section now carries a
**Recruit event invitations** row saying exactly that, so the two ladders are
visible where they are set rather than only described here.

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
