# LAN-171 — The messaging plan an approver reads, and the club's messaging schedule

Status: implemented. This is the **as-built** contract, written as part of delivery because the
mission packet supplied the design authority (workflows, acceptance evidence and mockups) rather
than a pre-implementation wireframe ticket. The current live LAN-171 issue, its dispatch
corrections, `docs/adr/0036-messaging-schedule-configuration.md`, Brian's round-2 walkthrough
findings (Q-19; OWNER-LAN171-01 through -05), and his round-3 findings (OWNER-LAN171-06 through
-09) remain authoritative; this file records what was actually shipped and does not restate
`docs/ux/slice-ux.md` or the shared Administration contract in
`docs/ux/tickets/LAN-73-shell-and-access.md`.

> **Synthetic scenario data:** every displayed people, date and count in this mission's mockups is
> synthetic and does not correspond to real members.

## Purpose

Two surfaces answering one question — _what will this event actually send?_ — before it sends
anything, and where the rules behind that plan are read and changed.

## Controlling sources

- Workflows: `missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/workflows/W1-approve-an-event-knowing-what-it-will-send.md`
  and `.../W7-find-out-what-the-clubs-messaging-rules-are-and-change-them.md`.
- Acceptance: `missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/acceptance/W1.md` and
  `.../W7.md`.
- Mockups: `missions/packets/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/mockups/W1.html` and
  `W7.html`, and the `W7-01`/`W7-02` screenshot pairs (desktop and 375px) — the design intent that
  governs where the running application and the `-current` captures disagree.
- ADR 0036 and the surviving parts of ADR 0021.

## Owned screens and routes

| Screen                                         | Route                              | Audience                                   |
| ---------------------------------------------- | ---------------------------------- | ------------------------------------------ |
| W1-01 Messaging plan disclosure (pre-approval) | `/operate/events/[id]?step=review` | Designated event approver                  |
| W1-02 Concise WhatsApp error before approval   | `/operate/events/[id]?step=review` | Designated event approver                  |
| W1-03 Committed plan disclosure (approved)     | `/operate/events/[id]`             | Authorized event operator                  |
| W7-01/02 Messaging schedule                    | `/operate/admin/messaging`         | Operator holding `delivery_administration` |

## This ticket builds

- On the event page's pre-approval review, an expandable **Messaging plan** disclosure showing
  every rung the scheduler will actually create — WhatsApp message 1, WhatsApp message 2 (or
  however many the schedule configures), email, then the follow-up escalation — each with its
  resolved date and time, read through `resolveMessagingPlanIn` rather than re-derived.
- A stated guarantee when the event is closer than its own invitation lead ("goes out now"), and a
  named warning when the runway is too short for the full ladder (late approval: WhatsApp only,
  never escalates), both read from the plan rather than inferred by the screen.
- A concise pre-approval error — "N user(s) have an error" — naming, on request, every audience
  member with no usable WhatsApp number. No manual-send workaround is offered.
- The same disclosure, frozen, on the approved event page — `event_messaging_plans`' stored
  anchor and counts replayed through the same ladder arithmetic, never a second copy of it.
- `/operate/admin/messaging`, **Messaging schedule**, under Administration between Operators and
  Roles: one editable card per **template**, each with its own **Save `<template name>`** button
  (round 2, OWNER-LAN171-04 — a page-level save read as "one act" over independent rows,
  which Brian rejected once he saw it live). Two rows of three labelled fields per card — RSVP by
  / First inv. / Cadence, then WhatsApp / Email / President — each carrying its unit (`days`,
  `h`) beside the value, or no unit for the two plain counts (round 2, OWNER-LAN171-03). Cadence,
  President, WhatsApp and Email also carry a short `helperText` at the field itself, naming what
  the number does — the gap between messages, the hours after the RSVP deadline before the
  President is told, and what each channel's count includes (round 3, OWNER-LAN171-08; Brian: "it
  just says 12 hours, but that doesn't explain what 12 hours after the deadline... is"). A per-row
  worked example previews the dates the policy produces for an event four weeks out, and starts
  closed on every row, every load — opening one is the operator's own choice, with no row
  exempted (round 3, OWNER-LAN171-09; Brian: "all examples should be hidden by default"). It no
  longer carries a callout naming a gap before the deadline: round 2 built that callout to flag a
  badly-configured schedule, but under the Q-19 ladder correction it fires on the shipped
  defaults, warning about the normal case (round 3, OWNER-LAN171-07). The gap is still computed
  and still proved by test — `messaging-schedule.ts` and `presentation.ts` are unchanged — only
  the row stopped drawing it.
- **WhatsApp counts the invitation as message #1** (round 2, Q-19: `REQ-ladder-order` governs over
  W7's looser "reminders" wording). The schedule's WhatsApp count and its grid label ("WhatsApp",
  never "WhatsApp reminders") both reflect this; a policy of 2 WhatsApp + 1 email therefore sends
  the invitation, one further WhatsApp reminder, one email reminder, then the President — four
  messages, not five.
- Saving a schedule change writes an attributed `audit_events` row naming the template it
  changed. It used to need a workaround: `messaging_schedules`' own key was `public.event_type`,
  which is not a uuid, so `entity_id` carried a UUIDv5 derived from the event type (round 2,
  OWNER-LAN171-01 — the literal event type text was rejected by `audit_events.entity_id`'s `uuid`
  column, silently rolling back every save since the page shipped). LAN-265 rekeyed the table by
  `template_id`, which **is** a uuid, so the audit row now names the real row and the derivation
  is retired.
- A write that genuinely fails names the row and the submitted values rather than suggesting a
  retry that cannot fix a deterministic rejection (round 2, OWNER-LAN171-02).
- One card per template below the table breakpoint; no horizontal scrolling at 375px.

## Explicitly not in this ticket

- A per-event override of any kind — the schedule is set per template only, never per event
  (ADR 0021, unchanged; LAN-265 changed what a row is keyed by, not that there is no per-event
  override).
- Reordering the ladder — WhatsApp, WhatsApp, email, then the President is fixed; only spacing and
  counts are configurable.
- Quiet hours, in any form.
- The player-facing surfaces (`src/app/participation/`), the per-event delivery telemetry
  (`/operate/events/[id]/delivery`), and the Meta cutover — LAN-170, LAN-172, LAN-173 and LAN-168
  respectively.
- A second superseding ADR. ADR 0036 already records both reversals this package relies on.
- Widening `audit_events.entity_id` to accept non-uuid values, or any other migration — the
  seeded rows in `public.messaging_schedules` are untouched by round 2; only the arithmetic that
  reads `whatsapp_reminder_count` changed. The seven event types' derived `invitation_lead_days`
  defaults are unchanged and remain provisional: under the corrected count they now leave a
  visible one-day gap on the row preview for every type, by design — that gap is what makes Brian
  confirming a new value (before the first real dispatch) necessary and visible, not a bug to
  paper over here.

## Ticket interaction contract

- The messaging plan disclosure and the WhatsApp-error disclosure are read-only: opening either
  creates no invitation, job or delivery attempt.
- The messaging schedule page is gated on `delivery_administration` — the same four calendar
  roles who already approve events and repair their delivery, plus the transitional IT Officer
  seat — rather than on `role_management`. It is not a widening of `role_management`; see
  `src/lib/auth/capabilities.ts`'s note on the capability.
- A schedule change is attributed in `audit_events` and never retroactive: an event already
  approved keeps the plan frozen in `event_messaging_plans` at the moment it was approved.
- Button labels carry no em dashes.
- Preserve the desktop and 375px information hierarchy the mockups show. Responsive reflow may not
  remove required information or actions.
- Before a later change to either surface, re-read the live LAN-171 issue, this file, and ADR 0036,
  and reconcile anything recorded since.

## Acceptance criteria

Restated from `acceptance/W1.md` and `acceptance/W7.md` as what was built to satisfy them:

- The event page shows event details, then the named audience, then the messaging plan as a
  disclosure; approving the event commits and freezes exactly what was shown.
- An event inside its own invitation lead says, before approval, that it dispatches immediately.
- A missing or unusable WhatsApp route is named as a concise count before approval, with the
  affected person revealed on request; no manual-send control is offered.
- The messaging schedule is editable per template and offers no per-event override anywhere in
  its markup. A template an operator has just created is already on this page, carrying the
  default cadence (LAN-265).
- Every schedule row previews the dates it produces, starts closed, and does not draw a callout
  for the gap before the deadline — that arithmetic is still computed and tested, only not shown.
- Each template saves independently, through its own button; saving one row never touches
  another's.
- The WhatsApp count includes the invitation, and its label never calls the invitation a reminder.
- Changing the schedule leaves already-approved events untouched, and every change is attributed —
  including that the write itself succeeds: a schedule change actually persists, and its audit row
  actually exists, for every template (round 2, OWNER-LAN171-01).
- One card per template below the table breakpoint; no horizontal scrolling; desktop and true
  375px both conform.
- `npm run verify` passes.

## Known deviations from the mission packet's mockups

- The row is labelled "Strength and conditioning" rather than the mockup's "Strength &
  conditioning". It was `TYPE_LABELS`' canonical label, used everywhere else an event type was
  shown; since LAN-265 it is the template's own `name`, backfilled from that label, and the club
  may now change it here to whatever it likes. One label per concept across the application was
  judged more valuable than matching the mockup's ampersand.
- The messaging plan's per-rung "side" chip (`38 people`, `Unanswered`, `Still unanswered`,
  `President`) is real product content on the event page; the mockup's `Proposed` chip is a
  mockup-authoring annotation marking new content for reviewers and was not carried into the
  shipped UI.
- Round 2 (Q-22, refined the same round by Q-23 — the mockup owns structure, the shipped
  application owns style): `W7.html` and the `W7-02` image pair were opened and checked directly
  against the rebuilt schedule row, not worked from dispatch prose alone. Three **structural**
  divergences from `W7-02`, each traced to Brian's round-2 instruction given today looking at the
  live page, which governs over the packet mockup by the Lead's own resolution:
  - **One page-level "Save changes" button** in the mockup, over **one save button per row**
    here — Brian reversed this once he saw the single-button shape live (round 2, OWNER-LAN171-04).
  - **One combined "Reminders" column** (`2 WA, 1 email`) in the mockup, over **separate WhatsApp
    and Email fields** here — Brian's own round-2 grid instruction names them as two fields.
  - The mockup's worked example assumes the **pre-Q19 four-message ladder** (invitation, two
    WhatsApp reminders, one email); the shipped worked example reflects **Q-19's ruling** that the
    invitation counts as WhatsApp #1, producing a three-message ladder for the default policy.

  One **style** correction, caught by the same check and fixed twice before it reached anyone
  else: the row heading had been set in MUI's `overline` (all-caps) variant on the strength of the
  dispatch's own capitalised ASCII art. A first fix picked `subtitle1`/bold by eye from the
  mockup's own screenshot rendering — the wrong authority under Q-23, which is explicit that
  typography is a style question the shipped application decides, never the mockup's rendering.
  The second fix instead read the actual component: `../roles/page.tsx` and
  `../operators/page.tsx` both draw their per-card entity-name heading as `subtitle2`/700, and the
  shipped heading now matches that.

## Decision history relocated from source (LAN-300)

### src/app/operate/admin/messaging/use-result-cleared-by-editing.ts — `useResultClearedByEditing`

> A saved result describes the values that produced it, so editing one of
> them makes it stale — LAN-250.
>
> `docs/ux/standards.md` rule 1 already says a result never outlives the
> thing it describes, and every panel here claims the outcome slot on
> `onSubmit` so the previous result disappears when the next action starts.
> The gap that finding walked into is a submit that never starts: these
> fields carry `min`/`max`, so typing `999999` into "RSVP by" and pressing
> Save makes the browser's own constraint check block the submit. No
> request fires, `onSubmit` never runs, and the server's previous sentence —
> "Practice: player rsvp by cannot be left blank." — stays on screen
> describing a field that is no longer blank and a value the operator can
> see is not empty. The message is then worse than no message: it names the
> wrong fault.
>
> So the trigger is the edit, not the submit. A `change` from any field in
> the form marks the result the operator was reading as belonging to the
> previous values; the next result the action returns is a new object, so it
> is not stale and draws again. Nothing here suppresses a real refusal — it
> only stops one outliving the values it was about.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/admin/messaging/use-result-cleared-by-editing.ts — module header

> Shared by every row form in `schedule-form.tsx` and `schedule-row.tsx`
> (LAN-300) — split out on its own so neither imports the other.
>
> A saved result describes the values that produced it, so editing one of
> them makes it stale. The trigger is the edit, not the submit — a browser
> constraint (`min`/`max`) can block a submit outright, leaving no new
> result to replace the stale one, so a `change` on any field marks the
> current result stale directly rather than waiting for the next submit.
> Nothing here suppresses a real refusal; it only stops one outliving the
> values it was about.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/admin/messaging/validation.ts — module header

> Reading and checking one row's form before it reaches the database — W7,
> LAN-171.
>
> The database's own `messaging_schedules_*` check constraints are the
> backstop (`src/lib/db/errors.ts` names each one in the club's words), and
> this is the ergonomic layer in front of them: the same six bounds, checked
> here so a mistyped field comes back naming the template and the field
> rather than a round trip to the database. Pure and side-effect-free, so it
> is testable without a transaction.
>
> The caller passes the template's **name**, not its id — LAN-265. A refusal is
> read by a person, and "Kicking Clinic: first invitation sent cannot be left
> blank" is the sentence; the id is what the write is keyed by and says nothing
> to anybody. There is no list of valid names to check against here, and there
> deliberately is not one: the templates a club has are data now, and the row
> being saved is one the page just rendered from them.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/admin/messaging/actions.ts — updateOneMessagingScheduleAction

> Saving one template's messaging schedule — W7, LAN-171, rekeyed by LAN-265.
>
> One action per row, not one action for the whole page (OWNER-LAN171-04):
> Brian, on the approved-then-reversed shape, "I think there should be a save
> button per event. Having one group save at the top doesn't really make a
> lot of sense." Each row on `/operate/admin/messaging` posts
> its own `<form>`, carrying a hidden `templateId` alongside its six fields, to
> this one action — which is what "one action per row" actually needs to mean
> for a Server Action: the function is shared, but each row's `useActionState`
> call is independent, so one row's pending/error/notice state can never leak
> onto another's.
>
> `requireCapability("delivery_administration")` resolves the actor from the
> verified session, exactly as every other Administration action does — a
> server action is a POST endpoint the browser can call directly, so an
> action that trusted a hidden field for "who is asking" would trust whatever
> was sent.
>
> A row is written only if it actually changed. `updateMessagingScheduleIn`
> records an audit row carrying both the old and the new values every time it
> is called, and calling it for a row nobody touched would misreport the
> club's history — as attributed as a genuine change, when nothing changed.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-approval/shared.ts — ApprovalPreview.plan

> LAN-171. The whole plan a live approval would commit — the dispatch
> anchor, the ladder and the escalation threshold — read through the same
> arithmetic `approveEvent` uses, at the moment this preview is read rather
> than at some earlier snapshot. `null` exactly where `deadline` is: an
> event with no date yet has no plan to project.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-approval/read.ts — resolveUnreachableIn allowlist independence

> Deliberately independent of `DELIVERY_RECIPIENT_ALLOWLIST`. That allowlist is
> a deployment safety control over which real numbers this environment may
> contact — it says nothing about whether the invitee actually has WhatsApp —
> and folding it in here would tell an approver a real person is unreachable
> when the only obstacle is the showcase's own guard rail.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/audit.ts — deriveEntityIdFromNaturalKey (OWNER-LAN171-01)

> `audit_events.entity_id` is `uuid not null`, and until LAN-171 every audited
> table (`events`, `people`, `seasons`, …) was itself uuid-keyed, so the
> entity's own id always was a legal `entity_id`. `public.messaging_schedules`
> is the first exception (OWNER-LAN171-01): its primary key is
> `public.event_type`, a plain enum label like `"practice"`, and passing that
> straight through made Postgres reject the audit insert — rolling back the
> schedule change with it, silently, on every save.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
