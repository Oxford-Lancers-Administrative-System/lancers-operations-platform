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

## Accepted deviations from this contract — Brian, 13 August 2026

Recorded here because this file is where an implementer or a project manager
looks for what the approval screens are supposed to do. Each was decided on the
real screen during LAN-77's visual review, and each supersedes the wireframe it
contradicts. Nothing here changes a frozen domain invariant.

### The audience is saved on the draft, not assembled at approval

The wireframes imply the audience is built and approved in one sitting. It is
not: choosing an audience saves it against the draft, and approval confirms what
is already stored. **Edit draft** and back, a refresh, a closed tab and a second
operator all keep it.

Consequences worth knowing:

- The builder re-opens with the saved audience already ticked. That is not a
  default audience — ADR 0012's rule is that the _system_ never implies one —
  it is the operator's own saved work.
- The event detail shows the audience from the moment one is proposed, so a
  draft carrying forty people says so rather than looking untouched.
- A draft may carry an **empty** audience. Clearing a selection is a legitimate
  thing to do; invariant E1b bites at approval, not before it.
- The audience is frozen the instant the event is approved. Both write paths
  guard on `status = 'draft'`, so the freeze is structural rather than a control
  that happens not to be rendered.

### Approval honours the confirmed list exactly

If somebody goes inactive between being proposed and the event being approved,
they are **still invited**. A human chose them and the screen showed their name;
dropping them would mean approving a different list from the one confirmed. The
confirmation screen says how many are no longer active and still lets the
approval proceed, and the audit row records the count.

### One person, one invitation

A person can qualify in more than one capacity — the frozen model is explicit
that the President is also a player, and eleven people in the synthetic club hold
both a membership and a role. They are invited **once**, as a player before a
coach before a committee member, and the resolved capacity is shown against
their name.

The database cannot see this collision: a player row's `person_id` is null and a
committee row's `season_membership_id` is null, so the two unique indexes never
meet. Left alone it would send one person two WhatsApp messages about one
practice.

### The group buttons

- **Everyone active is first**, and the narrower groups read as refinements of
  it.
- Each button is a **toggle**: lit when every one of its people is selected,
  and pressing it again clears them. Unticking one person unlights the group.
- Each count is **people, not rows**. An earlier version showed the row count
  and explained the difference in a sentence underneath; the club knows what
  "everyone active" means and the screen does not explain its own arithmetic.
- Selected people **sort to the top** of the list, so an audience of forty built
  from a roster of forty-five is reviewable.

### Additional derived groups

The four groups here are what current domain data defines authoritatively.
Further groups — by unit, by year, by anything the club actually asks for — are
follow-on work and need the team to define them. They are not covered by this
ticket and are not the post-MVP configuration administration in LAN-106 either.

## Where the rules live

| Rule                                                   | Source of truth                                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| RSVP deadline per event type, and the clamp            | [`../../adr/0021-response-deadline-configuration.md`](../../adr/0021-response-deadline-configuration.md) |
| Audience proposed on the draft, frozen at approval     | [`../../adr/0022-audience-proposed-then-frozen.md`](../../adr/0022-audience-proposed-then-frozen.md)     |
| The audience must be non-empty (E1b), and who enforces | [`../../adr/0012-explicit-event-audience.md`](../../adr/0012-explicit-event-audience.md)                 |
| Who may approve                                        | `src/lib/auth/capabilities.ts` — one file, no inline role lists                                          |

## Decision history relocated from source (LAN-300)

### src/app/operate/events/[id]/page.tsx — `EventDetailPage` (module header)

> ## Why they are all one route
>
> The screen registry gives every one of them `/operate/events/[id]`, and that
> is not an oversight in the contract: they are states of one record. `?step=`
> selects between the audience builder and the confirmation; `?approved=1`
> reports the transition that just happened. The same device LAN-76 used for
> UX-33.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/page.tsx — `EventDetailPage` (module header)

> ## After Brian's LAN-76 clarification
>
> Draft actions are gated on `event_calendar_management` and approval on
> `event_approval`. Any other linked operator can open this page and read the
> event, and is offered nothing to press; the actions guard themselves
> server-side regardless, so the hiding is a courtesy rather than the boundary.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/page.tsx — `EventDetailPage` (module header)

> ## What this screen deliberately does not show
>
> Neither who entered the event nor where its schedule comes from. Brian read
> both on the real screen and they answered questions nobody was asking. Both
> are still recorded — `events.owner_person_id`, `events.origin`, and every
> transition's actor in `audit_events`. What went is the display, not the record.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-approval.ts — module header, part 2 of 2 (the transaction and its order)

> ## What "one transaction" still has to mean
>
> Approval is four writes that are only ever correct together: the event's
> status and approval columns, one invitation per audience member, one
> notification job per invitation, and the audit rows. Every partial state is a
> specific operational failure — approval without invitations is exactly the
> defect `uninvited_audience_members` exists to report, and jobs without
> invitations is undeliverable work in the queue forever. `withTransaction`
> offers no savepoint, so there is no way to half-recover.
>
> ## Order, and why it is this order
>
> 1. **The guarded status update first.** `where id = $1 and status = 'draft'`
>    is the concurrency control, not a preceding read: it takes the row lock, so
>    a second approval arriving at the same instant blocks, then finds the event
>    is no longer a draft and is refused.
> 2. **Invitations from the audience rows themselves**, by selecting from the
>    table. One invitation per audience row is then a property of the statement
>    instead of a loop that could drift.
> 3. **Jobs from the invitations**, for the same reason.
> 4. **Audit last**, once the facts it describes are true.
>
> ## What this module does not do
>
> It delivers nothing. Jobs are created `pending` on a provider-neutral channel
> and left there; LAN-78 dispatches them through whatever LAN-92 selects.
>
> It also provides no way back. The audience is editable while the event is a
> draft and frozen the moment it is approved — no late additions, no removals,
> no resend. Both write paths guard on `status = 'draft'`, so the freeze is
> structural rather than a control that happens not to be rendered.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-approval.ts — `missingForApproval`

> ## Which fields, and why the list is this short
>
> The date and the start time, and that is all that can be missing. `name`
> and `event_type` are `not null` and are the minimum to save a draft at all
> (D15), so an event that exists has both; everything else on the record is
> legitimately absent on an approved event:
>
> - **Venue** — `TBD` is what the club writes on its own term card for a
>   fixture whose ground is not settled, and W4 says so in as many words: "TBD
>   stays a legitimate value on a draft — for venue, for time". Requiring one
>   would refuse an event the club really does approve.
> - **Description and required equipment** — W8 makes every template field
>   optional, and a meeting that needs no equipment has nothing to say here.
>
> **Start time is the one exception to "TBD stays legitimate", and it is
> deliberate.** F-C1, owner decision Q-31 (Brian, 2026-08-27): the dispatch
> path had nowhere honest to put a TBD kickoff — `coalesce(starts_at,
'00:00'::time)` rendered it as a fact, and 31 people were told an event
> started at midnight because nobody had set a time. Chosen over rendering
> "time to be confirmed" and over warning-but-allowing: this narrows W4's own
> words to a _draft_, and removes the TBD-approval workflow for a start time
> specifically. This guard is forward-only — it cannot reach a row that was
> already approved with a null `starts_at` before it existed; the dispatch
> path's own guard (`EVENT_HAS_NO_START_TIME_REASON`, `./delivery.ts` and
> `./messaging-scheduler.ts`) is what stops one of those from still
> fabricating a time.
>
> ## Where it is enforced
>
> Here, above the database, in the service layer — so it holds when the screen
> is bypassed and `approveEvent` is called directly. Invariant E1a
> (`events_approval_requires_date_and_audience`) is the database's own
> backstop for the date; it was **not** extended to the start time, because
> that would need a migration and this correction adds none. The service
> layer is documented as the primary authorization boundary and the database
> as the backstop (`AGENTS.md`) — this guard is narrower than that principle
> ordinarily allows, and is recorded here rather than left implicit.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-approval.ts — `assertOperatingSeason`

> `readEventIn` reads by id alone — deliberately, and documented as such, so
> that any event resolves for display. That is right for a screen and wrong for
> a write: a draft left behind in a closed season was approvable, and approving
> it would have resolved an audience from that season's memberships and queued
> real messages to a roster the club has moved on from.
>
> No such draft exists today, which is why this was latent rather than broken.
> Brian's decision, 14 August 2026: refuse it. The safe direction, and it
> matches how every other read in the application already treats "the current
> season".
>
> `readCurrentSeasonIn` is the same resolution the rest of the service layer
> uses — `open`, `active` or `closing`, newest first — so a club that has opened
> next season before closing this one still operates the newer of the two, and
> an event in either is fine.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/actions.ts — approveEventAction

> `draft → approved` — the one action in this slice that sends anything to a
> real person. LAN-77.
>
> Three things about it are deliberate.
>
> **It guards on `event_approval`, not on `event_calendar_management`.** The two
> capabilities currently name the same four roles, so today the check is
> equivalent — and it is still the wrong one to reuse. Approval is the gate that
> releases automated messages, and separation of duties is explicitly something
> Brian may add later; when he does, it narrows one list in `capabilities.ts`
> and this action changes not at all.
>
> **It carries no audience at all.** The audience is already stored against the
> draft by `saveEventAudienceAction`, so the only thing this posts is which
> event. A browser therefore cannot widen the list between the confirmation
> screen and the write, because it is not sending a list.
>
> **It does not check the count.** The confirmation screen shows UX-42 when the
> stored audience is empty, and that is a courtesy: a client skipping the screen
> entirely still reaches invariant E1b's refusal in the service layer rather
> than producing an approval nobody would receive.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/actions.ts — approveEvent

> Approve an event and release its invitations. The four calendar roles.
>
> The behaviour shipped in LAN-77 and lives in
> `src/app/operate/events/actions.ts`, beside the screen that posts to it —
> same as `activateMembership` above, whose body shipped in LAN-75. These
> entry points stay because they are the guard-parity harness LAN-73 built:
> `actions.test.ts` calls each one directly with an under-privileged actor, so
> a capability quietly widened or a guard quietly deleted fails a test here
> rather than being discovered on a screen.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/[id]/question-list.tsx — module header (QuestionList)

> The questions, exactly as a player will meet them — amendment W4-A1.
>
> Shared by the approval review and the event page, because they are the same
> list and `docs/ux/standards.md` rule 7 is about exactly that. The review adds
> the RSVP's own first question at the top, because "are you coming?" is asked
> before any of these and an approver reading the list should see the page as it
> will arrive rather than the part of it this screen happens to own.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/audience-selection.ts — file header (why rules live here)

> Split out of `event-audience.ts` for the same structural reason
> `event-input.ts` is split out of `events.ts`, and the header there explains
> it: this module is imported by the **client** component that renders the
> audience builder, and `event-audience.ts` reaches the database. A client
> component importing that would drag `pg` into the browser bundle, which does
> not build.
>
> The rules living here rather than in the component is the point. The screen
> has to show the approver **exactly** the list that approval will write, names
> and count and capacity, because the confirmed list is the approval subject
> rather than the group labels that produced it. A component that re-implemented
> de-duplication would eventually disagree with the transaction by one person,
> and the operator would never know which of the two was lying.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/events/read.ts — lockEventIn (LAN-77 approval-path bug)

> Independent review proved exactly that against LAN-77's approval path, with
> three real connections. `approveEvent` read the audience, then flipped the
> status; `saveEventAudience` checked the status with a plain `select`, which
> does not block on another transaction's uncommitted `update`, and deleted the
> audience rows underneath it. The committed result was an **approved event with
> no audience and no invitations** — precisely the state invariant E1b exists to
> prevent, and one `uninvited_audience_members` cannot even report, because
> there are no audience rows left to report on.
>
> The guarded `update … where status = 'draft'` stays where it is. It is still
> the thing that makes a double submission safe, and it now has a lock in front
> of it rather than instead of it.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
