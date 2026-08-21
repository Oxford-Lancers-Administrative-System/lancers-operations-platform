# W5 — Amend or reschedule an approved event

## What this workflow is for

An approved event changes — the pitch is waterlogged and it moves to University
Parks, the time shifts an hour, the kit list grows — and everyone who needs to
know finds out, without anybody losing the answer they already gave.

Today this is impossible. There is no amendment path on `main` at all, so a
rescheduled practice means telling people in WhatsApp and leaving the record
wrong.

- **Primary actor:** an operator holding event approval — President,
  Vice-President, Secretary or General Manager.
- **Trigger:** something about an approved event is now untrue.
- **Entry point:** the approved event's own page.
- **User-visible result:** the event is right, every response still stands, and
  the people who needed telling have been told — or deliberately have not,
  recoverably.
- **Controlling source:** Events & Calendar brief D49–D55, D76, §4.13; owner
  decision OD-1 of 2026-08-18, closing Q6, Q7 and Q9.

## The shape of it

**The event is edited in place and never leaves approved.**

1. **Press Edit event.** The event stays approved, and stays approved on the
   public calendar, throughout.
2. **Everything survives** — details, invitations, and every RSVP already
   collected. Nothing is cleared.
3. **Change what is wrong**, in the ordinary editor from `W4`. Changes are held
   as a pending amendment and are not live.
4. **Save**, and decide whether this change notifies. Saving is the moment the
   change lands.
5. **Or abandon it**, and nothing whatever has happened.
6. **If it went out silently by mistake, re-notify** (D54).

### Why not "return to draft"

D49 makes `approved → draft` a real transition, and an earlier draft of this
workflow took that literally: the operator pressed _Return to draft_, edited, and
re-approved.

That is wrong in practice for a reason the decision could not have anticipated,
because D4 was decided separately: **drafts are visible on the public calendar.**
An approved event with 37 invitations already sent would therefore appear
publicly as a draft for as long as somebody was editing it — and if they were
interrupted, indefinitely. A club event that silently becomes a draft after
people have been invited to it is a worse outcome than any amendment it was
meant to enable.

**D49 is therefore superseded for the amendment path**, by Brian on 2026-08-21.
The event is amended in place; the operator never meets the word "draft"; and
the public never sees the event flicker. `approved → draft` remains a real
transition in the model and remains unused by this workflow.

_Recorded as a proposed correction to the Events brief in
`notion-corrections.md`._

## Who is told, and when

**The whole invited audience**, when a change notifies. OD-1/Q9 closed this and
simplified D51 and D53 into one rule: yes-responders, no-responders and
non-responders alike. One rule for all recipients.

- **A yes still stands.** People who answered yes are told the event has changed
  and to re-read the details. **They are not asked to answer again** (D51, D52).
- **A non-responder's message doubles as an ordinary "please RSVP" prompt**
  (D53).
- **Decliners are included.** A venue or date change might reverse their answer,
  and one rule is simpler than three.

## Whether it notifies

**The operator decides, and the decision has a default per field** (D54, D55):

| Field changed      | Notify defaults |
| ------------------ | --------------- |
| Date               | **On**          |
| Time               | **On**          |
| Venue              | **On**          |
| Description        | Off             |
| Required equipment | Off             |
| Name               | Off             |

The operator may override either way. The default is a starting position, not a
rule — but it is chosen so that the changes which strand somebody at the wrong
place at the wrong time are the ones that speak up by themselves.

**No reason is required** (OD-1/Q7). An amendment does not carry a separate
reason field; the description already exists, is required on every approvable
event, and can hold any explanation. The actor, the change and the notify choice
are all recorded regardless.

## Rescheduling recomputes the chase

**When the date or time moves, the RSVP chase threshold recomputes against the
new date, and the app says that a reschedule is happening** (OD-1/Q6).

The recomputation is this mission's — the threshold is event-type configuration
this mission owns. The chasing that follows is Mission 4's. A practice moved
from next week to next month should not still be chasing people on the old
schedule.

## What this workflow does not do

**It does not send anything.** It decides that a message is owed and to whom;
Mission 4 formats it, picks the moment, delivers it and retries.

One consequence of the seam is worth stating because it is already decided on
the other side of it. Task 02's D5 says: **undelivered notification jobs are
cancelled on return to draft, nothing already sent is recalled, and on
re-approval invitations never attempted dispatch fresh.**

That rule survives intact, but **its trigger moves**: there is no return to
draft any more, so the moment at which undelivered jobs are cancelled and
replaced is **when an amendment is saved**. The substance is unchanged — nothing
sent is recalled, nothing unsent goes out describing the old event — but Mission
4 must be told, because D5 names a transition this workflow no longer performs.
Recorded as a proposed correction to the Task 02 brief in
`notion-corrections.md`.

## State transitions

- **None on the event's status.** It is approved before, during and after.
- A **pending amendment** exists between Edit and Save, and is not visible to
  anyone but the operator editing.
- **Saving applies the change** and records the notify decision.
- **Abandoning discards it** and leaves no trace on the event.
- The event's identity, its audience and its collected responses are unchanged
  throughout.
- Change history is retained and queryable, with the actor, the change and the
  notify choice recorded against it (§4.13).

## Handoffs

- **← `W1`, `W7`** — an operator reaches the event from the list, a calendar, or
  its own page.
- **↔ `W4`** — the editing itself is `W4`'s form and `W4`'s audience builder.
  This workflow is the wrapper that makes them reachable on an approved event
  and decides what happens on the way out.
- **→ Mission 4** — the notification, and the recomputed chase.
- **→ `W6`** — if the answer is that the event should not happen at all.

## Exceptions and recovery

| Situation                                               | Behaviour                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A change was saved with notify turned off by mistake    | **Re-notify** sends the change notification to the same audience, without altering the event or its responses (D54, acceptance example F)               |
| The audience is edited while the event is back in draft | Allowed — it is a draft. People removed keep no obligation; people added are new invitations on re-approval                                             |
| Re-approval with a now-missing required field           | Refused, exactly as `W4` refuses. The event stays a draft                                                                                               |
| Re-approval with an empty audience                      | Refused. The event stays a draft                                                                                                                        |
| The event has already passed                            | It can still be amended — a correction to the record is legitimate. Whether it notifies is the operator's call, and the default for a past event is off |
| A second operator is editing the same event             | Ordinary concurrency; the Mission Lead's problem, not a product decision                                                                                |

## Safety, privacy, consent, and authority boundaries

- **No response is ever destroyed by an amendment.** This is the load-bearing
  rule: an operator fixing a venue must never silently discard 25 people's
  answers.
- **The audit record is the point.** Actor, change and notify choice, retained
  and queryable — this is the only place in the mission where somebody changes
  something people have already acted on.
- **Approval capability is required**, enforced in the service layer.
- **Nothing here reaches a person directly.** The obligation to notify is
  recorded; Mission 4 acts on it.

## Repository reconciliation

**There is no amendment path on `main` at `2072ecd`.** The README's own
limitation list says C4 is absent, and the Authority Manifest records Scope 1's
C4 as unbuilt. An approved event today is terminal: it cannot be returned to
draft, edited, or re-notified.

Two things the current approved-event page carries that this mission removes,
neither of which belongs to this workflow:

- **The "Confirm what happened" panel** — event status, "Occurrence: Not yet
  asserted", "Attendance: Unavailable, opens only after Mark occurred", and the
  **Mark occurred** and **Mark not held** buttons. D30 retires occurrence
  assertion entirely and the brief states that screens UX-70 and UX-75 cease to
  exist; D71–D74 replace them with a time buffer. **That removal belongs to
  `W7`**, which owns the event page's attendance-facing content, and it is
  recorded here so it is not lost between the two.
- **The "Response solicited / No response requested" block**, which D23 removes.
  `W4` removes it from the form; the same value is displayed here and goes with
  it.

## Acceptance evidence

- An approved event can be amended and **never leaves the approved status**,
  including on the public calendar, at any point during the edit.
- Every invitation and every RSVP survives an amendment — asserted by count and
  by identity, not by inspection.
- Abandoning an amendment leaves the event byte-for-byte as it was, and writes
  no history entry.
- A yes-responder is told the event changed and is not asked to answer again;
  their answer is unchanged afterwards.
- When a change notifies, the notification obligation is recorded against every
  invited person, decliners included.
- Notify defaults on for date, time and venue, and off for description,
  equipment and name, and the operator's override is honoured and recorded.
- Re-notify sends the change notification to the same audience and alters
  neither the event nor its responses.
- Moving the date recomputes the chase threshold against the new date.
- Saving is refused when a required field is missing or the audience would be
  empty, and the event stays approved and unchanged.
- The change history records actor, change and notify choice, and is queryable.
- No amendment creates, alters or destroys an attendance record.

## Core decisions

| Decision                                                                                                                                       | Classification                   | Governing evidence                                                                                           | Status        |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------- |
| An approved event is changed by returning it to draft; `approved → draft` is a real transition                                                 | `locked`                         | D49                                                                                                          | Settled       |
| Returning to draft preserves details, invitations and every RSVP                                                                               | `locked`                         | D50                                                                                                          | Settled       |
| Yes-responders are told and keep their answer; they are never asked to re-RSVP                                                                 | `locked`                         | D51, D52                                                                                                     | Settled       |
| When a change notifies, the **whole invited audience** is notified, decliners included                                                         | `locked`                         | OD-1/Q9, 2026-08-18, which supersedes D51/D53's split                                                        | Settled       |
| The operator decides whether a change notifies, with per-field defaults — on for date, time and venue; off for description, equipment and name | `locked`                         | D54, D55                                                                                                     | Settled       |
| **No mandatory amendment reason.** The required description carries any explanation; actor, change and notify choice are recorded              | `locked`                         | OD-1/Q7, which supersedes the Capability Register's C4 "recorded with reason" wording for the amendment path | Settled       |
| Rescheduling recomputes the RSVP chase threshold against the new date, and the app says a reschedule is happening                              | `locked`                         | OD-1/Q6                                                                                                      | Settled       |
| **Re-notify** exists as an explicit action, so a silently-sent change is recoverable rather than permanent                                     | `locked`                         | D54, acceptance example F                                                                                    | Settled       |
| Change history retains actor, change and notify choice, and is queryable                                                                       | `locked`                         | §4.13                                                                                                        | Settled       |
| Undelivered jobs are cancelled on return to draft; nothing sent is recalled; never-attempted invitations dispatch fresh on re-approval         | `locked`, **owned by Mission 4** | Task 02 D5, which closed Q8                                                                                  | Settled there |
| A past event may still be amended, with notify defaulting off                                                                                  | `delegated to Mission Lead`      | Follows D31's treatment of a past cancellation as administrative                                             | Delegated     |
| How the notify choice is presented — per-field toggles, or one choice with the defaults applied                                                | `delegated to Mission Lead`      | The defaults are the product decision; the control is not                                                    | Delegated     |
| Concurrency when two operators edit one event                                                                                                  | `delegated to Mission Lead`      | Ordinary engineering                                                                                         | Delegated     |

## Brian approval

- Exact words:
- Date:
