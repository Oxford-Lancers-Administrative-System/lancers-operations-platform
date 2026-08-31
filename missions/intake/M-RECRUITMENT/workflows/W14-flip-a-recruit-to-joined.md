# W14 — Flip a recruit to joined

- Purpose/intended outcome: one of the core four decides a recruit is in, and that
  one decision creates the season membership, puts them on the roster, and opens
  onboarding.
- Primary actor: President, Vice President, Secretary or General Manager. Nobody
  else, ever.
- Trigger: the club agrees they are in, normally out of a Monday conversation.
- Entry point: the status cell on `W1`, or the status on `W2`.
- Route/placement: an interruption on the surface where the decision is made.
- Controlling source: Task 09 D5 and D6; Brian's 2026-08-31 ruling on its shape.
- User-visible result: they are on the roster as joined for this season, they are
  in onboarding, and they are off the recruit board.

## Brian's shape, 2026-08-31

_"When it flips to 'Join,' there should be a pop-up that comes up… 'Join' means
these people are being officially added to some season, right? Do that, yes. When
they hit 'Join,' something should happen on the roster page so we can see that
they're now joined, they joined this season, and they're moved on to Onboard and
they're now in the next steps."_

Four things, and all four are settled:

1. The status change to `joined` **interrupts** rather than committing silently.
2. `joined` **means** a season membership exists — it is not a label.
3. The **roster** shows them, joined, this season.
4. **Onboarding opens**, and they are in the next steps.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue: `/operate/roster` at
  `main@e669331`, photographed as `W14-02` — the roster the flipped recruit lands
  on. `W14-01`, the interruption itself, is drawn: no confirmation of this kind
  exists in the application.
- Reused component, language, interaction, and permission patterns: the roster's
  own membership rows and status ladder; the application's dialog language.
- Desktop and 375px evidence: `W14-01` drawn at both widths; `W14-02` photographed
  both sides.
- Reason for any departure from the implemented application: the schema already
  binds `converted` to a real membership for the same person and the same season
  through two composite foreign keys, so reaching `joined` already requires the
  process. What is missing is a human moment around it, which is what Brian asked
  for.

## Required actions

1. Change the status to `joined` from the board or the record.
2. **Be interrupted**: told what is about to happen — a membership created for this
   season, a roster row, onboarding opened — and asked to confirm.
3. Confirm, or cancel with nothing written.
4. Land somewhere that shows it worked.

## State transitions

One transaction: prospect → `joined`, season membership created in the
`onboarding` status of Mission 5's rebuilt ladder, roster row appears, onboarding
opens, audit written. All of it, or none of it.

**On the team is not active.** Activation is a separate later human gate at the end
of onboarding and is Mission 7's. This workflow never produces an active member.

## Handoffs

- To Mission 7, at its entry state: membership exists, on the roster, onboarding
  open, not active.
- To Mission 5's roster, which renders the result.
- From `W1` and `W2`.

## Dependencies and mission boundaries

- **Mission 7 / onboarding:** this mission's side is the flip and the state it
  hands over; Mission 7's side is everything after it. The seam is the single most
  important one in the mission and it is a clean one — Task 09 §4 fixes the entry
  state precisely. Independently walkable.
- **Mission 5 / the roster and membership:** this mission's side is creating the
  membership; Mission 5's side is the roster that shows it and the status
  vocabulary it uses. Independently walkable.
- **Mission 11 / seasons:** the membership is created in the one open season. No
  season is created here. Independently walkable.

## Exceptions and recovery

- **They already hold a membership this season.** Invariant I2 refuses it. Say so
  plainly rather than failing.
- **Missing information.** Never blocks the flip — Task 09 D5 and invariant 4.
  Whatever was not collected becomes onboarding's work.
- **It was wrong.** Reversal is a leadership discussion and moves the membership to
  inactive — an audited state change, never a deletion, Task 09 D6. The recruit
  record survives and says what happened.
- **The operator cancels the interruption.** Nothing is written. The status stays
  where it was.
- **Somebody without authority tries.** Refused, naming the required role, exposing
  nothing.

## Safety, privacy, consent, and authority boundaries

- Four roles only. This is the single most consequential action in the mission and
  its authority is the narrowest.
- Fully audited: who flipped, when, from what status, into which season.
- No duplicate check at the flip — Task 09 D7 is explicit. The person has existed
  for weeks; the only guard is invariant I2.

## Acceptance evidence

- `W14-01` `grounding: code-only`, drawn — no such confirmation exists.
  `W14-02` `grounding: photograph`, the roster at measured 1280px and 375px.

## Core decisions

| Decision                                                   | Classification                | Governing evidence or recommended default                                                             | Status  |
| ---------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------- | ------- |
| The flip is the four roles only, one audited action        | `locked`                      | Task 09 D5; invariant 3                                                                               | Settled |
| It interrupts rather than committing silently              | `locked`                      | Brian, 2026-08-31                                                                                     | Settled |
| `joined` means a season membership exists                  | `locked`                      | Brian, 2026-08-31; the schema already binds it                                                        | Settled |
| The roster shows them joined this season; onboarding opens | `locked`                      | Brian, 2026-08-31                                                                                     | Settled |
| On the team is not active                                  | `locked`                      | Task 09 D5; R2 acceptance                                                                             | Settled |
| Missing information never blocks it                        | `locked`                      | Task 09 D5; invariant 4                                                                               | Settled |
| What the interruption actually says                        | `proposed for owner approval` | Recommendation: name the three consequences and the season, and nothing else                          | Open    |
| Where the operator lands afterwards                        | `proposed for owner approval` | Recommendation: stay on the board, with a confirmation naming the roster. Recruitment's job continues | Open    |

## Brian approval

- Exact words:
- Date:
