# 0012 — The confirmed event audience is a relation; its non-emptiness is not

**Status:** Accepted · **Date:** 2026-08-10 · **Relates to:** [0008](0008-relational-mapping-conventions.md)

## Context

An independent verification of the schema baseline found that the frozen model's
**audience definition** had no physical representation. The baseline recorded
`audience_confirmed_at` and `audience_confirmed_by_person_id` on `events` —
metadata saying _that_ an audience was confirmed, with nothing saying _who_.

Two things followed from that, and both were real:

- Invariant **P7** requires `never-invited` to be reportable. With invitations as
  the only population, an absence has no row, so the reporting view could
  express four of the five states and silently omitted the fifth.
- The database could not distinguish **"outside the audience"** from **"in the
  audience and accidentally not invited"**. The first is not the club's concern;
  the second is an approval defect the weekly review needs to see.

The first event vertical slice would have had to invent the missing structure,
which the implementation ticket's definition of done explicitly rules out.

## Decision

**`event_audience_members` is the resolved audience** — one row per participant
the approver confirmed, anchored by the same capacity rule as invitations and
attendance (player → season membership, everything else → person).

**An invitation must be resolved from an audience member of the same event, in
the same capacity, for the same participant.** `invitations.audience_member_id`
is `not null` and bound by a composite foreign key. To make that binding cover
the participant as well as the event, both tables carry a stored generated
column `participant_id = coalesce(season_membership_id, person_id)`: a composite
key over the two nullable anchor columns would be skipped entirely whenever
either was null, under `MATCH SIMPLE`. Such a foreign key cannot use
`on update cascade`, which is fine — neither an audience member's id nor a
participant's identity is ever updated in place.

**The audience may be populated before approval.** It is the thing the approver
reviews, so requiring an approved event would have been circular. Drafts still
carry no invitations, responses or attendance.

**Invariant E1 is split.** E1a — an approved event records a date, a type, an
approver and an audience confirmation — remains a check constraint. E1b — the
confirmed audience is non-empty — is **service-layer enforced** and documented
as such.

## Why E1b is not enforced in the database

"At least one row exists in another table" has no declarative form in
PostgreSQL. Two options were considered:

- **A constraint trigger.** Rejected: the architecture record is explicit that
  changeable workflow must not be buried in triggers, and the implementation
  ticket's correction instructions ruled it out by name.
- **A back-reference from `events` to a representative audience member**, made
  mandatory from approval onward by a check. This _is_ declarative and would
  have closed the gap: the pointed-at row cannot be deleted, so the audience
  cannot become empty. It was rejected because it invents a modelling artifact
  the frozen model does not have — "the audience member that witnesses the
  confirmation" — and because a pointer to one member reads as if it means
  something about that member, which it does not. It remains available if the
  club later wants the guarantee at the database level; it is one column, one
  foreign key and one check.

The approval transaction in the TypeScript service layer inserts the audience
and flips the status together, and must refuse an empty one. A test asserts that
the _database_ accepts an approved event with an empty audience, so that nobody
reads the E1a check as proving more than it does.

## Consequences

- P7's five states are all derivable. `invitation_response_state` starts from
  the audience and left-joins invitations.
- A new exception view, `uninvited_audience_members`, surfaces people who were
  confirmed and never asked. It is deliberately **not** merged into
  `nonresponse_queue`: Requirement 6 automates chasing people who did not
  answer, and someone who was never asked is a different problem with a
  different owner.
- Adding a late invitee means adding them to the audience and inviting them in
  one transaction — which is what register D3 already described.
- The audience, the invitation, the RSVP and the attendance record remain four
  separate facts. Attendance still has no foreign key to any of them, so
  invariant P6's walk-up is unaffected.
