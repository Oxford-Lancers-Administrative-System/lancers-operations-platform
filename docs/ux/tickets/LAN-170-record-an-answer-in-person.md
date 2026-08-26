# LAN-170 — Record an answer somebody gave you in person

Status: workflow `W3` approved by Brian on 25 August 2026 — _"I trust it's
there. Make the spec W3 approved."_ Verify against the current live Linear
issue before further implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses,
> responses, and attendance records are synthetic and do not correspond to real
> members.

Work package `WP-record-in-person` of mission
`M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY`, workflow `W3`. Controlling
sources:
[`missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/workflows/W3-record-an-answer-somebody-gave-you-in-person.md`](../../../missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/workflows/W3-record-an-answer-somebody-gave-you-in-person.md)
and its acceptance,
[`.../acceptance/W3.md`](../../../missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/acceptance/W3.md);
Brian's portfolio decision of 19 August 2026 (`PILOT-verbal-rsvp`), amended
25 August 2026 on where provenance is shown; `T03-gap-operator-correction`;
`T03-arriving-rsvp-cancels`; and this ticket's own contract,
[`LAN-157-participation-and-club-link.md`](./LAN-157-participation-and-club-link.md),
for the card idiom this surface extends.

## Purpose

A player answers a coach at training instead of in WhatsApp. This ticket adds
the control that records that answer against the invitation, so it counts
exactly like one the player gave themselves, stops the chase, and stays
findable in the audit trail without cluttering the row.

Shared vocabulary, authorization and responsive behaviour are defined in
[`../slice-ux.md`](../slice-ux.md) and [`../standards.md`](../standards.md) and
are not duplicated here.

## Owned screens and routes

No new route. Everything lives on the LAN-157 participation table at
`/operate/events/[id]`, operator tier only:

| Screen  | What it is                                                           |
| ------- | -------------------------------------------------------------------- |
| `W3-01` | **Record answer** on a row (desktop) or card (375px) with no answer  |
| `W3-02` | The recording dialog — response, when, reason, the event's questions |
| `W3-03` | The row afterwards — an ordinary answer, no provenance shown         |

`W3-04` (superseding a player's own answer) is in the mission's mockup but is
**cut** — see Deviations.

## Wireframes

The approved artefact is the mission mockup, desktop 1280 and 375px, current
build against proposed:
[`missions/packets/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/mockups/W3.html`](../../../missions/packets/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/mockups/W3.html),
with the `W3-01`, `W3-02`, `W3-03`, `W3-04` and `W3-current` desktop/375
screenshots beside it. See Deviations for where the `W3-01` capture disagrees
with the text it illustrates.

## This ticket builds

- **The row control.** `RecordAnswerControl` — a bordered row-action button
  that **replaces** the existing "No answer" text entirely, rendered only for
  an operator, only against a row that carries a real invitation, and only
  where the answer is `null`. A walk-up never gets it: nobody asked them
  anything to record. Every cell in the Answer column holds exactly one
  element — the absence of an answer chip is itself the "no answer" signal
  (OWNER-LAN170-05, correction round 3; see Correction history).
- **The recording dialog.** An exclusive Yes/No toggle, a "when did they tell
  you" date and time (defaulting to now, backdating allowed, postdating
  refused), and — depending on which answer is selected — either a required
  reason (No) or the event's own questions, answerable in the same form,
  partially or not at all, and never blocking the answer (OWNER-LAN170-07).
- **The write.** `recordOperatorRsvpResponse` in `src/lib/services/rsvp.ts` —
  an ordinary `rsvp_responses` row with `source = operator` and the recording
  operator's own person id, in the same transaction as cancelling that
  person's pending player-facing reminders and (optionally) upserting answers
  to the event's own questions.
- **Three fields surfaced for the first time.** `OperatorParticipationPerson`
  gained `invitationId` (operator tier only, same boundary as `delivery`),
  `ParticipationQuestion` gained `choices` (both tiers), and
  `ParticipationQuestion` gained `isRequired` (both tiers, correction round 3,
  `event_questions.is_required`) — read-only additions to
  `src/lib/services/participation.ts` / `participation-view.ts` that this
  control needed and nothing before it read that far into a question.

## Explicitly not in this ticket

- **Superseding a player's own answer.** Cut by Brian on 25 August 2026 —
  _"We're not building this into the workflow. It's too much. Cut it."_
  **Record answer** therefore appears only on a row with no answer at all.
- **Clearing an un-actioned `nonresponse_flags` row was never this package's
  own write.** It comes for free: `WP-messaging-foundation` (LAN-169) landed
  after this ticket was drafted and extended the shared `stopChasingIn`
  function this package factored out of `recordSignedLinkResponse` (merged in
  at correction round 2) to also clear the flag, so an operator's recorded
  answer clears it exactly as a player's own answer does, with no code in this
  package aware of the flag's existence.
- **Attendance.** A recorded RSVP never marks or implies attendance — Task 04's
  axis, untouched here.
- **Delivery, scheduling, or sending anything.** This write never queues a
  notification job; it only ever cancels pending ones.

## The one tier this surface has

Operator only. `RecordAnswerControl`'s floor is `requireGeneralOperator()` —
the same boundary `readOperatorParticipation` already draws, and the workflow's
own "which operator roles may record" question is recorded as open for Brian,
with "any authorized operator who can already see the participation table" as
its working default. The control is a courtesy; the boundary is the guard
inside `recordOperatorAnswerAction` and `recordOperatorRsvpResponse`, which
re-resolves the invitation inside its own transaction rather than trusting
anything a stale render passed it.

## Ticket interaction contract

- **The row control replaces the chip; it never sits beside it.** An
  unanswered row shows only `Record answer`, styled as the repository's
  ordinary bordered row-action button (`variant="outlined" color="inherit"`).
  A row that already carries an answer, or that the control is not offered
  against, is unaffected and still shows its chip. (OWNER-LAN170-05,
  correction round 3 — see Correction history; supersedes the original
  "beside the chip" design below in Deviations.)
- **The answer choice is a standard MUI `ToggleButtonGroup` with
  `exclusive`.** Yes and No are one exclusive choice from a fixed set, not two
  independent actions, and the selected option carries MUI's own selected
  treatment whichever option it is — including No. There is no rule making
  Yes the only option allowed to look chosen; that earlier rule
  (`REQ-emphasis-points-at-yes`) never applied to this surface at all — it is
  a player-facing rule from workflow W2, about the landing pages and a
  player's own page, and Brian corrected the packet that carried it here on
  26 August 2026. **Answer colour still binds**: Yes keeps `color="success"`,
  No keeps `color="error"`, on both the unselected and the selected
  treatment. `ToggleButton` sets `aria-pressed` itself from `selected`, so a
  screen reader gets the same fact a sighted operator does. (OWNER-LAN170-06,
  correction round 3.)
- **Progressive disclosure: one branch's fields at a time.** Yes selected
  shows the event's own questions and not the reason; No selected shows the
  required reason and not the questions; nothing selected shows neither. This
  scopes the "event's questions answerable in the same form" requirement to
  the case where the questions mean anything — their substance is unchanged,
  they are simply not offered alongside a No, where transport questions are
  meaningless. They still never block the answer either way.
  (OWNER-LAN170-07, correction round 3.)
- **A question the event marks required still says so here**, worded so it
  cannot be read as "optional for the player": the label "Required of the
  player, optional to record now" (`QUESTION_REQUIRED_OF_PLAYER_OPTIONAL_HERE`)
  replaces the bare "Optional" label when `question.isRequired`. Recording
  itself never gates on it — `recordOperatorRsvpResponse` has no such check,
  and this package does not add one. (OWNER-LAN170-08, correction round 3.)
- **Answer colour follows `participation-table.tsx`:** once recorded, the row
  reads through the same `AnswerChip` every other row uses — Yes is `success`,
  No is `error` — because the recorded answer is, deliberately, an ordinary
  one.
- **No provenance on the row.** Brian's amendment of 25 August 2026: _"If you
  did record an answer, it should just say yes and change... The audit keeps
  that trail there, but other than that, we don't have to say it does."_ No
  badge, no "recorded by", no second line.
- Below the table breakpoint, the control renders in LAN-157's card idiom,
  replacing the chip there exactly as it does on the desktop row. **No
  horizontal scrolling at 375px.**
- **No em dashes in any button label** — Brian settled this for the whole
  mission (journal Q-10).
- Material UI v9 throughout; system styling in `sx`. The dialog's `<form>`
  starts inside `Dialog`'s own markup rather than around it — MUI renders the
  dialog through a portal, and a form wrapping it would not actually enclose
  its submit button in the DOM.
- The copy rule: the form says what a control does and what happens next. It
  never explains its own design and never justifies a default.

## Correction history

- **Round 2** (Brian's first walkthrough) replaced a bespoke ring-and-dim
  selection treatment with the `action.selected` tint (OWNER-LAN170-03), and
  fixed the date/time picker's future-bound and five-minute-step defects
  (OWNER-LAN170-04).
- **Round 3** (Brian's second walkthrough, 26 August 2026) is this revision.
  Round 2's bare-text row button, the `action.selected` tint, and the
  "Yes is always filled" rule it depended on are all gone, replaced by the
  bordered row button and the `ToggleButtonGroup` described above
  (OWNER-LAN170-05, -06). Progressive disclosure narrows where the event's
  questions appear (OWNER-LAN170-07). The seed now carries enough unanswered
  invitations and at least one required question on the events nearest the
  operator's own "now" for these states to be walkable, and a wording fix
  keeps a required question from misstating whose rule is whose
  (OWNER-LAN170-08).

## Acceptance criteria

1. **Record answer** appears only against an invitation with no answer at
   all, on the desktop row and in the 375 card.
2. Recording writes an ordinary response with `source = operator` and the
   recording operator's own person id.
3. The row then just says Yes or No — no badge, no "recorded by", no second
   line — and counts in the headline numbers like any other answer.
4. Who recorded it, and when the player said it, live in the audit trail.
   `responded_at` stays distinct from `recorded_at`.
5. A No requires a real reason, in the form and in the service layer.
6. `responded_at` may be backdated, never postdated, and never before the
   invitation existed (floored to the minute it was created).
7. The event's own questions are answerable in the same form when Yes is
   selected — narrowed from "always" by OWNER-LAN170-07 (correction round 3),
   since they are meaningless alongside a No. Partial answers are accepted
   and never block the answer; unanswered ones stay outstanding.
8. Recording cancels that person's pending player-facing reminders in the
   same transaction, and they leave the chase list.
9. Superseding an answer the player gave themselves is out of scope — the
   control is never offered on a row that already carries one.
10. A recorded RSVP never implies attendance.

## Deviations from the approved mockup

1. **The `W3-01` screenshot does not visibly show the button.** Both rows the
   capture names as "the two people yet to answer" (Alwyn Cholmondley, Jarrah)
   render only the existing "No answer" chip in the captured JPG, with no
   control beside it — inspected directly, cropped and upscaled, rather than
   assumed. `W3-02` and `W3-03` are captured correctly. This reads as a capture
   defect in the packet rather than a design change: the workflow document's
   own prose, the acceptance contract's criterion 1, and Brian's verdict
   ("I trust it's there") all describe the control existing on that row. This
   package implements the acceptance contract's text; the stale capture is
   flagged here for Brian's eye rather than resolved silently.
2. **Superseded in correction round 3 (OWNER-LAN170-05).** This deviation
   originally kept the control beside the "No answer" text rather than
   replacing it, reasoning that the acceptance contract said only where the
   control appears. Brian's second walkthrough overturned that: stacking a
   chip above a control in one narrow cell read as awkward regardless of the
   acceptance text's silence on it, and his decision — chosen against a
   clickable-chip alternative and a separate actions column — is that the
   button replaces the chip entirely. The interaction contract above reflects
   the current, shipped behaviour; this entry stays only as the record of
   what changed and why.
3. **"When did they tell you?" is two pickers, not one combined field.** The
   approved mockup shows a single field; this ticket reuses the event form's
   own `DatePicker` + `TimePicker` pair (`dd/MM/yyyy`, 12-hour clock, 5-minute
   steps) rather than introducing a second date-time control, because that
   pair already carries fixes for locale-independence defects
   (`W154C-C1`/`C2`) a new combined picker would have to rediscover.
4. **The future/before-invitation bounds are enforced only in the service
   layer.** This package ships no migration, so there is no database
   constraint backing them the way there is for the reason requirement — a
   limitation recorded in the pull request.

## Open for Brian

Which operator roles may record is not settled — the workflow document
records it as "Open — needs Brian" and this ticket uses the recommended
default (any authorized operator who can already see the participation
table). Narrowing it is additive and does not block the rest of the workflow.
