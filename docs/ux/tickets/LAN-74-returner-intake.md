# LAN-74 - Returner intake

Status: workflow direction approved by Brian on 12 August 2026; verify against the current live Linear issue before implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses, responses, and attendance records are synthetic and do not correspond to real members.

Approval evidence: [LAN-90 approval comment](https://linear.app/brian-schuster/issue/LAN-90/0-define-and-approve-the-minimum-ux-for-the-first-operational-vertical#comment-44f1c4de-cc9f-4708-86b3-b2ba555bf960) · [Notion approval record](https://app.notion.com/p/3ba488886d5781ed9adedd53635d1c6f)

## Purpose

Let an authorized operator add a returning person and current-season membership without silent duplicates.

The current live LAN-74 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route                            | Audience                   |
| ------ | -------------------------------- | -------------------------- |
| UX-10  | `/operate/roster/new`            | Authorized roster operator |
| UX-11  | `/operate/roster/new`            | Authorized roster operator |
| UX-12  | `/operate/roster/new`            | Authorized roster operator |
| UX-13  | `/operate/roster/[membershipId]` | Authorized roster operator |

## Wireframes

- **UX-10 - Add returning player:** [`desktop`](../wireframes/UX-10-returner-entry-desktop.svg) / [`phone`](../wireframes/UX-10-returner-entry-phone.svg)
- **UX-11 - Review possible matches:** [`desktop`](../wireframes/UX-11-returner-candidates-desktop.svg) / [`phone`](../wireframes/UX-11-returner-candidates-phone.svg)
- **UX-12 - This person already has a current-season membership:** [`desktop`](../wireframes/UX-12-returner-current-membership-refusal-desktop.svg) / [`phone`](../wireframes/UX-12-returner-current-membership-refusal-phone.svg)
- **UX-13 - Returning player added:** [`desktop`](../wireframes/UX-13-returner-created-desktop.svg) / [`phone`](../wireframes/UX-13-returner-created-phone.svg)

## This ticket builds

- `/operate/roster/new`
- Family name, given name, known-as, email and phone
- Fixed Returning marker
- Duplicate check before every write
- Candidate matches by name and supplied contact
- Explicit existing-person selection or explicit new-person confirmation
- Current-season membership refusal
- Transactional person/contact/membership result and roster return

## Explicitly not in this ticket

- Self-service `/verify/[token]`
- Silent merge
- Silent person creation
- Open recruitment
- Historical import

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, re-read the live owning issue and comments and reconcile any changes recorded after Brian’s 12 August 2026 approval.
- In implementation review, provide LAN-74, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).
