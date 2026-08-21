# W6 — Cancel an event

## What this workflow is for

The pitch is waterlogged at seven in the morning and the game is off. One
operator, one action, and thirty-seven people know before they set out.

- **Primary actor:** any one of the four operator roles — President,
  Vice-President, Secretary or General Manager. **No second person is needed**
  (D61).
- **Trigger:** the event is not going to happen.
- **Entry point:** the event's own page.
- **User-visible result:** the event is visibly cancelled, everyone invited has
  been told, and the record of what happened survives.
- **Controlling source:** Events & Calendar brief D31, D56–D61, D76.

## The shape of it

1. **Cancel.** It is **its own action**, not a round trip through draft (D56).
2. **Say why, for the record.** A reason is captured internally for the audit
   record (D76).
3. **Everyone invited is told, by default** (D58).
4. **Done.** It cannot be undone (D60).

There is **no approval gate**. One operator, one action, in the time it takes to
look at a waterlogged pitch.

## What the recipients see

**That it is cancelled. Nothing else.** No reason is shown to them (D59). The
reason exists for the club's record, not for the message. Brian's own framing
when D76 was taken: low stakes — _"they know each other."_

## What survives

- **The event stays visible**, on the calendar and in the list, marked
  cancelled, with its history (D57) — at every tier, public included.
- **It stays in the subscription feed too**, marked cancelled rather than
  removed (`W2`). A subscriber sees "Cancelled: vs Brackenridge Bulls" in their
  own calendar; an event that silently disappears reads as a sync failure, not
  as a cancellation. **They may see it hours late** — that is `W2`'s recorded
  refresh non-guarantee, and it is why the message, not the calendar, is how
  people find out.
- **Every response it collected stays with it.** The 25 people who said yes
  still said yes; that is a fact about what happened, not a live obligation.
- **Attendance records, if any, are untouched.**
- **The cancellation itself is recorded** — who, when, the reason, and whether
  it notified.

A cancelled event is not deleted, because deleting it would erase the fact that
the club planned it and called it off. Deleting belongs to drafts nobody was
told about, and that is `W4`.

## Notifying, and the silent path

**One decision, defaulting to on** — the same shape as `W5`, because it is the
same question.

**The operator may cancel silently** (D58), and there is one case that needs it:
**tidying up a bygone event.** A session three weeks past that was never held
gets cancelled for the record, and nobody should receive a message about
something already gone (D31). That is the case the override exists for.

Because of that, the default follows the event's date:

| The event is  | Notifying defaults |
| ------------- | ------------------ |
| In the future | **On**             |
| In the past   | **Off**            |

Turning notification **off on a future event** asks first, and names the
consequence in people — the same rule `W5` uses, for the same reason: thirty-two
people are expecting to be somewhere.

## Cancelling is terminal

**A cancellation cannot be reversed** (D60). Brian, when the decision was taken:
_"that's too complicated."_

If an event comes back, it is a new event. That is a smaller price than a state
machine where a cancelled event can be un-cancelled after people were told it
was off — and it means the message that went out is never contradicted by the
system.

## State transitions

- `approved → cancelled` — one action.
- `draft → cancelled` — permitted, but rarely what anybody wants: a draft
  nobody was told about is deleted (`W4`), not cancelled.
- `cancelled → anything` — **never**.

## Handoffs

- **← `W1`, `W5`, `W7`** — an operator reaches the event and decides it is off.
- **→ Mission 4** — the cancellation notification, and the cancelling of
  anything queued for the event.
- **→ `W1`** — the event remains on the calendar, cancelled.

## Exceptions and recovery

| Situation                                               | Behaviour                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| The event is in the past                                | Cancellable, as an administrative correction. Notifying defaults off (D31) |
| The operator wants a future cancellation to be silent   | Permitted, after a confirmation naming how many people are expecting it    |
| The operator changes their mind after cancelling        | **Not possible.** The event is terminal; a replacement is a new event      |
| Messages are queued for the event                       | Cancelled with it. Nothing already delivered is recalled                   |
| Somebody RSVPs through a signed link after cancellation | The link shows the event as cancelled and takes no answer                  |
| A non-operator attempts it                              | Refused in the service layer                                               |

## Safety, privacy, consent, and authority boundaries

- **This is the most consequential single click in the mission.** It is
  irreversible, it messages the whole audience by default, and one person can do
  it alone. The confirmation carries its weight accordingly.
- **The reason is internal.** It is in the audit record and never in the
  message.
- **No response or attendance record is destroyed.**
- **Any of the four roles, no second approver** — deliberate, because a
  waterlogged pitch does not wait for a quorum.

## Repository reconciliation

There is no cancellation path on `main` at `c894f1d`; `cancelled` exists as a
status and nothing can reach it. The approved event page carries **Mark not
held**, which is not this: `not_held` is one of the four statuses D28 removes,
and its migration mapping folds it into `cancelled` silently. The removal of
that control belongs to `W7`, with the rest of the "Confirm what happened"
panel.

## Acceptance evidence

- One operator holding any of the four roles can cancel in a single action, with
  no second approval.
- A cancelled event remains visible on both calendars, in the list and on its own
  page, marked cancelled, retaining its responses.
- Every invited person receives a cancellation notification by default, and the
  message carries no reason.
- The reason is written to the audit record and appears in no recipient-facing
  surface — asserted by test on the message payload, not by inspection.
- A future cancellation cannot be made silent without passing a confirmation
  that names the number of people affected.
- A past event cancels with notification defaulting off.
- A cancelled event cannot be returned to any other status by any route,
  including a direct service call.
- Queued messages for the event are cancelled; delivered ones are not recalled.
- No attendance record is created, altered or destroyed by a cancellation.

## Core decisions

| Decision                                                                               | Classification              | Governing evidence                                                                                                                                                                                                                                                                                                                                                                  | Status    |
| -------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Cancellation is its own action, not a round trip through draft                         | `locked`                    | D56                                                                                                                                                                                                                                                                                                                                                                                 | Settled   |
| No approval gate; any one of the four roles may cancel alone                           | `locked`                    | D61                                                                                                                                                                                                                                                                                                                                                                                 | Settled   |
| A cancelled event stays visible with its history and its responses                     | `locked`                    | D57                                                                                                                                                                                                                                                                                                                                                                                 | Settled   |
| Everyone invited is told by default                                                    | `locked`                    | D58                                                                                                                                                                                                                                                                                                                                                                                 | Settled   |
| Recipients see only that it is cancelled; no reason is shown                           | `locked`                    | D59                                                                                                                                                                                                                                                                                                                                                                                 | Settled   |
| A reason is captured internally for the audit record                                   | `locked`                    | D76                                                                                                                                                                                                                                                                                                                                                                                 | Settled   |
| Cancellation is terminal and cannot be reversed                                        | `locked`                    | D60                                                                                                                                                                                                                                                                                                                                                                                 | Settled   |
| A past event may be cancelled as an administrative correction                          | `locked`                    | D31                                                                                                                                                                                                                                                                                                                                                                                 | Settled   |
| **Notifying defaults on for a future event and off for a past one**                    | `locked`                    | Derived from D58 and D31 together: the silent path exists for the bygone event, so that is where it should be the default                                                                                                                                                                                                                                                           | Settled   |
| **Silencing a future cancellation requires a confirmation naming the people affected** | `locked`                    | The same rule `W5` carries, for the same reason. Consistent with the D55 tightening already recorded                                                                                                                                                                                                                                                                                | Settled   |
| **`cancelled` is the only state. There is no paused state**                            | `locked`                    | Brian, 2026-08-21: "canceled for now. That's it. You can cancel, and that's it. You can edit it as well, but canceled means it's definitely not happening." A known new date is `W5`'s reschedule; an unknown future is a cancellation plus a later new event; an unconfirmed event is a draft. Nothing else changes — the brief's existing notification handling stands as written | Settled   |
| The confirmation's exact wording and the weight of the control                         | `delegated to Mission Lead` | Must be hard to hit by accident and must name the audience size                                                                                                                                                                                                                                                                                                                     | Delegated |

## Brian approval

- **Exact words:** "this looks pretty great" (2026-08-21, on the three screens)
  and, closing the last open decision, "canceled for now. That's it."
- **Date:** 2026-08-21
