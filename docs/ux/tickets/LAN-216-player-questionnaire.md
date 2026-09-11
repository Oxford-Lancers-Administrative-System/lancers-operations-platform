# LAN-216 — The player's link: one questionnaire in five steps, and fixing what the club has wrong

**Workflows:** `W4 — Say yes and fill in your details`, `W5 — Fix something the club has wrong`
**Routes:** `/me/[token]/details` (new — on the durable, non-single-use `person_access_tokens` credential `/me/[token]` already resolves)
**Shared contract:** [`../slice-ux.md`](../slice-ux.md) · [`../standards.md`](../standards.md) · [`LAN-172-player-answer.md`](./LAN-172-player-answer.md) (the shipped player-facing shell and throttle bucket this route reuses unchanged)

## Why this contract exists

`missions/packets/M-ONBOARDING-AND-INFORMATION-COMPLETION/packet.json`,
`missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/workflows/W4-*.md` and
`W5-*.md`, and their `acceptance/W4.md`/`W5.md` records are the approved
design — Linear is not a durable repository contract. This records what was
actually built from them, at LAN-216's own head.

## The route, and why it carries no new credential

`/me/[token]/details` resolves the same durable, non-single-use
`person_access_tokens` row `/me/[token]` already resolves
(`resolvePersonTokenIn`, unchanged, called read-only). `T11-one-request`'s
"one open ask, ever" is already that row's own partial unique index,
`person_access_tokens_one_live_per_person_season` — this package mints no
token of its own and calls no issuing function. Throttling and uniform
terminal timing are `src/lib/rsvp/public-surface.ts`'s existing
`allowPlayerHomeRequest`/`logThrottledPlayerHomeRequest`/
`withUniformTerminalTiming`, the exact bucket `/me/[token]` uses — a second
allowance was deliberately not added, since this is the same link and the
same page family, not a new public surface. `src/lib/rsvp/**` and
`src/lib/services/rsvp-tokens.ts` are untouched by this diff.

An unresolvable token (unknown, revoked, answer-shaped, or a closed season —
`resolvePersonTokenIn` collapses all four to `unknown`) renders this route's
own `not-found.tsx`: the exact shape `src/app/a/[token]/not-found.tsx`
already ships (404, the same heading, the same privacy line, one `Close`),
with only its body sentence replaced (`W4-09`'s own substitution) because
the shipped sentence talks about an event having started, which is untrue of
a collection link.

## The five steps, behind the one link, as page states not path segments

`?step=details|code_of_conduct|photo_release|bucs_play|hudl|done` on the one
route — never five routes — so "the same link, compiled to whatever is still
outstanding" (the packet's own words) is literally one URL throughout. A
fresh load with no `step` named resumes at the first step genuinely still
outstanding (`readQuestionnaireView`'s own `nextStep`), or renders the
uniform "already complete" page (`W4-08`) when nothing is; an explicit
`?step=` always wins, which is how the finishing page's own "each one a link
back to its step" (`W4-07`) works. `STEP_ORDER`'s own literal-next (not
recomputed) is what lets "Continue"/"Finish" on the two non-blocking steps
move forward within one visit even before their own item is claimed — a
later fresh visit still resumes at that same step, since it is still
genuinely outstanding.

### Step 1 — the details, the consent board (`W4-01`, `W4-02`)

The tick is the form's first field (`OD7-form-is-consent-board`), rendered
only when `hasGrantedSeasonMessagingConsentIn` is false this season; a
flipped recruit's door-granted row means this page never asks again
(`W4-02`). The control only ever grants — `grantSeasonMessagingConsentIn` is
the one consent function this package calls; `withdrawSeasonMessagingConsentIn`
is never imported here, so there is no code path by which a crafted request
could revoke it (`OD7-oneway-tick`).

Step 1 also collects the **college email** (LAN-268 — required, validated to
the Oxford rule recorded in `LAN-202-signup-consent-gate.md`), and, in a
section of their own, the **student number** and **BAFA registration number**
(LAN-267). Neither number is required: a player who does not have one yet must
not be blocked by it, and the roster form prints a blank row and names them in
its warning line instead. The mobile and the emergency contact's phone are the
shared two-part control (LAN-211).

The required set is `person-required.ts`'s player tier, read rather than
restated, plus the emergency contact's four required fields
(`person-required.ts`'s own `emergency_contact` aggregate covers "a row
exists"; this page adds the granular per-field check the four-required,
one-optional shape needs). Required blocks the page's own advance to the
next step, never the player: every changed field commits independently
(`saveDetailsStep`), so a part-filled visit that never becomes "complete"
still keeps everything it saved. There is no control anywhere that declines
a required fact.

**No silent overwrite (`REQ-no-silent-overwrite`).** For the seven `people`
columns `person_fact_disputes` already scopes itself to: an empty prior
value fills directly; a non-empty one with no attributable source (seeded,
imported, `person_created`) fills directly, the locked recommendation; a
non-empty one last set by this same person (their own earlier answer)
overwrites directly, their prerogative; a non-empty one last set by anybody
else raises `person_fact_disputes`, both values kept, shown on the page as
one inline notice rather than a silent replacement. The "same person" check
is this package's own addition — `readPersonRecordIn`'s own `<field>Source`
answers "who, by name" (`Q-13`); this reads the same `audit_events` action's
`actor_person_id` once per changed field to answer "was that this person".
Emergency contact fields are overwritten in place, matching the shipped
design `docs/architecture/data-model.md` already states for
`person_emergency_contacts` ("overwritten in place") and
`person-fact-dispute.ts`'s own scope note (exactly the seven `people`
columns) — no second dispute shape was invented for a table this mission's
migration does not own.

Mobile and personal email supersede (`supersedeContactPoint`, unchanged),
which already keeps the prior value rather than overwriting it — no dispute
needed there.

**Date of birth is shape-checked here like the two academic years** (LAN-245).
A future date used to pass this form untouched, reach
`people_date_of_birth_in_the_past`, and take the whole page down to the
generic error boundary with a 500 — the player left on a crash screen with no
guidance about which of fourteen fields was wrong. It now gets an inline field
message ("A date of birth has to be in the past."), the value alone stays
unwritten, and everything else in the same submission still commits, exactly
as an implausible matriculation year already behaved. The rule is
`validateDateOfBirth` in `person-validation.ts`, the same one the operator's
own edit form asks (`LAN-185-person-write.md`), so the two surfaces cannot
refuse the same value two different ways.

### Steps 2 and 3 — the two documents (`W4-03`, `W4-04`)

Each is its own page: the document, scrolled, and an agreement reachable
only from the end of it. `onboarding-agreements.ts`'s shipped
`recordOnboardingAgreementIn` (PR #139) is the one write; this package adds
the item completion on top of it (`code_of_conduct`/`photo_release` →
`complete`, `actorKind: "player"`), since neither of `membership.ts`'s own
mutators fits a direct-class item completed by the player's own confirmation
(`claimOnboardingItem` only accepts a `trust`-class item;
`resolveOnboardingItem` always records `actorKind: "operator"`). Agreeing
twice in one season is refused by the schema's own
`onboarding_agreements_one_per_person_season_type`; the route treats that
refusal as a no-op rather than an error, since a resubmitted or
double-clicked form is not a failure.

Document and instruction text is a labelled placeholder in the real
versioned `onboarding_agreement_versions` slot the migration already seeded
— **LAN-213** owes the real wording. Nothing here invents club policy.

**The item, not the agreement row, is what these two steps obey** (LAN-240).
The sequence used to read either signal — "the item is complete **or** an
agreement row exists" — and the step's own "Already agreed" panel read the row
alone. So when an operator reopened Photo release from the record (setting it
back to `No`, the shipped mechanism), the row survived, the sequence skipped
the step, and a direct load of it printed "Already agreed" beneath a navigator
reading "Outstanding". The reopen now removes that row
(`LAN-217-operator-record.md`), and the item's status is what both the
navigator and the panel read whenever the item exists. The row remains the
fallback for the one case it was introduced for — a membership with no
configured `code_of_conduct`/`photo_release` item at all, where there is
nothing for a completion to mark and a player who did agree would otherwise
resume to the same step forever.

### Steps 4 and 5 — BUCS Play and Hudl (`W4-05`, `W4-06`)

Both are `claimOnboardingItem` (unchanged) — the player's own trust-class
word, recorded `claimed`, never `complete`. Neither step blocks the
sequence: "Continue"/"Finish" always advances, claimed or not, per the
packet's own "continue anyway. The club will ask you again." Hudl carries a
second, independent control — "No invitation has reached me" — which moves
nothing in `onboarding_items` (the invitation genuinely has not gone out)
and is recorded only in the sectioned activity log, since no status value
exists to carry it without a migration this package does not own.

### The finishing page (`W4-07`) and the already-complete page (`W4-08`)

`W4-07` is the post-sequence summary — reached at `?step=done`, always,
regardless of what remains — listing what is still outstanding by section,
each a link back to `?step=<its own step>`. `W4-08` is the uniform "nothing
left" page, shown whenever nothing is outstanding at all, on any load,
`?step=` or not: operator-only items (subscriptions, kit, the squad photo,
comms groups) are structurally excluded from both — the player is never
told to do the club's own ticking.

## W5 — the same page, its returning state

Not a second surface. `PersonRecord`'s own `<field>Source` is what the page
already reads for step 1; a source of `null` at first visit (an imported or
seeded value) and a source naming somebody once written through the app is
the entire mechanism that turns step 1's "fill the gaps" framing into W5's
"confirm or correct, with provenance" framing, with no branch in the code
that treats "first visit" and "later visit" differently. The page carries no
explanation of itself — Brian, 2026-09-02: "Too much UI narration… too
narrative in design" — every field's own label, asterisk, and one-line
source clause is all that is shown; the disputed-fact notice is the one
exception, and it names only "the club", never an officer.

## What is deliberately not here

- **No resolution screen for a disputed fact.** `W7`/`WP-operator-record`,
  E-3, reads `person_fact_disputes` and writes nothing this package does not
  already write.
- **No change to `src/lib/rsvp/**` or `player-answer-tokens.ts`.** Both are
  consumed unchanged; see the PR body for the exact classifier check against
  `.github/merge-rules.json`.
- **No e-signature.** `W4-04`'s own open decision — a dated agreement
  (version, moment, person) is the whole mechanism; the application has no
  object storage and none was added.
- **No touch to `/operate/roster/**` or the arrival services** — the
  concurrent package `WP-arrival-doors`' own surface.

## Visual evidence

`npm run visual:preflight` against three synthetic fixtures created for this
walk and removed afterwards (never left in the shared database): a fresh
player, walked through `?step=details|code_of_conduct|photo_release|bucs_play|hudl|done`;
a flipped-recruit-shaped player (consent already granted, `W4-02`'s state,
landing on step 1 with no consent step); and a fully-resolved player for the
already-complete page (`W4-08`). The dead-link page (`W4-09`) was proved
against an unresolvable token; the automated preflight's `domcontentloaded`
wait undercaptured its screenshot (a timing artifact of the 404 boundary's
own render, not a defect — confirmed by a direct `networkidle` capture
showing the correct heading, body and privacy line), recorded here rather
than left implicit. All of the above at desktop (1440px) and a
Playwright-measured 375px. See the package receipt for the exact routes and
the evidence path.

## Decision history relocated from source (LAN-300)

### src/app/me/[token]/details/step-shell.tsx — `itemStepWord`

> The navigator drew its chip from the item's stored status and its label
> from a separate `=== "claimed"` test, so a BUCS Play item the club had
> _confirmed_ — a resolved state, and the one beyond claimed — sat under a
> chip coloured complete with the word "Outstanding" beside it. Two signals
> about one row, contradicting each other, which is the defect LAN-216 asks
> this navigator not to have: "the navigator's label and its chip state
> agree; a resolved item reads as resolved."
>
> So both now come from the status, here, once. `claimed` keeps its own word
> — the player has said they are done and the club has not confirmed it, and
> that is genuinely not the same as confirmed — and every state that needs
> nothing further from anybody (`RESOLVED_ITEM_STATUSES`) reads as resolved.
> `invited` stays "Outstanding" on purpose: an invitation the player has not
> taken up is exactly the thing this sequence is asking them to do.
>
> The words are the player's, not the operator record's. `itemStateLabel`
> answers the same question for an administrator ("Not invited", "Confirmed")
> and cannot be borrowed: it throws on a state its item's own list does not
> carry, and `waived` is not on either trust item's list even though the
> schema lets a membership sit in it.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/me/[token]/details/step-shell.tsx — `QuestionnaireStatus`

> F3 (LAN-230): the two-column status box `W4-07-proposed` (Done) and
> `W4-05-proposed` (BUCS Play) each show above their steps — one `dl` grid
> shared by both rather than two copies of the same layout. `positive`
> colours a row's value the same way this route already colours an `Alert`
> (`success.main`/`warning.main`), matching the mockups' green/amber without
> a new colour convention.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/player-questionnaire.ts — module header (top of file)

> /**
>
> - The player-facing questionnaire's own domain logic — `WP-player-questionnaire`,
> - LAN-216, W4 and W5. Everything `/me/[token]/details` reads and writes lives
> - here, so the route itself stays a thin resolve-throttle-render/redirect
> - shell, matching `src/lib/services/README.md` rule 1: business rules live in
> - a service, never in a route handler.
> -
> - ## What this module does not rebuild
> -
> - Every read and write below composes substrate this mission's earlier
> - packages already shipped — `person-record.ts`, `person-write.ts`,
> - `person-fact-dispute.ts`, `messaging-consent.ts`, `onboarding-ask.ts`,
> - `onboarding-agreements.ts`, `membership.ts`'s `claimOnboardingItem`, and
> - `onboarding-item-history.ts`/`onboarding-activity-log.ts`. This module adds
> - exactly two things neither of them exposes:
> -
> - 1.  **The provenance-aware write** for the seven `people` columns
> -      `person_fact_disputes` used to scope its now-removed dispute mechanism
> -      to (B-002, correction round 2, Q-9) — direct write in every case: when
> -      the prior value is empty, unattributed, the player's own earlier
> -      self-service submission, or somebody else's — last write wins,
> -      whoever gave it, with `updatePersonField`'s own audit row carrying who
> -      and when. `readPersonRecordIn`'s `<field>Source` already answers "who,
> -      by name" (`Q-13`); this module adds the one comparison neither
> -      `PersonRecord` nor `person-fact-dispute.ts` exposes — "was that name
> -      *this same person*" — by reading the same `audit_events` action's
> -      `actor_person_id` directly, once per changed field.
> - 2.  **Completing the four onboarding items whose "who" is the player or is
> -      derived from what the player just gave** — `code_of_conduct`,
> -      `photo_release`, `contact_academic_details`, `season_welcome_consent`.
> -      `membership.ts`'s own two mutators do not fit: `claimOnboardingItem`
> -      only ever accepts a `trust`-class item (BUCS Play and Hudl, reused here
> -      unchanged), and `resolveOnboardingItem` always records `actorKind:
> -      "operator"`, which would misattribute the player's own confirmation or
> -      a derived completion. Reusing either for these four items is not
> -      possible without misrecording who acted, so this module's own small
> -      writer records `actorKind: "player"` for the two documents and
> -      `actorKind: "system"` for the two derived items instead.
> -
> - ## Emergency contact fields are overwritten in place, not disputed
> -
> - `docs/architecture/data-model.md` and `person-fact-dispute.ts`'s own module
> - note both scope the disputed-fact mechanism to exactly the seven `people`
> - columns `updatePersonField` can silently overwrite. `person_emergency_contacts`
> - is documented as "overwritten in place" — third-party data about somebody
> - who never agreed to be in this system, structurally isolated, with no
> - provenance-ranking mechanism built for it. This module follows that shipped
> - design rather than inventing a second dispute shape the schema does not
> - carry: a player's own correction to an emergency contact field always
> - writes directly, through `updateEmergencyContactField`, exactly as the
> - operator edit surface already does.
>   */

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/player-questionnaire/step1.ts — mobile/email shape check

> per Brian's correction (B-001, LAN-216 round 1): "Should be the same as
> all other form validations we have."

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
