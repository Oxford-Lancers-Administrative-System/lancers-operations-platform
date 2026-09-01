# W2 — One recruit's record

- Purpose/intended outcome: everything the club knows about one recruit on one
  working page — their details, every signal, every message, and the notes —
  correctable from there rather than read-only.
- Primary actor: an operator holding the core four authority.
- Trigger: the operator clicks a row on the board, or arrives from a follow-up or
  an event.
- Entry point: the pinned Recruit column on `W1`.
- Route/placement: `/operate/recruitment/[prospectId]`.
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

| Shipped card          | Colour           | Becomes                | What it holds                                                                                                                                         |
| --------------------- | ---------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PERSON`              | slate `#455a64`  | **Person**, unchanged  | Person facts, read-only. Carries the personal questionnaire's sent row.                                                                               |
| `ONBOARDING`          | amber → teal     | **Recruitment**        | Status, came in through, first contact, committed on, whether the recruitment questionnaire was sent, and its six answers — one card, edited in place |
| `ATTENDANCE`          | violet `#4527a0` | **Recruitment events** | The shipped table, reused whole, `Mandatory` dropped                                                                                                  |
| `THEIR OTHER SEASONS` | slate `#455a64`  | **Notes**              | Prose, attributed and dated, with somewhere to write the next one                                                                                     |
| `STATUS HISTORY`      | slate `#455a64`  | **Status history**     | Recruitment's own changes, not membership's                                                                                                           |

**Recruitment and the recruit-stage ask are one card, not two.** Brian,
2026-09-01: _"Recruitment and recruitment questions are one thing."_ `W2` was
approved with them as two cards, teal and blue; they merge, keeping the teal.
Each questionnaire's sent row sits with the questions it asks, not together on
one card: _"The personnel questions sent should be with the personnel
questions. The recruitment questions should be with the recruitment
questions."_ Personal-sent is on the Person card; recruitment-sent is on the
Recruitment card.

**The Person card carries no `Open the person record →`.** Brian, 2026-09-01,
on the shipped card this one clones: _"that shouldn't be something that they do
here."_ A person fact is corrected from Mission 5's own record, reached the way
`W1`'s person columns already route there, not from a link on this card.

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

## The actions

**Two buttons, top right — one per questionnaire.** Brian, 2026-08-31: _"There
are two questionnaires... There's one for the personal, and there's one for the
recruitment."_ So `SEND PERSONAL QUESTIONNAIRE` and
`SEND RECRUITMENT QUESTIONNAIRE`, each opening its own dialog, which is why the
dialog never has to ask which one. They wrap onto their own lines at 375px.

**Not links in card headers.** Brian struck the previous build,
which put four text links in card headers — _"The UI elements for asking this are
not very good. They're hidden... Everything we've changed on the person, you've
done too much."_ The button is the application's own contained button, cloned.

**The flip is not a button here.** Brian: _"It doesn't happen on this page. It is
something that happens on a status change, not a button."_ So `W14` is reached by
changing the status, which interrupts with its confirmation, and `W13` likewise.

**The dialog** (`W2-03`) confirms the one questionnaire its button chose, and
shows **when it was last sent**, because the point is not bothering someone twice: _"here are the
last times we've sent them a questionnaire, because we don't want to bug them
that many times."_ Where one has already been answered, it says so.

Every message is a **Meta-approved template** — `src/lib/delivery/config.ts:168`,
_"`template` is the only production shape"_ — so the dialog chooses a template
and fires it. There is no composer anywhere in this mission and nothing to type.

**The send record is embedded, not a card.** A quiet line at the foot of the
Person card and the Recruitment card lists the dates that questionnaire went
out — _"it should be embedded. It should just be a list of what dates they were
sent on."_ The full history of sends lives in the **audit**, the `STATUS HISTORY`
card, alongside every other change: _"What we've sent should just be part of the
audit to see what was there."_ The separate `WHAT WE HAVE SENT` card is gone.

`W2-02` and `W2-03` build the record from one shared function, so the page behind
the dialog cannot drift from the page without it.

## Where SEND goes

Pressing SEND is the **handoff to `W4`**, which both specifications already
stated: `W2`'s handoffs say _"To `W4` to send or resend the ask"_, and `W4`'s
trigger is _"the end of W3's ladder, or an operator sending or resending the ask
from `W2` or `W9`"_.

So `W2` owns the decision to send and the record of it; `W4` owns everything
after — the WhatsApp template going out, the signed link at `/a/[token]`, the
form the recruit opens, the reminder, and the answers coming back. The dialog
needs no destination of its own: it closes, and what changes is `W2`'s own state
— the send line at the foot of the card, the `Questionnaire sent` row, and a new
line in the audit with its delivery state.

**One correction owed to `W4`:** its trigger still names _"the end of `W3`'s
ladder"_, and `W3` was removed on 2026-08-31. That trigger is now `W10`'s ladder.

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
  proposed route `/operate/recruitment/[prospectId]` does not exist on `main`, and
  every frame says so rather than printing a route that is not there.
- `W2-03` carries the sign-on ladder, moved here from `W3` on 2026-08-31.
- The duplicate Recruit chip visible on the current side is a defect this mission
  found and this page does not reproduce.

## Core decisions

| Decision                                                     | Classification                | Governing evidence or recommended default                                                                  | Status  |
| ------------------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------- | ------- |
| The recruit's page is its own surface, not the person record | `locked`                      | Task 08 amendment 2026-08-27 item 4                                                                        | Settled |
| Person facts render read-only and route out                  | `locked`                      | Same amendment; Mission 5 owns correction                                                                  | Settled |
| Signals are dated facts with a source, never scored          | `locked`                      | Task 09 D9; the 8/5 schema comment                                                                         | Settled |
| Four recruitment cards as above                              | `proposed for owner approval` | Drawn from the boundary's signal and notes items; Recruitment and the recruit-stage ask merged, 2026-09-01 | Open    |
| Notes carry an author and a timestamp                        | `proposed for owner approval` | Brian made notes first-class; an unattributed note is not evidence                                         | Open    |
| The page survives the flip and stays readable                | `proposed for owner approval` | Recruitment history is not deleted because somebody joined                                                 | Open    |

## Added after approval — `W2-04`, and it needs Brian's word

`W9` was folded on 2026-08-31 and its one surviving screen came here: the product
**refusing** to message a recruit who has declined.

### One fact, three places — Brian, 2026-08-31

> "W2-04 should not be a pop-up or whatever. That should be a status at the very
> top where they said no to the WhatsApp... If you click that, then the pop-up
> comes up, but it should be somewhere. Figure out how to get it ingrained."

A dialog that appears only when you try is a trap: you find out at the moment you
act, and only if you act. So the fact is stated three times, in descending order
of how hard it is to miss:

1. **A banner at the top of the record**, above the first card, in the
   application's own `MuiAlert` — the one the record already renders for its
   outstanding-items line: _"**The club will not message Ambrose.** He declined
   on 2 May 2026. Change his recruitment status if that is wrong."_
2. **The send buttons are disabled**, so the refusal is visible rather than
   discovered.
3. **The dialog**, for the operator who pressed anyway. It is no longer the
   announcement — it is the answer at the moment of action.

None of the three is the only place the fact lives. There is deliberately no
_send anyway_: under templates-only there is nothing to compose and nothing to
override, so the only way to message him again is for his status to stop being
`declined`.

### The question underneath it, unanswered

Brian said _"where they said no to the WhatsApp"_, and that may be a **different
fact** from `declined`:

| Fact                      | Means                                                            |
| ------------------------- | ---------------------------------------------------------------- |
| `declined`, a ladder rung | They are not joining the club                                    |
| Said no to WhatsApp       | Do not reach them on that channel — they may still be interested |

The mission records only the first today. A recruit who is keen but will not take
WhatsApp messages has nowhere to be recorded, and one who declined the club is
assumed to refuse contact too. They come apart in practice: _"not this term, ask
me in Hilary"_ is the never-harsh case and refuses no contact at all.

The banner is built to carry **either** cause — one derived question, _may we
message this person?_, with the reason named underneath — so nothing here has to
change if the answer is "they are separate". But **whether to record the second
fact is Brian's, and unanswered.** It would be a new field on the recruit and it
would touch `W1`'s columns and the questionnaire.

**`W2-04` arrived after the approval recorded below.** It is noted here rather
than by reopening the workflow, because the ledger's ordering rule makes
reopening an earlier workflow invalidate every later approval — `W4` through `W8`
would all have fallen over.

## Brian approval

- Exact words: _"Okay, no, fine. Leave a note here that I'm going to want to
  update the button placement because you can't seem to figure out where I want
  to put it. Fine. It's approved. W-2 is approved. I can't spend any more time on
  this."_
- Date: 2026-08-31

### The approval carries a reservation, and it is not settled

**Button placement is explicitly open.** Brian approved this workflow while
saying he intends to change where the two send buttons sit. The current
placement — two contained buttons in the top right, wrapping at 375px — is what
he accepted **to stop spending time**, not what he wants. Three arrangements were
tried and struck before it: card-header action links (_"hidden... you've done too
much"_), one button for two questionnaires, and the flip and follow-up as further
actions (_"No, fuck that"_).

Do not treat the placement as decided, and do not defend it. When he returns to
it, move it.

## Still open on this workflow

1. **Button placement**, above.
2. **The events card is violet** `#4527a0` here, the shipped `ATTENDANCE`
   colour, while `W1`'s approved event bands are blue `#0b3d91`. Making them
   consistent changes approved work and needs his word.
3. **Does channel presence render on this record at all?** `AM-presence` and
   `T08-row8` moved here when `W3` was removed and both say it does, while
   `On WhatsApp` was struck from the board as not a recruit field.
4. **`W3`'s five decisions** now sit in `W10` and `W2`; he has not confirmed
   those homes.
