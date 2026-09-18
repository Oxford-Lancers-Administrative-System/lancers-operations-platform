# 0022 — An event's audience is proposed on the draft and frozen at approval

**Status:** Accepted · **Date:** 2026-08-13 · **Extends
[0012](0012-explicit-event-audience.md)**

## Context

ADR 0012 made the confirmed audience a relation and left its non-emptiness to the
service layer. It did not say **when** the rows are written, and LAN-77's first
implementation chose the moment of approval: the browser posted a list of people,
the approval transaction resolved it and inserted the audience, the invitations
and the jobs together.

That failed its first contact with a real screen. Brian built a forty-person
audience, pressed **Edit draft** to correct the venue, and lost all of it. There
was nowhere for it to be — the only copy lived in a React component.

The schema had anticipated this and the implementation had not.
`20260810121300_domain_event_audience.sql` says so in as many words: "The
audience is populated BEFORE approval, because it is the thing the approver is
confirming. There is therefore no event-status constraint here: a draft may carry
a proposed audience."

A second question fell out of the first. Once an audience can sit on a draft for
a week, the roster can move underneath it — somebody goes inactive between being
chosen and the event being approved.

## Decision

**The audience is stored against the draft**, as its own step, and approval
confirms what is already there.

- `saveEventAudience` replaces a draft's audience wholesale. An empty audience is
  a legal proposal: clearing a selection is a thing an operator must be able to
  do.
- `approveEvent` takes no audience. It reads the stored rows, refuses an empty
  one under invariant E1b, and creates the invitations and jobs from them.
- Both write paths guard on `status = 'draft'`. The audience is therefore frozen
  the instant the event is approved — structurally, not by omitting a button.

**Approval honours the confirmed list exactly.** Somebody who has gone inactive
since they were proposed is still invited. A human chose them and the screen
showed their name; dropping them silently would mean approving a different list
from the one confirmed. The confirmation screen states how many are no longer
active, the approval proceeds, and the audit row records the count.

**One person receives one invitation.** Where somebody qualifies in several
capacities, the audience holds them once — player before coach before committee —
and the resolved capacity is shown against their name. The database cannot
enforce this: a player row's `person_id` is null and a committee row's
`season_membership_id` is null, so the two unique indexes never meet.

## Consequences

- The confirmation screen renders from the database rather than from client
  state, which is what makes the audience survive an edit, a refresh, a closed
  tab and a second operator. The only client component left in the flow is the
  tick list.
- A failed approval no longer discards the audience. Rollback covers the
  approval; the proposal was committed earlier and stays, which is the desired
  behaviour and is asserted by test.
- A draft can now be inspected for who it is _for_, not only for what it is.
  Invariant P1 still forbids invitations before approval, so a proposed audience
  carries no obligation and reaches nobody.
- `event_audience_members` rows now exist against events that may never be
  approved, and that changes what one view reports.

  **The two operational surfaces are unaffected**, because both filter on event
  status: `uninvited_audience_members` narrows to `approved, occurred, not_held`,
  and `nonresponse_queue` to `approved, occurred`. A draft's proposal is
  therefore never an approval defect and never a nonresponse to chase.

  **`invitation_response_state` does change.** It partitions the audience of
  every response-soliciting event whatever its status, so a draft with forty
  people chosen supplies forty `never_invited` rows — literally true, and
  operationally meaningless. Nothing in the slice reads that view directly; the
  Monday report reads the two narrowed views above. Whether the partition should
  exclude drafts is a **schema question reported to Brian rather than decided
  here**, since changing it is a migration.

  The seeded-data test that asserted these counts were equal now compares them
  over the same event statuses, and `src/lib/services/event-approval.test.ts`
  pins the behaviour in both directions.

- Editing an approved event's audience is refused rather than absent. The
  amendment workflow, when somebody builds it, has a stated rule to change rather
  than a silence to interpret.
- **Open:** amending an approved event's date does not recompute its invitations'
  deadlines, and adding a late invitee remains unbuilt. Both belong to the
  amendment workflow, which no issue owns yet — see LAN-77's owner clarification.

## Amendment, 2026-09-17 — the freeze is "never reduced", not "never grows"

Added to this ADR rather than into it: the decision above stands as written, and
this says what LAN-392 and LAN-393 changed about it and why.

Clint, 2026-09-17: "If I make an event with an audience and I want to add more
people to the audience (which happens a lot during recruitment) I can't do that
right now." Brian, four minutes later: "if the status of somebody changes (for
example, when a recruit gets added), they should automatically be added to the
recruitment event."

Two doors now reach an approved event's audience, and both only ever add.

- **LAN-392, the group rule.** An approved event stores the derived audience
  groups it was built from (`event_audience_groups`) and the people the approver
  took out of them (`event_audience_exclusions`). While it is approved and has
  not started, a person whose standing moves them into one of those groups is
  added to the audience and invited under that event's own frozen plan.
- **LAN-393, the hand-add.** An operator may name a person and add them to an
  approved event that has not started, through a service of its own —
  `saveEventAudience` guards on `draft` and is a wholesale replace, and
  `amendApprovedEvent` refuses an audience-only change outright.

**What "frozen" means now.** The approver's list is never reduced and never
re-resolved. Nobody is removed by a rule, no confirmed row is rewritten, no
capacity on an existing row is upgraded, and neither door can reach a person the
approver unticked — that deselection is recorded, and only an operator naming
them specifically clears it. What the original decision forbade, it still
forbids: an audience that silently re-resolves against the live roster between
approval and the send.

**The last paragraph of "Consequences" is now answered.** "Adding a late invitee
remains unbuilt" was true when this ADR was written. It is built, and it is built
the way that paragraph anticipated — adding them to the audience and inviting
them in one transaction — rather than by relaxing the `draft` guard on either
existing write path, both of which are unchanged.
