# LAN-110 - Coach attendance

Status: workflow direction approved by Brian on 12 August 2026; verify against the current live Linear issue before implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses, responses, and attendance records are synthetic and do not correspond to real members.

Approval evidence: [LAN-90 approval comment](https://linear.app/brian-schuster/issue/LAN-90/0-define-and-approve-the-minimum-ux-for-the-first-operational-vertical#comment-44f1c4de-cc9f-4708-86b3-b2ba555bf960) · [Notion approval record](https://app.notion.com/p/3ba488886d5781ed9adedd53635d1c6f)

## Purpose

Give active Head Coach, OC and DC assignments a narrow recorder over LAN-80 attendance after occurrence.

The current live LAN-110 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route                             | Audience                                   |
| ------ | --------------------------------- | ------------------------------------------ |
| UX-90  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                       |
| UX-91  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                       |
| UX-92  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                       |
| UX-93  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                       |
| UX-94  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                       |
| UX-95  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                       |
| UX-96  | `/operate/events/[id]/attendance` | Signed-in coach without LAN-110 capability |
| UX-97  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                       |

## Wireframes

- **UX-90 - Attendance is not open:** [`desktop`](../wireframes/UX-90-coach-occurrence-locked-desktop.svg) / [`phone`](../wireframes/UX-90-coach-occurrence-locked-phone.svg)
- **UX-91 - Team Practice attendance:** [`desktop`](../wireframes/UX-91-coach-attendance-desktop.svg) / [`phone`](../wireframes/UX-91-coach-attendance-phone.svg)
- **UX-92 - Team Practice attendance:** [`desktop`](../wireframes/UX-92-coach-saving-desktop.svg) / [`phone`](../wireframes/UX-92-coach-saving-phone.svg)
- **UX-93 - Team Practice attendance:** [`desktop`](../wireframes/UX-93-coach-saved-desktop.svg) / [`phone`](../wireframes/UX-93-coach-saved-phone.svg)
- **UX-94 - We could not save this change:** [`desktop`](../wireframes/UX-94-coach-save-failed-desktop.svg) / [`phone`](../wireframes/UX-94-coach-save-failed-phone.svg)
- **UX-95 - Correct attendance:** [`desktop`](../wireframes/UX-95-coach-correction-desktop.svg) / [`phone`](../wireframes/UX-95-coach-correction-phone.svg)
- **UX-96 - You cannot record attendance for this event:** [`desktop`](../wireframes/UX-96-coach-unauthorized-desktop.svg) / [`phone`](../wireframes/UX-96-coach-unauthorized-phone.svg)
- **UX-97 - Add walk-up attendance:** [`desktop`](../wireframes/UX-97-coach-walk-up-desktop.svg) / [`phone`](../wireframes/UX-97-coach-walk-up-phone.svg)

## This ticket builds

- Post-occurrence gate
- All four attendance states and corrections
- Saving, Saved and failed-save feedback
- Latest committed value, last actor and time
- Capability-constrained minimal walk-up UX-97 reusing LAN-80
- Unauthorized-coach denial
- Attendance-only navigation and no unrelated or sensitive fields

## Explicitly not in this ticket

- Mark occurred or Mark not held
- Second attendance workflow
- Roster/contact/availability access
- RSVP reasons
- Event administration
- Position-coach access by inference

## Capability-constrained walk-up

UX-97 is the coach-only variant of LAN-80 walk-up capture. It stays on `/operate/events/[id]/attendance`, uses attendance-only navigation and displays only event context, minimal walk-up identity, one of the four attendance states and the later-reconciliation notice. UX-73 remains the operator variant and is not weakened or replaced.

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, re-read the live owning issue and comments and reconcile any changes recorded after Brian’s 12 August 2026 approval.
- In implementation review, provide LAN-110, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).
