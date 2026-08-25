# W8 — Keep queued messages honest when an event changes

- **Purpose/intended outcome:** When an event moves or is called off, the club
  never sends a message that is no longer true, and never goes quiet about a
  change people needed to hear.
- **Primary actor:** Nobody. The hold and the resume are consequences of an
  operator's action in Mission 2, not a job of their own.
- **Trigger:** An amendment saved, a reschedule, or a cancellation.
- **Entry point:** None of its own. It runs behind `/operate/events/[id]/edit`
  and shows its result on the surfaces W4 and W6 already own.
- **Route/placement:** Invisible until it matters. What an operator sees is that
  the queue is honest.
- **Controlling sources:** `D5`, `F2`, `D54`, `D58`, `D60`, `D76`, `OD1`/Q6,
  `REQ-amend-hold`, `T03-stale-deadline`, `T03-prereq-amendment`.
- **User-visible result:** No player receives an invitation to an event that
  moved, and no player is left uninformed because the system quietly dropped a
  message.

## The seam this workflow sits on

Mission 2 owns the event side and has already placed the amendment workflow.
This mission owns the messages. `REQ-amend-hold` draws the line precisely:
**Mission 2 places the hold; this mission decides what resumes.**

`D5`'s trigger was corrected during this intake. Its original shape assumed a
return-to-draft and a re-approval, and **neither exists**: Mission 2 decided an
approved event is amended **in place**, and LAN-151 has since narrowed
`event_status` to `draft`, `approved`, `cancelled` — so return-to-draft is not
merely retired, it is unrepresentable. Two of D5's three triggers are dead and
the surviving one is the amendment hold.

## Three changes, three different answers

### An amendment holds

Saving an amendment **holds** the event's unsent messages. Held is not
cancelled: the jobs still exist, still belong to their invitations, and are
waiting on a decision.

What resumes is this workflow's decision, and it follows the operator's own
choice recorded in Mission 2 (`D54`): a **re-notify** produces an obligation
this mission discharges.

- **Re-notify chosen** — the held messages resume, and the people who already
  received the old details are told what changed. An amendment that changes what
  somebody agreed to must reach them.
- **Re-notify not chosen** — the held messages resume unchanged. The amendment
  was not material enough to re-ask, and the ladder continues as though nothing
  happened.

Nothing stays held indefinitely. A held job either resumes or is cancelled with
the event; there is no third resting state.

### A reschedule recomputes the chase

`OD1`/Q6: rescheduling **recomputes the chase threshold**, and **the app says a
reschedule is happening.**

This is the case ADR 0021 explicitly left open — it froze the response deadline
onto each invitation at approval and recorded that amending does not currently
recompute it, because _"the amendment workflow is unowned and will have to
decide that deliberately."_ `T03-stale-deadline` hands that decision here, and
this is the deliberate answer:

**A reschedule recomputes the deadline and everything counted from it.** A
deadline frozen against a date that no longer exists is not a deadline. The
recomputation uses the same rules W7 holds, so a game moved three weeks later
gets its full runway back rather than inheriting a deadline that has already
passed.

The recomputation is bounded by the same late-approval rule W7 settled: if the
new date leaves no room, the invitation goes immediately, at least one WhatsApp
sends, and the President is not told.

### A cancellation is terminal

`D60`: cancellation is terminal, so its undelivered jobs are **cancelled, not
held**. There is nothing to resume, because there is no longer an event.

`D58`: cancellation notices follow the notify choice Mission 2 records. If the
operator chose to tell people, they are told.

`D76` is a hard boundary: **the internal cancellation reason must never reach a
recipient-facing payload.** Operators record why an event was called off for the
club's own record. A player is told that it is off, not that the coach fell out
with the venue.

## What a cancelled job is not

A job cancelled by an event change is **not a delivery failure**, and must never
appear as one. W6's surfaces count failures so an operator can repair them;
counting cancellations there would manufacture work that does not exist and
bury the failures that do.

This is the single most likely implementation mistake in the workflow, because
both states end with a job that never sent.

## Handoffs

- **← Mission 2** — the amendment, the reschedule, the cancellation, and the
  operator's notify choice. This mission never decides whether an event changes.
- **→ W2** — a player whose event moved is told, and their standing answer
  survives the change.
- **→ W4** — the participation table shows held and cancelled honestly.
- **→ W5** — a recomputed threshold moves when the chase and any escalation
  happen. A held event does not accumulate a chase.
- **→ W6** — cancelled jobs never appear as failures.
- **← W7** — the rules the recomputation uses.

## Exceptions

| Situation                                    | Behaviour                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| An amendment is saved                        | Unsent messages hold; sent ones are history and are never retracted             |
| Re-notify is chosen                          | Held messages resume and people already contacted are told what changed         |
| Re-notify is not chosen                      | Held messages resume unchanged                                                  |
| The event is rescheduled                     | The deadline and everything counted from it are recomputed, and the app says so |
| The new date leaves no runway                | W7's late-approval rule applies: immediate, WhatsApp only, no escalation        |
| The event is cancelled                       | Undelivered jobs are cancelled; notices follow Mission 2's notify choice        |
| A cancellation reason was recorded           | It stays internal. It never appears in any recipient-facing payload             |
| A player already answered before the change  | Their answer stands. A reschedule does not silently discard it                  |
| A message was already delivered              | It stays delivered. History is never rewritten to match the new details         |
| A held job's event is then cancelled         | It cancels. Held is never a terminal state                                      |
| A job is mid-flight when the amendment saves | It completes and is recorded honestly; the hold applies to what has not started |

## Safety, privacy, and authority

- The internal cancellation reason is club data and never leaves the operator
  boundary.
- No message is retracted or rewritten after sending. The club's record of what
  it said stays true.
- This workflow initiates nothing on its own. Every action here descends from an
  operator's decision in Mission 2.
- A player's standing answer is never discarded by a change to the event.

## Acceptance evidence

- Saving an amendment holds every unsent job for that event and holds nothing
  else.
- Choosing re-notify resumes the held jobs and informs everybody already
  contacted; declining resumes them unchanged.
- No job remains held once the event is cancelled or the amendment resolves.
- A reschedule recomputes the response deadline and every derived time, using
  W7's rules, and the change is visible in the application.
- A reschedule with no runway follows W7's late-approval rule exactly.
- Cancelling an event cancels every undelivered job, and **none of them appears
  as a failure** in W6's counts or lists.
- Cancellation notices are sent only when Mission 2 recorded that choice.
- The internal cancellation reason appears in no recipient-facing payload, proved
  by test against the rendered message.
- An already-delivered message is never retracted, and history is never rewritten.
- A player's standing answer survives an amendment, a reschedule and a
  cancellation.
- Grounding is `main` at `80e9616d396336a7b575a975ecb012548b4ed611`, where
  `event_status` is `draft`, `approved`, `cancelled` and return-to-draft is
  unrepresentable.

## Core decisions

| Decision                                                            | Classification                | Governing evidence or recommended default                                    | Status                        |
| ------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- | ----------------------------- |
| An amendment holds unsent messages rather than cancelling them      | `locked`                      | `REQ-amend-hold`; Mission 2 places the hold                                  | Settled                       |
| Two of D5's three triggers are dead                                 | `locked`                      | Mission 2 amends in place; LAN-151 makes return-to-draft unrepresentable     | Settled                       |
| Resume follows the operator's notify choice                         | `locked`                      | `D54`, `D58`                                                                 | Settled                       |
| Cancellation is terminal; its jobs cancel rather than hold          | `locked`                      | `D60`                                                                        | Settled                       |
| The internal cancellation reason never reaches a recipient          | `locked`                      | `D76`                                                                        | Settled                       |
| A reschedule recomputes the deadline and everything counted from it | `proposed for owner approval` | `OD1`/Q6 and `T03-stale-deadline`; ADR 0021 left this deliberately unowned   | **Recommended — needs Brian** |
| A cancelled job is never counted or shown as a delivery failure     | `proposed for owner approval` | W6 counts failures so they can be repaired; a cancellation needs no repair   | Recommended                   |
| Held is never a resting state — a job resumes or cancels            | `proposed for owner approval` | An indefinitely held job is a message the club forgot it owed                | Recommended                   |
| Exact hold mechanics and resume ordering                            | `delegated to Mission Lead`   | Must satisfy the visible acceptance without changing what is sent or to whom | Delegated                     |

## Brian approval

- **Exact words:** Pending
- **Date:** Pending
