# LAN-353 batch 7 — visual evidence

Captured on the batch branch `feat/lan-353-batch-7` — everything but LAN-414,
LAN-420 and LAN-421 at `ddc6c7a6`, and those three **re-taken at `de9b3bd4`**
after round 3 — against the local stack, through the real application login, at
the two required viewports: desktop 1440×900 and a **measured** 375×812 phone,
taken from the browser context rather than from a resized window. Nothing here
is hosted data: every person and event shown is the local synthetic seed.

Each pair is `desktop-*.png` and `phone375-*.png` of the same route.

Round 3's pairs were taken by a throwaway Playwright script doing exactly what
`npm run visual:preflight` does — the same real login, the same two viewport
sizes, each width read back from the browser context and printed (`desktop:
1440px`, `phone375: 375px`) — with the clicks three of them need before the
shutter: two tick boxes for the ticked picker, and one field opened for the kit
picker. Same mechanism, one interaction earlier.

**The head counts moved since round 2.** The widest group reads 40 where it read
39 and the players group 38 where it read 37, against a freshly reset and
reseeded database on this head. Neither this round's changes nor anything in
the pictured behaviour depends on the figures; they are what the seed holds
now.

## LAN-420 — response progress by capacity (round 3)

`LAN-420/desktop-operator-event-page.png`, `phone375-operator-event-page.png` —
the operator's own page for **Freshers' Fair — stand**, an approved recruitment
event whose audience carries all three of recruits, players and coaches. The
top of the page is three blocks, in Stewart's order:

| Block    | Value line           | Bar                                           |
| -------- | -------------------- | --------------------------------------------- |
| Recruits | `0 yes · 0 no / 8`   | pale end to end — nobody has answered         |
| Players  | `28 yes · 5 no / 35` | green 28, a pale gap of 2, red 5 at the right |
| Coaches  | `1 yes · 1 no / 2`   | green half, red half, no gap                  |

Every block carries the one label **Said yes · Said no / Invited** under its
value. Committee has no block, because nobody was invited in that capacity.

**Both of Brian's walk changes are in this pair.** The two stacked metrics of
round 2 are one value line, and the bar is three segments at their true widths
with **no colour gate**: the Players bar is not "green because 94 % answered",
it is 28 green, 2 pale and 5 red, and the pale gap is the two people still to
chase. The Coaches bar is the clearest reading of why the gate went — everybody
has answered and half of them said no, which round 2 painted entirely green.

There is **no Showed / Invited card anywhere on the page**: below Details and
Audience and distribution comes **Attendance is open** — the register panel,
which is where attendance is recorded and which this kept.

`LAN-420/desktop-event-info-link-page.png`, `phone375-event-info-link-page.png`
— the public Event info link page for **Practice — hilary week 6**, which has
players and coaches and no recruits. The same blocks lead the page, from the
same component, in the same words: `16 yes · 6 no / 39` and `2 yes · 0 no / 2`.
The Invited / Said yes / No row LAN-384 put there is gone, and **so is Showed**,
which round 2 left standing here; between the blocks and the table there is now
the Details section and nothing else. At 375 px the blocks stack one per row and
no value line wraps.

## LAN-421 — Player-Owned on the five required kit items (round 3)

`LAN-421/desktop-record-kit-player-owned.png`,
`phone375-record-kit-player-owned.png` — a membership record with the **KIT**
band open and the **Practice Jersey** field's own picker open on top of it. The
options read _not recorded_, Blue, White, Red and **Player-Owned**, in that
order: the value is last, after the club's own values, exactly as it is on each
of the other four required items. Practice Jersey is the one shown because its
list is short enough that the whole picker, and so the value's position at the
end of it, is in one frame; Helmet and Shoulder Pads carry it in the same place
on lists of ten and twenty-eight.

These two are viewport shots rather than full-page ones, because the picker is
a menu positioned against the field and a stitched full-page capture does not
place it where a reader sees it.

**What these do not show.** That the value is on those five items and on no
other, and that Kit Distributed reads complete on five Player-Owned values and
pending on four, are proved by
`src/lib/services/roster-board.test.ts` — "counts Player-Owned toward Kit
Distributed on all five, and pending on four — LAN-421" — against the real
trigger. The mirror test in the same file proves the picker's list and
`kit_item_options` agree, in order, so what the migration inserted is what the
screenshot shows.

## LAN-414 and LAN-416 — the picker is checklist bands (round 3)

`LAN-414/desktop-audience-picker-bands.png`,
`phone375-audience-picker-bands.png` — **Build event audience** on a draft
game, as it opens. The pills are gone. Every category is a folding band in the
roster board's own idiom and colours: **General** and **Coaching assignments**
open, **Warmup assignments**, **Special teams** and **Recruits** folded.
Coaching assignments folds again into its own three bands — **Coaching
groups**, **Offensive position groups**, **Defensive position groups** — each
folding separately and each in its own board colour. Every group is a tick-box
row with its head count and, at the right, what it would add: `adds 40`,
`adds 38`, `adds 9` and so on. The sticky line at the top reads **0 groups ·
0 people**, and the resolved-people list below the picker is unchanged. At
375 px the whole picker is one column and every row keeps its count and mark.

**This round's change is in the first two rows of General**, which now read
**Whole club** — 40, `adds 40` — and **All roster players** — 38, `adds 38`.
Round 2's "Everyone active and onboarding" and "Active and onboarding players"
are gone: the labels name the size of each group rather than the membership
rule inside it, which is unchanged.

`LAN-414/desktop-audience-picker-ticked.png`,
`phone375-audience-picker-ticked.png` — the same screen with **All roster
players** and **Defense** ticked. Read the row above the first one: **Whole
club** is _not_ ticked and reads **adds 2**. That is the whole of Brian's
earlier finding — under the pills, pressing the players group lit everything it
swallowed; here nothing moved but the row that was ticked, and the overlap is a
number. The rows the selection already covers say **Included** (All active
committee, Onboarding, All Active BPS, and every offensive and defensive
position group); the two ticked rows say **Selected**; each band head says
**1 chosen**; the sticky line reads **2 groups · 38 people**; and the review
button at the foot reads **Review 38 selected**.

`LAN-414/desktop-template-default-audience.png`,
`phone375-template-default-audience.png` — the **Practice** template's default
audience, the second surface that chooses a group. The same component, the same
bands, the same renamed labels and the same head counts to the person — 40, 38,
3, 10, 6, 5 — which is why the template pages read the current season's
catalogue (docs/ux/standards.md rule 7) rather than a list of their own.

The bands pair is also LAN-416's evidence: the **Recruits** band is on a _game_
event, which is the whole of that change, and the candidate list below carries
open recruits — _Barnaby Quince · Recruit · Committed_, _Cassius Thorne ·
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

## The mint control — hidden while a code is live (Brian, 2026-09-23)

`mint/desktop-recruitment-qr.png`, `mint/phone375-recruitment-qr.png` —
**Sign-up code** with a live code on it. There is **no mint button anywhere on
the page**: the code, its address, the generated share card, **DOWNLOAD** and
the clipboard control beside it, `0 sign-ins this season` and **Minted 23 Sept
2026, 15:27** are all still there, and the control that replaced the code is
not. That is the whole change — a printed QR cannot be replaced by a stray
press.

**The pair proves the other state too.** The seed carries no sign-up code, so
the desktop run opened the page on **No live code yet**, pressed **MINT CODE**
— still on the page, which is how a first code is issued — and shot the result.
The script printed `mint controls on the page: 0` at both widths after the
code existed. The phone run found the code the desktop run had minted and
pressed nothing.

Taken the same way as round 3's pairs: a throwaway Playwright script doing what
`npm run visual:preflight` does — the same real application login, the same two
viewports read back from the browser context (`desktop: 1440x900`,
`phone375: 375x812`) — against a production build on the local stack, with this
change applied on top of `4ce252f7`. Everything shown is the local synthetic
seed.

Both states are held still without a browser by
`src/app/operate/recruitment/qr/screens.test.tsx`.
