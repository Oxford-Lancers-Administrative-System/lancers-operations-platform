# LAN-171 — The messaging plan an approver reads, and the club's messaging schedule

Status: implemented. This is the **as-built** contract, written as part of delivery because the
mission packet supplied the design authority (workflows, acceptance evidence and mockups) rather
than a pre-implementation wireframe ticket. The current live LAN-171 issue, its two dispatch
corrections, and `docs/adr/0036-messaging-schedule-configuration.md` remain authoritative; this
file records what was actually shipped and does not restate `docs/ux/slice-ux.md` or the shared
Administration contract in `docs/ux/tickets/LAN-73-shell-and-access.md`.

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
  Roles: one editable row per event type (player RSVP by, first invitation sent, reminder
  cadence, WhatsApp and email reminder counts, President escalation), a single **Save changes**
  for the whole table, and a per-row worked example that previews the dates a policy produces for
  an event four weeks out, with a warning when the last reminder lands well before the deadline.
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
- Every schedule row previews the dates it produces and warns when the last reminder lands well
  before the deadline it is chasing.
- Changing the schedule leaves already-approved events untouched, and every change is attributed.
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
