# LAN-78 - Automated delivery

Status: workflow direction approved by Brian on 12 August 2026; verify against the current live Linear issue before implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses, responses, and attendance records are synthetic and do not correspond to real members.

Approval evidence: [LAN-90 approval comment](https://linear.app/brian-schuster/issue/LAN-90/0-define-and-approve-the-minimum-ux-for-the-first-operational-vertical#comment-44f1c4de-cc9f-4708-86b3-b2ba555bf960) · [Notion approval record](https://app.notion.com/p/3ba488886d5781ed9adedd53635d1c6f)

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
- An accepted message the provider never confirmed becomes a retryable failure once its delivery
  window has passed (LAN-288)

### An expired delivery — LAN-288

Meta has no `expired` status. The Cloud API's status webhook takes exactly `sent`, `delivered`,
`read`, `played` and `failed`
([status reference](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages/status/)),
and a message the platform could not deliver inside its validity period — thirty days by default
for every template category except authentication — is simply dropped, with no callback at all:
"If you do not receive a status messages webhook with `status` set to `delivered` before the TTL is
exceeded, assume the message was dropped"
([messaging guide](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/)).

So expiry is an absence, and the sweep concludes it rather than a webhook reporting it. An attempt
that was accepted, never concluded, and is older than `WHATSAPP_MESSAGE_TTL_HOURS` becomes a
`failed` delivery result with the club's own reason, which the delivery screen reads as
**Retryable** and lists under **Needs attention**, and which the Follow-ups queue shows as that
person's last delivery. No new state, no automatic replacement send: the repair is the Retry that
already exists, because a dropped message is one that sending again might actually deliver.

A confirmed **Delivered** is out of reach of this — it concludes only an attempt nothing has
concluded — and a stale callback arriving afterwards is stored as evidence and applies nothing,
under invariant M4. Meta documents both halves of that hazard: one message can produce a
`delivered` and a `failed` webhook when somebody is signed in on two devices, and a `failed`
webhook can be delayed.

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
- Before implementation, re-read the live owning issue and comments and reconcile any changes recorded after Brian’s 12 August 2026 approval.
- In implementation review, provide LAN-78, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).
