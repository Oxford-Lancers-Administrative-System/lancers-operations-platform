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

## Decision history relocated from source (LAN-300)

### src/app/operate/roster/actions.ts — module header

> The membership workflow's server actions — LAN-75, and the free ladder
> LAN-186's owner walkthrough put in its place (`Q-12`).
>
> ## Authorization, and where it actually lives
>
> A status change opens with `requireCapability("person_record_authority")`,
> which resolves the actor from the **verified session** and refuses unless
> they hold one of the four board offices `REQ-authority` names — "four-role
> only, for the grid and every column on it." It takes no actor argument, and
> may not: a server action is a POST endpoint the browser can call directly,
> so an action that accepted "who am I" would accept whatever was sent. The
> acceptance criterion — "activation is refused for an operator without that
> grant, **in the server action and not only in the UI**" — is this line and
> the test that calls the action with a coach.
>
> `membership_activation` was this gate until RVW-186-001: it reads as
> "Exec/GM", which includes the Treasurer, and until this correction that was
> academic — a legal-transition table let a Treasurer reach only three narrow,
> legal destinations. Removing that table (`Q-12`) was correct and did not
> touch who may change a status; it just meant `membership_activation` alone
> no longer bounded anything, and the Treasurer's three narrow reaches became
> every status including `departed` and `archived`, with no reason and no
> legality check. This line closes that back onto the board's own boundary
> rather than deciding a new one.
>
> The role list is read from `src/lib/auth/capabilities.ts` and is not restated
> here, so no call site carries a policy of its own. Every direction the free
> ladder permits — including flipping straight to `departed` or `archived` —
> stays behind this same gate.
>
> Resolving an onboarding item is gated the same way, as of LAN-214
> correction round 2 (`F-NEW-001`). It was `requireGeneralOperator()` until
> then — UX-21's audience reads "Authorized roster operator," and that
> reading held while the approved model still let an item carry a per-item
> owner. `OD7-four-role-only` (Brian, 2026-09-02) superseded that: "Only the
> four-role group ever resolves an item… a kit manager who needs to hand out
> kit goes and does it" — the physical act is anyone's, but recording the
> resolution is not, and `REQ-reason-free-waive` names waive and reopen as
> four-role actions explicitly. `requireGeneralOperator()` admitted the Kit
> Manager, the Treasurer and every other non-coach role to complete, waive,
> not-applicable and reopen alike; nothing here ever branched on
> `params.status` to narrow waive and reopen specifically, so the fix is the
> same gate as every other write on this record, not a partial one.
>
> LAN-110's own narrowing (refusing a coaching assignment) is subsumed by
> this: `person_record_authority` was never open to a coach either.
>
> ## Why a refusal is never a form message
>
> `NotPermitted` is excluded from the `catch` and rethrown, exactly as
> `events/actions.ts` does it. A refusal rendered as red text beside a control
> reads as "try again", which is the wrong instruction and hides an
> authorization event inside a validation failure.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/onboarding-item-history.ts — module header

> The typed home `REQ-item-history` asks for — LAN-214, `WP-onboarding-substrate`.
>
> `onboarding_items` (LAN-75) carries current state only; W6's own grounding
> names exactly what that loses: "The record can say an item is complete; it
> cannot say it was complete, reopened in November and completed again."
> `public.onboarding_item_history` is the append-only record that answers it,
> and this module is its only writer and its reader.
>
> ## Append-only, structurally
>
> The migration's grant on `onboarding_item_history` is `select, insert` —
> no `update`, no `delete`. This module therefore exposes no update or delete
> function; there is nothing here to call. A caller that tried to alter a row
> directly would be refused by the database itself, which is what
> `onboarding-item-history.test.ts` proves.
>
> ## Who calls this
>
> `membership.ts`'s `resolveOnboardingItem` (an operator's four resolutions,
> `reopen` included) and `claimOnboardingItem` (a player's own trust-class
> claim) both write through here in the same transaction as the state change
> they describe — the same "a change and its history commit together or not
> at all" posture every other typed table in this schema takes. Later
> packages read it back through {@link readOnboardingItemHistoryIn} to render
> "who said so, and when" on the record (W6).

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
