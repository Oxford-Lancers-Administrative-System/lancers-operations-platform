import "server-only";

import { ConstraintViolated, type Tx } from "@/lib/db";
import { recordAudit } from "../audit";

/**
 * The stored cadence — reading, the default a new template starts from, and
 * changing it (LAN-171, W7). LAN-300 split of `messaging-schedule.ts`; see
 * `./index`.
 */

export interface MessagingSchedule {
  readonly templateId: string; // LAN-265: the template this cadence belongs to, and the key it is read by
  readonly templateName: string; // what the club calls it — the only word any screen shows
  readonly eventType: string; // behavioural class the recruit ladder still keys off
  readonly rsvpByDays: number; // whole days before start at which an answer is due
  readonly invitationLeadDays: number; // whole days before start at which the invitation goes
  readonly reminderCadenceHours: number; // hours between rungs, counting forward from the invitation
  readonly whatsappReminderCount: number; // counts the invitation itself as #1 (Q-19) — see relocations.md
  readonly emailReminderCount: number; // after the invitation; the invitation is never email
  readonly escalationHours: number; // hours after the RSVP deadline before the President is told; zero is legal
  readonly recruitInvitationLeadDays: number | null; // DEC-split-on-the-schedule (LAN-201); null off `recruitment`
  readonly recruitFollowUpCadenceHours: number | null; // hours to the one permitted follow-up; null likewise
  readonly updatedAt: Date;
}

const SCHEDULE_NOT_CONFIGURED_RULE = "messaging_schedule_not_configured";

const SCHEDULE_COLUMNS = `
  s.template_id,
  t.name as template_name,
  s.event_type::text as event_type,
  s.rsvp_by_days,
  s.invitation_lead_days,
  s.reminder_cadence_hours,
  s.whatsapp_reminder_count,
  s.email_reminder_count,
  s.escalation_hours,
  s.recruit_invitation_lead_days,
  s.recruit_follow_up_cadence_hours,
  s.updated_at`;

// Aliased s/t so SCHEDULE_COLUMNS can qualify every column — after LAN-265, event_type is no longer unique across this table.
const SCHEDULE_FROM = `public.messaging_schedules s
         join public.event_templates t on t.id = s.template_id`;

interface ScheduleRow {
  template_id: string;
  template_name: string;
  event_type: string;
  rsvp_by_days: number;
  invitation_lead_days: number;
  reminder_cadence_hours: number;
  whatsapp_reminder_count: number;
  email_reminder_count: number;
  escalation_hours: number;
  recruit_invitation_lead_days: number | null;
  recruit_follow_up_cadence_hours: number | null;
  updated_at: Date;
}

function toSchedule(row: ScheduleRow): MessagingSchedule {
  return {
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
    updatedAt: row.updated_at,
  };
}

// A refusal naming the gap — ADR 0021's first surviving rule (see relocations.md).
export async function readMessagingScheduleIn(
  tx: Tx,
  templateId: string,
): Promise<MessagingSchedule> {
  // text, not uuid cast — a cast would raise a PostgreSQL error instead of this refusal
  const result = await tx.query<ScheduleRow>(
    `select ${SCHEDULE_COLUMNS} from ${SCHEDULE_FROM} where s.template_id::text = $1`,
    [templateId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new ConstraintViolated(
      "No messaging schedule has been agreed for this event's template, so the event cannot " +
        "be approved. That is a club decision rather than a fault in the app.",
      { rule: SCHEDULE_NOT_CONFIGURED_RULE },
    );
  }
  return toSchedule(row);
}

// Ordered by the template's name (LAN-265), not public.event_type's declared order.
export async function listMessagingSchedulesIn(tx: Tx): Promise<readonly MessagingSchedule[]> {
  const result = await tx.query<ScheduleRow>(
    `select ${SCHEDULE_COLUMNS} from ${SCHEDULE_FROM} order by lower(t.name)`,
  );
  return result.rows.map(toSchedule);
}

// The cadence a template created today starts from — LAN-265 (Brian, 2026-09-09; see relocations.md).
export const DEFAULT_MESSAGING_SCHEDULE: MessagingScheduleChange = Object.freeze({
  rsvpByDays: 2,
  invitationLeadDays: 5,
  reminderCadenceHours: 24,
  whatsappReminderCount: 2,
  emailReminderCount: 1,
  escalationHours: 12,
});

// The cadence row a newly created template gets, before anybody edits it (see relocations.md).
export async function createMessagingScheduleIn(
  tx: Tx,
  templateId: string,
  eventType: string,
): Promise<MessagingSchedule> {
  await tx.query(
    `insert into public.messaging_schedules
       (template_id, event_type, rsvp_by_days, invitation_lead_days, reminder_cadence_hours,
        whatsapp_reminder_count, email_reminder_count, escalation_hours)
     values ($1::uuid, $2::public.event_type, $3, $4, $5, $6, $7, $8)`,
    [
      templateId,
      eventType,
      DEFAULT_MESSAGING_SCHEDULE.rsvpByDays,
      DEFAULT_MESSAGING_SCHEDULE.invitationLeadDays,
      DEFAULT_MESSAGING_SCHEDULE.reminderCadenceHours,
      DEFAULT_MESSAGING_SCHEDULE.whatsappReminderCount,
      DEFAULT_MESSAGING_SCHEDULE.emailReminderCount,
      DEFAULT_MESSAGING_SCHEDULE.escalationHours,
    ],
  );
  return readMessagingScheduleIn(tx, templateId);
}

// Not a surface — LAN-171 builds /operate/admin/messaging on this. No `insert`: rows come from the migration.
export interface MessagingScheduleChange {
  readonly rsvpByDays: number;
  readonly invitationLeadDays: number;
  readonly reminderCadenceHours: number;
  readonly whatsappReminderCount: number;
  readonly emailReminderCount: number;
  readonly escalationHours: number;
  readonly recruitInvitationLeadDays?: number; // LAN-203, Recruitment row only; undefined leaves the column untouched elsewhere
  readonly recruitFollowUpCadenceHours?: number;
}

export async function updateMessagingScheduleIn(
  tx: Tx,
  actorPersonId: string,
  templateId: string,
  change: MessagingScheduleChange,
): Promise<MessagingSchedule> {
  const before = await readMessagingScheduleIn(tx, templateId);

  const updated = await tx.query<{ template_id: string }>(
    `update public.messaging_schedules
        set rsvp_by_days = $2,
            invitation_lead_days = $3,
            reminder_cadence_hours = $4,
            whatsapp_reminder_count = $5,
            email_reminder_count = $6,
            escalation_hours = $7,
            recruit_invitation_lead_days = coalesce($8::smallint, recruit_invitation_lead_days),
            recruit_follow_up_cadence_hours = coalesce($9::smallint, recruit_follow_up_cadence_hours),
            updated_at = now()
      where template_id = $1::uuid
     returning template_id`,
    [
      templateId,
      change.rsvpByDays,
      change.invitationLeadDays,
      change.reminderCadenceHours,
      change.whatsappReminderCount,
      change.emailReminderCount,
      change.escalationHours,
      change.recruitInvitationLeadDays ?? null,
      change.recruitFollowUpCadenceHours ?? null,
    ],
  );

  // W7: every change is attributed; the audit row carries both old and new values (see relocations.md).
  await recordAudit(tx, {
    actorPersonId,
    action: "messaging_schedule.changed",
    entityTable: "messaging_schedules",
    entityId: templateId,
    context: { before, after: change },
  });

  // re-read, not `returning`: SCHEDULE_COLUMNS is qualified against the template-name join, which returning cannot do
  return readMessagingScheduleIn(tx, updated.rows[0].template_id);
}
