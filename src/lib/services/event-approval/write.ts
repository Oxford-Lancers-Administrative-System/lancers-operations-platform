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

// Stated here because nothing below the service layer states it: readEventIn reads by id alone so
// any event resolves for display, which is wrong for a write. Brian, 14 August 2026: refuse it.
async function assertOperatingSeason(tx: Tx, event: EventDetail): Promise<void> {
  const current = await readCurrentSeasonIn(tx);
  if (event.seasonId !== current.id) {
    throw new InvalidTransition(WRONG_SEASON_MESSAGE, { rule: WRONG_SEASON_RULE });
  }
}

// Wholesale replacement, not a diff — deleting first is safe only while a draft (P1). Empty is accepted here, refused only at approval (E1b).
export async function saveEventAudience(
  actorPersonId: string,
  eventId: string,
  keys: readonly string[],
): Promise<AudienceMember[]> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const event = await lockEventIn(tx, eventId); // locked before status is read — see lockEventIn
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

    if (!resolution.ok && resolution.failure !== "empty") {
      throw new ConstraintViolated(resolution.message, { rule: resolution.rule }); // "empty" is legal here; "unknown" never is
    }
    const members = resolution.ok ? resolution.members : [];

    await tx.query("delete from public.event_audience_members where event_id = $1", [eventId]);

    if (members.length > 0) {
      await tx.query(
        // invitee_person_id denormalised so "one row per person per event" is a unique index (P9, LAN-294).
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

// Approves a draft and releases its invitations, atomically. Takes no audience — whatever
// saveEventAudience last stored is what the approver saw. Four writes only correct together
// (status, invitations, jobs, audit), in LAN-77's fixed order.
export async function approveEvent(
  actorPersonId: string,
  eventId: string,
): Promise<ApprovalOutcome> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const before = await lockEventIn(tx, eventId); // locked before the audience is read
    await assertOperatingSeason(tx, before);
    const catalogue = await listAudienceCatalogueIn(
      tx,
      before.seasonId,
      before.scheduledOn,
      before.eventType,
    );
    const members = await readAudienceIn(tx, eventId, catalogue);

    const missing = missingForApproval(before); // D16, checked first — no date means no deadline and no week
    if (missing.length > 0) {
      throw new ConstraintViolated(describeMissingForApproval(missing), {
        rule: APPROVAL_INCOMPLETE_RULE,
      });
    }

    if (members.length === 0) {
      throw new ConstraintViolated(EMPTY_AUDIENCE_MESSAGE, { rule: EMPTY_AUDIENCE_RULE }); // invariant E1b, refused before anything is written
    }

    const moment = await tx.query<{ at: Date }>("select now() as at");
    const approvedAt = moment.rows[0].at;

    // LAN-169: the whole plan, computed once here, so the panel read and the schedule can't disagree.
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
      // double-submission path — the second press is told the event is already approved; nothing written
      throw new InvalidTransition(
        `${APPROVAL_REQUIRES_DRAFT_MESSAGE} This event is ${describeStatus(before.status)}.`,
        { rule: APPROVAL_REQUIRES_DRAFT_RULE },
      );
    }

    const invitations = await tx.query<{ id: string }>( // selected from the audience, so "one invitation per audience member" is a property of the statement (P7)
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

    const jobs = await tx.query<{ id: string }>( // idempotency_key derives from facts that never change (invariant M1) — a retry can't double-send
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

    // LAN-169: approval commits the plan, not the send. Frozen first so REQ-schedule-not-retroactive holds immediately.
    await freezeMessagingPlanIn(tx, eventId, plan, actorPersonId);
    const ladder = await scheduleEventLadderIn(tx, eventId, plan);

    const byCapacity = countByCapacity(members);

    await recordAudit(tx, {
      actorPersonId,
      action: "event.audience_confirmed",
      entityTable: "events",
      entityId: eventId,
      context: {
        audienceSize: members.length,
        byCapacity,
        noLongerSelectable: members.filter((member) => !member.stillSelectable).length, // approval honours the confirmed list even if since-inactive
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
        invitationAt: plan.invitationAt.toISOString(), // LAN-169: what this approval set in motion, answerable later without re-deriving
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

// W11's second defect, LAN-203: this omitted recruits, so an approver was never told how many
// recruits an event reaches. See relocations.md.
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
