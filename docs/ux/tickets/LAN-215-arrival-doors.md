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

| Screen           | Route/surface                                       | Audience                                                      |
| ---------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| `W1-01`…`W1-04`  | `/operate/roster/import` (new)                       | Four-role (`roster_bulk_import`): President, Vice-President, Secretary, Treasurer, General Manager, IT Officer |
| —                | The roster board's **Add players** menu (new control on `/operate/roster`) | Same as `/operate/roster` itself (`person_record_authority`) |
| `W2-01`…`W2-03`  | `/operate/roster/new` (LAN-74, unchanged as a route)  | The shipped general-operator floor — any linked, active operator who is not a coaching assignment |
| `W3-01`          | `/operate/roster/[membershipId]` (LAN-186/187, unchanged as a route) | Whoever already opens that record |

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
