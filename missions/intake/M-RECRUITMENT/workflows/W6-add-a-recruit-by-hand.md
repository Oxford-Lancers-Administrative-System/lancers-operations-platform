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

## The screens

Two, reduced from three on 2026-08-31.

| Screen  | What it is                                                                                     |
| ------- | ---------------------------------------------------------------------------------------------- |
| `W6-01` | The shipped add-a-person form, reading as recruitment, with an Academic section added beneath. |
| `W6-02` | The shipped duplicate check, driven and photographed rather than drawn.                        |

### The form carries more than a name and a number

Brian, 2026-08-31: _"I think we can add more personal details about them here...
At the minimum, we need the name, first name, last name, and phone number. And
then maybe the other details underneath it."_

The four shipped fields — first name, last name, mobile, personal email — stay as
they are. Beneath them sits an **Academic** section holding College,
Matriculation year and how the club came by the number. Those are the person
record's own fields, in the order `MISSING_FILTER_FIELDS` lists them, and the
shipped person-edit form already groups the first two under a section of exactly
that name. They are text inputs because that is what this product uses for them.

**The opt-in is a field, not a callout.** Task 09 §9.1 says an operator adding
somebody by hand has no natural opt-in, so this door must capture one. An earlier
draft explained that in an amber panel; a control captures it, a panel only talks
about it. It is a fixed set and should render as a select — none exists on this
route to clone, so its options are listed instead.

### `W6-02` shows the check the form already performs

An earlier draft drew a refusal panel on top of it — Brian: _"I don't understand
at all what W6-02 is doing."_ The screen now fills the shipped form with somebody
already in the club, presses the application's own `CHECK FOR DUPLICATES`, and
photographs the answer: two candidates with their match reasons and a
`THIS IS THEM` on each.

This is also the answer to the condition Brian attached to `W5`. **This** door has
the duplicate check; the walk-up door deliberately has none.

### `W6-03` was deleted rather than redesigned

It was a callout for "we cannot get in contact with them". Brian: _"W6-03 seems
rather ungrounded... I'm not sure if this should be a whole separate callout...
I'm looking for recommendations."_ The recommendation, which he accepted, is that
a callout adds a third place to say something two shipped surfaces already say:

1. **The board's `Contactable` column** — no mobile means no indicator, on the
   surface where an operator scans everybody.
2. **Missing data** (`/operate/people/missing`) — already in the Administration
   navigation, already filtering by `mobile`, and already the route "for an hour
   spent usefully".

The consequence — no welcome went out — is already on the recruit's record as
`Questionnaire sent: not sent` and in the audit.

**Offered and not taken:** making the board's `Contactable` cell read
`No way to reach them` in grey when both are missing. One cell, no new surface.
It stays available if Brian wants the absence stated rather than implied.

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
