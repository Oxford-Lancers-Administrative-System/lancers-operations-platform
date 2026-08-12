# LAN-73 - Shell and access

Status: owner-review draft; verify against the current live Linear issue before implementation.

## Purpose

Provide the `/operate` shell, Roster/Events/Report navigation, exact account-state recovery, and service-enforced capability boundaries.

The current live LAN-73 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route             | Audience                                           |
| ------ | ----------------- | -------------------------------------------------- |
| UX-01  | `/login`          | Operator                                           |
| UX-02  | `/operate/roster` | Authorized operator                                |
| UX-03  | `/operate`        | Signed-in user without linked operator profile     |
| UX-04  | `/operate`        | Signed-in user with inactive operator profile      |
| UX-05  | `/operate`        | Authenticated operator without required capability |

## Wireframes

- **UX-01 - Sign in to Lancers Operations:** [`desktop`](../wireframes/UX-01-sign-in-desktop.svg) / [`phone`](../wireframes/UX-01-sign-in-phone.svg)
- **UX-02 - Lancers Operations:** [`desktop`](../wireframes/UX-02-operator-shell-desktop.svg) / [`phone`](../wireframes/UX-02-operator-shell-phone.svg)
- **UX-03 - Operator profile not connected:** [`desktop`](../wireframes/UX-03-operator-unlinked-desktop.svg) / [`phone`](../wireframes/UX-03-operator-unlinked-phone.svg)
- **UX-04 - Operator access inactive:** [`desktop`](../wireframes/UX-04-operator-inactive-desktop.svg) / [`phone`](../wireframes/UX-04-operator-inactive-phone.svg)
- **UX-05 - You do not have access to this action:** [`desktop`](../wireframes/UX-05-operator-unauthorized-desktop.svg) / [`phone`](../wireframes/UX-05-operator-unauthorized-phone.svg)

## This ticket builds

- Email/password sign-in
- Operator shell under `/operate` with no Home destination
- Distinct exact-copy unlinked and inactive states with no protected data
- Ordinary operator capability mapping
- Narrow HC/OC/DC attendance-recorder capability
- Service authorization independent of navigation

## Explicitly not in this ticket

- Blanket President/Secretary full-MVP permission
- Player eligibility or returner verification states
- Operator account administration UI
- Branding polish or a custom design system

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, confirm Brian’s dated Notion approval is linked from LAN-90 and reconcile any live-issue changes since this export.
- In implementation review, provide LAN-73, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).
