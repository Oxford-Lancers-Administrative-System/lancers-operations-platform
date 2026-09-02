# W7 — Sign yourself in

- Purpose/intended outcome: a recruit standing at the Freshers' Fair stand puts
  themselves into the club's system, on the club's own page, and comes out of it
  in the community group.
- Primary actor: the recruit.
- Trigger: they scan a QR code, or open a link the club posted.
- Entry point: the QR on the stand, on a poster, or shared in a message.
- Route/placement: a public page on the club's own domain.
- Controlling source: Task 09 D2's first door; Brian's 2026-08-28 decision that
  the QR points at our own page on our own domain; his 2026-08-31 description of
  the flow and his statement that its detail is still open.
- User-visible result: they are a recruit, they are in the group, and they were
  told if the club already had them.

## Brian's flow, and what is still open

2026-08-31: _"If they sign the QR code, we're going to want them to go to a form.
And then, once they submit the form, they should get a login, basically an invite
to the WhatsApp group. And that's the flow, but I think I want to talk more about
how that works there."_

So the shape is settled — scan, form, submit, group invite — and the detail is
explicitly not. This specification draws the shape and marks every detail decision
open rather than resolving it quietly. Note that "a login" is read here as **the
group invite and the signed link**, not an account: Task 08 §3 fixes that there
are no player logins in Release One, and creating one for recruits would be a
larger decision than this workflow can make. Flagged rather than assumed.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue: **none.** There is no
  public self-entry page on `main`, and the signed-link token tables are empty in
  the seeded dataset. Both sides are **drawn** and labelled `New surface, nothing
to compare`.
- Reused component, language, interaction, and permission patterns: the uniform
  invalid page contract from Task 09 §2.1, the no-login signed-link rules from
  Task 08 §3, and the application's own type and colour.
- Desktop and 375px evidence: `W7-01` and `W7-02`, drawn at both widths. The 375px
  frame is the real one — nobody scans a QR on a desktop.
- Reason for any departure from the implemented application: nothing to depart
  from.

## The flow ends at WhatsApp

Brian, 2026-08-31: _"Is it that once they sign up, they get a link to go to our
WhatsApp when they approve and they send this in?... It should take them to
WhatsApp then. After they do the information, you'll get the sign-in, and then
they go to WhatsApp, right? That's part of W7."_

Yes, and it is the whole point of this door:

1. They scan the QR and land on the club's own page — **the sign-up form, the
   same surface as Questionnaire A.**
2. They leave a name and a way to reach them, and **tick consent to WhatsApp
   messaging.** The tick is a required condition of submitting: first name,
   last name and the tick are the required set; every other field, including
   the rest of Questionnaire A, stays visibly optional. The form cannot be
   saved without it — Brian, 2026-09-01.
3. The saved page reveals the community group link. **Only the tick opens it**
   — the earlier build showed the button unconditionally, before the gate
   existed.

The consent tick, not pressing the WhatsApp button, is `W7`'s **natural
opt-in**, and it is why `W7` carries one and `W6` does not: here the recruit
ticks for themselves; there, an operator types somebody in, and Task 09 §9.1
makes that door ask how the club came by the number. Because the tick is
required to submit, `refused` is not reachable through this door — the
five-value `messaging_consent_state` enum is otherwise unchanged; Brian:
_"I don't think we need to fix the statuses, that's just a comment."_

## The check is one question, asked of the person standing there

Amended 2026-08-31, **after** Brian approved this workflow, on his instruction:

> "We just need to ship something simpler here... If somebody puts in their name,
> first name, last name, and phone number, there should just be a quick check to
> say, 'Hey, have you already registered before?' and see if their name or
> information is there. If they say yes, it says, 'Great,' and then pops them to
> the WhatsApp board. If it's no, it creates it as a new thing. If there's a
> duplicate, then we can go through the deduplication process in the people
> table, and that can be handled there simply."

So the door asks one question and both answers end in the group:

| Answer | What happens                                        |
| ------ | --------------------------------------------------- |
| Yes    | Nothing is created. Straight to the WhatsApp group. |
| No     | Created as a new person. Straight to the group.     |

**This deletes the parked review queue entirely.** The person at the stand is the
one who knows whether they have signed up before, so asking them needs no
operator, no queue, no notification and no surface — which is why the old
`W8-02` is gone.

Anything that still slips through is resolved in **the people table's own merge**,
which already ships at `/operate/people/[personId]/merge` and belongs to Mission 5. This mission does not own merging.

**The form also carries Questionnaire A**, `W4`'s personal-details questions,
on this same surface rather than a later signed link. Its "Known as" answer
writes a `person_aliases` row — there is no preferred-name field anywhere in
the product, and Brian caught the mockup that invented one: _"this is old
information."_

### The one thing this screen must not become

A stranger can type any name. If the page then showed that person's number and
email back, the QR code would be a lookup tool for the club's contact details. So
the match is confirmed only in terms the visitor **already supplied** — a first
name they typed and the last three digits of the number they typed. Nothing is
revealed that they did not already know. This is the same reasoning as the E1
uniform-invalid page in `W4-03`.

## The duplicate check, and what it does not do

Brian: _"The duplicate should be very simple. It should be based on email or
phone number or whatever, and we should just take their contact information
regardless. I think the duplicate check is fine. We'll figure out how to handle
that in production."_

So this door **refuses nobody and blocks on nothing.** It takes what it is given
and reconciles afterwards — the same posture as the walk-up door in `W5`, and the
opposite of the operator-add door in `W6`, which runs the club's full check
because an operator is sitting at a desk rather than standing at a stand.

The earlier draft's separate _"you are already on our list"_ screen is gone.
Signing in a second time is the common case at a second event, so that person
sees the same page and the same way into the group, and nothing reads as an
error.

## Required actions

1. Scan and land on the club's own page, on the club's own domain, which looks
   like the club.
2. Enter first name and last name, required; mobile, email and the rest of
   Questionnaire A stay visibly optional here, unlike the other three doors'
   required mobile — Brian, 2026-09-01: the tick, not the phone number, is
   this door's required set beyond a name.
3. **Tick consent to WhatsApp messaging** — required to submit. Brian,
   2026-09-01: the form cannot be saved without it.
4. **Be told if the club already has them** — Brian, 2026-08-31: _"they should see
   if they're already in the list. If their name is already there, they go, 'Oh,
   you've already done this.'"_
5. Submit, and land in the community group, with the group link now shown.

## State transitions

Person minted if new. Prospect created at `identified`. `W3` fires. A recruit
who is told they are already in the list stops there rather than creating a
second record; nothing is parked.

## Handoffs

- To `W3` on submit.
- To Mission 5's people merge when the same person really did get in twice.
- To `W1` and `W2`.

## Dependencies and mission boundaries

- **Mission 5 / dedup:** this mission's side is the self-serve telling and the
  parking behaviour; Mission 5's side is the matching. Independently walkable.
- **Mission 4 / transport:** carries the welcome afterwards. Independently
  walkable.
- **Mission 8 / consent:** the QR carries the most natural opt-in of any door —
  the person typed their own number — but the wording is Mission 8's.
  Non-blocking.

## Exceptions and recovery

- **They are already in the list.** Told plainly, nothing created, no message
  sent. This is the common case at a second event and must not read as an error.
- **An ambiguous match.** Parked for `W8`. No record created, no welcome fired —
  Task 09 §3's self-serve rule, so an existing member never receives a "welcome to
  the club" message.
- **A revoked or expired QR.** The uniform invalid page.
- **Somebody submits nonsense.** Captured anyway if it has a plausible mobile;
  recruitment is not a validation exercise, and an operator can correct it later.
- **They submit twice.** The second submission finds the first.

## Safety, privacy, consent, and authority boundaries

- The page is public and unauthenticated, so it exposes **nothing** about the club
  beyond what a poster does. The duplicate telling must not become a way to probe
  membership: it confirms only what the submitter themselves typed.
- The QR is mintable and revocable — `W10` — so a leaked poster code can be turned
  off.
- No real send before LAN-101; no real recruit before LAN-86.

## Acceptance evidence

- `grounding: code-only`. Both sides drawn.

## Core decisions

| Decision                                                                                    | Classification                | Governing evidence or recommended default                                                      | Status  |
| ------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- | ------- |
| The QR points at the club's own page on the club's own domain                               | `locked`                      | Brian, 2026-08-28                                                                              | Settled |
| Scan, form, submit, group invite                                                            | `locked`                      | Brian, 2026-08-31                                                                              | Settled |
| The recruit is told if they are already in the list                                         | `locked`                      | Brian, 2026-08-31                                                                              | Settled |
| "A login" means the signed link and the group invite, not an account                        | `proposed for owner approval` | Task 08 §3 fixes no player logins in Release One; an account for recruits is a larger decision | Open    |
| The duplicate telling confirms only what the submitter typed                                | `proposed for owner approval` | A public page that says "yes, we have a Rosalind Penhaligon" is a membership oracle            | Open    |
| The page also asks Questionnaire A, on the same surface as the consent gate                 | `locked`                      | Brian, 2026-09-01: every door leads to the single consent gate                                 | Settled |
| The consent tick is required to submit; every other field, including mobile, stays optional | `locked`                      | Brian, 2026-09-01                                                                              | Settled |
| The group link appears on the saved page only after the tick                                | `locked`                      | Brian, 2026-09-01; the earlier build showed it unconditionally, before the gate existed        | Settled |
| "Known as" writes a `person_aliases` row; there is no preferred-name field                  | `locked`                      | Brian, 2026-09-01: "this is old information"; `main` has `person_aliases` and no such field    | Settled |

## Brian approval

- Exact words: _"Okay, sounds great. W7 approved."_, then re-approved as _"W7 approved."_
  after the amendment below.
- Date: 2026-08-31

Approved once, then amended on Brian's instruction with the have-you-registered-before
question, then approved again. The first approval did not cover that step, which is why the
ledger reopened the workflow rather than letting the amendment ride on it.

Given once the flow ran through to WhatsApp and the separate "already on our
list" screen was removed.

### The three doors now hold three deliberate postures

Worth recording together, because they look like inconsistency and are not:

| Door              | Duplicate handling                       | Why                                                                     |
| ----------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `W5` walk-up      | None                                     | Written on a phone at the side of a pitch; Brian removed the match path |
| `W6` operator add | The full shipped check, candidates, link | An operator at a desk, with time                                        |
| `W7` QR sign-in   | Simple, takes the details regardless     | A stranger at a stand; refusing them loses them                         |

`W8` describes the check itself, wherever it runs, and must not contradict any
of them. What none of them resolves is resolved by the people record's own
merge, which already ships.
