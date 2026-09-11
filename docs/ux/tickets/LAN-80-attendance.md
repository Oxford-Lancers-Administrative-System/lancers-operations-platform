# LAN-80 - Attendance

Status: workflow direction approved by Brian on 12 August 2026; verify against the current live Linear issue before implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses, responses, and attendance records are synthetic and do not correspond to real members.

Approval evidence: [LAN-90 approval comment](https://linear.app/brian-schuster/issue/LAN-90/0-define-and-approve-the-minimum-ux-for-the-first-operational-vertical#comment-44f1c4de-cc9f-4708-86b3-b2ba555bf960) · [Notion approval record](https://app.notion.com/p/3ba488886d5781ed9adedd53635d1c6f)

## Purpose

Gate attendance on a human occurrence assertion and maintain one auditable attendance model for operators and LAN-110 coaches.

The current live LAN-80 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route                             | Audience                                |
| ------ | --------------------------------- | --------------------------------------- |
| UX-70  | `/operate/events/[id]`            | Authorized occurrence operator          |
| UX-71  | `/operate/events/[id]/attendance` | Authorized attendance operator          |
| UX-72  | `/operate/events/[id]/attendance` | Authorized attendance operator          |
| UX-73  | `/operate/events/[id]/attendance` | Authorized operator attendance recorder |
| UX-74  | `/operate/events/[id]/attendance` | Authorized attendance recorder          |
| UX-75  | `/operate/events/[id]`            | Authorized occurrence operator          |
| UX-97  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                    |

## Wireframes

- **UX-70 - Confirm what happened:** [`desktop`](../wireframes/UX-70-occurrence-decision-desktop.svg) / [`phone`](../wireframes/UX-70-occurrence-decision-phone.svg)
- **UX-71 - Attendance is not available yet:** [`desktop`](../wireframes/UX-71-attendance-locked-desktop.svg) / [`phone`](../wireframes/UX-71-attendance-locked-phone.svg)
- **UX-72 - Attendance · Team Practice:** [`desktop`](../wireframes/UX-72-attendance-roster-desktop.svg) / [`phone`](../wireframes/UX-72-attendance-roster-phone.svg)
- **UX-73 - Add walk-up attendance:** [`desktop`](../wireframes/UX-73-walk-up-capture-desktop.svg) / [`phone`](../wireframes/UX-73-walk-up-capture-phone.svg)
- **UX-74 - Correct attendance:** [`desktop`](../wireframes/UX-74-attendance-correction-desktop.svg) / [`phone`](../wireframes/UX-74-attendance-correction-phone.svg)
- **UX-75 - Event marked not held:** [`desktop`](../wireframes/UX-75-event-not-held-desktop.svg) / [`phone`](../wireframes/UX-75-event-not-held-phone.svg)
- **UX-97 - Add walk-up attendance:** [`desktop`](../wireframes/UX-97-coach-walk-up-desktop.svg) / [`phone`](../wireframes/UX-97-coach-walk-up-phone.svg)

## This ticket builds

- Mark occurred and Mark not held
- Attendance locked until occurred
- Present, absent, late and excused
- RSVP mismatch visibility without auto-reconciliation
- Immediate committed-value feedback
- Minimal walk-up identity with later reconciliation
- Operator walk-up UX-73 and capability-constrained coach variant UX-97
- Audited corrections and not-held completion

## Explicitly not in this ticket

- Coach occurrence assertion
- Time-inferred occurrence
- Full walk-up onboarding
- RSVP rewriting
- Medical or performance detail

## Shared walk-up model

UX-73 is the operator walk-up surface. UX-97 is the capability-constrained coach presentation of the same LAN-80 attendance model and traces to both LAN-80 and LAN-110. Both create a minimal temporary attendance identity for later reconciliation; neither performs full onboarding.

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, re-read the live owning issue and comments and reconcile any changes recorded after Brian’s 12 August 2026 approval.
- In implementation review, provide LAN-80, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).

## Decision history relocated from source (LAN-300)

### src/app/operate/events/[id]/attendance/page.tsx — `AttendancePage` (module header)

> ## One route, four screens, and the gate between them
>
> The screen registry gives all four `/operate/events/[id]/attendance`, and
> that is not an oversight: they are states of one thing. The event's status
> chooses between UX-71 and UX-72, `?add=walk-up` opens UX-73, and UX-74's
> correction happens in place on the row it belongs to — see
> `./attendance-row.tsx` for why that is not a fifth screen.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/attendance/page.tsx — `AttendancePage` (module header)

> ## Authorization, and the two things it is not
>
> The page gates on `attendance_recording` — the four calendar roles and the
> three coaching seats. See `./actions.ts` for why it is that union, and for
> the reading of § 8 this replaced: an ordinary-operator floor admitted an
> ordinary player who happened to hold an operator account, which is the thing
> LAN-80's own criterion says must be refused.
>
> That is not the boundary, and neither is this route. Every write re-resolves
> the operator from the verified session inside its own server action, and the
> service refuses any event that is not `occurred` after taking a row lock on
> it. A page rendered a minute ago against an occurred event whose assertion has
> since been corrected produces a refusal, not a write.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/attendance.ts — module header

> Attendance — locked Requirement 7, invariants P5, P6 and P8. LAN-80.
>
> ## The one rule the whole module exists to hold
>
> **A Yes never becomes a Present.** RSVP is intent and attendance is
> observation, and they are two authoritative records with no path between
> them. There is deliberately no function here that reads `rsvp_responses` or
> `current_rsvp` and writes `attendance_records`; the board below reads the
> standing answer only so a recorder can see it beside the person's name, and
> `tests/…/attendance.test.ts` asserts that a `yes` with nothing recorded stays
> absent from `attendance_records` entirely.
>
> The database agrees structurally: `attendance_records` has no foreign key to
> an invitation or a response, which is what makes invariant P6's walk-up — a
> person who was never invited and never answered — an ordinary row rather than
> an exception.
>
> ## What is enforced where
>
> Nothing in this file re-implements a rule the schema already carries, and the
> two that matter are worth naming:
>
> - **Invariant P5** — attendance belongs to an event that is really going
>   to have happened, and since LAN-151 occurrence is derived rather than
>   asserted (D30). The rule is in two halves, deliberately. The database
>   holds the part no legitimate write can produce: a cascading composite
>   foreign key plus
>   `check (event_status in ('approved', 'cancelled'))`, so no row in the
>   table has ever belonged to a draft, including rows written by a script
>   that never called this module. `cancelled` is inside that check since
>   LAN-156 because cancelling an event cascades its status onto the
>   register and W6 says those rows survive it — the event was approved when
>   the register was taken, and calling it off does not unmake that.
>
>   What the database therefore does _not_ hold is "attendance is only ever
>   created against an approved event". That is this module's, in
>   `closedReasonFor`, which every write path asks. A cancelled event's
>   register is closed.
>
>   The other half is the **clock**, which a check constraint cannot read, so
>   it is enforced here: the register opens on D71's buffer before the event
>   starts and never closes (D72), which `./attendance-window.ts` decides.
>   Note that this is deliberately _not_ "the date has passed" — a coach
>   standing at the pitch as people arrive is the person this surface exists
>   for, and refusing them until the evening is over would be a rule nobody
>   asked for. That half is a genuine service-layer guarantee rather than a
>   courtesy, which is why `requireOpenRegister` takes the row lock before
>   asking.
>
> - **Invariant P8** — player capacity anchors to the season membership;
>   coach, committee, guest and recruit anchor to the durable person. Held by
>   `attendance_records_anchor_matches_capacity`. This module never lets a
>   caller choose both: a target resolves to exactly one anchor, from rows
>   that already exist for the event.
>
> ## What a caller may name
>
> A recorder posts a **participant key**, and the key is resolved against the
> event's own invitations and its own attendance rows. It is not a pair of
> columns the browser fills in. That matters because the alternative — trusting
> a posted capacity and anchor id — would let anybody with a session record
> attendance for an arbitrary membership at an arbitrary event, which is a
> write against a person who was never involved. Adding somebody who genuinely
> was not invited is a separate, deliberate action: `recordWalkUpAttendance`.
>
> ## Mismatches are shown and never resolved
>
> `public.rsvp_attendance_mismatches` computes them and this module reads it.
> Nothing here writes, hides, suppresses or "reconciles" one — the frozen model
> says mismatches are "computed, surfaced as exceptions, and never silently
> reconciled", and a said-no-but-showed-up is a fact about the evening rather
> than a data-entry error to clean up.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/attendance.ts — `readAttendanceBoard`'s mismatch filter

> D74, and the defect it exists to prevent — LAN-152, corrected by LAN-165.
>
> The board on `main` once reported **zero recorded and thirty mismatches
> at the same time**, on every occurred event whose register nobody had
> opened. It is a counting fault rather than a display one, and it lives in
> one classification: `said_yes_no_attendance_recorded` fires per person,
> so a session nobody assessed came back as thirty separate accusations
> that thirty people had let the club down. An unrecorded event read as a
> bad one, which is the exact reading D74's two-state axis forbids.
>
> A mismatch is a **disagreement between two records**. Where the second
> record does not exist there is no disagreement — there is an absence,
> and the club already has a word for it: _not recorded_. That is true of
> every yes with nothing recorded, not only while the whole register is
> untouched: LAN-152's first fix suppressed the classification only when
> _nothing at all_ had been saved against the event, so the moment one
> person was recorded, every other unrecorded yes flipped back into a
> "mismatch" — a 47-invited, 29-yes event recording one matching Present
> moved Mismatches from a would-be 29 to 28, not to 0. `said_yes_marked_
absent`, `said_no_but_attended` and `attended_without_invitation` all
> require an attendance row to exist at all, so `said_yes_no_attendance_
recorded` is the only classification this view can emit for a person
> with nothing recorded — dropping it, per person, is both necessary and
> sufficient: it reads zero mismatches while the sheet is untouched (no
> other classification can fire yet) and it stops flagging an unrecorded
> yes the instant somebody else on the same sheet is saved.
>
> Filtered **here** rather than in `public.rsvp_attendance_mismatches`
> deliberately. The view is the durable home for this rule and it should
> carry it, but the view is schema, and this mission's schema belongs to
> the status-and-occurrence migration package; two packages writing
> migrations at once is what the collision rules exist to prevent.
>
> Nothing else over-counts in the meantime, and the reason is now narrower
> than it was: **this function is the view's only reader.** `weekly-report.ts`
> was the other one, and LAN-151 stopped it reading the view entirely,
> because the view derives occurrence against `now()` and a report about
> last March must not depend on today's date — it counts walk-ups straight
> off `attendance_records`.
>
> So the rule is applied wherever the view is read today, and what this
> filter protects against is a **future** reader: one written after this
> package, going to the view directly, and not looking here.
>
> That makes moving the rule into the view a real follow-up rather than a
> tidy-up: a direct reader of `rsvp_attendance_mismatches` written after
> this package, and not looking here, would over-count every unrecorded
> yes on a sheet somebody has started. It is recorded in the residual-risk
> section of the pull request that merges LAN-165.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
