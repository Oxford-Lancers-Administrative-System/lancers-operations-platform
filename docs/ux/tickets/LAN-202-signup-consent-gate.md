# LAN-202 — The sign-up form: one consent gate, two doors

**Workflow:** `W7 — Sign yourself in`, `W4 — Fill in your details` (Questionnaire A)
**Routes:** `/join/[code]`, `/me/join/[token]`, `/me/stop/[token]`
**Shared contract:** [`../slice-ux.md`](../slice-ux.md) · [`../standards.md`](../standards.md)

## Why this contract exists

LAN-202's own Linear body, its three amendments, and the mockup/workflow
sources it names are the approved design; Linear is not a durable repository
contract. This records what was built from them, so a later package (LAN-203
and beyond) does not have to re-derive it, and so the two decidable departures
from the mockup are written down rather than discovered.

Sources, in the authority order `slice-ux.md` §1 sets:

- `LAN-202` in Linear, including Amendment 2 (the merge lane and the route) and
  Amendment 3 (the seam with LAN-203), and the packet's amendment 1
  (season-scoped consent), approved by Brian 2026-08-31 and amended
  2026-09-01.
- `chore/recruitment-fidelity-mockup` (LAN-200) — `src/app/recruitment-preview/sign-up.tsx`,
  `qr-page.tsx`, `consent-states.tsx`.
- `missions/intake/M-RECRUITMENT/mockups/shots/` — `W7-01`–`W7-03`, `W4-01`–`W4-02`.
- `missions/intake/M-RECRUITMENT/workflows/W7-sign-yourself-in.md` and
  `W4-fill-in-your-details.md`.

## The one form, two doors

Both doors render the same `SignupForm` component
(`src/app/join/[code]/signup-form.tsx`), parameterised by `mode`:

| Door                    | Route              | Credential                                                 | Prefilled | Duplicate question |
| ----------------------- | ------------------- | ------------------------------------------------------------ | --------- | ------------------- |
| QR (anonymous)          | `/join/[code]`      | `recruitment_signup_codes.code` — not a secret, one per season | No        | Yes, when a mobile is given |
| WhatsApp link (existing) | `/me/join/[token]`  | `person_access_tokens`, durable, non-single-use (the same substrate `/me/[token]` reads) | Yes | No — the token already names one person |

`/me/stop/[token]` is the opt-out surface (item 6), reached the same way, under
the same `/me/` prefix.

## Required set, and why the form still asks nine questions

Brian, 2026-09-01: first name, last name and the consent tick are the only
required fields, on **both** doors. Every other field (mobile, email, Known as,
college, matriculation year, expected graduation, degree) is filled from
Questionnaire A, visibly optional, and a blank one never blocks the save
(`REQ-missing-never-blocks`). The Save/Sign-up button is disabled until the
required set is satisfied, and the disabled-state caption names exactly what is
missing — standards rule 4.

## The QR door's duplicate question

`W7`'s "have you signed up with us before?" step
(`probeExistingRecruitForQrSignup`, `src/lib/services/recruitment-signup.ts`)
runs only when a mobile number was supplied, and matches on an **exact** phone
value — never on name alone. The confirmation screen echoes back only what the
visitor themselves typed (their own given name, the last three digits of their
own mobile), never a stored value, per `W7`'s "the one thing this screen must
not become." Confirming "Yes, that's me" links the existing person; "No, I'm
new" and a blank mobile both go straight to creating a new person. Neither
branch is ever refused.

## Consent

The tick is required to submit (superseding the earlier draft's optional
tick), so `refused` is not reachable through this form — matching Brian's
2026-09-01 amendment. A successful save always writes `granted`, dated, source
`qr_self_entry` (`src/lib/services/messaging-consent.ts` — see below for why
this one value covers both doors). The WhatsApp group link (`groupLink` prop,
sourced from `RECRUITMENT_WHATSAPP_GROUP_LINK`) renders on the saved page only,
never before, and never in a message.

## The consent gate — the seam with LAN-203

`src/lib/services/messaging-consent.ts` is item 5 of LAN-202, defined here and
consumed by `WP-recruitment-messaging` (LAN-203). Its exported
`requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId)` throws
`InvalidTransition` (`rule: "season_messaging_consent_required"`) unless the
current state for that `(person, season)` is exactly `granted`; a companion
`hasGrantedSeasonMessagingConsentIn` returns a boolean for a non-throwing
check. `withdrawSeasonMessagingConsentIn` is the opt-out surface's one write.

`season_messaging_consent_source` carries three values, read here as three
**mechanisms of obtaining consent** rather than three routes: `qr_self_entry`
(the recruit ticks it themselves — both doors this package builds, and this
package's own self-service opt-out),`walk_up_read_back` (W5's verbal read-back,
owned by a different package), `operator_recorded` (W6's operator-typed
consent, likewise not this package's). This module writes only
`qr_self_entry`.

## Departures from the mockup, and why they are decidable rather than escalated

1. **The mockup's `ready` gate required a mobile number and did not require the
   consent tick.** Superseded outright by LAN-202's own amendment note ("the
   consent tick is required to submit"), which the issue records as amending
   the mockup after Brian's walkthrough. Not a departure this package
   introduced — the issue text is the correction.
2. **`recruitment_questionnaire_responses` is not written.** Questionnaire A's
   fields are `people`/`contact_points`/`person_aliases` columns per `W4`'s own
   "locked" core decision; the generic responses table is Questionnaire B's
   (football background), which this form does not ask.

## What is deliberately not here

- **No QR-minting screen.** `W1-04`'s admin page (mint/deactivate/re-mint,
  behind `QR CODE` on the recruit board) is a different package's route;
  `src/lib/services/recruitment-signup-codes.ts` exposes the minimal
  `mintRecruitmentSignupCodeIn` that page will call, built here only because
  this package's own acceptance criteria need a live code to prove the door
  end to end.
- **No `recruitment_prospect_status_events` row on creation.** Not required by
  this package's "Done when"; a later package (the recruit board / record)
  decides whether an initial event is worth recording.
- **No delivery pipeline.** LAN-203 owns the actual send loop that calls
  `requireGrantedSeasonMessagingConsentIn`; this package proves the gate
  refuses, not that a message was sent or withheld.

## Visual evidence

Both entry doors and the saved-page state were proved at desktop (1280–1440px)
and a Playwright-measured 375px — `npm run visual:preflight` for the two entry
routes, and a scripted Playwright walk (fill, tick, submit) for the saved/done
states, since those are client-side steps with no URL of their own. See the
package receipt for the exact commands and the ignored evidence path.
