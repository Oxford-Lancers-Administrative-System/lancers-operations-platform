# LAN-206 — Add by hand, resolve a duplicate, and the interest questionnaire

**Workflows:** `W6 — Add a recruit by hand`, `W8 — Resolve a possible duplicate`, `W4 — Fill in your details` (Questionnaire B only)
**Routes:** `/operate/recruitment/new` (built here, replacing LAN-204's placeholder) · `/a/[token]` (extended here for Questionnaire B; the RSVP answer-link flow it already carries is unchanged)
**Shared contract:** [`../slice-ux.md`](../slice-ux.md) · [`../standards.md`](../standards.md) · [`LAN-202-signup-consent-gate.md`](./LAN-202-signup-consent-gate.md) (the consent gate every send checks; the door's own opt-in evidence, distinct from it) · [`LAN-203-recruit-ladders-and-cycle.md`](./LAN-203-recruit-ladders-and-cycle.md) (the cycle this door declares into) · [`LAN-204-recruit-board-record-exits-flip.md`](./LAN-204-recruit-board-record-exits-flip.md) (the record's own SEND/RESEND button, unchanged) · [`LAN-205-walk-up-and-recruits-first.md`](./LAN-205-walk-up-and-recruits-first.md) (the sibling door's own send machinery, same shape)

## Why this contract exists

LAN-206's own Linear body, its packet amendment 1 (the consent model) and its
2026-09-01 amendment ("this package builds its own send machinery") are the
approved design; Linear is not a durable repository contract. This records
what was built from them.

Sources, in the authority order `slice-ux.md` §1 sets:

- `LAN-206` in Linear, both amendments, and packet amendment 1, approved by
  Brian 2026-08-31 and 2026-09-01.
- **Correction round 1 (Brian, 2026-09-02, quoted in full below): "Mock up
  wins."** The runnable fidelity mockup — `src/app/recruitment-preview/` on
  `origin/chore/recruitment-fidelity-mockup`, in particular
  `add-recruit.tsx` and `questionnaire-b.tsx`, read with `git show` rather
  than checked out (that branch is eleven commits behind `main`) — outranks
  the approved, generated screens below wherever the two disagree on
  **structure or copy**. Appearance (styling, spacing, components, idiom)
  is unaffected by this ruling and still comes from the shipped application.
- `missions/intake/M-RECRUITMENT/mockups/proposals/W6-01.js`, `W6-02.js`,
  `W8-01.js`, `W4-01.js`–`W4-03.js` — the approved, generated injection
  scripts, executable against the real application rather than freehand
  markup, read directly rather than from their photographs. `mockups/src/`
  holds each one's own source and reasoning; `mockups/shots/` the photographs
  taken from a run of them, used here only to check a reading of the code.
  Superseded by the fidelity mockup above wherever the two disagree.
- `missions/intake/M-RECRUITMENT/workflows/W6-add-a-recruit-by-hand.md`,
  `W8-resolve-a-possible-duplicate.md`, `W4-fill-in-your-details.md`. The
  2026-09-01 amendment supersedes `W6`/`W4` where they disagree; W8 is
  superseded by Brian's 2026-08-31/09-01 removal of the parked-capture queue.
- The shipped surfaces this door clones: `src/app/operate/people/new/` (the
  four-field form, its duplicate check, its exact-match override) and
  `src/app/a/[token]/question-field.tsx` (Questionnaire B's three controls,
  reused for four of its six fields — see "Questionnaire B" below).

### The three-way conflict, and how it was settled

The Lead's own mid-task correction had told this package's implementer that
the fidelity mockup branch added nothing beyond the `mockups/` directory
already covered above — wrong: the branch also carries
`src/app/recruitment-preview/`, 7,339 lines that exist there only. The
implementer recorded the resulting three-way conflict (mockup vs. approved
screens vs. what shipped) as an honest limitation rather than silently
picking one, and the Lead put it to Brian in prose, quoting all three
sources. Brian's ruling, in full: **"Mock up wins."** This correction round
is that ruling applied.

## Three doors, three deliberate postures — not normalised

`W5`'s touchline checks nothing; this door runs the full shipped duplicate
check; `W7`'s QR door asks one question. `W8-01.js`'s own build note states
this is intended (Brian, 2026-08-31, on the walk-up door: "I'm going to keep
it as it is right now"). There is no `/operate/recruitment/review` queue —
Brian deleted the parked-capture queue on 2026-08-31 and confirmed it on
2026-09-01: a duplicate that gets through a door's own check is the people
table's own merge (`/operate/people/[personId]/merge`, Mission 5, unchanged),
never a second resolution path this package builds.

## `/operate/recruitment/new` — `W6`

`create-person-form.tsx` and its server action, cloned wholesale for the four
shipped fields (First name, Last name, Mobile phone, Personal email) and the
check-then-create flow — `findPersonDuplicates`, called and never
duplicated. Two additions, both `W6-01.js`'s own:

- **An Academic section beneath the four fields** — College and Matriculation
  year, the person record's own fields, as **text inputs** matching the
  shipped person-edit form's `CorrectableField`s (`W6-01.js`'s own comment:
  they render as a fixed-set chooser in the mockup script only because no
  select exists on the cloned route to photograph one from — the written
  intent is text, and that is what shipped).
- **"How we came by this number"** — a select, genuinely a fixed set, this
  door's own opt-in evidence, plus a default "Not recorded" — the ticket's
  own Done-when requires: _"With no opt-in evidence the recruit is created
  and no message is sent."_ **Correction round 1 (F-206-02):** the four
  options are now `add-recruit.tsx`'s own literal list — "They gave it to
  us themselves", "A member passed it on with their agreement", "It is
  publicly listed and they expect to hear from clubs", "Something else —
  written below" — superseding the earlier reading drawn from
  `W6-01.js`'s own proposal script, per Brian's "Mock up wins" ruling.
- **"In your own words"** — restored in correction round 1 (F-206-02):
  `add-recruit.tsx`'s own free-text field beside the chooser above, with its
  own helper text ("Free text alone is unauditable and a tick alone records
  nothing, so this door asks for both."), optional, written as the recruit's
  first note (`addRecruitmentProspectNoteIn`, the shipped mechanism — never
  a second notes table) when supplied.

**The duplicate check's answer renders above the form, not below it** —
`W6-02.js`: "the duplicate check if it finds something needs to go at the top,
not the bottom" (Brian, 2026-09-01). `create-person-form.tsx`'s own shipped
layout puts it beneath the fields; this door departs from that one placement
deliberately, per the mockup's own correction.

**Correction round 1 (F-206-02) — the door's own controls, not the shipped
form's.** `add-recruit.tsx`'s own structure: the header carries only
`Cancel`/`Check for duplicates`, **never** a button whose label morphs by
state (the shipped `create-person-form.tsx`'s own idiom, which this door no
longer follows); the four-field-plus-Academic form stays visible
throughout, never conditionally hidden; and a match, once found, renders its
own subtitle — "_N_ records look like this person. Nothing has been written
yet." (`add-recruit.tsx`'s own copy, count-aware; "No record looks like this
person. Nothing has been written yet." for zero matches, since the mockup's
own fixed two-candidate demo has no zero-match state to draw) — and its own
two controls inside the candidates panel: **"This is somebody new"** (or
"Create anyway" over an exact contact-point match, unchanged) and **"Go back
and change the details"**, which dismisses the panel without writing
anything (a new `intent="dismiss"` branch in the server action, touching no
service and no database) so the still-visible form below can be edited and
checked again.

**Each candidate says who it is** — `W8-01.js`: "Are they a part of the
current season? Are they already a player on the season? Are they another
recruit?" A new read (`recruitment-candidate-identity.ts`, read-only, calling
no write and duplicating no query `person-duplicate.ts` already runs)
resolves each candidate's current-season membership, current-season prospect
status, or most recent past season, in the club's own vocabulary
(`MEMBERSHIP_STATUS_LABELS`, `PROSPECT_STATUS_LABELS`) — rendered as a chip
on the candidate row, e.g. "Player · Active · 2026-27" or "Past member · last
played 2024-25".

**An existing player is refused, not converted** — W6's own exception. Linking
onto a person who already holds a season membership is refused before
`createPerson` is ever called (`refuseIfAlreadyAMemberIn`), so nothing —
not even the link's own audit row — is written for a refused link. The button
itself is never disabled (the same "a disabled button hides the refusal"
reasoning `send-questionnaire-button.tsx`'s own doc comment already states
for this codebase); pressing it opens the same server round trip and the
refusal renders in words, alongside a standing warning under a player
candidate's own row.

**Mobile is mandatory here too** — the 2026-09-01 amendment's own line: "at
every door: first name, last name and mobile." The shipped form's own
required rule ("mobile or email") is not loosened; this door adds its own
stricter field error and its own service-layer backstop
(`requireMobileProvided`) on top of it.

## The send machinery — `declareRecruitmentCycleJobsIn`, called once

With opt-in evidence recorded, `finishRecruitmentAddIn` grants
`season_messaging_consents` (`state: granted`, `source: operator_recorded`,
the same raw-insert idiom `authoriseWalkUpMessagingIn` already uses for
`walk_up_read_back` — `messaging-consent.ts` deliberately never writes either
source itself) and calls `declareRecruitmentCycleJobsIn` (LAN-203), in the
same transaction as the prospect row. With no evidence, neither ever runs —
the recruit is created, and nothing is declared, so nothing is ever sent; no
new "why" indicator was built because the shipped SEND/RESEND dialog on the
record already answers it (`not_consented`).

Declaring a job is not sending one — the existing scheduler sweep claims and
dispatches it, on the welcome step's own offset, unchanged. Proved end to end
against the real local delivery sink: the job created by this door is
claimed, rendered with `recruit_welcome`, and accepted by the sink —
`recruitment-cycle-dispatch.test.ts`'s own LAN-206 suite.

## Questionnaire B, at `/a/[token]`

Four of the six fields reuse `question-field.tsx`'s own shipped controls
exactly — `boolean` for the two "have you ever" questions, `choice` for
"How did you hear", `text` for "Anything else". **Correction round 1
(F-206-02):** "Which positions interest you?" and "What playing gear do you
already have?" are now genuine multi-selects — Brian, quoted in
`questionnaire-b.tsx`'s own comment: "A recruit is allowed to be interested
in more than one thing." The original delivery read `W4-02.js`'s approved
field table as naming each a single chooser and reused `QuestionField`
unmodified for both, which the "Mock up wins" ruling supersedes. Positions
are the fidelity mockup's own 22, grouped Offence / Defence / Special teams,
`CODE · Label`; gear is its own six individual items (Boots, Gloves,
Mouthguard, Helmet, Shoulder pads, Padded trousers), retiring the five
preset bundles the superseded reading offered — a recruit owning boots and
a mouthguard could previously only claim "Full pads" (false) or "Something
else" (uninformative). `question-field.tsx` exports no multi-select variant,
so these two use a small dedicated client component
(`multi-select-checkboxes.tsx`) of plain `Checkbox`/`FormControlLabel`
pairs — the same idiom `audience-builder.tsx` already ships elsewhere in
this application, native and uncontrolled (`defaultChecked`, no client
state), each option its own checkbox under one shared `name` so the plain
server-action `<form>` collects every selection via `formData.getAll`. The
schema needed no migration: a multi-select answer joins its selected values
into the one string `answer_choice` already stores
(`recruitment_questionnaire_responses_exactly_one_answer`'s own shape).
Every field still carries no `isRequired` — `REQ-missing-never-blocks` and
W4's own "every field is optional and nothing gates."

Heading, subtitle, every field's prompt and the submit label all now follow
`questionnaire-b.tsx`'s own copy, verbatim, per the same ruling — "Football
background" / "For the coaching staff. Every question is optional." /
"Submit", not the earlier reading's "About your football experience" /
"…nothing here decides whether you can play…" / "SEND MY ANSWERS". The
mockup script's own `note(...)`/explanatory `Scaffold` panels remain
reviewer annotation, never on-screen copy, per
`docs/ux/standards.md`'s no-narrative-text rule.

**A recruit answering twice supersedes the earlier answer, which is
kept.** **Correction round 1 (F-206-02)** replaced the single
always-the-form render with `questionnaire-b.tsx`'s own three real states:
a first-time or `?edit=1` visit renders the form, prefilled with whatever is
currently on record; a successful submit redirects to `?saved=1` and shows
"Answers received / Nothing further is needed." with its own "Change an
answer" link (back to `?edit=1`); and a later revisit with an answer already
on record and no `?saved=1` shows "Already completed / You can change any
answer." with the same link. `W4-01` (Questionnaire A, superseded by the
sign-up form) is the only other approved shot for this route and is not
built here.

**The uniform invalid page is the existing one, reused, not rebuilt** — an
unresolvable Questionnaire B token calls the same `notFound()` this route
already calls for an unresolvable RSVP token, rendering `not-found.tsx`
unchanged. `W4-03`'s copy ("This link is no longer valid… It may have
expired, or it may have been replaced by a newer one") already matches that
shared page's own wording.

### The credential, and why it lives at `/a/[token]`

Questionnaire B's own link is a new, purpose-tagged `person_access_tokens`
row (`recruitment-interest-tokens.ts`), resolved by a bare-token branch added
to the top of `page.tsx`, ahead of the unchanged RSVP resolution — the two
shapes can never collide (a bare 43-character token carries no dot; an
answer token always carries two). `/a/[token]` was the substrate this
mission already named for a signed-link "fill in a form" journey (W4's own
"Route/placement" line), so this reuses that route rather than minting a
second one; the answer-link flow already living there is untouched, byte for
byte, outside the one new branch.

### One open request per person, ever

`person_access_tokens_one_open_purpose_request` (this package's migration,
`20260902090000_recruitment_forms_open_request.sql`) is the substrate: a
partial unique index on `(person_id, purpose)`, `purpose` a new nullable
column so every existing row (the durable player-page credential, every RSVP
one-time answer token) is untouched. `issueRecruitmentInterestTokenIn`'s own
revoke-then-insert is `issuePersonTokenIn`'s exact idiom, so the reminder's
own mint always supersedes the ask's — the ask's link goes dead the moment
the reminder's own is issued, proved end to end
(`recruitment-cycle-dispatch.test.ts`). Missions 7 and 8 inherit the same
guarantee for their own signed-link asks by adding their own `purpose` value,
never by re-deriving the rule.

## What is deliberately not here

- **No `/operate/recruitment/review`.** See "Three doors" above.
- **No change to `declareRecruitmentCycleJobsIn`'s signature or the template
  registry.** Both are called, unchanged in shape.
- **No real Meta send.** The local sink proof is the acceptance bar; real
  template approval and credentials remain LAN-168, LAN-199 and LAN-210,
  Brian's.
- **No change to `board-columns.ts` or the board's row type** (correction
  round 1's own guard) — `positionInterest`/`gearOwned` were already
  `string | null`, `edit: "none"`, sortable, not filterable, on `main`, and a
  multi-select's joined answer is exactly that shape; the board joins
  nothing itself, it simply displays the one string this package now writes.

## Correction round 1 — resend actually resends (F-206-01)

The reviewer live-reproduced a false status on a reachable path: pressing
the record's own SEND/RESEND button (LAN-204, `send-questionnaire-button.tsx`)
on an **outstanding, unanswered** Questionnaire B request rendered "Already
answered." to the operator while the job sat `pending` — because
`declareRecruitmentCycleJobsIn`'s own idempotent re-declare (`on conflict do
nothing`, nothing new created since the row already exists) is reported with
the same word, `already_complete`, as a track the recruit has genuinely
finished. `sendRecruitmentQuestionnaireIn` (`recruitment-prospect.ts`) now
re-reads completion directly whenever declare reports nothing created and
that reason is `already_complete`: if the track is not actually complete, it
reports the new `"outstanding"` reason instead — surfaced in the record's own
dialog as "Already queued and not yet answered — made due again now." — and
resets the existing job's own `scheduled_for` to now, so a resend actually
brings the ask forward rather than only re-confirming a status. This reuses
the row `declareRecruitmentCycleJobsIn` already created; nothing is ever
inserted a second time, so the two-ask cap — one `interest_ask`-shaped slot,
one `interest_reminder`-shaped slot, structurally, never a third — is
unaffected. The token each resend actually sends still comes from
`issueRecruitmentInterestTokenIn`'s own revoke-then-insert at dispatch time,
unchanged, which is what makes the fresh link supersede whatever was open
before it and keeps the one-open-request substrate satisfied.
`declareRecruitmentCycleJobsIn`'s own contract, and its existing callers and
tests, are untouched — this is a reporting and re-scheduling correction in
the one caller this package owns, not a change to the shared cycle function.
Proved by a regression test cited to F-206-01 in
`recruitment-cycle-dispatch.test.ts`, observed to fail with the defect
restored and pass with the fix.

## Visual evidence

`/operate/recruitment/new` (empty; the duplicate check answering with two
real seeded players, both refused; "Go back and change the details"
dismissing the panel back to the still-visible, editable form — all driven
live through the real login) and Questionnaire B at `/a/[token]` (the
multi-select form, empty and prefilled with several selections each; the
"Already completed" summary) were proved at desktop (1440px) and a
Playwright-measured 375px — `npm run visual:preflight` against the real
login. See the package receipt for the exact routes and the ignored evidence
path.
