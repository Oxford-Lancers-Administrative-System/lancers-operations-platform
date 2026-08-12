# LAN-77 - Event approval

Status: workflow direction approved by Brian on 12 August 2026; verify against the current live Linear issue before implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses, responses, and attendance records are synthetic and do not correspond to real members.

Approval evidence: [LAN-90 approval comment](https://linear.app/brian-schuster/issue/LAN-90/0-define-and-approve-the-minimum-ux-for-the-first-operational-vertical#comment-44f1c4de-cc9f-4708-86b3-b2ba555bf960) · [Notion approval record](https://app.notion.com/p/3ba488886d5781ed9adedd53635d1c6f)

## Purpose

Resolve an explicit named audience and give the designated approver a deliberate approval boundary.

The current live LAN-77 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route                  | Audience                  |
| ------ | ---------------------- | ------------------------- |
| UX-40  | `/operate/events/[id]` | Authorized event operator |
| UX-41  | `/operate/events/[id]` | Designated event approver |
| UX-42  | `/operate/events/[id]` | Designated event approver |
| UX-43  | `/operate/events/[id]` | Authorized event operator |

## Wireframes

- **UX-40 - Build event audience:** [`desktop`](../wireframes/UX-40-audience-builder-desktop.svg) / [`phone`](../wireframes/UX-40-audience-builder-phone.svg)
- **UX-41 - Approve Team Practice:** [`desktop`](../wireframes/UX-41-approval-review-desktop.svg) / [`phone`](../wireframes/UX-41-approval-review-phone.svg)
- **UX-42 - This event cannot be approved:** [`desktop`](../wireframes/UX-42-empty-audience-refusal-desktop.svg) / [`phone`](../wireframes/UX-42-empty-audience-refusal-phone.svg)
- **UX-43 - Event approved:** [`desktop`](../wireframes/UX-43-event-approved-desktop.svg) / [`phone`](../wireframes/UX-43-event-approved-phone.svg)

## This ticket builds

- Explicit selection from active memberships and eligible capacities
- Select-all convenience without silent default
- Named confirmation list and count
- Designated approver, normally President or delegated lead
- Empty-audience refusal
- Approve, reject or return to draft
- Audience/invitation/job creation and post-approval evidence

## Explicitly not in this ticket

- Blanket President/Secretary approval
- Silent whole-roster audience
- Empty audience approval
- Manual invitation composition

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, re-read the live owning issue and comments and reconcile any changes recorded after Brian’s 12 August 2026 approval.
- In implementation review, provide LAN-77, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).
