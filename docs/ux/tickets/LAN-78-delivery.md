# LAN-78 - Automated delivery

Status: owner-review draft; verify against the current live Linear issue before implementation.

## Purpose

Show official automated 1:1 WhatsApp distribution, auditable results and safe repair controls.

The current live LAN-78 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route                           | Audience                     |
| ------ | ------------------------------- | ---------------------------- |
| UX-50  | `/operate/events/[id]/delivery` | Authorized delivery operator |
| UX-51  | `/operate/events/[id]/delivery` | Authorized delivery operator |
| UX-52  | `/operate/events/[id]/delivery` | Authorized delivery operator |

## Wireframes

- **UX-50 - Delivery · Team Practice:** [`desktop`](../wireframes/UX-50-delivery-overview-desktop.svg) / [`phone`](../wireframes/UX-50-delivery-overview-phone.svg)
- **UX-51 - Delivery diagnostics:** [`desktop`](../wireframes/UX-51-delivery-diagnostics-desktop.svg) / [`phone`](../wireframes/UX-51-delivery-diagnostics-phone.svg)
- **UX-52 - Repair delivery:** [`desktop`](../wireframes/UX-52-delivery-repair-desktop.svg) / [`phone`](../wireframes/UX-52-delivery-repair-phone.svg)

## This ticket builds

- Official WhatsApp Business Platform 1:1 delivery
- Queued, attempted, delivered, failed and retryable status model
- Per-invitee safe diagnostics
- Retry, revoke and reissue
- One live token and provider evidence
- Automated email/calendar fallback according to policy

## Explicitly not in this ticket

- Manual copying, sending or posting
- WhatsApp group or Community posting
- Provider secrets or raw webhook UI
- Treating delivery as RSVP

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, confirm Brian’s dated Notion approval is linked from LAN-90 and reconcile any live-issue changes since this export.
- In implementation review, provide LAN-78, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).
