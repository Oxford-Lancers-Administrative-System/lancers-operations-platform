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

## Required actions

1. Scan and land on the club's own page, on the club's own domain, which looks
   like the club.
2. Enter first name, last name and mobile; email optional. Same standard as every
   other door.
3. **Be told if the club already has them** — Brian, 2026-08-31: _"they should see
   if they're already in the list. If their name is already there, they go, 'Oh,
   you've already done this.'"_
4. Submit, and land in the community group.

## State transitions

Person minted if new. Prospect created at `identified`. `W3` fires. A likely
duplicate does not create and does not message; it parks for `W8`.

## Handoffs

- To `W3` on submit.
- To `W8` when the self-serve check cannot resolve a match.
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

| Decision                                                             | Classification                | Governing evidence or recommended default                                                      | Status  |
| -------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- | ------- |
| The QR points at the club's own page on the club's own domain        | `locked`                      | Brian, 2026-08-28                                                                              | Settled |
| Scan, form, submit, group invite                                     | `locked`                      | Brian, 2026-08-31                                                                              | Settled |
| The recruit is told if they are already in the list                  | `locked`                      | Brian, 2026-08-31                                                                              | Settled |
| "A login" means the signed link and the group invite, not an account | `proposed for owner approval` | Task 08 §3 fixes no player logins in Release One; an account for recruits is a larger decision | Open    |
| The duplicate telling confirms only what the submitter typed         | `proposed for owner approval` | A public page that says "yes, we have a Rosalind Penhaligon" is a membership oracle            | Open    |
| What the page asks beyond name and mobile                            | `proposed for owner approval` | Open by Brian's word. Recommendation: nothing — every extra field costs completions at a stand | Open    |

## Brian approval

- Exact words:
- Date:
