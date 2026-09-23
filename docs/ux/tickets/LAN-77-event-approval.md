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

### The picker is checklist bands

Superseding "the group buttons", which described the pills this screen carried
until LAN-414's visual review (Brian, 2026-09-22). His finding, on the built
screen: "I think the pills don't make sense because when I click one pill
that's all active, everything lights up. I think it should be more: I click a
group, I see how many people there are and which groups I collect or not." He
chose this shape from four built on the `ux/audience-picker-variants` branch.

- **Every category is a folding band** in the roster board's own band idiom,
  using exactly `BAND_COLOURS` and no new tone. Coaching assignments folds
  again into **Coaching groups**, **Offensive position groups** and
  **Defensive position groups**, each folding on its own. General and Coaching
  assignments arrive open; the rest arrive folded.
- **Every group is a tick-box row**, the app's existing check-field idiom,
  carrying the group's head count and, right-aligned, one of three marks:
  **Selected** when it is ticked, **Included** when the selection already
  reaches everyone in it, or `adds N` for the people it would bring. An empty
  group is never **Included** — it reads `adds 0`, because there is nobody in
  it to already have.
- **A control never changes another control's visual state.** A tick box is
  ticked because somebody ticked it; overlap is only ever a number. This is the
  rule the pills broke, and it is the reason the tick state is the _stored
  group rule_ (LAN-392) rather than the old inference "is everybody this group
  would invite already chosen".
- **Whole club is first**, and the narrower groups read as refinements of it.
  It and **All roster players** are named for their size rather than for the
  membership rule inside them (Brian's walk, 2026-09-23): both reach a
  mid-onboarding membership, as LAN-415 decided, and the resolved-people list
  below the picker is what shows who that is on the day.
- **Unticking a group keeps the people a narrower ticked group still claims**,
  which is the write-side half of "overlap is a number".
- Each count is **people, not rows**, and comes from the service
  (`audienceGroupCounts`), so the row that says `adds 12` and the write that
  invites twelve more people come from one function. An earlier version showed
  the row count and explained the difference in a sentence underneath; the club
  knows what its groups mean and the screen does not explain its own
  arithmetic.
- **A sticky summary** at the top reads `<n> groups · <m> people`.
- **The resolved-people list below the picker is unchanged**, so an operator
  still sees exactly who the selection reaches, by name, before saving.
  Selected people **sort to the top** of it, so an audience of forty built from
  a roster of forty-five is reviewable.

The same component serves the **template editor's default audience**
(docs/ux/standards.md rule 7). The **approval review** and the **event's own
audience panel** name the chosen groups under the same category and
sub-category headings, in the same labels, so checking the audience against
what was ticked is reading the same words in the same order.

### Additional derived groups

The General groups here are what current domain data defines authoritatively,
beside the roster's own assignment vocabularies (LAN-414). Further groups — by
year, by anything the club actually asks for — are follow-on work and need the
team to define them. They are not covered by this ticket and are not the
post-MVP configuration administration in LAN-106 either.

## Where the rules live

| Rule                                                   | Source of truth                                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| RSVP deadline per event type, and the clamp            | [`../../adr/0021-response-deadline-configuration.md`](../../adr/0021-response-deadline-configuration.md) |
| Audience proposed on the draft, frozen at approval     | [`../../adr/0022-audience-proposed-then-frozen.md`](../../adr/0022-audience-proposed-then-frozen.md)     |
| The audience must be non-empty (E1b), and who enforces | [`../../adr/0012-explicit-event-audience.md`](../../adr/0012-explicit-event-audience.md)                 |
| Who may approve                                        | `src/lib/auth/capabilities.ts` — one file, no inline role lists                                          |
