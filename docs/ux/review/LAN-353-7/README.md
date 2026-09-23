# LAN-353 batch 7 — visual evidence

Captured on the batch branch `feat/lan-353-batch-7` — everything but LAN-414
and LAN-420 at `ddc6c7a6`, and those two **re-taken at `d257c305`** after
correction round 2 — against the local stack, through the real application
login, at the two required viewports: desktop 1440×900 and a **measured**
375×812 phone, taken from the browser context by `npm run visual:preflight`
rather than from a resized window. Nothing here is hosted data: every person
and event shown is the local synthetic seed.

Each pair is `desktop-*.png` and `phone375-*.png` of the same route.

One pair is the exception, and says so where it appears:
`LAN-414/*-audience-picker-ticked.png` needed two rows ticked first, and
`visual:preflight` navigates rather than drives a page. It was taken by a
throwaway Playwright script doing what the preflight does — the same real
login, the same two viewport sizes, each width read back from the browser
context and printed (`desktop: 1440px`, `phone375: 375px`) — with two clicks
before the shutter. Same mechanism, one interaction earlier.

## LAN-420 — response progress by capacity (correction round 2)

`LAN-420/desktop-operator-event-page.png`, `phone375-operator-event-page.png` —
the operator's own page for **Freshers' Fair — stand**, an approved recruitment
event whose audience carries all three of recruits, players and coaches. The
top of the page is three blocks, in Stewart's order:

| Block    | Yes     | Said no | Bar                     |
| -------- | ------- | ------- | ----------------------- |
| Recruits | 0 / 8   | 0       | red — 0 % have answered |
| Players  | 28 / 35 | 5       | green — 94 %            |
| Coaches  | 1 / 2   | 1       | green — 100 %           |

Committee has no block, because nobody was invited in that capacity.

**Both of Brian's corrections are in this pair.** The No figure is now a
labelled metric like the pair above it — the number at the same weight with
**Said no** under it, not the word "No" in front of a count. And there is **no
Showed / Invited card anywhere on the page**: below Details and Audience and
distribution comes **Attendance is open** — the register panel, which is where
attendance is recorded and which this correction kept.

`LAN-420/desktop-event-info-link-page.png`, `phone375-event-info-link-page.png`
— the public Event info link page for **Practice — hilary week 6**, which has
players and coaches and no recruits. The same blocks lead the page, from the
same component, with the same **Said no** metric; the Invited / Said yes / No
row LAN-384 put there is gone, and Showed still sits below the facts — Brian's
review took that card off the operator page and left this one standing. At
375 px the blocks stack one per row.

## LAN-414 and LAN-416 — the picker is checklist bands (correction round 2)

`LAN-414/desktop-audience-picker-bands.png`,
`phone375-audience-picker-bands.png` — **Build event audience** on a draft
game, as it opens. The pills are gone. Every category is a folding band in the
roster board's own idiom and colours: **General** and **Coaching assignments**
open, **Warmup assignments**, **Special teams** and **Recruits** folded.
Coaching assignments folds again into its own three bands — **Coaching
groups**, **Offensive position groups**, **Defensive position groups** — each
folding separately and each in its own board colour. Every group is a tick-box
row with its head count and, at the right, what it would add: `adds 39`,
`adds 37`, `adds 9` and so on. The sticky line at the top reads **0 groups ·
0 people**, and the resolved-people list below the picker is unchanged. At
375 px the whole picker is one column and every row keeps its count and mark.

The two General labels read **Everyone active and onboarding** and **Active and
onboarding players**, which is the other half of this round.

`LAN-414/desktop-audience-picker-ticked.png`,
`phone375-audience-picker-ticked.png` — **the correction itself**, the same
screen with **Active and onboarding players** and **Defense** ticked. Read the
row above the first one: **Everyone active and onboarding** is _not_ ticked and
reads **adds 2**. That is the whole of Brian's finding — under the pills,
pressing the players group lit everything it swallowed; here nothing moved but
the row that was ticked, and the overlap is a number. The rows the selection
already covers say **Included** (All active coaches, Onboarding, All Active
BPS, and every offensive and defensive position group); the two ticked rows say
**Selected**; each band head says **1 chosen**; and the review button at the
foot reads **Review 37 selected**.

`LAN-414/desktop-template-default-audience.png`,
`phone375-template-default-audience.png` — the **Practice** template's default
audience, the second surface that chooses a group. The same component, the same
bands, the same three marks and the same head counts, which is why the template
pages now read the current season's catalogue (docs/ux/standards.md rule 7).

The bands pair is also LAN-416's evidence: the **Recruits** band is on a _game_
event, which is the whole of that change, and the candidate list below carries
open recruits — _Barnaby Quince · Recruit · Identified_, _Cassius Thorne ·
Recruit · Engaged_ — on an event type that until now offered none at all.

**What these do not show.** The rows inside the three folded bands are behind a
fold. Every one of them, its label and who it resolves to is proved by
`src/lib/services/audience-selection.test.ts`, and the bands' own colours,
order and nesting by `src/app/operate/events/screens.test.tsx` ("bands every
category, and folds Coaching assignments into three") and the template
editor's `screens.test.tsx`. The overlap arithmetic behind `adds N` and
**Included** — a person in two chosen groups counted once, an empty group never
Included — is proved in `audience-selection.test.ts`.

## LAN-413 — a refused onboarding save is shown on the step

`LAN-413/desktop-details-step-refusal.png`,
`phone375-details-step-refusal.png` — step 1 of a live onboarding link with the
refusal on it: "The club could not record that. Nothing else on this step was
changed. Try again, and tell the club if it keeps happening." The step is still
there underneath, with the trail, the consent box and every field the player
had filled in, which is the whole point: before this, the same refusal was the
generic server error page and the form was gone.

**What these do not show.** The per-field version — a refused contact write
landing as an error on that email or phone rather than on the step — lives in
the form's own `useActionState` slot and is reachable only by submitting the
form. It is proved by two tests in `src/lib/services/player-questionnaire.test.ts`
— "shows an email another record holds against its own field, and saves the
rest" and "saves the step once the refused email is changed to one nobody
holds". `src/app/onboarding/[token]/actions.test.ts` and `screens.test.tsx`
cover the step-level refusal shown above, not the per-field one.

## LAN-412 — Availability is its own roster group

`LAN-412/desktop-record-availability-section.png`,
`phone375-record-availability-section.png` — a membership record with every
group folded except the top ones. **AVAILABILITY** is its own band,
immediately after **MEMBERSHIP 2026-27** and before **COACHING ASSIGNMENTS**,
folding on its own exactly as the LAN-387 groups below it do.

**The board's own band is not here.** `/operate/roster` is 67 columns wide and
the Availability band sits beyond the right edge of a 1440 viewport;
`visual:preflight` measures the viewport and does not scroll a table, so a
screenshot of that route would have shown the Person group and nothing this
issue changed. The record pair above is the band idiom's evidence, and
`src/app/operate/roster/board-columns.test.ts` and `board-screens.test.tsx`
prove the board's group order and its own fold.

## LAN-417 — Event info link

`LAN-417/desktop-event-info-link-panel.png`,
`phone375-event-info-link-panel.png` — the share panel opened on an approved
event. The button in the page header and the panel headline both read **Event
info link**. Two words change and nothing else does: the panel's two clipboard
controls, its one sentence, the issuing, the seven-day expiry and the six-line
share message are all exactly as they were.

## LAN-418 — one shell link is current, the most specific one

`LAN-418/desktop-one-link-current.png`, `phone375-one-link-current.png` —
`/operate/people/missing`, where **Missing data** is lit and **People** is not,
although the second's href is a prefix of the first's. One link current, and it
is the longest match.

## LAN-419 — one Edit event

`LAN-419/desktop-edit-event.png`, `phone375-edit-event.png` — the single **Edit
event** page for an approved event, carrying the amendable details and then the
questions, saved by one press. The event page's own **Edit event** button is
visible in `LAN-420/desktop-operator-event-page.png`, and **Edit questions** is
not there at all.
