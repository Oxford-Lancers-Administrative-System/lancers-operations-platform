# W9 — Follow up with a recruit

- Purpose/intended outcome: an operator says something polite to a recruit —
  usually a nudge about something they have not filled in — quickly, from wherever
  they already are, and the message is good without the operator having to write it
  well.
- Primary actor: an operator holding the core four authority.
- Trigger: the operator notices somebody has gone quiet, has not answered the ask,
  or is worth a personal word before an event.
- Entry point: an action on a board row (`W1`), on the recruit's record (`W2`), or
  from an event's audience (`W11`).
- Route/placement: a composer opened in place, not a separate page.
- Controlling source: the never-harsh amendment of 2026-08-31; Brian's ruling the
  same day that this surface is Mission 6's and Mission 7 inherits from it; his
  description of its normal job — _"somebody can go and say, 'Hey, go and ask them
  anything that they haven't filled out with this thing.'"_
- User-visible result: a message leaves the club, is visible against that recruit
  for ever, and nothing about it is a chase.

## Why this workflow exists at all

Until 2026-08-31 the rule was that recruits are never chased and human touches
happen outside the system. Brian replaced it: _"it should never be harsh. That's
the better rule… We should send polite reminders, nudges, things like that. The
app should be very open to allowing the person… to send polite messages,
follow-ups, things like that, and the messages should be good. It should be easy,
right?… these are sales. This is sales prospecting."_ That turns an explicitly
excluded capability into a named one, and it is the item the amendment added to
the boundary.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue: `/operate/admin/follow-ups`
  at `main@e669331`, photographed as `W9-01` — Mission 4's Follow-ups queue, which
  is the closest thing to "who needs a word" in the product. There is **no
  composer anywhere in the application**: Mission 5's packet is explicit that it
  composes, schedules and sends nothing, and Mission 4 sends only from its ladder.
- Reused component, language, interaction, and permission patterns: Mission 4's
  transport and template machinery, verbatim. The queue's own language for who is
  outstanding and why.
- Desktop and 375px evidence: `W9-01` photographed both sides; `W9-02`, the
  composer itself, drawn, because nothing like it exists.
- Reason for any departure from the implemented application: the composer is new
  by necessity. Its restraint is the design: it must make a good message quick to
  send and make a harsh one hard to send.

## Required actions

1. Open the composer from a row, a record, or an event, without losing place.
2. See what this recruit has not done — the outstanding ask, the unanswered
   invitation — so the operator is not composing blind.
3. Pick a starting point: a short set of good default messages, one per common
   situation, written in club voice.
4. Edit it, because a real person is sending it.
5. Send, and see it land on the recruit's record.

## State transitions

Sending is an interaction by the club, not by the recruit, so it moves nothing.
A reply would move `identified → engaged`, but no inbound message is captured
anywhere at the baseline — the webhook parses only `statuses[]` — so a reply is
not observable and the operator records it by hand.

## Handoffs

- From `W1`, `W2` and `W11`.
- To `W2`, where the message is recorded.
- To Mission 4 for dispatch and delivery state.
- To Mission 7, which inherits this surface for members.

## Dependencies and mission boundaries

- **Mission 4 / transport:** this mission's side is the composer, the defaults and
  the rule; Mission 4's side is dispatch, retry and delivery state. Independently
  walkable.
- **Mission 7 / the message-and-flag direction:** the Authority Manifest named
  Mission 7 as the candidate home for an operator message-and-flag capability and
  never promoted it into a brief. Brian settled it on 2026-08-31: this surface is
  Mission 6's, and Mission 7 inherits. Independently walkable.
- **Mission 8 / consent:** a recruit who has not approved communication, or has
  declined, cannot be messaged at all. Non-blocking; the check is Mission 8's
  policy and this surface enforces it.

## Exceptions and recovery

- **The recruit has not approved communication.** The composer refuses and says
  why, rather than sending and failing.
- **The recruit declined.** Refused outright. A recorded refusal never coexists
  with continued messaging.
- **No usable number.** Refused, with the missing fact named.
- **Delivery fails.** Visible on the record, resendable, never silent.
- **The operator writes something harsh.** Not preventable by software, and this
  specification does not pretend otherwise. What the design does is make the
  polite thing the fast thing.

## Safety, privacy, consent, and authority boundaries

- Four-role only.
- Every message sent is attributable to the operator who sent it and is retained
  against the recruit — this is the audit that makes an operator-sent message
  safe to allow at all.
- The never-harsh invariant binds here more than anywhere: no message may tell a
  recruit they are required to be somewhere, and this surface must never grow a
  cadence, a rung, or a bulk send.

## Acceptance evidence

- `W9-01` `grounding: photograph`; `W9-02` `grounding: code-only`, drawn, because
  no composer exists anywhere in the application.

## Core decisions

| Decision                                                 | Classification                | Governing evidence or recommended default                                                         | Status  |
| -------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------- | ------- |
| The recruit follow-up surface is this mission's          | `locked`                      | Brian, 2026-08-31                                                                                 | Settled |
| Its normal job is asking for what has not been filled in | `locked`                      | Brian, 2026-08-31                                                                                 | Settled |
| It never becomes a cadence, a rung or a bulk send        | `locked`                      | Invariant 1, the never-harsh rule                                                                 | Settled |
| Good default messages, editable before sending           | `proposed for owner approval` | Brian: "the messages should be good. It should be easy." A blank box is neither                   | Open    |
| One recruit at a time, no multi-select                   | `proposed for owner approval` | The moment it sends to many, it is a campaign and the rule is gone. Recommendation: one at a time | Open    |
| The composer opens in place rather than as a page        | `delegated to Mission Lead`   | Changes no intent                                                                                 | Settled |

## Brian approval

- Exact words:
- Date:
