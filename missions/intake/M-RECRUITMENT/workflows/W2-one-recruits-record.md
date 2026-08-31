# W2 — One recruit's record

- Purpose/intended outcome: everything the club knows about one recruit on one
  working page — their details, every signal, every message, and the notes —
  correctable from there rather than read-only.
- Primary actor: an operator holding the core four authority.
- Trigger: the operator clicks a row on the board, or arrives from a follow-up or
  an event.
- Entry point: the pinned Recruit column on `W1`.
- Route/placement: `/operate/recruits/[prospectId]`.
- Controlling source: Task 09 D4 and D9; Brian's 2026-08-28 note that clicking a
  row opens that recruit the way clicking a player opens their record; Task 08's
  2026-08-27 amendment, which keeps recruitment facts off the person record.
- User-visible result: one page carrying the whole recruit, with the person half
  routing out to Mission 5 and the recruitment half editable here.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue:
  `/operate/roster/[membershipId]` at `main@e669331` — the player record —
  photographed as `W2-01` against seeded synthetic data. Brian rejected
  `/operate/people/[personId]` on 2026-08-31 (_"It does not come from the people
  workflow"_) and accepted the player record shell; this specification is
  corrected to say what was actually photographed.
- Reused component, language, interaction, and permission patterns: the person
  record's card stack — _Who they are_, _How to reach them_, _Academic_,
  _Restricted_, _Where they stand_, _Their seasons_, _What changed_ — its label
  and value rows, its `not recorded` grey, its `CORRECT THIS RECORD` action, and
  its four-role gate.
- Desktop and 375px evidence: `W2-01`, `W2-02` and `W2-03`, both sides, measured.
- Reason for any departure from the implemented application: the recruit's page is
  a new surface because Task 08's 2026-08-27 amendment forbids recruitment facts
  on the person record — Brian: _"There's nothing on here related to recruits…
  It's a person record."_ So this page reuses that page's shell and adds the cards
  the person record may not carry.

## The cards

1. **Who they are · How to reach them · Academic** — the person record's own
   cards, rendered read-only with one link out to the person record. Correcting a
   person fact is Mission 5's job and costs Mission 5's rules.
2. **Where they are in recruitment** — new. The status with its ladder colour and
   its history, the source door, first contact, and the committed date where one
   exists.
3. **What we have seen** — new. Every signal as a dated fact with a source: the
   welcome delivered, the group joined, the ask answered, each event invited,
   answered and attended. Never a score, never a ranking, never a computed value
   that moves a stage.
4. **What we have said** — new. Every message the club sent this recruit, when,
   through which door it fired, and whether it arrived. This is where `W9`'s
   follow-ups land.
5. **Notes** — new. Prose, first-class, with who wrote each note and when.
6. **What changed** — the person record's own audit card, extended to
   recruitment's own changes.

## Required actions

1. Read the whole recruit without leaving the page.
2. Edit a recruitment fact in place — status, source, first contact, notes.
3. Follow up (`W9`) without navigating away.
4. Open the person record to correct a person fact.
5. Send or resend the recruit-stage ask (`W4`).
6. Take them off the board (`W13`) or flip them (`W14`).

## State transitions

Status is written here as it is on the board, with the same rule: every value
except `joined` is a direct audited change; `joined` is intercepted by `W14`.

## Handoffs

- To the person record for any person fact.
- To `W4` to send or resend the ask; to `W9` to say something; to `W13` and `W14`
  for the exits.
- From `W1`, `W11` and `W12`, which all link here.

## Dependencies and mission boundaries

- **Mission 5 / the person record:** this mission's side is the recruitment cards
  and the notes; Mission 5's side is the person facts and their correction
  machinery. Independently walkable — the person record ships at the baseline.
- **Mission 4 / the transport:** this mission's side is what was said and when;
  Mission 4's side is the delivery record it reads. Independently walkable.

## Exceptions and recovery

- **A recruit with almost nothing recorded.** The normal case at the top of the
  funnel. Every empty field reads `not recorded`; nothing is defaulted.
- **A recruit whose person record was merged.** The page follows the surviving
  person, and the recruitment record follows with it.
- **A recruit who has already joined.** The page stays readable and states that
  they joined, with a link to their roster record. Recruitment does not delete its
  own history at the flip.

## Safety, privacy, consent, and authority boundaries

- Four-role only. Notes and signals are operator-visible only and never reach a
  coach, a player, or the recruit.
- Date of birth and emergency contact render only where the person record already
  renders them, under the person record's own restriction — never on this page's
  recruitment cards.
- No message is composed from this page without `W9`'s rules applying.

## Acceptance evidence

- `grounding: photograph`. `/operate/roster/[membershipId]` — the player record —
  is the shell, photographed both sides at measured 1280px and 375px. The
  proposed route `/operate/recruits/[prospectId]` does not exist on `main`, and
  every frame says so rather than printing a route that is not there.
- `W2-03` carries the sign-on ladder, moved here from `W3` on 2026-08-31.
- The duplicate Recruit chip visible on the current side is a defect this mission
  found and this page does not reproduce.

## Core decisions

| Decision                                                     | Classification                | Governing evidence or recommended default                          | Status  |
| ------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------ | ------- |
| The recruit's page is its own surface, not the person record | `locked`                      | Task 08 amendment 2026-08-27 item 4                                | Settled |
| Person facts render read-only and route out                  | `locked`                      | Same amendment; Mission 5 owns correction                          | Settled |
| Signals are dated facts with a source, never scored          | `locked`                      | Task 09 D9; the 8/5 schema comment                                 | Settled |
| Five recruitment cards as above                              | `proposed for owner approval` | Drawn from the boundary's signal and notes items                   | Open    |
| Notes carry an author and a timestamp                        | `proposed for owner approval` | Brian made notes first-class; an unattributed note is not evidence | Open    |
| The page survives the flip and stays readable                | `proposed for owner approval` | Recruitment history is not deleted because somebody joined         | Open    |

## Brian approval

- Exact words:
- Date:
