# LAN-81 - Monday report

Status: owner-review draft; verify against the current live Linear issue before implementation.

## Purpose

Preview and generate a narrow, immutable exception-and-action snapshot from `/operate/report`.

The current live LAN-81 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route             | Audience                   |
| ------ | ----------------- | -------------------------- |
| UX-80  | `/operate/report` | Authorized report operator |
| UX-81  | `/operate/report` | Authorized report operator |
| UX-82  | `/operate/report` | Authorized report operator |
| UX-83  | `/operate/report` | Authorized report operator |

## Wireframes

- **UX-80 - Prepare Monday report:** [`desktop`](../wireframes/UX-80-report-preview-desktop.svg) / [`phone`](../wireframes/UX-80-report-preview-phone.svg)
- **UX-81 - Monday exception and action report:** [`desktop`](../wireframes/UX-81-stored-report-desktop.svg) / [`phone`](../wireframes/UX-81-stored-report-phone.svg)
- **UX-82 - Report versions:** [`desktop`](../wireframes/UX-82-report-versions-desktop.svg) / [`phone`](../wireframes/UX-82-report-versions-phone.svg)
- **UX-83 - No stored report for this date:** [`desktop`](../wireframes/UX-83-report-empty-desktop.svg) / [`phone`](../wireframes/UX-83-report-empty-phone.svg)

## This ticket builds

- Reporting date and computed preview
- Lead order: nonresponses; Not attending reasons; RSVP/attendance mismatches; absences/missing attendance; onboarding exceptions; uninvited-audience defects
- Stored events/statuses and response breakdown
- Attendance and current availability levels
- Snapshot metadata and immutable versions
- Stored-content-only report view

## Explicitly not in this ticket

- Repeated response issue
- Broad analytics dashboard
- Narrative availability or diagnosis
- Rewriting a prior snapshot
- Three-week horizon

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, confirm Brian’s dated Notion approval is linked from LAN-90 and reconcile any live-issue changes since this export.
- In implementation review, provide LAN-81, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).
