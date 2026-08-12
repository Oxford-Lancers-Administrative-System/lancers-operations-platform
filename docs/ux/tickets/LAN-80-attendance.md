# LAN-80 - Attendance

Status: owner-review draft; verify against the current live Linear issue before implementation.

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
- Before implementation, confirm Brian’s dated Notion approval is linked from LAN-90 and reconcile any live-issue changes since this export.
- In implementation review, provide LAN-80, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).
