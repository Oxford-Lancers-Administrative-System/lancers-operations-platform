# W6 — Add a recruit by hand

- Purpose/intended outcome: the club finds somebody it wants and puts them in
  deliberately — proactive sourcing as a first-class path rather than a fallback.
- Primary actor: an operator holding the core four authority.
- Trigger: somebody is mentioned, met, or recommended, away from an event.
- Entry point: `ADD RECRUIT` on the recruit board.
- Route/placement: `/operate/recruits/new`.
- Controlling source: Task 09 D2's third door; Brian's 2026-08-28 subject note
  that the club sources people and reaches out, which the four-door framing
  under-serves.
- User-visible result: the recruit exists, is on the board, and `W3` has begun.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue: `/operate/people/new` at
  `main@e669331`, photographed as `W6-01` — the shipped add-a-person form with its
  duplicate check.
- Reused component, language, interaction, and permission patterns: that form
  wholesale, including its dedup-before-create behaviour, which is exactly what
  this door needs and already works.
- Desktop and 375px evidence: `W6-01`, `W6-02` and `W6-03`, both sides,
  measured. `W6-02` is the duplicate check answering on this door; `W6-03` is the
  welcome held for want of opt-in evidence, moved here from `W3` on 2026-08-31
  because operator-add is the door that carries no natural opt-in.
- Reason for any departure from the implemented application: one addition only.
  Task 09 §9.1 is explicit that **operator manual add carries no natural opt-in** —
  a number sourced in conversation was not given by its owner for this purpose —
  so this door must capture opt-in evidence that the other doors get for free.

## Required actions

1. Enter first name, last name and mobile; email optional.
2. See and resolve any possible duplicate before creating.
3. **Record how the club came by this number and that the person expects to hear
   from us** — this door's opt-in evidence.
4. Optionally record the source and a first note while it is fresh.
5. Save; `W3` fires.

## State transitions

Person minted or linked. Prospect created at `identified`. `W3` fires.

## Handoffs

- To `W3` on save; to `W8` when a duplicate needs more than this screen; to `W1`
  and `W2`.

## Dependencies and mission boundaries

- **Mission 5 / add-or-link and dedup:** this mission's side is the recruitment
  wrapper and the opt-in capture; Mission 5's side is the person-creation form and
  the duplicate check, both shipped. Independently walkable.
- **Mission 8 / consent:** this mission's side is the evidence; Mission 8's side is
  what it must say. Non-blocking.

## Exceptions and recovery

- **The person already exists.** Link rather than create — Mission 5's
  add-or-link path, unchanged.
- **They already hold a membership.** They are a player, not a recruit. Say so and
  refuse, rather than creating a prospect beside a membership.
- **They are already a recruit this season.** The unique constraint on
  `(person_id, season_id)` refuses it. Offer their record instead of an error.
- **No opt-in evidence.** The recruit is created; the welcome does not fire, and
  the record says why.

## Safety, privacy, consent, and authority boundaries

- This is the one door where cold-messaging is a real risk. Meta requires
  documented opt-in before the first business message and GDPR requires a lawful
  basis; the evidence captured here is what makes the welcome lawful to send.
- Four-role only. A coach cannot use this door.

## Acceptance evidence

- `grounding: photograph`. `/operate/people/new` both sides at measured 1280px and
  375px.

## Core decisions

| Decision                                          | Classification                | Governing evidence or recommended default                                          | Status  |
| ------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------- | ------- |
| Sourcing is a first-class door, not a fallback    | `locked`                      | Brian, 2026-08-28                                                                  | Settled |
| Dedup-before-create runs here as at every door    | `locked`                      | Task 09 D7                                                                         | Settled |
| This door captures explicit opt-in evidence       | `locked`                      | Task 09 §9.1                                                                       | Settled |
| The evidence is one required sentence plus a tick | `proposed for owner approval` | Free text alone is unauditable; a tick alone records nothing. Recommendation: both | Open    |
| An existing member is refused, not converted      | `proposed for owner approval` | A player is not a recruit; silently creating one would corrupt the funnel          | Open    |

## Brian approval

- Exact words:
- Date:
