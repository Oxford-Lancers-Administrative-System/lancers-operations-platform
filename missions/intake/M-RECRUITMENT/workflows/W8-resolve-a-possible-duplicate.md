# W8 — Resolve a possible duplicate

- Purpose/intended outcome: a capture the system could not safely resolve waits
  for a human, and one operator decision settles it — without ever having silently
  created a person, merged two, or messaged a member.
- Primary actor: an operator holding the core four authority.
- Trigger: any door parked a capture.
- Entry point: a count on the recruit board, and an item in the Administration
  navigation.
- Route/placement: `/operate/recruits/review`.
- Controlling source: Task 09 D7 and §3, which lock dedup-before-create at every
  door and put self-serve matches in an operator-review queue with the welcome
  held; Brian's 2026-08-31 note that what the self-serve door cannot resolve needs
  a separate way through.
- User-visible result: the parked capture becomes the existing person or a new
  one, and whatever was held is released.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue:
  `/operate/people/[personId]/merge` at `main@e669331`, photographed as `W8-01` —
  the shipped merge screen, which is the closest thing to a two-records-one-human
  decision in the product.
- Reused component, language, interaction, and permission patterns: that screen's
  side-by-side comparison, its explicit choice, its audit, and the shipped
  duplicate check behind it.
- Desktop and 375px evidence: `W8-01` and `W8-02`, both sides, measured.
- Reason for any departure from the implemented application: merge resolves two
  records that both exist. This queue resolves a submission that does **not** exist
  yet against a record that does — nothing has been written, so there is nothing
  to merge. The screen therefore compares a _submission_ to a _record_, and its
  two outcomes are create and link, not survivor and loser.

## Required actions

1. See how many captures are waiting, from the board.
2. Open one and see the submission beside the candidate record, field by field.
3. Choose: **this is them** (link, discard the submission, release nothing that
   would message a member) or **this is somebody new** (create, and `W3` fires).
4. See what is held — no welcome has fired and no record exists until this
   decision.
5. Leave one for later without losing it.

## State transitions

On link: no person created, no prospect created if they already hold one, nothing
messaged. On create: person minted, prospect at `identified`, `W3` fires.

## Handoffs

- From `W5`, `W6` and `W7`.
- To `W3` on create; to `W2` on link.
- To Mission 5's merge when the right answer is that two records already exist and
  must be merged — that is Mission 5's screen, not this one.

## Dependencies and mission boundaries

- **Mission 5 / merge and dedup:** this mission's side is the queue for captures
  that never became records; Mission 5's side is merging records that already
  exist. The seam is exactly the moment of creation. Independently walkable.

## Exceptions and recovery

- **The candidate is a current member.** Link, and never send the welcome. This is
  the case the whole rule exists for — Task 09's worked example B.
- **Two candidates.** Show both; the operator picks or declares new.
- **The submission is nonsense.** Discard it, recorded, with a reason.
- **Nobody works the queue.** It is visible on the board with a count, so a
  forgotten queue is visible rather than silent. Nothing expires and nothing is
  auto-resolved.

## Safety, privacy, consent, and authority boundaries

- Nothing is written until a human decides. No silent create, no silent merge —
  the locked rule at the centre of R2.
- An existing member never receives a "welcome to the club" message.
- Four-role only. The queue holds contact details of people who are not yet
  records, so it is at least as restricted as the board.

## Acceptance evidence

- `grounding: photograph`. The shipped merge screen as the shell, both sides at
  measured 1280px and 375px.

## Core decisions

| Decision                                                     | Classification                | Governing evidence or recommended default                                              | Status  |
| ------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------- | ------- |
| Dedup at intake, never at the flip                           | `locked`                      | Task 09 D7                                                                             | Settled |
| Nothing is created or messaged until a human decides         | `locked`                      | Task 09 §3                                                                             | Settled |
| The queue compares a submission to a record, not two records | `proposed for owner approval` | Nothing is written yet, so there is nothing to merge                                   | Open    |
| The queue's count lives on the board                         | `proposed for owner approval` | A queue nobody can see is a queue nobody works                                         | Open    |
| Discards are recorded with a reason                          | `proposed for owner approval` | A discarded capture is a person the club chose not to keep; that is worth an audit row | Open    |

## Brian approval

- Exact words:
- Date:
