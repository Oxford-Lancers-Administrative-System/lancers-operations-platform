# W5 — Chase the people who have not answered

- **Purpose/intended outcome:** Nobody compiles a list. The people who have not
  answered surface by themselves, the system chases them on the approved ladder,
  and when that ladder runs out the exception reaches the President — who can act
  without anybody having done clerical work first.
- **Primary actor:** The President, and any operator working follow-ups.
- **Trigger:** A response deadline passes, or a delivery proves undeliverable.
- **Entry point:** The proactive escalation message, and an in-app chase queue.
- **Route/placement:** A new cross-event queue under **Administration** in the
  operator shell, reusing the application's own table and filters. Per-event
  detail stays on W4's participation table.
- **Controlling sources:** `T03-nonresponse-queue`, `T03-escalation-hours`,
  `T03-escalation-office`, `T03-flag-surfaces`, `T03-no-personal-data`,
  `T03-flag-lifecycle`, `Q4`, `F4`, `D5`, `R6`, and `OWN-default-sequence-v2`
  (WhatsApp → WhatsApp → email → escalation to the President, approved in W1).
- **User-visible result:** The President learns there is a problem without
  looking for it, and finds the names one click away rather than in the message.

## The rule that shapes everything here

**Nobody compiles a list.** `T03-nonresponse-queue` is the whole point:
nonresponse surfaces on its own. Every part of this workflow is a consequence —
the queue is a reading of state, the escalation fires from a threshold, and the
flag exists so the same exception is not raised twice.

The substrate is already there. `nonresponse_queue` is a live view on `main`
joining `invitation_response_state` to approved events, selecting people whose
state is `awaiting_response` or `expired_without_response`. **Nothing renders
it.** There is no chase surface in the operator shell today — the nav is Roster,
Events, Report, Operators, Roles.

## When escalation happens

`T03-escalation-hours`: escalation is **the response deadline plus N hours**,
where N is configurable **per event type** and **N = 0 is permitted** — a game
may escalate the moment the deadline passes, a social may wait a day.

W7 owns where N is read and changed. W5 owns what happens when it elapses.

## Who it goes to

`T03-escalation-office`: the target is **an office, not a person**. It resolves
to whoever currently holds the President's seat, so committee turnover changes
the recipient with no configuration change and no forgotten setting. If the
office is vacant, the escalation is held and visibly unsent rather than silently
dropped or sent to a stale holder.

## What the message may say

`T03-no-personal-data`: **no player personal data in the escalation body.** The
message says how many people, for which event, by when — and links to the queue.
Names, contact details and reasons stay behind the operator login.

> Six people have not answered for **vs Harewell Hawks** on Sunday 13
> September. The response deadline passed at 18:00. Open the club app to see
> who.

This is not squeamishness. The escalation travels over WhatsApp and email to a
committee phone; the club login is the boundary that decides who reads a roster.

## The chase queue

One cross-event list, so the President can see everything outstanding without
opening events one at a time.

- **Grouped by event**, soonest first, because urgency is the event date.
- Each event shows how many have not answered, the deadline, and whether it has
  escalated.
- Each person shows their chase position — the rung already sent and the next
  one due — reusing exactly what W4 renders.
- **Undeliverable people appear here too.** `F4`: one list, two streams. Somebody
  the club cannot reach is as unresolved as somebody who has not replied, and
  hiding them in a delivery screen makes them invisible to the person chasing.
  They are visibly labelled as a delivery problem, and W6 repairs them.
- Answering, or an operator recording an answer, removes the row.

## The flag, and its lifecycle

`T03-flag-lifecycle` was approved provisionally and is **explicitly owed a
restatement here**, so this is that restatement:

- **One flag per invitation per threshold.** Crossing the escalation threshold
  raises at most one flag for that person and that event.
- **Idempotent under reruns.** Running the scheduler twice, retrying after a
  crash, or reprocessing a backlog raises no second flag and sends no second
  escalation.
- **A flag is cleared by resolution, not by time.** An answer, a recorded answer,
  or an operator actioning it clears it. Nothing expires quietly.
- **A cleared flag stays in history.** The record that the club escalated is
  evidence, not a transient state.

`T03-flag-surfaces` names its three surfaces: **the proactive message**, **the
in-app queue**, and **the Monday report**. The first two are this workflow's.
The Monday report is Mission 9's surface, and this mission supplies its exception
content rather than building it.

## What this workflow does not do

- **It does not decide timing.** W7 owns offsets, N, and compression.
- **It does not repair delivery.** W6 does; W5 only refuses to hide it.
- **It does not chase players again.** The player-facing ladder ends at the
  email. Escalation is a message about players, to a committee officer.
- **It does not treat an incomplete answer as no answer.** A Yes with unanswered
  questions is answered; W2's single nudge covers it and it never reaches here.
- **It does not build the Monday report.**

## Handoffs

- **← W1** — the approved ladder whose final rung this is.
- **← W2 / W3** — an arriving answer cancels pending rungs and clears the flag.
- **← W4** — the per-event view; this is its cross-event counterpart.
- **← W6** — undeliverable people, who join this list as a second stream.
- **← W7** — N, the offsets, and short-runway compression.
- **→ Mission 9** — exception content for the Monday report.

## Exceptions

| Situation                                     | Behaviour                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| The President's office is vacant              | The escalation is held and visibly unsent; it is never sent to a stale holder       |
| The scheduler runs twice                      | One flag, one escalation; reruns are idempotent                                     |
| Everybody answers before the threshold        | No flag, no escalation, and the event leaves the queue                              |
| Somebody answers after escalation             | Their row clears and the flag is resolved; the escalation stays in history          |
| N is zero for the event type                  | Escalation fires as the deadline passes                                             |
| The event is cancelled                        | Outstanding chase work stops; the queue drops the event                             |
| The event is rescheduled                      | The threshold is recomputed — `OD1`, owned by W8                                    |
| A person is both unanswered and undeliverable | One row, labelled as a delivery problem, resolved by W6                             |
| The escalation itself fails to send           | It is a delivery failure like any other and appears in W6, never silently discarded |

## Safety, privacy, and authority

- No player personal data leaves the application in an escalation body.
- The queue is operator-tier. A club-link holder never reaches it.
- Escalation is a notification, not an authority: it grants the President no
  power they did not already have.
- The office resolution reads current seat holders and never caches a person.
- Production is approved-template-only, so the escalation needs its own approved
  template before it can send.

## Acceptance evidence

- Crossing the threshold raises exactly one flag per invitation and sends one
  escalation, proved idempotent by rerunning the scheduler.
- N is honoured per event type, including N = 0.
- The escalation resolves to the current President by office; changing the seat
  changes the recipient with no configuration change.
- A vacant office holds the escalation visibly rather than dropping or
  misdirecting it.
- The escalation body contains no name, contact detail, or reason, proved by
  test against the rendered template.
- The queue lists every unanswered and every undeliverable person across
  approved events, grouped by event, soonest first.
- Answering, recording an answer, or resolving delivery removes the row and
  clears the flag in the same transaction.
- A cleared flag remains readable in history.
- The queue is unreachable without an operator seat.
- Grounding is `main` at `80e9616d396336a7b575a975ecb012548b4ed611`, where
  `nonresponse_queue` exists and nothing renders it.

## Core decisions

| Decision                                                                 | Classification                | Governing evidence or recommended default                                          | Status                          |
| ------------------------------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------- | ------------------------------- |
| Nonresponse surfaces without anybody compiling a list                    | `locked`                      | `T03-nonresponse-queue`; `nonresponse_queue` already exists unrendered             | Settled                         |
| Escalation is the deadline plus N hours, N per event type, N = 0 allowed | `locked`                      | `T03-escalation-hours`                                                             | Settled; W7 owns where N is set |
| The target is an office resolving to its current holder                  | `locked`                      | `T03-escalation-office`                                                            | Settled                         |
| No player personal data in the escalation body                           | `locked`                      | `T03-no-personal-data`                                                             | Settled                         |
| One flag per invitation per threshold, idempotent under reruns           | `proposed for owner approval` | `T03-flag-lifecycle` — approved provisionally and explicitly owed this restatement | **Restated here for approval**  |
| A flag clears by resolution, never by time, and stays in history         | `proposed for owner approval` | The record that the club escalated is evidence                                     | Recommended                     |
| Undeliverable people join the same queue as a labelled second stream     | `proposed for owner approval` | `F4` — one list, two streams                                                       | Recommended                     |
| The queue is a new cross-event surface in the operator shell             | `proposed for owner approval` | Nothing renders `nonresponse_queue` today; per-event detail stays on W4            | **Needs Brian: where it lives** |
| A vacant office holds the escalation visibly rather than dropping it     | `proposed for owner approval` | Silent loss is the failure mode this mission exists to remove                      | Recommended                     |
| Exact escalation copy and its approved template                          | `delegated to Mission Lead`   | Must satisfy the no-personal-data acceptance; Meta approval may adjust wording     | Delegated                       |

## Brian approval

- **Exact words:** Pending
- **Date:** Pending
