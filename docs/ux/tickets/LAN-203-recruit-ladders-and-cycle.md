# LAN-203 — Two ladders, the recruitment cycle, and the two approval defects

Status: implemented. This is the **as-built** contract, written as part of delivery because the
mission packet (`missions/intake/M-RECRUITMENT/workflows/W10-administer-recruitments-machinery.md`
and `W11-run-a-recruitment-event.md`) and the LAN-203 issue body — including Amendment 1 (the
consent model, packet amendment 1), Amendment 2 (the missing schema) and Amendment 4 (the LAN-202
seam) — supplied the design authority rather than a pre-implementation wireframe ticket. This file
extends `docs/ux/tickets/LAN-171-plan-and-schedule.md`, whose contract for the messaging plan
disclosure and the messaging schedule page it does not restate, and does not restate
`docs/ux/slice-ux.md` or the shared Administration contract in
`docs/ux/tickets/LAN-73-shell-and-access.md`.

> **Synthetic scenario data:** every displayed person, date and count in this mission's mockups is
> synthetic and does not correspond to real members.

## Purpose

Two defects live on `main` before this package: a recruit invited to a recruitment event received
the player reminder-and-escalation ladder that ends with the President, and an operator approving
a recruitment event was never told how many recruits it reached. This closes both, gives recruits
their own ladder — one invitation, at most one polite follow-up, never an escalation
(`REQ-two-ladders`, `REQ-never-harsh`) — and gives the recruitment cycle (the welcome and the two
questionnaire asks that fire on capture, not on an event) a place to live and be administered.

## Controlling sources

- Workflows: `missions/intake/M-RECRUITMENT/workflows/W10-administer-recruitments-machinery.md`
  and `W11-run-a-recruitment-event.md`.
- Screens: `missions/intake/M-RECRUITMENT/mockups/shots/` — `W10-01`, `W11-01`–`W11-06`.
- The LAN-203 issue body and its four amendments (consent model, missing schema, merge lane, the
  LAN-202 seam), and LAN-199's template manifest (`recruit_welcome_v1`,
  `recruit_details_reminder_v1`, `recruit_interest_ask_v1`, `recruit_event_followup_v1`, and the
  off-by-default `recruit_interest_reminder_v1`).
- `docs/architecture/data-model.md`'s "Recruitment messaging (LAN-203)" section for the schema.

## Owned screens and routes

| Screen                                                 | Route                      | Audience                                     |
| ------------------------------------------------------ | -------------------------- | -------------------------------------------- |
| Recruitment cycle section (three rows)                 | `/operate/admin/messaging` | Operator holding `delivery_administration`   |
| Recruitment event row, split into two audience groups  | `/operate/admin/messaging` | Operator holding `delivery_administration`   |
| Onboarding section heading (structure only, not built) | `/operate/admin/messaging` | Operator holding `delivery_administration`   |
| Messaging plan disclosure, grouped by audience         | `/operate/events/[id]`     | Designated event approver / operator         |
| A recruit's reduced confirm screen                     | `/a/[token]`               | Unauthenticated recruit, from a WhatsApp tap |
| A recruit's saved screen (the token, consumed)         | `/a/[token]`               | Unauthenticated recruit                      |

## This ticket builds

### The two defects

- `scheduleEventLadderIn` (`src/lib/services/messaging-scheduler.ts`) now anchors and chases a
  recruit invitation on the Recruits group's own lead and cadence, never the player one — a
  separate `update`/`insert` pair, filtered by `invitations.capacity`, rather than one unfiltered
  statement covering every capacity. `raiseDueEscalations` carries the same filter: a recruit
  crossing the shared response deadline never raises a flag and never reaches the President's
  outstanding count.
- `countByCapacity` (`src/lib/services/event-approval.ts`) reports `recruit` alongside `player`,
  `coach` and `committee` in the `event.approved` audit row's `byCapacity`.

### The recruit ladder

- `event_messaging_plans` gained six `recruit_*` columns, frozen at approval on the same
  copy-not-a-reference idiom the seventeen player columns already use — `null` together on every
  event whose confirmed audience carries no recruit. Computed whenever the schedule carries
  recruit configuration (today, exactly the Recruitment event type), independent of whether this
  particular event's audience actually includes one, on the same footing the player ladder is
  computed independent of whether any player was invited.
- The one permitted follow-up is capped by the shared response deadline (the same
  `available = floor(runway / cadence)` boundary the player ladder's own arithmetic uses,
  including that a rung landing exactly on the deadline still counts) — never a second one, and
  never scheduled past it.
- Consent-gated in two places: `scheduleEventLadderIn` never creates the follow-up job for a
  recruit with no granted `season_messaging_consents` record this season, and `claimJobIn`
  (`src/lib/services/delivery.ts`) refuses the invitation job itself at the moment it would send,
  for the same reason — `approveEvent` already creates one invitation job per audience member
  regardless of capacity, unmodified. Neither refusal falls back to email: withholding consent is
  not a channel problem, and the automatic WhatsApp-to-email fallback is deliberately not
  triggered for it (`not_consented` is its own `ClaimOutcome` reason, recorded the same visible,
  retryable way `unschedulable` already is).

### The messaging plan, grouped by audience — `REQ-approval-shows-both-ladders`

- The pre-approval review and the approved event page's messaging plan disclosure
  (`src/app/operate/events/[id]/messaging-plan.tsx`) show a "Regular players" heading and rows,
  then a "Recruits" heading and rows, exactly what approval will send to each — never an
  escalation row in the Recruits block. An event with no recruit ladder renders exactly as
  `LAN-171` shipped it: no heading, no second block.

### The recruitment cycle — `REQ-recruitment-cycle`

- `/operate/admin/messaging` reads as three sections (W10, Brian 2026-08-31): **Recruitment**
  (the cycle), **Event messaging** (the seven event types, unchanged in every row but
  Recruitment's own), and **Onboarding** (a heading with nothing built behind it yet, so the
  structure already has the shape Mission 7 needs).
- Three rows in the Recruitment section, cloned from the shipped `schedule-row` idiom: **Welcome**
  (fires on capture, offset `0`), **Details reminder** (the one nudge to finish the sign-up form —
  packet amendment 1 withdrew `recruit_details_ask`, so the welcome is now that ask and this is
  what used to be its own reminder), and **Recruitment questionnaire**, which covers two database
  rows — the football-background ask and its own reminder, off by default per LAN-199 — in one
  form and one save, on the same several-columns-one-row law the event rows already keep.
- Each step carries its own on/off switch. W10's own gap: the shipped page had no precedent for
  "whether a step runs at all" (`schedule-row-toggle` is the unrelated "Show an example"
  disclosure); this control is this package's own, drawn once.
- Timing fields read in whole hours after capture throughout, including the two-field
  questionnaire row — not the mixed hours/days the mockup's own screen drew, and not a
  reminder-relative "N hours after the ask" for the questionnaire's second field: every step's own
  offset stays meaningful on its own once the step it might otherwise be measured from is switched
  off. An appearance departure from the mockup (Q-23: structure and copy come from the mockups and
  the specs; units and labelling are the shipped application's own idiom), recorded here rather
  than escalated because it changes no stored value's meaning and remains fully editable.

### The Recruitment event row's two audiences — `DEC-split-on-the-schedule`

- The Recruitment row's body carries "Regular players" (the shipped six fields, unchanged) and
  "Recruits" (`recruit_invitation_lead_days`/`recruit_follow_up_cadence_hours`, LAN-201's own
  columns) as two named groups, one row and one save covering both — Brian, 2026-08-31: "on the
  recruit event, instead, you're going to have two sections." No President field for Recruits:
  there is nothing to configure, because recruits are never escalated.

### A recruit's answer path — `REQ-recruit-sees-public-only`, `REQ-no-reason-asked`

- The recruit event follow-up template's yes/no buttons carry one-time answer tokens on the exact
  substrate a player's own reminder already uses, landing on `/a/[token]`. That route now branches
  on the invitation's capacity: a recruit sees a reduced confirm screen carrying only the event
  name, when, and venue — never their own name framed as "Player", never the event's questions,
  never who else was invited or answered, and never a reason field on a No. A recruit's invitation
  itself is unchanged (`event_invitation`, the one template every audience shares); only the one
  follow-up carries the new `recruit_event_followup` template.
- `submitAnswer` sends a recruit back to `/a/[token]` itself rather than to the durable
  `/me/[token]` page — which reads every invitation a person has ever held, exactly the exposure
  `REQ-recruit-sees-public-only` forbids, and which a recruit has no reason to visit at all ("There
  is no event page for them," W11). No durable person token is minted for them. The route's own
  "already recorded" branch, reached once the token is consumed, is what a recruit's saved page
  is — "Your response is saved", the answer and the event on one line.
- A No is never asked for a reason: the field simply is not rendered, so `consumeAnswerTokenIn`'s
  existing blank-reason fallback (`NO_REASON_GIVEN_DEFAULT`, "No reason given") is what writes the
  `rsvp_responses` row. `rsvp_responses_no_requires_a_reason` is unchanged and unweakened —
  satisfied before the row is ever offered to the database, exactly as the player path already
  satisfies it.

### The template registry

- Five new `MessageKind`s (`src/lib/delivery/provider.ts`, `templates.ts`): `recruit_event_followup`
  (wired into the live dispatch path — `messageKindFor` reads the invitation's capacity for
  exactly this one case) and the four capture-cycle kinds LAN-199 names
  (`recruit_welcome`, `recruit_details_reminder`, `recruit_interest_ask`,
  `recruit_interest_reminder`), declared with their exact parameter shapes and button labels but
  not yet reachable through a job — see "Explicitly not in this ticket".

## Explicitly not in this ticket

- The capture-time declaration function that would turn "a recruit was captured" into the four
  cycle steps' `notification_jobs` rows, and the wiring of `runMessagingSweep`/`dispatchJob` to
  actually send one. No caller exists in `main` today (the walk-up and operator-add capture flows,
  LAN-205/LAN-206, have not landed), and none of LAN-199's four templates are Meta-approved either
  way — "the cycle can be built and cannot run" (LAN-203's own boundary). This ticket is the
  "built" half: the schema, the read/write service, and the admin section that edits it.
- The QR code, deliberately: it lives on the recruit board and its own page (W1-04), not here —
  "This workflow is the cycle and nothing else" (W10, Brian 2026-08-31).
- The recruits audience group and its count on the event audience builder — both already existed
  (`src/lib/services/event-audience.ts`, D46) before this package started.
- A composer, free text, two-way chat, or any inbound WhatsApp handling. Templates only, on every
  surface this ticket touches.
- Real WhatsApp sending of any kind — LAN-90 and LAN-92 remain binding, and none of this can run
  until LAN-199's templates clear Meta's review, which is an owner action outside this ticket.
- A migration to widen `notification_job_type` or add a column to `notification_jobs` for the
  capture cycle. That table already accepts a `person_id`-only row with no `invitation_id` or
  `event_id` — the shape `job_type = 'escalation'` already uses — so a capture-triggered send
  needs no schema change to declare, once something exists to declare one.

## Ticket interaction contract

- The recruit ladder, the recruitment cycle's rows, and the Recruitment event row's Recruits group
  are all read through the same service functions the player-facing surfaces already use; nothing
  here is a second copy of arithmetic that lives elsewhere.
- A recruitment cycle step's save, and the Recruitment row's save, are each attributed in
  `audit_events` on the same `deriveEntityIdFromNaturalKey` idiom `messaging_schedules` already
  uses — `recruitment_cycle_steps` carries no `updated_by_person_id` column, deliberately, for the
  identical reason that table does not: a foreign key to `public.people` on reference data is a
  table the synthetic seed's `truncate ... cascade` would take out from under the club's own
  configuration.
- Consent is checked at the moment of an actual send (`claimJobIn`), and at cycle-step
  job-creation time for the recruit follow-up (`scheduleEventLadderIn`) — never inferred, never
  cached, and never widened to the existing player-facing sends this package does not touch.
- Preserve the desktop and 375px information hierarchy. Responsive reflow may not remove required
  information or actions.
- Before a later change to any of these surfaces, re-read the live LAN-203 issue (all four
  amendments), this file, and `docs/ux/tickets/LAN-171-plan-and-schedule.md`, and reconcile
  anything recorded since.

## Acceptance criteria

Restated from the LAN-203 issue's own "Done when" as what was built to satisfy them:

- A recruitment event approved with both audiences plans two ladders; `scheduleEventLadderIn`
  creates no escalation job for a recruit invitation, and never chases one past its own one
  follow-up.
- `countByCapacity` reports recruits in the approval summary.
- Both defects carry a regression test that fails with the defect restored and passes after the
  fix (`event-approval.test.ts`, "the recruit ladder — LAN-203").
- Nothing is sent to a person with no granted consent record for the season, proved by test
  (`delivery.test.ts`, "the recruit consent gate — LAN-203").
- Nothing is ever sent to a recruit who declined, and there is never a second reminder for any
  step: a recruit's pending follow-up is cancelled the moment they answer, through the same
  `recordAnswerIn`/`stopChasingIn` path players already use.
- A recruit declining an event writes an `rsvp_responses` row with a system-supplied reason,
  without being asked for one, and `rsvp_responses_no_requires_a_reason` is unchanged.
- A recruit sees only an event's public details — never attendance, never who else was invited or
  answered, never roster or member data.
- The messaging schedule and the approval plan are proved at desktop and a measured 375px.
- `npm run verify` passes.

## Known deviations from the mission packet's mockups

- The recruitment cycle's timing fields read in whole hours throughout, including the
  Recruitment-questionnaire row's two fields, rather than the mockup's mixed hours/days units, and
  the questionnaire reminder's field is "hours after capture" rather than "hours after the ask" —
  see "The recruitment cycle" above. Appearance and field semantics, not structure: the mockup's
  own "which two fields, on which row" shape is unchanged, and every value stays fully editable.
- The on/off switch on every recruitment cycle row is this package's own drawing. W10 records the
  gap explicitly — the shipped page has no precedent, and the mockup left it undrawn pending "what
  it should look like" — so there is no mockup rendering to diverge from; a plain `Switch` beside
  each step's timing field was judged the smallest addition consistent with the row's existing
  density.

## Decision history relocated from source (LAN-300)

### src/app/a/[token]/terminal-panels.tsx — `RecruitAlreadyRecorded`

> LAN-203. The recruit journey's actual saved page: "Your response is
> saved", the answer and the event on one line — the same shape the
> mockup's illustration draws — reached because `submitAnswer` sends a
> recruit back to this exact route rather than to `/me/[token]`. No "your
> own page" note, because there is no such page for them.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/admin/messaging/schedule-form.tsx — `MessagingScheduleForm`

> The whole editable schedule — three sections (W10, Brian 2026-08-31):
> **Recruitment**, the cycle that fires on capture; **Event messaging**, the
> seven event types this page has always carried, with the Recruitment
> row's own body now split into its two audiences
> (`DEC-split-on-the-schedule`); and **Onboarding**, a heading with nothing
> built behind it yet, so the page already has the shape Mission 7 needs.
>
> Recruitment sits first — "what fires when somebody is captured" is a
> different question from "what an event sends", and it is the question W10
> puts first. The QR code is deliberately not here at all: it lives on the
> recruit board (W1) and its own page (W1-04) — "This workflow is the cycle
> and nothing else."

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/admin/messaging/schedule-form.tsx — `CycleStepRow`

> One recruitment cycle row — always two `recruitment_cycle_steps` rows, one
> form, one SAVE: Welcome covers `welcome` and its own `details_reminder`
> ("the top two bars here should be made as one", Brian, 2026-09-01);
> Recruitment questionnaire covers `interest_ask` and its own
> `interest_reminder`, unchanged. Two offset fields, two rows, one save —
> never two cards, never two saves.
>
> No per-step on/off control — Brian, 2026-09-01: "the toggles were
> completely invented… Remove the toggles." `recruitment_cycle_steps.enabled`
> still exists in the database (no migration); this page simply no longer
> draws or submits it, so every step now sends on its own offset alone.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/admin/messaging/schedule-row.tsx — `RecruitmentScheduleRow`

> The Recruitment event row, split into its two audiences —
> `DEC-split-on-the-schedule`, LAN-203. The row keeps its identity: one row
> per `event_type`, one SAVE per row, both laws of this page — the six
> fields above stay Regular players' own, unchanged, and the two Recruits
> fields are appended into the same form and the same submit.
>
> Brian, 2026-08-31: "on the recruit event, instead, you're going to have
> two sections: one for regular players, one for recruits." No President
> field for Recruits — there is no escalation to configure, because
> recruits are never escalated (`REQ-two-ladders`, `REQ-never-harsh`).

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/admin/messaging/cycle-validation.ts — module header

> Reading and checking the recruitment cycle's own rows — LAN-203,
> `REQ-recruitment-cycle`. The `validation.ts` ergonomic-layer-in-front-of-
> the-database idiom, for the cycle's four steps instead of the seven event
> types.
>
> ## Why a form can cover more than one step
>
> `messaging_schedules_and_chase`'s law is one row, one form, one SAVE — and
> the cycle's own two rows (Brian, 2026-09-01) keep it: **Welcome** is one
> page row _of the page_ covering two database rows, `welcome` and its own
> `details_reminder` — "the top two bars here should be made as one… the
> first message gets sent out 0 hours after, and then the second one" — and
> **Recruitment questionnaire** is the same shape, covering `interest_ask`
> and its own `interest_reminder`. Both are the same "several columns, one
> row, one save" idiom the Recruitment event type's six fields already use.
> `readCycleStepsChange` is therefore given the list of step names one
> submission covers, and reads each one's own field out of the same
> `FormData` by a `step_<name>_` prefix, rather than being called once per
> database row.
>
> ## No `enabled` — superseded, Brian, 2026-09-01
>
> `REQ-recruitment-cycle`'s per-step toggle is gone: "the toggles were
> completely invented… Remove the toggles." This module reads and validates
> only each step's timing field now; `recruitment-cycle.ts`'s own module note
> explains why the database column survives untouched while the application
> stops reading and writing it.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/admin/messaging/schedule-row.tsx — TIMING_FIELDS/LADDER_FIELDS

> The two field groups Brian's own round-2 mockup draws for one row:
>
> ```
>   RSVP by      First inv.   Cadence
>   [ 2 ] days   [ 5 ] days   [ 24 ] h
>
>   WhatsApp     Email        President
>   [ 2 ]        [ 1 ]        [ 12 ] h
> ```
>
> `SCHEDULE_FIELDS` is already declared in exactly this order, so the groups
> are a slice rather than a second list that could drift from it.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/admin/messaging/schedule-row.tsx — ScheduleRow, row heading (Q-23)

> Q-23: the row heading is a style question, not structure — the
> mockup's own rendering does not govern it, the shipped application
> does. `../roles/page.tsx` and `../operators/page.tsx` both draw
> their per-card entity-name heading as `subtitle2`/700, not the
> all-caps `overline` this card carried before that check (chosen on
> the strength of the dispatch's own capitalised ASCII art) nor the
> `subtitle1` a first pass at fixing it picked by eye from a mockup
> screenshot rather than the real component.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/admin/messaging/schedule-row.tsx — worked-example preview, gap-before-deadline callout

> OWNER-LAN171-07, round 3: the gap-before-the-deadline callout is
> deliberately not rendered here. Brian: "get rid of this
> callout. The last reminder lands 1 day before the deadline it
> is chasing. Nobody is contacted in the 1 day that actually
> matter. I don't know why that's there. That's confusing." Under
> the corrected ladder arithmetic (Q-19) it fires on the shipped
> defaults, so a warning that should flag a misconfigured
> schedule instead fires on the normal case and trains an
> operator to ignore it. `row.preview.warning` itself is still
> computed by `buildSchedulePreview` and still proved by
> `presentation.test.ts` and R3-B1 in
> `messaging-schedule.test.ts` — only this surface stopped
> drawing it.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/a/[token]/presentation.ts — LAN-203 section banner.

> A recruit reaches this exact route through `recruit_event_followup`'s own
> yes/no buttons (the invitation itself reuses `event_invitation`
> unchanged), and needs distinct copy in three places: the player's page
> name and event questions are never asked of them, a No is never asked
> for a reason, and "Go see other events" presumes an app account they do
> not have.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-approval/write.ts — countByCapacity (W11/LAN-203)

> W11's second defect, LAN-203: this omitted recruits entirely, so an
> operator approving a recruitment event was never told how many recruits it
> reaches — precisely the number they care about most. `recruit` is one of
> four values `AudienceCapacity` already carries (`../event-audience.ts`);
> this function had simply never been extended to read it.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/recruitment-cycle.ts — module header

> ## The per-step toggle — superseded, Brian, 2026-09-01
>
> `REQ-recruitment-cycle`'s "each of which can be turned off, per cycle" is
> superseded: "the toggles were completely invented. That has never been
> part of this… Remove the toggles." The `enabled` column stays in the
> database, untouched — this is a presentation-layer change, not a
> migration — but the application no longer reads or writes it, so every
> row's stored value is inert from here on and every step sends on its own
> offset alone. `RecruitmentCycleStep`/`RecruitmentCycleStepChange` below
> carry no `enabled` field for exactly that reason.
>
> ## The declaration — Brian, 2026-09-01
>
> {@link declareRecruitmentCycleJobsIn} turns "recruit X was captured" into
> the `notification_jobs` rows the two steps describe, honouring consent,
> the recruit's own status, and completion (below). It still has **no
> caller**: the capture event itself belongs to LAN-205 (walk-up) and
> LAN-206 (operator-add and Questionnaire B's own form), neither of which
> has landed. "The cycle can be built and cannot run" now means exactly
> that one thing — the capture-time trigger — not the declaration or the
> dispatch, both of which are real and tested here and in
> `messaging-scheduler.ts`.
>
> ## Completion — `REQ-recruitment-cycle` amended, Brian, 2026-09-01, corrected
>
> by LAN-205
>
> "If they fill out the whole thing… then it doesn't send out again." The
> Welcome step's own completing fact is **the recruit having reached the
> sign-up form themselves** — LAN-202's `qr_self_entry` consent source,
> `season_messaging_consents.source = 'qr_self_entry'` for this
> `(person, season)` — and Questionnaire B's B1–B5 for the questionnaire
> step — never B6, and never college, matriculation, graduation or degree,
> which stay optional at recruit stage (`REQ-recruit-stage-optional`,
> finding 7, Mission 7's own enforcement, record-only here).
> {@link readRecruitmentCycleCompletionIn} is the read; `declareRecruitmentCycleJobsIn`
> and `messaging-scheduler.ts`'s `dispatchRecruitmentCycleJob` are its two
> callers, the first turning it into a refusal to create a job, the second
> into a refusal to send one already declared.
>
> This was originally "first name, last name and mobile on file", which is
> what the sign-up form's own required set happens to be — correct for the
> QR and tokenised doors, where those fields arrive _because_ the recruit
> filled the form in, and wrong everywhere else. LAN-205 found the defect
> this produced: the walk-up door writes that exact set (given name, family
> name, a current phone) in the _same transaction_ that captures the
> recruit, per its own 2026-09-01 mandatory-mobile amendment, so the welcome
> track read `already_complete` for every walk-up before its declaration was
> ever attempted — and `declareRecruitmentCycleJobsIn` sent
> `recruit_interest_ask` (a football-background questionnaire) instead of
> `recruit_welcome` (the signed sign-up-form link), which is not the one
> template the walk-up's read-back opt-in authorises. The fields being on
> file said only that an _operator_ had captured them; they never said the
> recruit had been through the form the welcome message exists to send them
> to. Keying completion on the consent source instead answers the question
> the step is actually asking, for every door alike, walk-up and
> operator-add (LAN-206) included, with no per-caller flag to remember.
>
> Questionnaire B's own collecting form does not exist yet — LAN-206 — so
> nothing can honestly answer B1–B5 today outside a test that inserts rows
> directly. The completion check is built against
> `recruitment_questionnaire_responses` as the real, permanent source
> regardless — never a stub, never gated on a form this package cannot
> reach — proved by tests that insert B1–B5 rows directly and observe the
> check flip. The two-ask cap (`the ask and one reminder, then silence,
never a third`) is structural, not counted: the schema offers exactly one
> `ask_offset`-shaped slot and one reminder-shaped slot per step (still
> `recruitment_cycle_steps.offset_hours`, one column, two rows —
> `interest_ask`/`interest_reminder` — per the presentation-layer note
> above), so there is no third slot to ever schedule from.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
