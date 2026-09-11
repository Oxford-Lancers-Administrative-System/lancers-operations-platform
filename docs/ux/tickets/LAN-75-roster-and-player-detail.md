# LAN-75 - Roster and membership detail

Status: workflow direction approved by Brian on 12 August 2026; verify against the current live Linear issue before implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses, responses, and attendance records are synthetic and do not correspond to real members.

Approval evidence: [LAN-90 approval comment](https://linear.app/brian-schuster/issue/LAN-90/0-define-and-approve-the-minimum-ux-for-the-first-operational-vertical#comment-44f1c4de-cc9f-4708-86b3-b2ba555bf960) · [Notion approval record](https://app.notion.com/p/3ba488886d5781ed9adedd53635d1c6f)

## Purpose

Provide the desktop operational roster, useful phone lookup, and current-season membership operations.

The current live LAN-75 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route                            | Audience                   |
| ------ | -------------------------------- | -------------------------- |
| UX-20  | `/operate/roster`                | Authorized roster operator |
| UX-21  | `/operate/roster/[membershipId]` | Authorized roster operator |
| UX-22  | `/operate/roster/[membershipId]` | Exec or GM                 |
| UX-23  | `/operate/roster`                | Authorized roster operator |

## Wireframes

- **UX-20 - Roster:** [`desktop`](../wireframes/UX-20-roster-desktop.svg) / [`phone`](../wireframes/UX-20-roster-phone.svg)
- **UX-21 - Avery Fielding:** [`desktop`](../wireframes/UX-21-membership-detail-desktop.svg) / [`phone`](../wireframes/UX-21-membership-detail-phone.svg)
- **UX-22 - Activate with outstanding onboarding:** [`desktop`](../wireframes/UX-22-activation-override-desktop.svg) / [`phone`](../wireframes/UX-22-activation-override-phone.svg)
- **UX-23 - No memberships match these filters:** [`desktop`](../wireframes/UX-23-roster-empty-desktop.svg) / [`phone`](../wireframes/UX-23-roster-empty-phone.svg)

## This ticket builds

- `/operate/roster` and `/operate/roster/[membershipId]`
- Search, sort and essential filters
- Person, raw contact, membership and onboarding items
- Complete, waive with reason, or mark onboarding not applicable
- Exec/GM-only activation with recorded override
- Unpaid subscription never blocks activation
- Active/inactive correction and filter-empty state

## Explicitly not in this ticket

- Inline spreadsheet editing
- Broad bulk actions
- Saved views
- Advanced export
- Long-form activity feed

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, re-read the live owning issue and comments and reconcile any changes recorded after Brian’s 12 August 2026 approval.
- In implementation review, provide LAN-75, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).
