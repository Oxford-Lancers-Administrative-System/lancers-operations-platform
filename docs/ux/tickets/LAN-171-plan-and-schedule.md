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
  Roles: one editable card per event type, each with its own **Save `<event type>`** button
  (round 2, OWNER-LAN171-04 — a page-level save read as "one act" over seven independent rows,
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
- Saving a schedule change writes an attributed `audit_events` row even though
  `messaging_schedules`' own key (`public.event_type`) is not a uuid: `entity_id` is a UUIDv5
  derived deterministically from the event type (round 2, OWNER-LAN171-01 — the literal event
  type text was rejected by `audit_events.entity_id`'s `uuid` column, silently rolling back every
  save since the page shipped).
- A write that genuinely fails names the row and the submitted values rather than suggesting a
  retry that cannot fix a deterministic rejection (round 2, OWNER-LAN171-02).
- One card per event type below the table breakpoint; no horizontal scrolling at 375px.

## Explicitly not in this ticket

- A per-event override of any kind — the schedule is set per event type only, never per event
  (ADR 0021, unchanged).
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
- The messaging schedule is editable per event type and offers no per-event override anywhere in
  its markup.
- Every schedule row previews the dates it produces, starts closed, and does not draw a callout
  for the gap before the deadline — that arithmetic is still computed and tested, only not shown.
- Each event type saves independently, through its own button; saving one row never touches
  another's.
- The WhatsApp count includes the invitation, and its label never calls the invitation a reminder.
- Changing the schedule leaves already-approved events untouched, and every change is attributed —
  including that the write itself succeeds: a schedule change actually persists, and its audit row
  actually exists, for every event type (round 2, OWNER-LAN171-01).
- One card per event type below the table breakpoint; no horizontal scrolling; desktop and true
  375px both conform.
- `npm run verify` passes.

## Known deviations from the mission packet's mockups

- `TYPE_LABELS` renders "Strength and conditioning" (the application's existing canonical label,
  used everywhere else an event type is shown) rather than the mockup's "Strength & conditioning".
  One label per concept across the application was judged more valuable than matching the
  mockup's ampersand.
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
