# W8 — Resolve a possible duplicate

- Purpose/intended outcome: a capture the system could not safely resolve waits
  for a human, and one operator decision settles it — without ever having silently
  created a person, merged two, or messaged a member.
- Primary actor: an operator holding the core four authority.
- Trigger: any door parked a capture.
- Entry point: a count on the recruit board, and an item in the Administration
  navigation.
- Route/placement: `/operate/recruitment/review`.
- Controlling source: Task 09 D7 and §3, which lock dedup-before-create at every
  door and put self-serve matches in an operator-review queue with the welcome
  held; Brian's 2026-08-31 note that what the self-serve door cannot resolve needs
  a separate way through.
- User-visible result: the parked capture becomes the existing person or a new
  one, and whatever was held is released.

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

- `grounding: photograph`. The shipped add-a-person form and its own duplicate
  check as the shell, both sides at measured 1280px and 375px, with `W8-01`'s
  proposed side produced by driving the real form rather than by drawing its
  output. The proposed route `/operate/recruitment/review` does not exist on `main`
  and every frame says so.

## Core decisions

| Decision                                                     | Classification                | Governing evidence or recommended default                                              | Status  |
| ------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------- | ------- |
| Dedup at intake, never at the flip                           | `locked`                      | Task 09 D7                                                                             | Settled |
| Nothing is created or messaged until a human decides         | `locked`                      | Task 09 §3                                                                             | Settled |
| The queue compares a submission to a record, not two records | `proposed for owner approval` | Nothing is written yet, so there is nothing to merge                                   | Open    |
| The queue's count lives on the board                         | `proposed for owner approval` | A queue nobody can see is a queue nobody works                                         | Open    |
| Discards are recorded with a reason                          | `proposed for owner approval` | A discarded capture is a person the club chose not to keep; that is worth an audit row | Open    |

## Brian approval

- Exact words: _"W8 approved."_
- Date: 2026-08-31

Given after the parked review queue was deleted and this workflow reduced to the check
itself, on whichever door is open. Leftover duplicates go to the people table's own merge,
which already ships and belongs to Mission 5.
