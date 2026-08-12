# LAN-79 - Player RSVP

Status: workflow direction approved by Brian on 12 August 2026; verify against the current live Linear issue before implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses, responses, and attendance records are synthetic and do not correspond to real members.

Approval evidence: [LAN-90 approval comment](https://linear.app/brian-schuster/issue/LAN-90/0-define-and-approve-the-minimum-ux-for-the-first-operational-vertical#comment-44f1c4de-cc9f-4708-86b3-b2ba555bf960) · [Notion approval record](https://app.notion.com/p/3ba488886d5781ed9adedd53635d1c6f)

## Purpose

Provide a responsive signed RSVP page and security-uniform public handling for non-resolving terminal token states.

The current live LAN-79 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route           | Audience       |
| ------ | --------------- | -------------- |
| UX-60  | `/rsvp/[token]` | Invited player |
| UX-61  | `/rsvp/[token]` | Invited player |
| UX-62  | `/rsvp/[token]` | Invited player |
| UX-63  | `/rsvp/[token]` | Link holder    |
| UX-64  | `/rsvp/[token]` | Link holder    |
| UX-65  | `/rsvp/[token]` | Link holder    |
| UX-66  | `/rsvp/[token]` | Invited player |

## Wireframes

- **UX-60 - Team Practice:** [`desktop`](../wireframes/UX-60-player-rsvp-desktop.svg) / [`phone`](../wireframes/UX-60-player-rsvp-phone.svg)
- **UX-61 - Not attending:** [`desktop`](../wireframes/UX-61-rsvp-not-attending-desktop.svg) / [`phone`](../wireframes/UX-61-rsvp-not-attending-phone.svg)
- **UX-62 - Your response is saved:** [`desktop`](../wireframes/UX-62-rsvp-saved-desktop.svg) / [`phone`](../wireframes/UX-62-rsvp-saved-phone.svg)
- **UX-63 - This RSVP link can’t be used:** [`desktop`](../wireframes/UX-63-rsvp-invalid-desktop.svg) / [`phone`](../wireframes/UX-63-rsvp-invalid-phone.svg)
- **UX-64 - This RSVP link can’t be used:** [`desktop`](../wireframes/UX-64-rsvp-event-started-desktop.svg) / [`phone`](../wireframes/UX-64-rsvp-event-started-phone.svg)
- **UX-65 - This RSVP link can’t be used:** [`desktop`](../wireframes/UX-65-rsvp-revoked-desktop.svg) / [`phone`](../wireframes/UX-65-rsvp-revoked-phone.svg)
- **UX-66 - This event has been cancelled:** [`desktop`](../wireframes/UX-66-rsvp-cancelled-desktop.svg) / [`phone`](../wireframes/UX-66-rsvp-cancelled-phone.svg)

## This ticket builds

- `/rsvp/[token]`
- Event and player context with current answer
- Attending or Not attending
- Required reason for Not attending
- Changes until event start; late responses accepted before start
- Distinct internal unknown, expired/event-started and revoked states with identical public 404 content, presentation, timing and behavior
- Distinct valid-token cancelled-event state
- No peer visibility

## Explicitly not in this ticket

- Player login
- Unsure response
- Public token-lifecycle disclosure
- Peer responses
- Writes after event start

## Owner-resolved terminal-state contract

UX-63, UX-64 and UX-65 are separate internal domain/test states, but the public response is deliberately indistinguishable: the same content, presentation, `404 Not Found`, body shape, headers, timing class and actions. They expose no player, event, invitation, time or token-history information. Secure internal logs, tests and operational diagnostics retain the distinction. UX-66 is evaluated only after a valid invitation resolves and may show the cancelled event and date, but no unrelated player or roster information.

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, re-read the live owning issue and comments and reconcile any changes recorded after Brian’s 12 August 2026 approval.
- In implementation review, provide LAN-79, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).
