# LAN-353 batch 7 — visual evidence

Captured on the batch branch `feat/lan-353-batch-7` at `ddc6c7a6`, against the
local stack, through the real application login, at the two required viewports
— desktop 1440×900 and a **measured** 375×812 phone, taken from the browser
context by `npm run visual:preflight` rather than from a resized window.
Nothing here is hosted data: every person and event shown is the local
synthetic seed.

Each pair is `desktop-*.png` and `phone375-*.png` of the same route.

## LAN-420 — response progress by capacity

`LAN-420/desktop-operator-event-page.png`, `phone375-operator-event-page.png` —
the operator's own page for **Freshers' Fair — stand**, an approved recruitment
event whose audience carries all three of recruits, players and coaches. The
top of the page is three blocks, in Stewart's order:

| Block    | Yes     | No  | Bar                     |
| -------- | ------- | --- | ----------------------- |
| Recruits | 0 / 8   | 0   | red — 0 % have answered |
| Players  | 28 / 35 | 5   | green — 94 %            |
| Coaches  | 1 / 2   | 1   | green — 100 %           |

Committee has no block, because nobody was invited in that capacity. **Showed /
Invited** reads `8 / 45` below the Audience and distribution section, and the
register panel is below that — both unchanged in content, both moved.

`LAN-420/desktop-event-info-link-page.png`, `phone375-event-info-link-page.png`
— the public Event info link page for **Practice — hilary week 6**, which has
players and coaches and no recruits. The same two blocks lead the page, the same
component; the Invited / Said yes / No row LAN-384 put there is gone, and
`— / 41` Showed sits below the facts. At 375 px the blocks stack one per row.

## LAN-414 and LAN-416 — audiences by category

`LAN-414/desktop-audience-categories.png`,
`phone375-audience-categories.png` — **Build event audience** on a draft game.
Five collapsible headers in the roster board's band idiom: **General**, open,
with its six baseline pills and each one's count; then **Coaching
assignments**, **Warmup assignments**, **Special teams** and **Recruits**,
folded, each carrying the number of its own pills that are currently lit. At
375 px the whole picker is one column and the pills wrap.

The same pair is LAN-416's evidence: the **Recruits** header is on a _game_
event, which is the whole of the change, and the candidate list below carries
open recruits — _Barnaby Quince · Recruit · Identified_, _Cassius Thorne ·
Recruit · Engaged_ — on an event type that until now offered none at all.

**What these do not show.** The pills inside the four folded categories are
behind a press, and `visual:preflight` navigates and screenshots rather than
driving the page. Every one of them, its label and who it resolves to, is proved
by `src/lib/services/audience-selection.test.ts`, and the template editor's own
screen test opens each category in turn.

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
form. It is proved by `src/app/onboarding/[token]/actions.test.ts` and
`screens.test.tsx`.

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
