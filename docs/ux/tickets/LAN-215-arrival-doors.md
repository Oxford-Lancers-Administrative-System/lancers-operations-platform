# LAN-215 - The three arrival doors: import, add one by hand, and the flip's consequences

Status: implemented, as built. This is the contract the shipped surfaces were
built against, not a plan — see `../slice-ux.md` for the shared vocabulary,
authorization and responsive rules this ticket does not restate.

> **Synthetic scenario data:** all displayed people, contact details and
> onboarding states are synthetic and do not correspond to real members.

Authority: LAN-215 in Linear, `missions/packets/M-ONBOARDING-AND-INFORMATION-COMPLETION/packet.json`
(`requirements`, `decisions`, `escalation_rules`), the specifications at
`missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/workflows/W1-bring-last-seasons-squad-in.md`,
`W2-add-one-player-by-hand.md`, `W3-a-flipped-recruit-lands-in-onboarding.md`,
their approvals at `.../acceptance/W1.md`, `W2.md`, `W3.md`, the item-and-ask
inventory at `.../item-and-ask-inventory.md`, and the approved photographs at
`.../mockups/W1-bring-last-seasons-squad-in.html`,
`W2-add-one-player-by-hand.html`, `W3-a-flipped-recruit-lands-in-onboarding.html`
(screens `W1-01`…`W1-04`, `W2-01`…`W2-03`, `W3-01`, desktop and 375px).

## Owned screens and routes

| Screen          | Route/surface                                                              | Audience                                                                                                       |
| --------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `W1-01`…`W1-04` | `/operate/roster/import` (new)                                             | Four-role (`roster_bulk_import`): President, Vice-President, Secretary, Treasurer, General Manager, IT Officer |
| —               | The roster board's **Add players** menu (new control on `/operate/roster`) | Same as `/operate/roster` itself (`person_record_authority`)                                                   |
| `W2-01`…`W2-03` | `/operate/roster/new` (LAN-74, unchanged as a route)                       | The shipped general-operator floor — any linked, active operator who is not a coaching assignment              |
| `W3-01`         | `/operate/roster/[membershipId]` (LAN-186/187, unchanged as a route)       | Whoever already opens that record                                                                              |

`W3` draws no route and no card of its own — its whole content is what Mission
6's flip transaction additionally does, read afterwards on the existing
record. This ticket does not restate `/operate/roster/[membershipId]`'s own
contract; nothing about its rendering changed.

## What renders

### `W1` — the bulk import

One screen in three states, following `/operate/events/import`'s own shape
(`OD7-import-like-events`) rather than inventing one: **start here** — the
season's own player/onboarding counts, a file picker, the template download,
and the six-column list in place of an AI-conversion prompt (a roster file
comes off a spreadsheet directly, so there is no prompt to copy); **the
proposal** — a totals strip, the confirmation table (outcome, name, mobile,
personal email, college, year, what happens), and, only when at least one row
needs one, a **possible duplicates** section beneath it; **applied** — a
success line, counts including welcomes queued and checklists generated, a
"Who arrived" list and a "What was refused, and why" list, replacing the
confirmation table rather than reverting to the empty start screen.

**The six columns**: `first_name`, `last_name`, `mobile` required;
`personal_email`, `college`, `matriculation_year` optional. No date of birth,
no emergency contact — both asked at onboarding, of everyone, and neither
belongs on a spreadsheet (locked decision, `acceptance/W1.md`).

**Outcomes**: New, Carried forward, Unchanged, Refused — exactly the four the
specification names. A row's own shape (a missing required field, an
unreadable mobile, two rows naming the same person by first name, last name
and mobile) refuses it without ever asking the database anything. A row that
matches an existing person only by **name** is genuinely ambiguous and is
asked about, once, in the duplicates section — **Same person** resolves to
Carried forward (or Unchanged, if that person already holds a membership this
season) and **Different person** resolves to New. A row whose **mobile**
exactly matches an existing person's own auto-resolves to Carried forward or
Unchanged without asking at all: a mobile number is single-owner, so the match
is a confirmed identity rather than a possible one — this is also the
mechanism that makes re-importing the identical file idempotent
(`acceptance/W1.md`'s own "same file imported twice" evidence). This threshold
is a delegated implementation choice (`escalation_rules.permitted_clarifications`),
not a locked decision.

**The menu wording is Brian's own** (`acceptance/W1.md`, "Menu wording"
correction) and is not this ticket's to improve: **Add one player** and
**Bulk import players**, on the roster board's own **Add players** control,
following `/operate/events`' `create-menu.tsx` shape exactly, per the Linear
issue's own instruction.

**Authority is four-role**, narrower than the general-operator floor the
surrounding roster surfaces use, because a single confirm can create dozens of
people who have not yet heard from the club (locked decision, `acceptance/W1.md`).
Enforced twice: at the page (`gateShellPage`) and again in the service
(`requireCapability("roster_bulk_import")` in every exported function of
`roster-import.ts`), on `/operate/events/import`'s own precedent.

**Nothing is written until confirmed.** The file's text and the operator's
duplicate answers travel through the form exactly as `/operate/events/import`'s
own confirmation carries its file text — never stored — and the plan is
recomputed and digest-checked inside the apply transaction, refusing outright
if the roster moved underneath the operator.

### `W2` — add one player by hand

`/operate/roster/new` is unchanged as a route: the same three steps, the same
duplicate-candidate review, the same already-a-member refusal, the same
redirect to the created record — none of it rebuilt (locked decision,
`acceptance/W2.md`). What changed: **last name and mobile join first name as
required** (the form was behind the required set it already fed), and
**confirming now queues the welcome in the same transaction** as the
membership and its checklist. Personal email stays optional. Authority stays
at the shipped general-operator floor — this is the everyday single-record
path, not the bulk write `W1` narrows for. No new UX element was added, per
Brian's own condition on this workflow's approval.

### `W3` — the flip's far side

No action, no route, no card. Inside Mission 6's existing flip transaction,
four things now also happen: the checklist generates (already true before this
package — drift-reconciled), the welcome queues, the recruit's own durable
link is revoked with an audit entry naming the supersession, and consent is
touched by nothing at all — the recruit's own consent row, granted at the
door, already **is** their consent for the season by the schema's own
`(person_id, season_id)` uniqueness. `membership_entry` stays `('new','returning')`,
unchanged — a flipped recruit reads identically to a hand-added player on the
roster board, which the packet's own decision records as "the one worth
revisiting" without making it this mission's to change.

## The one welcome

One template (`onboarding_welcome`), door-independent: the same
`emitOnboardingOpenedWelcomeIn` call queues it from `W1`'s bulk apply, `W2`'s
confirmation, and `W3`'s flip alike, and `messaging-scheduler.ts`'s
`dispatchOnboardingWelcomeJob` is the one place that sends it, on Mission 4's
pipeline. It is the one message the refuse-without-basis check
(`mayReceiveWelcomeContactIn`) permits before a messaging basis exists; every
other kind of onboarding message keeps requiring a granted consent. The
durable link a recipient's welcome carries is minted at dispatch, never at
declaration — a previously issued plaintext credential cannot be recovered —
and superseding it there is the same "second half" of `W3`'s ask-supersession
that the flip's own transaction starts.

## Explicitly not in this ticket

- The person record, its activity log, and disputed-fact resolution — later
  packages'.
- The onboarding form itself, the compiled ask, and everything under
  `/me/[token]`, `/me/join/[token]`, `/me/stop/[token]` — a concurrently
  running, separate package's surface, untouched here.
- BPS on the roster, activation, the follow-up queue, and the chase's own
  configuration — later packages'.
- `onboarding_welcome`'s WhatsApp template submission to Meta — a future,
  separate owner action; it dispatches against the local/dev provider only
  today, on the identical posture the recruitment cycle's own five templates
  already carry.
- Changing `membership_entry`'s two values, or which questionnaire answers
  pre-fill the onboarding form — both out of scope by the packet's own
  boundary.

## Acceptance criteria

The thirteen numbered criteria in `WP-arrival-doors`'s brief, and the
acceptance evidence sections of `acceptance/W1.md`, `W2.md` and `W3.md`, are
binding verbatim. This document does not restate them.

## Decision history relocated from source (LAN-300)

### src/app/operate/roster/import/page.tsx — module header

> `/operate/roster/import` — the CSV bulk import of last season's squad.
> LAN-215, `WP-arrival-doors`, workflow `W1`.
>
> New. There is no roster import anywhere on `main` before this package; the
> one thing this work changes on an existing screen is the roster board's own
> **Add player** control, which becomes the **Add players** menu —
> `../add-players-menu.tsx`, following the shape LAN-155 already gave the
> Events page.
>
> ## Three independent refusals, exactly as `/operate/events/import` has
>
> The layout guards the frame, `gateShellPage` guards this page, and
> `readRosterImportContext()` guards itself again in the service layer —
> `roster_bulk_import`, four-role, not the shipped general-operator floor
> `/operate/roster/new` (`W2`) stays at.
>
> ## Why the screen is a client component
>
> The file, the proposal and the confirmation are three states of one
> screen: nothing is written until the operator confirms, and the uploaded
> file is never stored — it lives in the request that produced the proposal
> and in the confirmation form the operator is looking at, on
> `/operate/events/import`'s own precedent (`OD7-import-like-events`).

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/roster/add-players-menu.tsx — module header

> **Add players**, as a menu of exactly two. LAN-215, screen `W1-01`.
>
> The Events page already carries a menu of this shape
> (`../events/create-menu.tsx`, LAN-155), and the Linear issue for this
> package names it directly as the surface to follow rather than invent a
> second one. This component is that pattern, retitled for the roster's own
> two doors.
>
> The two labels are Brian's own words, not this package's to improve —
> `acceptance/W1.md`'s "Menu wording" correction, taken before W1's approval:
> "Add one player by hand" became **Add one player**, and "Import last
> season's squad" became **Bulk import players**.
>
> Both destinations sit behind their own authority: `/operate/roster/new`
> stays at the shipped general-operator floor (W2), and
> `/operate/roster/import` is four-role (W1, `roster_bulk_import`) — this
> menu draws no distinction between the two entries, because a hidden or
> disabled item here would be a courtesy, never the boundary. Each
> destination's own page and service guard again.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/roster/import/import-state.ts — module header

> What the roster's bulk import screen hands back and forth. LAN-215, `W1`.
>
> Mirrors `../../events/import/import-state.ts` line for line, plus one
> field the event import has no need of: `duplicateAnswers`, the operator's
> running "same person / different person" answers, carried through exactly
> as the file's own text is — never stored, rebuilt into the proposal on
> every submission.
>
> Types come from `@/lib/services/roster-csv`, which is pure, and never from
> `@/lib/services/roster-import`, which is `server-only` — the client
> component reads this module, and a type import that dragged the database
> module into the browser bundle would not build.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/roster/import/export/route.ts — module header

> The roster import's template — the header row an operator's spreadsheet
> has to match. LAN-215, `WP-arrival-doors`, workflow `W1`.
>
> ## Why there is no round-tripping export here
>
> `/operate/events/import`'s own export round-trips an `id` column so a
> second import can recognise "this is the same event, edited" — this
> importer has no such column: a person is matched by the duplicate
> question, never by a spreadsheet identifier, so there is nothing an export
> of the current roster would let a re-import upsert against. Delegated to
> the Mission Lead (`acceptance/W1.md`) and settled this way: the template
> alone, on the identical byte-order-mark and authorization reasoning
> `/operate/events/import/export/route.ts` states in full.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/roster/new/validation.ts — FAMILY_NAME_REQUIRED

> LAN-215, W2's locked decision: "Last name and mobile become required,
> joining first name" — the approved item-and-ask inventory and
> `person-required.ts`'s own recruit tier, which already requires all three
> at every rung. The form was behind the required set it feeds; today only
> first name was enforced.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/roster-csv.ts — module header

> `OD7-import-like-events`, Brian 2026-09-01: the roster import follows the
> event import's shape rather than inventing one — the same three-state
> screen, the same proposal-before-write contract, the same partial-apply
> behaviour, the same never-store-the-file posture.
>
> ## Why it is pure, and has no database
>
> The confirmation table is a client component and the uploaded file is never
> stored — it lives in the request that produced the proposal and in the
> confirmation form the operator is looking at, exactly as `./event-csv.ts`'s
> own doc comment states for events. Anything the confirmation renders has to
> be reachable without `pg`.
>
> ## The mobile shape check, since LAN-215's B-007
>
> `mobile` used to be checked by a private, deliberately loose rule — any
> value with seven or more digits — because the club's real files contain
> numbers one digit short, and rejecting the whole row lost the contact
> entirely. Brian's correction is that the club's spreadsheet defects and a
> form a person is typing into are different problems: this file still
> refuses only the _one row_ a bad number appears on, by its own reason,
> naming the phone — every other row still lands — so tightening the rule
> costs nothing an operator cannot see and fix. The check itself is now
> `src/lib/validation/contact.ts`'s `looksLikePhone`, the same predicate
> `/operate/roster/new` uses, so a number this importer accepts is a number
> that could actually receive the welcome.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/roster-import.ts — module header

> ## Authorisation is here, not in the route
>
> `W1`'s own specification: "the guard is enforced twice — at the page and
> again in the service — as `/operate/events/import` does." Every exported
> function below opens with `requireCapability("roster_bulk_import")` before
> it reads or writes anything, on `event-import.ts`'s own precedent.
>
> ## What a duplicate answer is, and how it travels
>
> `W1`'s confirmation grows one section the event import has no need of:
> "each incoming row that matched an existing person, shown beside the
> candidate ... with the operator's answer required." That answer cannot be
> decided by this module — it is a human judgement about a specific pair of
> records — so it travels exactly as the file's own text does: back to the
> browser in the rendered proposal, and returned as a plain map on the next
> `propose` submission (never stored). A row still unanswered when
> `confirmed` is pressed is `refused`, and only that row — `W1`'s own
> decision, locked 2026-09-01.
>
> ## The write itself is Mission 5's, reused rather than duplicated
>
> `W1`'s own specification: "The person write is Mission 5's too.
> `enterReturningPlayer` in `src/lib/services/roster.ts` already mints a
> person, their contact points and a season membership from the
> returner-intake path." Every applicable row — `new` and
> `carried_forward` alike — is written by calling that function once, inside
> this module's own transaction (`withTransaction` joins rather than
> nesting, exactly as `event-import.ts`'s own doc comment states for
> `createEventDraft`/`updateEventDraft`), so the membership, the checklist
> and the queued welcome it already writes are this import's writes too,
> with no second, quieter copy of any of the three.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
