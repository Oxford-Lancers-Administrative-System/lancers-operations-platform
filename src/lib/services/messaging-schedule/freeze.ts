import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import type { MessagingPlan } from "./plan";
import type { MessagingSchedule } from "./schedule";

/**
 * Writing the plan onto an event at approval, and reading it back
 * (`REQ-schedule-not-retroactive`). LAN-300 split of `messaging-schedule.ts`;
 * see `./index`.
 */

/** The recruit ladder as it was frozen, read back from `event_messaging_plans`. */
export interface FrozenRecruitLadder {
  readonly invitationAt: Date;
  readonly dispatchesImmediately: boolean;
  readonly followUpAt: Date | null;
}

/** The plan as it was frozen, read back from `event_messaging_plans`. */
export interface FrozenMessagingPlan {
  readonly eventId: string;
  readonly schedule: MessagingSchedule;
  readonly responseDeadlineAt: Date;
  readonly invitationAt: Date;
  readonly escalationAt: Date | null;
  readonly dispatchesImmediately: boolean;
  readonly lateApproval: boolean;
  readonly whatsappRemindersScheduled: number;
  readonly emailRemindersScheduled: number;
  readonly frozenAt: Date;
  /** REQ-approval-shows-both-ladders. `null` where this event's frozen plan carries no recruit ladder. */
  readonly recruitLadder: FrozenRecruitLadder | null;
}

function countReminders(plan: MessagingPlan, channel: "whatsapp" | "email"): number {
  return plan.rungs.filter((rung) => rung.kind === "reminder" && rung.channel === channel).length;
}

/**
 * Writes the plan onto the event, once, at approval.
 *
 * `REQ-schedule-not-retroactive`, and the reason it is stored rather than
 * recomputed: the schedule is editable at runtime now. Recomputing a chase from
 * `messaging_schedules` would mean an operator who shortens the cadence on
 * Tuesday retroactively changes when Monday's already-approved event chases
 * forty people — and, worse, that the plan the approver read before committing
 * stops being the plan that runs.
 *
 * `on conflict do update` rather than `do nothing`, because W8 recomputes a
 * rescheduled event's thresholds and that is the one legitimate reason a frozen
 * plan moves. A second approval of the same event cannot reach here: approval
 * is guarded on `status = 'draft'`.
 */
export async function freezeMessagingPlanIn(
  tx: Tx,
  eventId: string,
  plan: MessagingPlan,
  actorPersonId: string | null,
): Promise<void> {
  await tx.query(
    `insert into public.event_messaging_plans
       (event_id, rsvp_by_days, invitation_lead_days, reminder_cadence_hours,
        whatsapp_reminder_count, email_reminder_count, escalation_hours,
        response_deadline_at, invitation_at, escalation_at,
        dispatches_immediately, late_approval,
        whatsapp_reminders_scheduled, email_reminders_scheduled, frozen_by_person_id,
        recruit_invitation_lead_days, recruit_follow_up_cadence_hours,
        recruit_invitation_at, recruit_dispatches_immediately, recruit_follow_up_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     on conflict (event_id) do update
        set rsvp_by_days = excluded.rsvp_by_days,
            invitation_lead_days = excluded.invitation_lead_days,
            reminder_cadence_hours = excluded.reminder_cadence_hours,
            whatsapp_reminder_count = excluded.whatsapp_reminder_count,
            email_reminder_count = excluded.email_reminder_count,
            escalation_hours = excluded.escalation_hours,
            response_deadline_at = excluded.response_deadline_at,
            invitation_at = excluded.invitation_at,
            escalation_at = excluded.escalation_at,
            dispatches_immediately = excluded.dispatches_immediately,
            late_approval = excluded.late_approval,
            whatsapp_reminders_scheduled = excluded.whatsapp_reminders_scheduled,
            email_reminders_scheduled = excluded.email_reminders_scheduled,
            recruit_invitation_lead_days = excluded.recruit_invitation_lead_days,
            recruit_follow_up_cadence_hours = excluded.recruit_follow_up_cadence_hours,
            recruit_invitation_at = excluded.recruit_invitation_at,
            recruit_dispatches_immediately = excluded.recruit_dispatches_immediately,
            recruit_follow_up_at = excluded.recruit_follow_up_at`,
    [
      eventId,
      plan.schedule.rsvpByDays,
      plan.schedule.invitationLeadDays,
      plan.schedule.reminderCadenceHours,
      plan.schedule.whatsappReminderCount,
      plan.schedule.emailReminderCount,
      plan.schedule.escalationHours,
      plan.responseDeadlineAt,
      plan.invitationAt,
      plan.escalationAt,
      plan.dispatchesImmediately,
      plan.lateApproval,
      countReminders(plan, "whatsapp"),
      countReminders(plan, "email"),
      actorPersonId,
      plan.recruitLadder ? plan.schedule.recruitInvitationLeadDays : null,
      plan.recruitLadder ? plan.schedule.recruitFollowUpCadenceHours : null,
      plan.recruitLadder?.invitationAt ?? null,
      plan.recruitLadder?.dispatchesImmediately ?? null,
      plan.recruitLadder?.followUpAt ?? null,
    ],
  );
}

async function readFrozenPlanIn(tx: Tx, eventId: string): Promise<FrozenMessagingPlan | null> {
  const result = await tx.query<{
    event_id: string;
    template_id: string;
    template_name: string;
    event_type: string;
    rsvp_by_days: number;
    invitation_lead_days: number;
    reminder_cadence_hours: number;
    whatsapp_reminder_count: number;
    email_reminder_count: number;
    escalation_hours: number;
    response_deadline_at: Date;
    invitation_at: Date;
    escalation_at: Date | null;
    dispatches_immediately: boolean;
    late_approval: boolean;
    whatsapp_reminders_scheduled: number;
    email_reminders_scheduled: number;
    frozen_at: Date;
    recruit_invitation_lead_days: number | null;
    recruit_follow_up_cadence_hours: number | null;
    recruit_invitation_at: Date | null;
    recruit_dispatches_immediately: boolean | null;
    recruit_follow_up_at: Date | null;
  }>(
    // The frozen numbers are the plan's own copies (`REQ-schedule-not-
    // retroactive`) and stay that way. The template's **name** is joined live
    // and deliberately: a rename is retroactive by decision (LAN-265, Brian
    // 2026-09-09), so an approved event reads whatever the club calls that kind
    // of event today, exactly as its list row and its public page do.
    `select p.event_id, e.template_id, t.name as template_name, e.event_type::text as event_type,
            p.rsvp_by_days, p.invitation_lead_days, p.reminder_cadence_hours,
            p.whatsapp_reminder_count, p.email_reminder_count, p.escalation_hours,
            p.response_deadline_at, p.invitation_at, p.escalation_at,
            p.dispatches_immediately, p.late_approval,
            p.whatsapp_reminders_scheduled, p.email_reminders_scheduled, p.frozen_at,
            p.recruit_invitation_lead_days, p.recruit_follow_up_cadence_hours,
            p.recruit_invitation_at, p.recruit_dispatches_immediately, p.recruit_follow_up_at
       from public.event_messaging_plans p
       join public.events e on e.id = p.event_id
       join public.event_templates t on t.id = e.template_id
      where p.event_id = $1`,
    [eventId],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    eventId: row.event_id,
    schedule: {
      templateId: row.template_id,
      templateName: row.template_name,
      eventType: row.event_type,
      rsvpByDays: row.rsvp_by_days,
      invitationLeadDays: row.invitation_lead_days,
      reminderCadenceHours: row.reminder_cadence_hours,
      whatsappReminderCount: row.whatsapp_reminder_count,
      emailReminderCount: row.email_reminder_count,
      escalationHours: row.escalation_hours,
      recruitInvitationLeadDays: row.recruit_invitation_lead_days,
      recruitFollowUpCadenceHours: row.recruit_follow_up_cadence_hours,
      updatedAt: row.frozen_at,
    },
    responseDeadlineAt: row.response_deadline_at,
    invitationAt: row.invitation_at,
    escalationAt: row.escalation_at,
    dispatchesImmediately: row.dispatches_immediately,
    lateApproval: row.late_approval,
    whatsappRemindersScheduled: row.whatsapp_reminders_scheduled,
    emailRemindersScheduled: row.email_reminders_scheduled,
    frozenAt: row.frozen_at,
    recruitLadder:
      row.recruit_invitation_at !== null
        ? {
            invitationAt: row.recruit_invitation_at,
            dispatchesImmediately: row.recruit_dispatches_immediately ?? false,
            followUpAt: row.recruit_follow_up_at,
          }
        : null,
  };
}

/**
 * The frozen plan for one event, or `null` before approval — for a page that
 * only wants to read it and holds no transaction of its own.
 */
export async function readFrozenMessagingPlan(
  eventId: string,
): Promise<FrozenMessagingPlan | null> {
  return withTransaction((tx) => readFrozenPlanIn(tx, eventId));
}
