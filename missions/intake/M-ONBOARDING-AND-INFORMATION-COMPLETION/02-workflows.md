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
11. `W11` — Set onboarding's chase: a four-role operator opens the club's
    messaging schedule → sets **how many times** onboarding chases somebody,
    **how often**, and **how long before the chase exhausts** → the chase runs
    to the club's policy rather than to a constant in the code.

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

### 2026-09-02 — `W11` removed; twelve workflows become eleven

`W11` proposed that an operator configure which items apply each season, their
labels, their verification class and a per-item owner. Brian rejected the whole
target:

> "We're not taking the individual items and bringing them to operators. Only
> the core four ever make changes in here. If the kit operator needs to go off
> and do something with a kit, they can go and run that on their own… What we
> need is the cadence for when they go through and do that… It should just
> define how many times we are going to chase them, how often we are going to
> chase them, and how long before the chase exhausts. That's it."

Three answers settled the shape:

1. **One workflow, not two.** The chase numbers *are* the onboarding cadence, so
   the old `W11` folds into it and the inventory is now **eleven workflows**.
2. **The checklist is fixed.** It is the approved `item-and-ask-inventory.md`,
   and nobody turns items on or off per season. `R1` and `R2-V2` are superseded.
3. **There are no per-item owners.** Only the four-role group resolves anything.
   `R2` is superseded.

Verification behaviour survives — an item can still complete on the player's
word or sit at `claimed` until a human confirms — but as a property of the item
in the approved inventory, never as a setting on a page. `W6` stands as approved.

**The last workflow is renumbered.** The frozen inventory must be consecutively
numbered from `W1` — the validator refuses a gap — so the old `W12` becomes
`W11`. No approved workflow's number moves: `W1` through `W10` are untouched,
and the only renumbered workflow is the one not yet drafted. References to
`W12` in already approved specifications were corrected to `W11`; they point at
the same workflow, and only its number changed.

## Brian approval

- Exact approved list/count: W1–W12 as listed above, twelve workflows
  (amended 2026-09-02 to eleven: W1–W11, the old W11 folded into the chase)
- Exact words: "Okay, I like that. ... The workflows look fine, except that I want to see what the actual questions in inventario are."
- Date: 2026-09-01
