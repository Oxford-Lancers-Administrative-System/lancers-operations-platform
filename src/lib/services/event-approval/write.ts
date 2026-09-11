import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "../audit";
import { actorRequirement } from "../actor";
import {
  EMPTY_AUDIENCE_MESSAGE,
  EMPTY_AUDIENCE_RULE,
  listAudienceCatalogueIn,
  resolveSelection,
  type AudienceCapacity,
} from "../event-audience";
import { lockEventIn, readEventIn, type EventDetail } from "../events";
import { readCurrentSeasonIn } from "../seasons";
import { freezeMessagingPlanIn, resolveMessagingPlanIn } from "../messaging-schedule";
import { scheduleEventLadderIn } from "../messaging-scheduler";
import type { ResolvedResponseDeadline } from "../response-deadline";
import {
  APPROVAL_INCOMPLETE_RULE,
  deadlineFromPlan,
  describeMissingForApproval,
  missingForApproval,
  readAudienceIn,
  type ApprovalOutcome,
  type AudienceMember,
} from "./shared";

/**
 * Proposing an audience, and approving the event — LAN-77. Decision history: docs/adr/0022-audience-proposed-then-frozen.md · docs/ux/tickets/LAN-77-event-approval.md.
 *
 * `saveEventAudience` writes the proposal; `approveEvent` confirms what is
 * already stored and releases it (Brian, 13 August 2026). Approval honours
 * the confirmed list exactly — it does not re-resolve against the live
 * roster — and both write paths guard on `status = 'draft'`, so the audience
 * freeze is structural, not a control that happens not to be rendered.
 */

const APPROVAL_REQUIRES_DRAFT_MESSAGE = "Only a draft can be approved.";
const APPROVAL_REQUIRES_DRAFT_RULE = "event_approval_requires_draft";
const AUDIENCE_EDIT_REQUIRES_DRAFT_MESSAGE =
  "Only a draft's audience can be changed. Once an event is approved its audience is fixed.";
const AUDIENCE_EDIT_REQUIRES_DRAFT_RULE = "event_audience_requires_draft";

const WRONG_SEASON_RULE = "event_outside_operating_season";

const WRONG_SEASON_MESSAGE =
  "This event belongs to a season the club is no longer operating, so it cannot be " +
  "approved. Approving it would invite that season's members and queue messages to them.";

/**
 * Invariant, stated here because nothing below the service layer states it: an
 * event may only be approved while its season is the one the club is operating.
 *
 * `readEventIn` reads by id alone — deliberately, and documented as such, so
 * that any event resolves for display. That is right for a screen and wrong for
 * a write. Brian's decision, 14 August 2026: refuse it. Decision history: docs/adr/0022-audience-proposed-then-frozen.md · docs/ux/tickets/LAN-77-event-approval.md.
 */
async function assertOperatingSeason(tx: Tx, event: EventDetail): Promise<void> {
  const current = await readCurrentSeasonIn(tx);
  if (event.seasonId !== current.id) {
    throw new InvalidTransition(WRONG_SEASON_MESSAGE, { rule: WRONG_SEASON_RULE });
  }
}

/**
 * Replaces the audience proposed against a draft.
 *
 * Wholesale replacement rather than a diff, because the operator's screen holds
 * a complete list and sending a complete list is the only way for "I unticked
 * somebody" to arrive at all. Deleting first is safe precisely while the event
 * is a draft: invariant P1 means no invitation can reference these rows yet, so
 * nothing depends on them.
 *
 * An **empty** audience is accepted here and refused at approval. That is not an
 * inconsistency: a draft is allowed to be unfinished, and an operator has to be
 * able to clear a selection they no longer want. Invariant E1b is about
 * approving, and `approveEvent` is where it bites.
 */
export async function saveEventAudience(
  actorPersonId: string,
  eventId: string,
  keys: readonly string[],
): Promise<AudienceMember[]> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    // Locked before the status is read, not after. A plain `select` does not
    // block on another transaction's uncommitted `update`, so without this an
    // approval in flight is invisible here and this function would happily
    // delete the audience it is about to invite. See `lockEventIn`.
    const event = await lockEventIn(tx, eventId);
    await assertOperatingSeason(tx, event);
    if (event.status !== "draft") {
      throw new InvalidTransition(
        `${AUDIENCE_EDIT_REQUIRES_DRAFT_MESSAGE} This event is ${describeStatus(event.status)}.`,
        { rule: AUDIENCE_EDIT_REQUIRES_DRAFT_RULE },
      );
    }

    const catalogue = await listAudienceCatalogueIn(
      tx,
      event.seasonId,
      event.scheduledOn,
      event.eventType,
    );
    const resolution = resolveSelection(catalogue.candidates, keys);

    // "Empty" is a legal proposal; "unknown" never is. Refusing an unresolvable
    // key rather than skipping it keeps the stored audience equal to the list
    // the operator was looking at.
    if (!resolution.ok && resolution.failure !== "empty") {
      throw new ConstraintViolated(resolution.message, { rule: resolution.rule });
    }
    const members = resolution.ok ? resolution.members : [];

    await tx.query("delete from public.event_audience_members where event_id = $1", [eventId]);

    if (members.length > 0) {
      await tx.query(
        // `invitee_person_id` is the human, denormalised so that "one row per
        // person per event" is a unique index rather than a rule somebody has
        // to remember (invariant P9, LAN-294). It is carried from the resolved
        // member rather than looked up, and the composite foreign key to
        // `season_memberships (id, person_id)` is what stops it disagreeing
        // with the membership a player row anchors to.
        `insert into public.event_audience_members
           (event_id, season_id, capacity, season_membership_id, person_id,
            invitee_person_id, added_at, added_by_person_id)
         select $1, $2, member.capacity::public.invitation_capacity,
                case when member.capacity = 'player' then member.anchor_id::uuid end,
                case when member.capacity <> 'player' then member.anchor_id::uuid end,
                member.person_id::uuid,
                now(), $5
           from unnest($3::text[], $4::text[], $6::text[])
                  as member(capacity, anchor_id, person_id)`,
        [
          eventId,
          event.seasonId,
          members.map((member) => member.capacity),
          members.map((member) => member.anchorId),
          actorPersonId,
          members.map((member) => member.personId),
        ],
      );
    }

    await recordAudit(tx, {
      actorPersonId,
      action: "event.audience_proposed",
      entityTable: "events",
      entityId: eventId,
      context: { audienceSize: members.length, byCapacity: countByCapacity(members) },
    });

    return readAudienceIn(tx, eventId, catalogue);
  });
}

/**
 * Approves a draft event and releases its invitations, atomically.
 *
 * Takes no audience: the audience is whatever `saveEventAudience` last stored,
 * which is the list the approver was shown. Nothing is re-resolved and nobody
 * is dropped.
 *
 * Four writes that are only ever correct together — the event's status and
 * approval columns, one invitation per audience member, one notification job
 * per invitation, and the audit rows — in the order LAN-77's own note fixes:
 * the guarded status update first (the concurrency control), invitations from
 * the audience rows themselves, jobs from the invitations, audit last.
 * Decision history: docs/adr/0022-audience-proposed-then-frozen.md · docs/ux/tickets/LAN-77-event-approval.md.
 */
export async function approveEvent(
  actorPersonId: string,
  eventId: string,
): Promise<ApprovalOutcome> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    // The lock comes first, before the audience is read. Everything below
    // decides from that audience, so reading it unlocked would mean deciding
    // from a list a concurrent `saveEventAudience` is free to replace.
    const before = await lockEventIn(tx, eventId);
    await assertOperatingSeason(tx, before);
    const catalogue = await listAudienceCatalogueIn(
      tx,
      before.seasonId,
      before.scheduledOn,
      before.eventType,
    );
    const members = await readAudienceIn(tx, eventId, catalogue);

    // D16, and checked before the audience because it is the more fundamental
    // gap: an event with no date has no deadline to compute and no week to sit
    // in, and telling an operator to build an audience for it first would send
    // them down the longer of the two paths.
    const missing = missingForApproval(before);
    if (missing.length > 0) {
      throw new ConstraintViolated(describeMissingForApproval(missing), {
        rule: APPROVAL_INCOMPLETE_RULE,
      });
    }

    // Invariant E1b, and the reason it is service-layer work: the database
    // stores the audience and would accept an approval with none, so this
    // sentence is the only thing between an approver and a silent
    // no-recipient approval. Refused before anything is written.
    if (members.length === 0) {
      throw new ConstraintViolated(EMPTY_AUDIENCE_MESSAGE, { rule: EMPTY_AUDIENCE_RULE });
    }

    const moment = await tx.query<{ at: Date }>("select now() as at");
    const approvedAt = moment.rows[0].at;

    // LAN-169. The whole plan, not only the deadline: the dispatch anchor, the
    // ladder and the escalation threshold are all computed from one arithmetic,
    // at one moment, so the panel the approver read and the schedule that then
    // runs cannot disagree.
    //
    // Every approved event carries a deadline (D23). Invariant E1a has already
    // guaranteed the date it is computed from, because approval is refused
    // without one.
    const plan = await resolveMessagingPlanIn(tx, before, approvedAt);
    const deadline: ResolvedResponseDeadline = deadlineFromPlan(plan);

    const updated = await tx.query<{ id: string }>(
      `update public.events
          set status = 'approved',
              approved_at = $2,
              approved_by_person_id = $3,
              audience_confirmed_at = $2,
              audience_confirmed_by_person_id = $3,
              response_deadline_at = $4::timestamptz,
              updated_at = now()
        where id = $1 and status = 'draft'
       returning id`,
      [eventId, approvedAt, actorPersonId, deadline.at],
    );

    if (updated.rowCount === 0) {
      // The double-submission path. The second press finds the event already
      // approved and is told so; nothing it would have written was written,
      // because this is the first statement that writes anything.
      throw new InvalidTransition(
        `${APPROVAL_REQUIRES_DRAFT_MESSAGE} This event is ${describeStatus(before.status)}.`,
        { rule: APPROVAL_REQUIRES_DRAFT_RULE },
      );
    }

    // Selected from the audience rather than from `members`, so "one invitation
    // per audience member" is a property of the statement. Invariant P7's
    // `never_invited` state cannot arise from an approval that ran this code.
    const invitations = await tx.query<{ id: string }>(
      `insert into public.invitations
         (event_id, event_status, season_id, capacity,
          season_membership_id, person_id, status, expires_at, audience_member_id)
       select a.event_id, 'approved'::public.event_status, a.season_id, a.capacity,
              a.season_membership_id, a.person_id, 'pending', $2::timestamptz, a.id
         from public.event_audience_members a
        where a.event_id = $1
       returning id`,
      [eventId, deadline.at],
    );

    // Invariant M1: the key is derived from facts that do not change — the
    // event, the capacity and the participant — so a retry of this whole
    // transaction cannot produce a second job for one invitee. The unique index
    // on `idempotency_key` is what turns that intent into a guarantee.
    const jobs = await tx.query<{ id: string }>(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, invitation_id, event_id, person_id,
          channel, template_variables)
       select 'event:' || i.event_id::text || ':invitation:' || i.capacity::text
                || ':' || i.participant_id::text,
              'invitation', 'pending', i.id, i.event_id,
              coalesce(i.person_id, m.person_id),
              'whatsapp', '{}'::jsonb
         from public.invitations i
         left join public.season_memberships m on m.id = i.season_membership_id
        where i.event_id = $1
       returning id`,
      [eventId],
    );

    // LAN-169. Approval commits the plan rather than performing the send.
    //
    // Brian, 2026-08-22: "Yes, approval commits the plan rather than sending."
    // The audience freeze R4 protects is unchanged — nothing below writes
    // `invitations` or `event_audience_members` — and only the moment of
    // dispatch moves. Frozen first so that `REQ-schedule-not-retroactive` is
    // true from the instant the event becomes approved: an operator who edits
    // the club's schedule a second later changes nothing about this event.
    await freezeMessagingPlanIn(tx, eventId, plan, actorPersonId);
    const ladder = await scheduleEventLadderIn(tx, eventId, plan);

    const byCapacity = countByCapacity(members);

    // Two rows, not one per invitee. Where a transition has a typed first-class
    // home the model says that table *is* the record, and an invitation is its
    // own record — 42 audit rows restating 42 invitations is the reconciliation
    // problem register D9 refuses.
    await recordAudit(tx, {
      actorPersonId,
      action: "event.audience_confirmed",
      entityTable: "events",
      entityId: eventId,
      context: {
        audienceSize: members.length,
        byCapacity,
        // Recorded because approval honours the confirmed list as-is: if
        // somebody had gone inactive since they were proposed, the audit says
        // the approver invited them anyway rather than leaving it inferable.
        noLongerSelectable: members.filter((member) => !member.stillSelectable).length,
      },
    });

    await recordAudit(tx, {
      actorPersonId,
      action: "event.approved",
      entityTable: "events",
      entityId: eventId,
      fromState: "draft",
      toState: "approved",
      context: {
        audienceSize: members.length,
        byCapacity,
        invitationsCreated: invitations.rowCount,
        notificationJobsCreated: (jobs.rowCount ?? 0) + ladder.reminders,
        responseDeadlineAt: deadline.at.toISOString(),
        responseDeadlineClamped: deadline.clamped,
        // LAN-169. What this approval actually set in motion, recorded so the
        // confirmation can restate it and so a later question about why an
        // event chased the way it did is answerable from the audit trail rather
        // than by re-deriving a plan from a schedule that may since have moved.
        invitationAt: plan.invitationAt.toISOString(),
        dispatchesImmediately: plan.dispatchesImmediately,
        lateApproval: plan.lateApproval,
        remindersScheduled: ladder.reminders,
        escalationAt: plan.escalationAt?.toISOString() ?? null,
      },
    });

    return {
      event: await readEventIn(tx, eventId),
      members,
      invitationCount: invitations.rowCount ?? 0,
      notificationJobCount: (jobs.rowCount ?? 0) + ladder.reminders,
      deadline,
      plan,
    };
  });
}

// W11's second defect, LAN-203: this omitted recruits entirely, so an
// operator approving a recruitment event was never told how many recruits it
// reaches — precisely the number they care about most. `recruit` is one of
// four values `AudienceCapacity` already carries (`../event-audience.ts`);
// this function had simply never been extended to read it.
function countByCapacity(members: readonly { capacity: AudienceCapacity }[]) {
  return {
    player: members.filter((member) => member.capacity === "player").length,
    coach: members.filter((member) => member.capacity === "coach").length,
    committee: members.filter((member) => member.capacity === "committee").length,
    recruit: members.filter((member) => member.capacity === "recruit").length,
  };
}

const requireActor = actorRequirement("An audience change has to name the operator who made it.");

const STATUS_DESCRIPTIONS: Readonly<Record<string, string>> = Object.freeze({
  draft: "a draft",
  approved: "already approved",
  cancelled: "cancelled",
});

function describeStatus(status: string): string {
  return STATUS_DESCRIPTIONS[status] ?? status;
}
