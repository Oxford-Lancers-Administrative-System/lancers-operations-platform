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
- `missions/intake/M-RECRUITMENT/mockups/proposals/W6-01.js`, `W6-02.js`,
  `W8-01.js`, `W4-01.js`–`W4-03.js` — the approved, generated injection
  scripts, executable against the real application rather than freehand
  markup, read directly rather than from their photographs. `mockups/src/`
  holds each one's own source and reasoning; `mockups/shots/` the photographs
  taken from a run of them, used here only to check a reading of the code.
- `missions/intake/M-RECRUITMENT/workflows/W6-add-a-recruit-by-hand.md`,
  `W8-resolve-a-possible-duplicate.md`, `W4-fill-in-your-details.md`. The
  2026-09-01 amendment supersedes `W6`/`W4` where they disagree; W8 is
  superseded by Brian's 2026-08-31/09-01 removal of the parked-capture queue.
- The shipped surfaces this door clones: `src/app/operate/people/new/` (the
  four-field form, its duplicate check, its exact-match override) and
  `src/app/a/[token]/question-field.tsx` (Questionnaire B's three controls).

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
  door's own opt-in evidence. Its four options are `W6-01.js`'s own literal
  list: "They gave it to us at the Freshers' Fair", "They gave it to us at a
  taster", "A current player passed it on", "Somewhere else" — plus a
  default "Not recorded", which the mockup does not draw (nothing in the
  approved shots shows the door with no evidence chosen) but the ticket's own
  Done-when requires: _"With no opt-in evidence the recruit is created and no
  message is sent."_

**The duplicate check's answer renders above the form, not below it** —
`W6-02.js`: "the duplicate check if it finds something needs to go at the top,
not the bottom" (Brian, 2026-09-01). `create-person-form.tsx`'s own shipped
layout puts it beneath the fields; this door departs from that one placement
deliberately, per the mockup's own correction.

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

Reuses `question-field.tsx`'s own three controls exactly — `boolean` for the
two "have you ever" questions, `choice` for a fixed set, `text` for
"anything else" — never a fourth, and never a multi-select: `W4-02.js`'s own
approved field table names each of Position interest and Gear owned a single
chooser, and the shipped `QuestionField` exports no multi-select variant to
clone one from. Every field carries no `isRequired` — `REQ-missing-never-blocks`
and W4's own "every field is optional and nothing gates."

Heading, subtitle and the six fields' prompts and choice lists are
`W4-02.js`'s own copy, verbatim. The mockup script's trailing `note(...)`
call is the mission's own explanatory annotation for the approval packet —
compare `W6-01.js`'s identical pattern — never on-screen copy; this page
carries none of it, per `docs/ux/standards.md`'s no-narrative-text rule.

**A recruit answering twice supersedes the earlier answer, which is kept** —
the same token resolves and re-renders the same form, prefilled with
whatever is currently on record, on every visit; there is no separate
"already answered" screen (the approved shots name only the form itself and
the uniform invalid page — W4-01, superseded by the sign-up form, is the only
other approved shot, and it is not built here). A successful submit redirects
back to the same route with a small, transient confirmation banner —
`?saved=1` — the same idiom `/a/[token]`'s own RSVP flow already uses for a
transient state (`busy`), not a structural departure from the approved shot.

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
- **No multi-select control.** See "Questionnaire B" above.

## Visual evidence

`/operate/recruitment/new` (empty, the duplicate check answering with two
candidates, and the exact-match override) and Questionnaire B at `/a/[token]`
(empty and prefilled) were proved at desktop (1440px) and a
Playwright-measured 375px — `npm run visual:preflight` against the real
login. See the package receipt for the exact routes and the ignored evidence
path.
