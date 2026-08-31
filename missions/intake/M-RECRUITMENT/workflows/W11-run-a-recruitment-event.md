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

## What the recruit sees — the shipped page, not a drawing

Brian, 2026-08-31: _"Holy fuck! W11-04, did you just invent this shit? This
exists in the app today... They should be using established conventions for how
the onboarding goes in the event board. This should not be new stuff. Fucking
look it up."_

He was right. The drawn RSVP page is deleted and replaced with a **photograph of
`/rsvp/[token]`**, which ships. It could not be reached before because
`rsvp_access_tokens` is empty in the seed and the route requires a 43-character
base64url token; one was minted into the local database for the shoot.

The invented WhatsApp-invitation screen is deleted outright, for the same reason
`W10-03` was: a template's body lives in Meta's tooling, not in this repository,
so drawing its copy was inventing.

| Screen   | What it is                                                          |
| -------- | ------------------------------------------------------------------- |
| `W11-03` | `/rsvp/[token]` as it ships — "I'm attending" / "I'm not attending" |
| `W11-04` | The declining step behind it                                        |

The page's own words are `Your invitation`, `Venue`, `Response deadline` with
`Late responses accepted until start`, and `Current answer` with
`Only you can see this`.

### The conflict this exposed, and it is Brian's to settle

**Declining demands a reason.** `REASON_LABEL` is "Reason", the field is
`required`, `submitNotAttending` checks the string again and the database
constrains it a third time. `DECLINE_PROMPT` is _"Choose a reason before saving
Not attending."_

That is the domain's rule for a player. For a **recruit** it contradicts Brian
directly — _"They don't need to give a reason. They do not give any reason."_ A
recruit is not a member and owes the club nothing, which is the whole never-harsh
position.

Either recruits skip that step, or the page learns who it is talking to. Both
change shipped behaviour, so **neither is drawn**; `W11-04` exists to put the
conflict in front of him.

### What a recruit sees afterwards

Not drawn either. The shipped page has its own saved state (`SAVED_HEADING` is
_"Your response is saved"_), and whether a recruit should see anything beyond it
is the question Brian left open: _"they don't see an events page... or maybe they
do see other events, but it should be yes or no."_ Unresolved.

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
