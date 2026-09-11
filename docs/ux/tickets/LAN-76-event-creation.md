# LAN-76 - Event creation

Status: workflow direction approved by Brian on 12 August 2026; verify against the current live Linear issue before implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses, responses, and attendance records are synthetic and do not correspond to real members.

Approval evidence: [LAN-90 approval comment](https://linear.app/brian-schuster/issue/LAN-90/0-define-and-approve-the-minimum-ux-for-the-first-operational-vertical#comment-44f1c4de-cc9f-4708-86b3-b2ba555bf960) · [Notion approval record](https://app.notion.com/p/3ba488886d5781ed9adedd53635d1c6f)

## Purpose

Create, edit and submit an operational event while preserving draft and pending no-distribution boundaries.

The current live LAN-76 issue, comments, relationships and recorded owner decisions remain authoritative. Shared vocabulary, authorization, responsive behavior, and cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are not duplicated here.

## Owned screens and routes

| Screen | Route                  | Audience                  |
| ------ | ---------------------- | ------------------------- |
| UX-30  | `/operate/events`      | Authorized event operator |
| UX-31  | `/operate/events/new`  | Authorized event operator |
| UX-32  | `/operate/events/[id]` | Authorized event operator |
| UX-33  | `/operate/events/[id]` | Authorized event operator |

## Wireframes

- **UX-30 - Events:** [`desktop`](../wireframes/UX-30-event-list-desktop.svg) / [`phone`](../wireframes/UX-30-event-list-phone.svg)
- **UX-31 - Create event:** [`desktop`](../wireframes/UX-31-event-editor-desktop.svg) / [`phone`](../wireframes/UX-31-event-editor-phone.svg)
- **UX-32 - Team Practice:** [`desktop`](../wireframes/UX-32-event-draft-desktop.svg) / [`phone`](../wireframes/UX-32-event-draft-phone.svg)
- **UX-33 - Event submitted for approval:** [`desktop`](../wireframes/UX-33-event-submitted-desktop.svg) / [`phone`](../wireframes/UX-33-event-submitted-phone.svg)

## This ticket builds

- Routes under `/operate/events`
- Name, practice type, origin, date, start/end, venue, term/week, owner
- Mandatory/optional and response-solicited
- Draft save/edit
- Submit pending approval and withdraw
- No invitations, responses or attendance before approval

## Explicitly not in this ticket

- Recurring templates
- Bulk schedule management
- Calendar-first planning
- Unapproved distribution

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success, completed, empty, and unauthorized states that apply under the shared contract.
- Use the registered route pattern and screen ID in tests and implementation review notes.
- Preserve the desktop and phone information hierarchy shown in the SVGs. Responsive reflow may not remove required information or actions.
- Do not add a new role, destination, workflow, field, status, or delivery action without a recorded design decision.
- Before implementation, re-read the live owning issue and comments and reconcile any changes recorded after Brian’s 12 August 2026 approval.
- In implementation review, provide LAN-76, implemented screen IDs, desktop and 375px phone screenshots, acceptance-criteria results, and every deviation or assumption.

## Acceptance criteria

- All owned screen IDs render at their registered routes for the correct role and record scope.
- Primary and secondary actions use the exact approved labels shown in the wireframes.
- Material alternate states shown in the owned screens are reachable and testable.
- Keyboard focus, labels, status meaning, error association, and touch targets are accessible.
- No inaccessible data is present in the DOM or response payload for an unauthorized role.
- The implementation review shows no unrecorded deviation from [`../slice-ux.md`](../slice-ux.md).

## Decision history relocated from source (LAN-300)

### src/app/operate/events/actions.ts — module header

> The event workflow's server actions — LAN-76, and the approval LAN-77 added.
>
> ## Authorization
>
> Every one of them opens with `requireCapability(…)`, which resolves the actor
> from the **verified session** and refuses with `NotPermitted` unless they hold
> a permitted role. None takes an actor argument, and none may: a server action
> is a POST endpoint the browser can call directly, so an action that accepted
> "who am I" would accept whatever was sent.
>
> Two capabilities are in play, and which one an action names matters:
>
> - `event_calendar_management` — creating, editing and abandoning a draft.
> - `event_approval` — approving one, which is the only action here that
>   creates invitations and queues messages to real people.
>
> They currently name the same four roles, so the distinction has no effect
> today. It is still not a duplication to collapse: separation of duties is
> something Brian may add later, and when he does it narrows one list in
> `capabilities.ts` rather than needing the approval path disentangled from the
> drafting path across several screens.
>
> Brian's LAN-76 clarification is what put a capability here at all. The first
> implementation used `requireOperator()` — any linked, active operator — on
> the reading that drafting was ordinary operator work. It is not: "the club
> calendar is managed only by these four operator roles", and an operator who
> can reach another part of the application does not thereby get to move
> practices around. The role lists live in `src/lib/auth/capabilities.ts` and
> nowhere else, so no action here carries a policy of its own.
>
> Nothing here submits an event for approval — Brian removed that step on 12
> August 2026, because only calendar operators create events and so there is
> nobody to submit one to. A saved event is a draft, and approval takes it
> straight from there.
>
> There is no ownership term in any of them. Any calendar operator may edit,
> withdraw or abandon any draft, and any approver may approve their own —
> the calendar is the club's, and `owner_person_id` is recorded for the audit
> trail rather than consulted for permission.
>
> ## Why a refusal is never a form message
>
> `NotPermitted` is deliberately excluded from the `catch` below and rethrown.
> A refusal rendered as red text beside a field reads as "fix your input and
> try again", which is the wrong instruction and hides an authorization event
> inside a validation failure. Everything else a service throws — an illegal
> transition, a constraint, a vanished event — is a sentence the operator can
> act on, and is returned as state so the form keeps what they typed.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/venue-field.tsx — module header

> The event editor's venue field — LAN-115.
>
> A searchable place/address combobox that is still, underneath, the free-text
> field LAN-76 shipped. That is the whole design, and every decision below
> follows from it.
>
> ## Free text is the field; search is an assistance on top of it
>
> The control is `freeSolo`, so whatever the operator types is what gets
> submitted, whether or not it matches anything. LAN-115 requires that
> explicitly — "preserve a manual text fallback when the provider is
> unavailable or an Oxford field/location is not indexed, so an operator can
> still save a draft" — and the club's own pitches are exactly the kind of
> place a geocoder has never heard of. A combobox that refused an unmatched
> value would make the provider's index an authority on where the Lancers
> train, which it is not.
>
> So the field posts one `name="venue"` input, the same as before, carrying
> either the formatted address of a chosen suggestion or the operator's own
> words. Nothing downstream — the action, the validation, the service, the
> column, the three screens that display it — knows which.
>
> ## Stale results, and why a sequence number rather than only an abort
>
> "A slow earlier query cannot overwrite a later query's results" is an
> acceptance criterion, and aborting the previous request does not on its own
> satisfy it: an abort is a request to stop, delivered asynchronously, and a
> response already in flight can still resolve afterwards. Every search
> therefore takes a ticket from `sequenceRef`, and the handler drops anything
> that is not the current one — checked twice, after the headers and again
> after the body, because the body is a second await and the world moves during
> it. The abort is kept as well, so the club stops paying for answers nobody
> will read.
>
> ## Controlled, since LAN-154
>
> The value lives in the form rather than here. Changing an event's **Type**
> replaces the venue the old type's template supplied — but only where nobody
> has edited it (D41) — and a field holding its own copy could neither be told
> nor asked. Nothing else about the control changed: it still posts one
> `name="venue"` input carrying whatever is in it.
>
> ## Failure never reaches the operator as a failure
>
> There is no state in which this component prevents the form being filled in
> or saved. A provider that is down, rate-limiting, unconfigured or simply
> ignorant of the place produces a sentence under the field and a still-typable
> input. The sentence lives in the helper-text line with `aria-live`, so it is
> announced when it changes under somebody who is typing rather than only being
> visible.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-input.ts — RawEventDraft header

> Three fields the first implementation had are deliberately absent, per
> Brian's LAN-76 clarification:
>
> - `origin` — derived, never asked (see `OPERATOR_CREATED_ORIGIN`);
> - `termId` and `weekNumber` — **derived from the date**. The event's real
>   date and times are the operator-entered source of truth, and the Oxford
>   term and week are a coordinate computed from it. Letting all three be
>   typed independently let an operator record a date in Michaelmas and
>   label it Hilary week 4, and nothing would have disagreed with them.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-input.ts — validateEventDraft attendance default (D15/W8)

> Mandatory-or-optional had no default at all under LAN-76, so a draft could not
> be saved without answering it. D15 and W8 changed what is right: name, type
> and date are the minimum to save, and the type's template says whether this
> kind of event expects attendance. An unanswered one is therefore accepted and
> stored as **optional** — which claims nothing, and is the direction the
> original rule was protecting. `Response requested` used to sit beside it and
> D23 removed it: mandatory or optional already carries that, and everyone sent
> an event is expected to answer.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
