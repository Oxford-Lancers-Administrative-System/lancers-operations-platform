# W4 — Merge two records for the same human

- Purpose/intended outcome: the club holds one person twice; afterwards it holds
  them once, both identities are preserved, everything that pointed at either
  record points at the survivor, and the whole thing is answerable.
- Primary actor: a four-role operator — President, Vice-President, Secretary,
  General Manager.
- Trigger: two rows with the same phone number; a returner entered fresh who was
  already there under a nickname; the duplicate check in `W3` was answered wrong
  six months ago.
- Entry point: **Merge…** on the person record (`W1-05`).
- Route/placement: `/operate/people/[personId]/merge`. Neither the route nor its
  parent exists on `main`; nothing occupies the path.
- Controlling source: Task 08 §2 and invariant I6 (both identities preserved, the
  losing row never deleted); §6 (four-role only, fully audited); LAN-147 question
  2; the owner session of 2026-08-26 for the operator-seat and prospect-collision
  edges.
- User-visible result: one surviving record, every reference re-pointed, the
  losing row kept and pointing at the survivor, and a merge event naming who,
  when and why.

## Required actions

- Find the other record, by the same search `W1` uses.
- **Show the two side by side, field by field**, with every value that differs
  marked. This is the screen the whole workflow exists for.
- Choose which record survives, and for each differing field, which value it
  keeps. Neither is assumed to be right because it is older or newer.
- Require a reason.
- Show what will move before it moves: memberships, prospect records, role
  assignments, contact points, RSVP and attendance history, audit history.
- Merge.

## State transitions

- One record becomes the survivor. The other is marked merged, dated, with the
  operator's id and the reason, and `merged_into_person_id` set.
- Every reference to the losing person is re-pointed at the survivor.
- Chosen field values are written onto the survivor, each one an ordinary audited
  correction so the change history reads honestly.
- Contact points from both records are kept; one per kind stays preferred.
- **The losing row is never deleted**, so imported rows keep their provenance.

## Handoffs

- To `W1` on the survivor.
- To `W8` for the merge event and everything it moved.
- To `W2` when the merge is done and a value still needs fixing.
- To Mission 1 when the losing record holds an operator seat, which must be
  ended there first.
- To Mission 6 for the recruitment consequences of a merged prospect pair.

## Dependencies and mission boundaries

- **A losing record holding an active operator seat refuses the merge.** The seat
  is ended first through Mission 1's existing flow. Brian, 2026-08-26: silently
  transferring a login is not acceptable.
- **`recruitment_prospects_one_per_person_per_season` makes the duplicate case
  impossible to merge naively.** Two prospect rows for one human in one season
  are combined onto the survivor, taking the earliest first-contact date and the
  furthest-along status. Recorded as a seam Mission 6 inherits.
- **Consent-record precedence is unresolved and stays unresolved**, because no
  consent substrate exists on `main`. Mission 8 decides it; this workflow records
  the edge rather than inventing a rule.
- Aliases from both records survive on the survivor as dedupe evidence, never as
  roster display.
- Merged-away records are excluded from every list and every duplicate check,
  which the shipped matching already does.

## Exceptions and recovery

- **The losing record holds an active operator seat.** Refused, naming what must
  happen first, with a route to it.
- **Both records hold a membership in the same season.** Refused. Two
  memberships for one human in one season is a roster question, not a person
  question, and merging them silently would rewrite a season's squad.
- **Both records hold a prospect row in the same season.** Combined by the rule
  above, and the operator is shown the result before it is written.
- **The operator picks the wrong survivor.** There is no undo. The confirmation
  states what will move, and the losing row survives pointing at the survivor,
  which is what makes a manual repair possible at all.
- **One of the two is already merged away.** Refused; the survivor is offered
  instead.

## Safety, privacy, consent, and authority boundaries

- Four-role only, and fully audited — Task 08 §6.
- The comparison screen shows two people's contact details, academic detail, date
  of birth and emergency contact side by side. It is the single most disclosing
  screen in this mission, which is why it is reached only from a record the
  operator already holds and never from a list.
- Nothing here sends a message or records a lawful basis.
- **Nothing is deleted, ever** — invariant I6.
- A merge is one audited event, not a sequence of silent corrections.

## Acceptance evidence

Against seeded synthetic data, an operator can:

1. find the duplicate from the survivor's record and see the two **side by side
   with every difference marked**;
2. **choose per field** which value survives, including keeping the older one;
3. be **refused** without a reason;
4. see **what will move** before it moves, and find it moved afterwards;
5. confirm the **losing row still exists**, marked merged, pointing at the
   survivor, and appearing in no list and no duplicate check;
6. be **refused** when the losing record holds an active operator seat, and be
   told what to do first;
7. be **refused** when both records hold a membership in the same season;
8. merge a **duplicate prospect pair** and find the earliest first-contact date
   and the furthest-along status on the survivor;
9. read the whole merge on the survivor's history as one event.

## Core decisions

| Decision                                                                       | Classification                | Governing evidence or recommended default                                                               | Status                |
| ------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------- |
| Both identities preserved; the losing row is never deleted                     | `locked`                      | Invariant I6; Task 08 §2                                                                                | Settled               |
| Field-by-field choice rather than "survivor wins"                              | `proposed for owner approval` | The older record is often the more complete and the newer the more correct; assuming either loses data  | Recommend as drawn    |
| A reason is required                                                           | `locked`                      | Task 08 §6                                                                                              | Settled               |
| An active operator seat on the losing record refuses the merge                 | `locked`                      | Brian, 2026-08-26                                                                                       | Settled               |
| Two memberships in one season refuse the merge                                 | `proposed for owner approval` | Merging them silently rewrites a season's squad. The alternative is asking the operator to pick one     | Recommend refuse      |
| Duplicate prospect rows combine: earliest first contact, furthest-along status | `locked`                      | Brian, 2026-08-26; recorded as a seam Mission 6 inherits                                                | Settled               |
| Consent-record precedence                                                      | `delegated to Mission Lead`   | No consent substrate exists on `main`; Mission 8 decides the rule and this workflow records the edge    | Deferred to Mission 8 |
| No undo                                                                        | `proposed for owner approval` | The losing row surviving is what makes manual repair possible. A real undo is a second destructive path | Recommend none        |
| Which references are re-pointed, and in what order                             | `delegated to Mission Lead`   | Mechanical; the set is every foreign key to `people`                                                    | Delegated             |

## Brian approval

- Exact words:
- Date:
