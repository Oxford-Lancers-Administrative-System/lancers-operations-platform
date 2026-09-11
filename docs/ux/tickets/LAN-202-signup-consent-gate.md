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

The refusal names the rule, in one sentence, everywhere:
**"Enter your Oxford address; it ends in ox.ac.uk"**.

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

## Decision history relocated from source (LAN-300)

### src/lib/services/messaging-consent.ts — file header (seam with WP-recruitment-messaging, source doors)

> ## The seam with `WP-recruitment-messaging` (LAN-202 amendment 3)
>
> {@link requireGrantedSeasonMessagingConsentIn} is the check every send calls,
> defined here and consumed by `WP-recruitment-messaging` (LAN-203), which runs
> concurrently and owns the actual dispatch loop. Nothing about _how_ a message
> is sent lives in this module — only the one gate a caller must pass before it
> tries.
>
> ## `source`, and why this module only ever writes `qr_self_entry`
>
> `season_messaging_consent_source` has three values, and the schema's own
> comment reads them as "covering all three doors" — but the three doors are
> three _mechanisms of obtaining consent_, not three routes:
>
> - `qr_self_entry` — the person ticks the box themselves, on the sign-up
>   form this package builds. Reached from the QR (anonymous) and from a
>   WhatsApp link (tokenised, prefilled) alike — both are the same surface,
>   and in both the recruit is the one pressing save.
> - `walk_up_read_back` — `W5`'s verbal read-back at a walk-up capture,
>   recorded by an operator on the strength of what the recruit said aloud.
>   That is a different package's (`WP-recruitment-messaging`'s sibling,
>   walk-up capture) own write, never this module's.
> - `operator_recorded` — `W6`'s operator-typed consent. Also never this
>   module's write.
>
> A self-service withdrawal (the opt-out link) is the same category as a
> self-service grant — nobody but the credential holder acted — so it is
> recorded with the same `qr_self_entry` source. There is no fourth value for
> "self-service, off the sign-up form", and inventing one is a migration this
> package does not own; this is the closest-fit existing value, and is called
> out here rather than left to be rediscovered from the write.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/recruitment-signup.ts — module header

> ## No operator, on purpose
>
> Every write in this module runs unauthenticated. There is no
> `actorPersonId` parameter anywhere here, unlike the rest of the service
> layer's own README rule — the same departure `player-answer-tokens.ts`'s
> `consumeAnswerTokenIn` already takes, and for the same reason: the credential
> (a code that is not a secret, or a person token that is) is the whole of the
> authorization, and `recordAudit`'s `actorLabel` names the mechanism honestly
> instead of a person who was never there.
>
> ## First name, last name, mobile, the tick — nothing else blocks
>
> Superseded, Brian, 2026-09-01: "Mobile is required no matter what… Missing
> never blocks except for phone. I'm fine not getting email, but we also need
> to get the phone number. That is how we communicate with them. Nothing else
> works if we don't have a phone number." The required set is now first name,
> last name, mobile and the consent tick — mobile joins the set this same
> module's header once called complete at three. {@link validateSignupSubmission}
> is the one place that is enforced, for both doors, before anything is
> written, and it is also where a supplied mobile is validated and
> normalised to E.164 (`person-validation.ts`'s `validatePhoneNumber`,
> LAN-183 — reused rather than re-derived; see that module's own note on why
> it is not `src/lib/delivery/phone.ts`'s `toE164` directly). Email, and the
> two academic years, are validated the same way when supplied and stay
> optional (`REQ-missing-never-blocks`) — a blank optional field never
> blocks the save; a **malformed** one now does, where blank previously
> discarded it silently (finding 3).
>
> ## Questionnaire A lands on the person record, not a response table
>
> `W4`'s own core-decisions table: "The page also asks Questionnaire A, on the
> same surface as the consent gate" is `locked`, and Questionnaire A's fields
> (Known as, mobile, email, college, matriculation year, expected graduation,
> degree) are Mission 5's own person-record columns — never
> `recruitment_questionnaire_responses`, which this package leaves alone.
> That table's generic `question_code` shape exists for Questionnaire B
> (football background), whose own six-field set is still "proposed for owner
> approval" and which this sign-up form does not ask.
>
> ## Filling, never silently overwriting
>
> A field already carrying a value is left alone here — an unauthenticated
> public form has no actor and no reason to attach to a correction, which is
> exactly what `person-write.ts`'s `updatePersonField`/`supersedeContactPoint`
> require for every value that is not empty. A blank field is filled outright,
> matching that same module's own rule that filling an empty value needs no
> reason. The one exception is `given_name`/`family_name` on the **tokenised**
> door: the credential already acts as this exact person (Task 08 §3), so
> "check it, change anything that is wrong" (`W4`) is taken at face value
> there, and only there.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/recruitment-signup.ts — fillPersonYearFieldIfBlankIn

> Superseded, Brian, 2026-09-01 (finding 3): `W7`'s "recruitment is not a
> validation exercise" no longer governs matriculation year and expected
> graduation specifically — `validateSignupSubmission` already refuses a
> malformed value before this is ever reached, so the bounds check below is
> now a defensive backstop rather than the actual validation; a value that
> fails it here would already have thrown upstream.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/recruitment-config.ts — module header

> The WhatsApp community group link — LAN-202, "saving reveals the WhatsApp
> community group link, on the saved page. Never before consent, and never in
> a message."
>
> There is no application config for this on `main` before this package, and
> minting the real group and its invite link is Brian's own action in
> WhatsApp — outside this repository, and outside anything an agent may do.
> `RECRUITMENT_WHATSAPP_GROUP_LINK` is read, never guessed and never
> defaulted to a placeholder URL: an unset value means the saved page shows
> the recorded consent and says the link is not live yet, rather than
> fabricating one.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
