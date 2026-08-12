# LAN-76 - Event creation

Status: owner-review draft; verify against the current live Linear issue before implementation.

## Purpose

Create, edit and submit an operational event while preserving draft and pending no-distribution boundaries.

The current live LAN-76 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route                  | Audience                  |
| ------ | ---------------------- | ------------------------- |
| UX-30  | `/operate/events`      | Authorized event operator |
| UX-31  | `/operate/events/new`  | Authorized event operator |
| UX-32  | `/operate/events/[id]` | Authorized event operator |
| UX-33  | `/operate/events/[id]` | Authorized event operator |

## Wireframes

- **UX-30 - Events:** [`desktop`](../wireframes/UX-30-event-list-desktop.svg) / [`phone`](../wireframes/UX-30-event-list-phone.svg)
- **UX-31 - Create event:** [`desktop`](../wireframes/UX-31-event-editor-desktop.svg) / [`phone`](../wireframes/UX-31-event-editor-phone.svg)
- **UX-32 - Team Practice:** [`desktop`](../wireframes/UX-32-event-draft-desktop.svg) / [`phone`](../wireframes/UX-32-event-draft-phone.svg)
- **UX-33 - Event submitted for approval:** [`desktop`](../wireframes/UX-33-event-submitted-desktop.svg) / [`phone`](../wireframes/UX-33-event-submitted-phone.svg)

## This ticket builds

- Routes under `/operate/events`
- Name, practice type, origin, date, start/end, venue, term/week, owner
- Mandatory/optional and response-solicited
- Draft save/edit
- Submit pending approval and withdraw
- No invitations, responses or attendance before approval

## Explicitly not in this ticket

- Recurring templates
- Bulk schedule management
- Calendar-first planning
- Unapproved distribution

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, confirm Brian’s dated Notion approval is linked from LAN-90 and reconcile any live-issue changes since this export.
- In implementation review, provide LAN-76, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).
