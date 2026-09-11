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

## Decision history relocated from source (LAN-300)

### src/app/operate/events/[id]/delivery/page.tsx — `DeliveryPage` (module header)

> ## Why three screens are one route
>
> `docs/ux/slice-ux.md`'s registry gives all three
> `/operate/events/[id]/delivery`, which is not an oversight: they are one
> record at three depths. `?view=diagnostics` opens the per-invitee table and
> `?invitation=` opens one invitee's repair panel. The same device LAN-76 used
> for UX-33 and LAN-77 for UX-40 to UX-43.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/delivery/page.tsx — `DeliveryPage` (module header)

> ## What is deliberately not in the payload
>
> No phone number, no RSVP link, no token, no provider credential and no raw
> provider body. The failure text an operator reads has already been mapped to
> a safe sentence and digit-redacted by the adapter. A screen that showed the
> link would be the manual-send path readmitted through the back door.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/actions.ts — approveEventAction, dispatch block

> LAN-78, as amended by LAN-169. Approval is what makes distribution
> automatic — "event approval automatically queues or initiates one WhatsApp
> invitation per approved opted-in audience member", and there is no operator
> action anywhere that means "now send them".
>
> What changed is _when_. `approveEvent` has already frozen the messaging
> plan and created every rung of the ladder; this call dispatches only what
> is **due now**, which is the invitation of an event closer than its own
> invitation lead and nothing else. An event a fortnight out sends nothing
> here, and the scheduler sweep collects it when its anchor arrives.
>
> The call stays rather than moving wholly to the sweep because W1's
> guarantee depends on it: "if practice happens in 2 days and we're approving
> and we're sending it out, that needs to go out now." Waiting for the next
> tick would make that guarantee true to within the tick interval instead of
> immediately.
>
> Deliberately outside the try above, and deliberately not able to fail this
> action. The approval is committed; a provider that is down, unconfigured or
> rate-limiting must not turn a successful approval into an error message,
> because retrying it would be refused — the event is no longer a draft. Each
> job records its own failure and appears on the delivery screen as Failed or
> Retryable, which is the surface built for exactly this.
>
> ---
>
> Swallowed on purpose, and it is the one swallowed error in this file.
> Every outcome worth acting on is already durable in `notification_jobs`
> and `delivery_attempts`; what is discarded here is only the summary the
> operator does not see anyway. Rethrowing would show them an error about
> an approval that succeeded.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/delivery/actions.ts — module header

> The two repair actions UX-52 offers, and the two it deliberately does not.
>
> **Offered:** Retry delivery, and Revoke and reissue link. Both are auditable
> system actions that act on an invitation that already exists.
>
> **Not offered, and not implementable from here:** copy link, send message,
> post to group, mark as sent, add a recipient. None has a service function
> behind it, so none could be added by writing a button — the absence is in the
> service layer and in the schema, not in this file's restraint.
>
> ## Authorization
>
> Both open with `requireCapability("delivery_administration")`, which resolves
> the actor from the verified session. Neither takes an actor argument: a
> Server Action is a POST endpoint the browser can call directly, so an action
> accepting "who am I" would accept whatever was sent.
>
> ## Why a refusal is rethrown rather than returned
>
> The same reason as the event actions: a `NotPermitted` rendered as red text
> beside a button reads as "try again", which is the wrong instruction and
> hides an authorization event inside what looks like a transient failure.
>
> ## Why neither redirects
>
> The operator stays on the invitee they were repairing, so they can see the
> result against the person it concerns. `revalidatePath` re-reads the delivery
> state from the database, so the screen shows what actually happened rather
> than what was requested.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
