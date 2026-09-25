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

| Door                     | Route              | Credential                                                                               | Prefilled | Duplicate question                      |
| ------------------------ | ------------------ | ---------------------------------------------------------------------------------------- | --------- | --------------------------------------- |
| QR (anonymous)           | `/join/[code]`     | `recruitment_signup_codes.code` — not a secret, one per season                           | No        | Yes, when a mobile is given             |
| WhatsApp link (existing) | `/me/join/[token]` | `person_access_tokens`, durable, non-single-use (the same substrate `/me/[token]` reads) | Yes       | No — the token already names one person |

`/me/stop/[token]` is the opt-out surface (item 6), reached the same way, under
the same `/me/` prefix.

## Required set, and why the form still asks nine questions

Brian, 2026-09-09, superseding his own 2026-09-01 note: the required set is
**first name, last name, phone number and college email**, on **both** doors,
and the consent tick is required alongside them. The club cannot reach a
recruit it has no number for, and the reason the mobile was ever optional —
that a recruit might not want to give one — was outweighed by a board full of
rows nobody can contact.

All four are enforced by the build as of LAN-275: the college email joined the
required set with LAN-268, is validated to the Oxford rule below, and a blank
or non-Oxford one now blocks the save on both doors. Everything else (Known as,
college, matriculation year, expected graduation, degree) is filled from
Questionnaire A, visibly optional, and a blank one never blocks the save
(`REQ-missing-never-blocks`). The Save/Sign-up button is disabled until the
required set is satisfied, and the disabled-state caption names exactly what is
missing — standards rule 4.

LAN-246 was filed against the paragraph this one replaces, reporting the
build's own phone requirement as a defect. It is canceled: the build was
right and this contract was stale.

## The college email, and the one rule it is held to

Brian, 2026-09-09 (LAN-268): a college email is valid only when its domain is
`ox.ac.uk` or any subdomain of it — `@ox.ac.uk`, `@balliol.ox.ac.uk`,
`@sbs.ox.ac.uk`, `@dept.college.ox.ac.uk`. The domain is matched
case-insensitively, and nothing else is accepted: not `gmail.com`, not another
university, and not the look-alikes that matter — `oxford.ac.uk` is a different
domain, `notox.ac.uk` merely ends in the same letters, and `ox.ac.uk.evil.com`
is somebody else's domain wearing the name.

LAN-425 (Brian, 2026-09-25, after the Freshers' Fair) widened the rule to
`.edu`-style addresses for visiting and exchange students: `edu` as the last
label of the domain, or followed by exactly one country code — `harvard.edu`,
`unimelb.edu.au`, `tsinghua.edu.cn`. Not `edu.example.com`, not
`.education`, not `harvard.edu.evil.com`.

The refusal names the rule, in one sentence, everywhere:
**"Enter your university address; it ends in ox.ac.uk or .edu"**.

One validator (`validateCollegeEmail` in `src/lib/services/person-validation.ts`)
answers this for all four surfaces that ask it — the sign-up door, add-by-hand,
the player questionnaire's step 1 and the operator's edit form. The operator's
form refuses the same way, before any write, with no override.

Required-ness and validity are separate questions. A person on the recruit or
player tier is _required_ to have one, and one they do not have surfaces in the
missing-data queue — as does one already on file that fails the rule. A coach,
a committee member or an alumnus is not asked for one (their college address
expires around graduation, and neither door that collects one is a door they
walk through), but a value they _do_ supply is still held to the same rule.

## The phone control

Brian, 2026-09-01 (LAN-211): every phone input in the application is two
controls on one line — a country-code dropdown, then the national number, with
the United Kingdom as the default. "One free-text field that the user is
expected to format correctly is not good enough."

One shared component (`src/components/phone-field.tsx`) is used on every
surface that captures a number. It posts one string, in international form,
under the field's own name, so what is stored is still E.164 from the one
existing normaliser and every server action reads exactly what it always did.
A number already on file splits back into the two controls without being
repaired; a value that cannot be split shows whole rather than being
reinterpreted. A refusal names which of the two halves is wrong.

## The QR door's duplicate question

`W7`'s "have you signed up with us before?" step
(`probeExistingRecruitForQrSignup`, `src/lib/services/recruitment-signup.ts`)
runs only when a mobile number was supplied, and requires an exact phone match
**and** a given-name-or-alias match, on the same person row — corrected by
LAN-208, which found the shipped query treating the two as alternatives
(`OR`), so a fabricated name plus a real phone number confirmed a match for
anyone in `public.people`, not just recruits. The probe itself is also gated
by `code` resolving to a live, non-deactivated season, the same as the write
below — otherwise it stays reachable indefinitely once any `/join/[code]` page
has loaded.

The confirmation screen echoes back only what the visitor themselves typed
(their own given name, the last three digits of their own mobile), never a
stored value, per `W7`'s "the one thing this screen must not become." The
probe's own response to the browser carries no database identifier either
(LAN-208) — a bare `found: boolean`, nothing a client could hold and later use
to address that person. Confirming "Yes, that's me" sends back only that same
boolean; the write path (`submitQrSignup`) re-runs the identical strict match
itself, from the name and mobile the recruit has typed at that moment, to
decide who to link. "No, I'm new" and a blank mobile both go straight to
creating a new person. Neither branch is ever refused. The blank-mobile branch
is no longer reachable from the form itself, now the mobile is part of the
required set; it stays because the probe and the write are separate entry
points and neither may assume the other ran. LAN-144, not this package,
decides whether either endpoint is rate-limited.

## The partial save (LAN-425)

Brian, 2026-09-25, after the Freshers' Fair: people typed a name and a number,
walked off, and nothing was recorded. The QR door now saves what it has.

Nothing on the screen changes. Sign me up is gated exactly as above, and the
visitor is never told a partial was saved. Underneath, once first name and last
name are both present, the page creates the record; every later change is
patched after a five-second pause with everything typed so far, one write in
flight at a time, so a slow patch cannot overwrite a faster later one and a
dropped one is healed by the next. Latest wins, raw as typed: a malformed
mobile is on file with no normalised number and cannot be messaged until an
operator fixes it; a malformed college email is on file for the missing-data
queue.

A partial is not a sign-up. It writes no consent row (an unticked box is not
consent), declares no interest ask, invites nobody to the group and counts no
code use. It does declare the recruitment cycle, whose welcome track is allowed
without consent (LAN-204) and exists to get somebody to finish this form; the
welcome is floored ten minutes out so a mistyped mobile can be corrected before
the dispatcher reads the number, and the dispatcher skips it once the real Save
grants consent.

On the board, `recruitment_prospects.source` reads **`qr_partial`** while one of
the core four (first name, last name, a valid mobile, a valid college email) is
missing, and **`qr_self_entry`** once they are all present — optional fields
may still be blank. Operators sort the Source column and chase the partials.

The page holds an opaque credential for its partial, never a person id
(LAN-208): a `person_access_tokens` row with the prefilled form's own purpose,
which resolves to nothing but this person's own typed values. It lives in
memory for the page load only; a reload starts over, and a re-scan that
duplicates a partial is voided or merged by an operator as any duplicate is. If
the name-and-mobile probe already matches somebody when the partial would
start, nothing is written and the real Save asks the duplicate question above
as it always did. Sign me up with a live token completes the partial in place
instead of running that probe.

The first write is throttled on the printed code like the probe; patches are
throttled on the token, so one stand's typists never spend each other's
allowance. The bar to create a person and trigger a welcome send is now "type a
name and a valid number" rather than "press Save"; the per-process throttle is
not a defence against a bot, and a per-code creation cap is a separate issue if
one is wanted.

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
   consent tick.** Half of that stands and half does not. The consent tick
   **is** required to submit, per LAN-202's own amendment note, which the issue
   records as amending the mockup after Brian's walkthrough. The mobile number
   is required too — the mockup was right about it, and this contract's
   earlier claim that it was optional was the mistake; see "Required set"
   above for Brian's 2026-09-09 decision and for the college email LAN-268
   adds beside it. So the only departure from the mockup here is the added
   consent tick.
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
