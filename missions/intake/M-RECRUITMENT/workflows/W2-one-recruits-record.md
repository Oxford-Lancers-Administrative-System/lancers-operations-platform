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

Every card is a **shipped card from `/operate/roster/[membershipId]` with its
content replaced**. Brian, 2026-08-31: _"The pages underneath should be very
similar to the roster in the way that it's done, except it's the recruit player
page, not the roster player page… We shouldn't invent UI elements here."_

| Shipped card          | Colour           | Becomes                   | What it holds                                                          |
| --------------------- | ---------------- | ------------------------- | ---------------------------------------------------------------------- |
| `PERSON`              | slate `#455a64`  | **Person**, unchanged     | Person facts, read-only, keeping its own `Open the person record →`    |
| `ONBOARDING`          | amber → teal     | **Recruitment**           | Status, came in through, first contact, committed on — edited in place |
| `SEASON · 2026-27`    | blue `#0b3d91`   | **The recruit-stage ask** | Whether it was sent and answered, and the six answers                  |
| `ATTENDANCE`          | violet `#4527a0` | **Recruitment events**    | The shipped table, reused whole, `Mandatory` dropped                   |
| `THEIR OTHER SEASONS` | slate `#455a64`  | **Notes**                 | Prose, attributed and dated, with somewhere to write the next one      |
| `STATUS HISTORY`      | slate `#455a64`  | **Status history**        | Recruitment's own changes, not membership's                            |

The events card matters most: it already ships as a table of
`Event · Date · Mandatory · RSVP · Attendance · Event status`, the exact treatment
Brian approved for the board the same day, so it is reused whole rather than
rebuilt. `Mandatory` goes because a recruit has no mandatory events.

**It is clearly under recruitment.** Recruitment is selected on the left, the
line under the name reads `Recruitment · 2026-27`, the route is
`/operate/recruitment/<recruit>`, and the button at the foot reads
`BACK TO RECRUITMENT`.

### What was struck

- **`What we have seen`** — the signal card, gone with the signal abstraction:
  _"let's just make events events."_ Its job is now the events table.
- **`What we have said`** — in the drafts this was never a messages card. It was
  the player's own 53-row attendance table with a renamed heading, from the
  silent `rebuildCard` failure, which is what Brian saw as _"two invite sections
  in W2-01"_. `W9` owns follow-ups and `W10` owns the machinery.
- **`On WhatsApp`** — not a recruit field. See the open question below.

## The screens

Two, reduced from three on 2026-08-31 after Brian found the others unreadable —
_"W2-02 seems to be not recruitment… I'm not sure what it's doing"_ and _"W2-03
has a fair amount of narration. I do not know what this section is trying to show
me."_

| Screen  | What it is for                                                                                                                     |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `W2-01` | The page at its emptiest — Rosalind Penhaligon, identified, ask unsent. The normal top-of-funnel case.                             |
| `W2-02` | The page with something on it — Tobias Wrenfield: ask answered in his own words, two events attended, notes, status open for edit. |

`W2-02` exists because `W2-01` alone would only ever show the ask as seven rows
of `Not answered`, and would assert editing without showing it. Brian: _"I should
be able to make edits and updates… I should see when they fill out information. I
should be able to fill in my own information where it makes sense."_ One screen
covers both. The deleted `W2-03` was the sign-on ladder moved here from `W3`;
`W3` has since been removed outright and its decisions rehomed.

## The actions, and where each one sits

W2 lists six required actions. The first build of these screens afforded one, so
the page read well and did almost nothing. Brian, 2026-08-31: _"There should be
buttons there to do that… it should be on the [recruit] member page itself. I
should be able to click on it and say, 'Oh, I want to send out this.'"_

Each action sits on the card it belongs to, using the header-action slot the
record **already ships** — the same slot that renders `Open the person record →`
on `PERSON`. The link is cloned from the shipped one, so nothing is drawn.

| Action                                   | Card                | Reads                                                        |
| ---------------------------------------- | ------------------- | ------------------------------------------------------------ |
| Open the person record (Mission 5)       | `PERSON`            | `Open the person record →`                                   |
| Send Questionnaire A, who you are (`W4`) | `PERSON`            | `Ask them for their details →`                               |
| Send Questionnaire B, football (`W4`)    | `QUESTIONNAIRE`     | `Send the questionnaire →`, or `Send a reminder →` once sent |
| Flip to joined (`W14`)                   | `RECRUITMENT`       | `Flip to joined →`                                           |
| Follow up (`W9`)                         | `WHAT WE HAVE SENT` | `Follow up →`                                                |
| Take off the board (`W13`)               | `RECRUITMENT`       | The status select itself                                     |

**Questionnaire A's action is on `PERSON` deliberately.** Its answers are person
facts, so the operator asks for them from the card those facts live on, and the
answers land there rather than in the questionnaire card. `QUESTIONNAIRE` holds
Questionnaire B alone, which is why its rows are the football ones.

## What we have sent, and what is due next

A seventh card, cloned from a shipped banded card. Brian, 2026-08-31: _"When
somebody gets recruited on board, we need to be able to tell when those things
get sent out to them."_

It lists every message the club has sent this recruit with its date and delivery
state, then, below a rule, **what is due to go out next**. `W10` defines what
"due next" means — the ladder, its triggers and its offsets; this card is where
one recruit's answer is read. On `W2-01` nothing is scheduled and the line says
so; on `W2-02` the welcome, both sends of Questionnaire B and an event invitation
are listed, with Questionnaire A still unsent.

## Open question inherited from W3's removal

`AM-presence` and `T08-row8` moved here when `W3` was removed. Both say channel
presence — is this person on WhatsApp and in this season's group — is **rendered
on the record**. On the same day Brian struck `On WhatsApp` from the **board** as
not a recruit field, and neither screen carries such a row.

**Does channel presence appear on a recruit's record at all, and if so where?**
Unanswered, and Brian's to settle.

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
