# W8 — Resolve a possible duplicate

- Purpose/intended outcome: the door an operator is already at tells them
  whether this person is already in the club, and one click settles it — without
  ever having silently created a person, merged two, or messaged a member.
- Primary actor: an operator holding the core four authority.
- Trigger: an operator is adding somebody at a door that runs the check.
- Entry point: none of its own; the check is a step inside whichever door is open.
- Route/placement: none of its own; it renders on the door's own surface.
- Controlling source: Task 09 D7 and §3, which lock dedup-before-create at every
  door; Brian's 2026-08-31 direction that the check belongs to the door and not
  to a page, and his 2026-09-01 confirmation that a real duplicate is resolved by
  the people record's own merge.
- User-visible result: the operator either links to the person who is already
  there or creates a new one, on the spot.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue: `/operate/people/new`
  at `main@e669331` — **the shipped duplicate check itself**, photographed as
  `W8-01` with the real form driven: names and a mobile typed in, the
  application's own _Check for duplicates_ pressed, and its own answer captured.
- **Re-grounded 2026-08-31.** The first draft used `/operate/people/[personId]/merge`.
  Brian: _"That's not where in the fucking workflow it belongs. That's not how
  the duplicate checks get done. That's not where it happens."_ He was right
  twice. Merge resolves two records that both exist, and the check that matters
  here already ships in `create-person-form.tsx` as a check-then-create: the form
  answers `Already in the club` with candidate rows, or says plainly that nothing
  matched.
- Reused component, language, interaction, and permission patterns: that form's
  check, its candidate rows, its per-candidate action, and its refusal to create
  past an exact match without a written reason.
- Desktop and 375px evidence: `W8-01` and `W8-02`, both sides, measured.
- Reason for any departure from the implemented application: merge resolves two
  records that both exist. This queue resolves a submission that does **not** exist
  yet against a record that does — nothing has been written, so there is nothing
  to merge. The screen therefore compares a _submission_ to a _record_, and its
  two outcomes are create and link, not survivor and loser.

## The check belongs to the door, not to a page

Brian, 2026-08-31: _"This is happening inside of the people page. I don't want
this to happen inside people. This is on the recruit page. If I check for
duplicates on the recruit page, the same thing happens with the operator page. It
happens in the roster, and it happens on that page when I add them... I'm not
going to the people page to do this."_

So `W8` is not a place an operator visits to check for duplicates. The check is a
**step inside whichever door is open**, rendered on that door's own surface.
`W8-01` is therefore the check as it runs while adding a **recruit**, wearing
recruitment's shell, at a proposed `/operate/recruitment/new`. It is photographed
on `/operate/people/new` because that is the surface implementing the check on
`main`.

## Each candidate has to say who it is

Brian: _"If I add a name and their contact details, I want to see what their
status is. Are they a part of the current season? Are they already a player on
the season? Are they another recruit? Who are they, because it could have the
same name. It could just be incredibly similar to another player, so we need a
way to differentiate them."_

The shipped rows give a name, a contact line and the fields that matched. None of
that separates two Brindlewoods. Each candidate now carries its identity, in the
club's own vocabulary — membership status and season from
`MEMBERSHIP_STATUS_LABELS`, the recruit rung from the ladder this mission
approved on the board:

- **Player · Active · this season**
- **Recruit · identified · this season**
- **Past member · last played 2024-25**

## The queue is deleted

`W8-02` was a parked review queue. Brian replaced the whole idea on 2026-08-31
with one question asked at the door, in `W7-02`: _"have you already registered
before?"_ The person standing at the stand is the one who knows, so no queue, no
operator and no notification is needed.

That also answers the question that exposed it. He asked where the queue was
reached from, how anybody would be told it was there, and where it sat in
relation to `W1` — and there was no good answer, because a surface nobody can
find is a surface nobody works.

### So what is left of this workflow

Only the check itself, on whichever door is open, which is `W8-01`.

| Door              | Duplicate handling                                   |
| ----------------- | ---------------------------------------------------- |
| `W5` walk-up      | None. A walk-on is always a new person               |
| `W6` operator add | The full shipped check, at the door, with identities |
| `W7` QR sign-in   | One question, answered by the recruit                |

**Whatever still slips through is not this mission's to resolve.** The people
table's own merge already ships at `/operate/people/[personId]/merge` and belongs
to Mission 5 — Brian: _"we can go through the deduplication process in the people
table, and that can be handled there simply."_

## Required actions

1. Press the door's own check and read the candidates, each saying who it is.
2. Choose: **this is them** (link, create nothing) or **this is somebody new**
   (create, and `W3` fires).
3. Be refused a create past an exact match without a written reason.

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
- Four-role only. The check reveals contact details of existing people, so it is
  at least as restricted as the board.

## Acceptance evidence

- `grounding: photograph`. The shipped add-a-person form and its own duplicate
  check as the shell, both sides at measured 1280px and 375px, with `W8-01`'s
  proposed side produced by driving the real form rather than by drawing its
  output. `W8-01` is photographed on `/operate/people/new` because that is the
  surface implementing the check on `main`, and every frame says so.

## Core decisions

| Decision                                                      | Classification | Governing evidence or recommended default                                              | Status  |
| ------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------- | ------- |
| Dedup at intake, never at the flip                            | `locked`       | Task 09 D7                                                                             | Settled |
| Nothing is created or messaged until a human decides          | `locked`       | Task 09 §3                                                                             | Settled |
| The check runs at the door and is never a page of its own     | `locked`       | Brian, 2026-08-31: the check belongs to the door, not to a page                        | Settled |
| A real duplicate is resolved by the people record's own merge | `locked`       | Brian, 2026-09-01: "that's a normal merge record that is handled on the people record" | Settled |

## Brian approval

- Exact words: _"W8 approved."_
- Date: 2026-08-31

Given after the parked review queue was deleted and this workflow reduced to the check
itself, on whichever door is open. Leftover duplicates go to the people table's own merge,
which already ships and belongs to Mission 5.
