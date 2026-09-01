# Frozen workflow inventory — M-ONBOARDING-AND-INFORMATION-COMPLETION

Definition: one primary actor's end-to-end journey from trigger and entry point to
one user-visible result.

See generated `subject-coverage.md` for the approved subject map.

## Proposed inventory — twelve workflows

**The three doors in**

1. `W1` — Bring last season's squad in: a four-role operator uploads the roster
   file → sees exactly who is about to be added with possible duplicates listed
   underneath → confirms → those players are on this season's roster in
   onboarding, their checklists generated and their welcomes sent.
2. `W2` — Add one player by hand: a four-role operator enters one person on the
   roster → that person is in onboarding with the same checklist and the same
   welcome as anyone who came through the import.
3. `W3` — A flipped recruit lands in onboarding: a four-role operator flips a
   recruit to joined → sees them arrive on the roster in onboarding with their
   checklist generated, everything they already told the club carried across,
   their recruit link retired and their welcome sent. **Mission 6's W14 ends at
   the words "onboarding opens"; this workflow is what those words mean.**

**What the player does**

4. `W4` — Say yes and fill in your details: a player receives the welcome and
   opens their link → ticks their consent for the season, confirms what the club
   already holds and fills what it doesn't → their record is as complete as they
   can make it and the club may message them from here on.
5. `W5` — Fix something the club has wrong: a player opens their link outside the
   welcome moment → corrects a value, or declines to give one → the correction is
   recorded, or the disagreement is raised for a human, and nothing they say
   silently overwrites something the club confirmed.

**Keeping it true**

6. `W6` — One player's onboarding record: a four-role operator opens a player →
   sees every item with who said what and when, and everything the club has ever
   said to them, counted by section → completes, waives, marks not applicable or
   reopens any item.
7. `W7` — Settle a disputed fact: a four-role operator opens a flagged field →
   sees the club's value, the person's answer and the whole history → resolves it,
   leaving flag, correction and confirmation each attributable.

**Chasing**

8. `W8` — Work the queue and nudge: a four-role operator opens the outstanding
   list at Monday → sees who is furthest behind, when each was last contacted and
   when the machine next will → nudges one person or several in one action, each
   receiving only their own ask.
9. `W9` — Pick up a chase that ran out: the configured office receives a message
   saying a chase has exhausted, carrying a count and a link but no names →
   follows it into the queue, contacts the person themselves → records what
   happened on that person's log.

**Finishing, and the machinery behind it**

10. `W10` — Activate a player: a four-role operator declares a player active, with
    whatever is still outstanding shown as context → the player is active and
    manageable as a full member of the squad.
11. `W11` — Set up this season's checklist: a four-role operator configures which
    items apply this season, their labels, their tracking flag and how each is
    verified → the season's checklist is what generates for everybody who arrives.
12. `W12` — Set onboarding's messaging cadence: a four-role operator opens the
    club's messaging schedule → sets what onboarding sends and when → the chase
    runs to the club's policy rather than to a constant in the code.

## Cross-cutting invariants and exclusions

Recorded in full in `01-overview.md`. The ones that bind every workflow above:
nothing gates, ever · at most one open ask per person, ever · no player logins,
so every player-facing step is a single-person signed link · nothing is ever sent
by hand · no automated timeout removes anybody · the collection loop is players
only · no recruit is ever chased · a surface renders a field only where its
substrate exists on `main` at build time.

Excluded here and owned elsewhere: consent wording, retention, erasure,
subject-access export and under-18 policy (Mission 8) · coach and committee
onboarding, chasing and self-service (Mission 9) · season creation, rollover and
the season-boundary reset (Mission 11) · the recruitment funnel up to the flip
(Mission 6) · transport (Mission 4) · the Monday report (Mission 10).

## Inventory amendments

None.

## Brian approval

- Exact approved list/count: W1–W12 as listed above, twelve workflows
- Exact words: "Okay, I like that. ... The workflows look fine, except that I want to see what the actual questions in inventario are."
- Date: 2026-09-01
