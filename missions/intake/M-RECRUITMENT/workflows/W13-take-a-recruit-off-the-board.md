# W13 — Take a recruit off the board

- Purpose/intended outcome: a recruit who is not going to onboarding leaves the
  board without leaving the record, and nothing further is sent to them.
- Primary actor: an operator holding the core four authority.
- Trigger: they said no, they went quiet, or the record should never have existed.
- Entry point: the status cell on `W1`, or the status on `W2`.
- Route/placement: no route of its own — it is a status change on a surface that
  already exists.
- Controlling source: Brian's 2026-08-28 off-ramp framing — _"Recruits can get in
  3 or 4 ways, but they can get off in several ways"_ — and his 2026-08-31
  ruling: _"When a recruit leaves the board, that's a status change, right? A moves
  statuses, and then the board resorts, more or less."_
- User-visible result: they are off the board, the board resorts, their history is
  intact, and the club stops talking to them.

## Why this is a workflow and not a button

Every walk-up is a recruit, and every QR scan is a recruit. That decision is what
makes the exits load-bearing: without them the board fills with everybody who ever
stood near the stand and stops being readable by November. The exits carry the
volume of the whole funnel.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue: `W1`'s own board, since
  this is a status change on it. Photographed as `W13-01`, the board before and
  after, so the resort is visible rather than described.
- Reused component, language, interaction, and permission patterns: the in-cell
  edit `W1` already specifies, the roster board's own audited status changes, and
  the ladder colours.
- Desktop and 375px evidence: `W13-01` and `W13-02`, both sides, measured.
  `W13-01` is the board before and after the status change, so the resort is
  visible rather than described; `W13-02` is the recruit's own row carrying the
  exit value and what stops being sent.
- Reason for any departure from the implemented application: none. Brian settled
  that this is a status change and nothing more; there is deliberately no separate
  removal mechanism, no archive action and no delete.

## The three exits

| Status       | What it means                                                             | Who sets it                               | What stops |
| ------------ | ------------------------------------------------------------------------- | ----------------------------------------- | ---------- |
| `declined`   | Hard no. They said no.                                                    | Operator, from what the recruit told them | Everything |
| `disengaged` | Soft no. They stopped engaging. Recoverable — people resurface in Hilary. | Operator judgement                        | Everything |
| `void`       | The record was a mistake and should never have existed.                   | Operator                                  | Everything |

`joined` is the fourth way off the board and is `W14`'s.

## `void` is still open

Brian's own doubt, recorded at Stage 1: every other value says something about the
person's relationship with the club, while `void` says the _record_ is wrong. Two
ways to hold it, and this workflow draws the second:

1. A seventh status value — one field, one filter, one place to look. Cost: the
   column answers two different questions and every consumer must know `void` is
   not a stage.
2. **A separate marker** — voided, by whom, when, and why — leaving six values that
   are all about the person. Cost: two things to check. Gain: the record keeps the
   status it had, so "this was marked committed and it was a mistake" stays
   visible; voiding carries an actor and a reason; un-voiding is trivial.

Recommendation: the separate marker, because Brian's instinct is right — `void` is
not a claim about the recruit.

## Required actions

1. Change the status from the board or the record, in the cell.
2. Give a reason where the exit is a judgement rather than something you were
   told — recommended for `disengaged` and required for `void`.
3. See the board resort.
4. Bring somebody back, because `disengaged` is explicitly recoverable.

## State transitions

`identified | engaged | committed → declined | disengaged | void`, and
`disengaged → engaged` on re-engagement, with history intact. Nothing is deleted
and no record is archived out of sight.

## Handoffs

- To `W1`, which resorts.
- To Mission 8 for destructive removal of a _person_, which is erasure and is
  never recruitment's — owner decision 2026-08-25.

## Dependencies and mission boundaries

- **Mission 8 / erasure and retention:** this mission's side is a recruit leaving
  the board; Mission 8's side is a human being deleted from the club's records and
  the retention rule for a lapsed or declined record. The line is explicit and
  must stay so, because the second is a privacy act with its own authority.
  Independently walkable.
- **Mission 11 / the season boundary:** an unconverted recruit at a rollover is a
  recruitment-lifecycle fact whose machinery is a season mission's. This mission
  states what must be true and performs no rollover. Non-blocking.

## Exceptions and recovery

- **They come back.** `disengaged → engaged`, history intact, no new person
  record — Task 09's worked example E.
- **They were voided by mistake.** Un-voiding is trivial under the marker model
  and destructive under the seventh-value model. This is the strongest practical
  argument for the marker.
- **They declined but keep turning up.** Attendance is recorded regardless. The
  status is what the club believes, not a gate on the door.
- **A season ends with them still on the board.** Open — Mission 11's machinery,
  this mission's rule.

## Safety, privacy, consent, and authority boundaries

- Nothing here deletes anything. A recruit leaving the board is a display change
  and a messaging change, never a data loss.
- A declined recruit is not messaged again, by anything, including `W9`.
- Four-role only.

## Acceptance evidence

- `grounding: photograph`. The board before and after, both sides at measured
  1280px and 375px.

## Core decisions

| Decision                                                      | Classification                | Governing evidence or recommended default     | Status  |
| ------------------------------------------------------------- | ----------------------------- | --------------------------------------------- | ------- |
| Leaving the board is a status change; the board resorts       | `locked`                      | Brian, 2026-08-31                             | Settled |
| No separate removal, archive or delete mechanism              | `locked`                      | Same                                          | Settled |
| `disengaged` is recoverable with history intact               | `locked`                      | Task 09 §1; the ladder decision of 2026-08-28 | Settled |
| `void` is a separate marker, not a seventh status value       | `proposed for owner approval` | Open decision 10. Recommendation: the marker  | Open    |
| A reason is required for `void`, recommended for `disengaged` | `proposed for owner approval` | A mistake worth recording is worth explaining | Open    |
| Deleting the person is never recruitment's                    | `locked`                      | Owner decision 2026-08-25                     | Settled |

## Brian approval

- Exact words:
- Date:
