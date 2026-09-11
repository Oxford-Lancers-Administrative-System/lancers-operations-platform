import "server-only";

import { ConstraintViolated, type Tx } from "@/lib/db";
import { recordAudit } from "../audit";

/**
 * The stored cadence — reading, the default a new template starts from, and
 * changing it (LAN-171, W7). LAN-300 split of `messaging-schedule.ts`; see
 * `./index`.
 */

/** One template's policy, as `public.messaging_schedules` holds it. */
export interface MessagingSchedule {
  /** LAN-265. The template this cadence belongs to, and the key it is read by. */
  readonly templateId: string;
  /** What the club calls that template — the only word any screen shows for it. */
  readonly templateName: string;
  /** The behavioural class underneath, which the recruit ladder still keys off. */
  readonly eventType: string;
  /** Whole days before the event's own start at which an answer is due. */
  readonly rsvpByDays: number;
  /** Whole days before the event's own start at which the invitation goes. */
  readonly invitationLeadDays: number;
  /** Hours between successive rungs. Reminders count forward from the invitation. */
  readonly reminderCadenceHours: number;
  /**
   * Every WhatsApp message the ladder sends, **counting the invitation
   * itself as the first one** (Q-19, `REQ-ladder-order` governs over W7's
   * looser "reminders" wording). A club that wants one further WhatsApp
   * reminder after the invitation sets this to 2, not 1 — the count column
   * never calls the invitation a reminder, but it does count it.
   */
  readonly whatsappReminderCount: number;
  /** Email reminders after the invitation. The invitation is never email. */
  readonly emailReminderCount: number;
  /** Hours after the RSVP deadline before the President is told. Zero is legal. */
  readonly escalationHours: number;
  /**
   * The Recruits audience's own first-invitation lead (`DEC-split-on-the-
   * schedule`, LAN-201). Null for every event type but `recruitment`.
   */
  readonly recruitInvitationLeadDays: number | null;
  /** Hours after the recruit invitation before the one permitted follow-up. Null likewise. */
  readonly recruitFollowUpCadenceHours: number | null;
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

/**
 * The schedule joined to the template whose name every reader of it prints.
 *
 * One string rather than the join written out at each call site, and aliased `s`
 * and `t` so `SCHEDULE_COLUMNS` above can qualify every column: after LAN-265
 * `event_type` is no longer unique across this table, and an unqualified column
 * list beside a join is one added column away from being ambiguous.
 */
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

/**
 * The schedule for one template, or a refusal naming the gap.
 *
 * The refusal is ADR 0021's first surviving rule and it is the point of the
 * function. A template with no cadence row cannot approve an event, and says so
 * — rather than quietly inheriting a practice's two days and messaging forty
 * people on a schedule nobody approved.
 *
 * Since LAN-265 the gap it guards against is a different one and a narrower one.
 * It used to be "a migration widened `public.event_type` and nobody added a
 * row"; `messaging_schedules_pkey` on `template_id` and the cascade on
 * `messaging_schedules_template_fkey` now make a template without a cadence
 * unrepresentable, and `createEventTemplate` writes both rows in one
 * transaction. What is left is a template deleted between the read that offered
 * it and the approval that used it, which is exactly the sentence below.
 */
export async function readMessagingScheduleIn(
  tx: Tx,
  templateId: string,
): Promise<MessagingSchedule> {
  // Compared as text, not cast to `uuid`, and for the reason this function used
  // to compare `event_type::text` rather than casting the parameter to the enum:
  // the cast is the natural way to write it and it defeats the refusal below.
  // PostgreSQL rejects a malformed uuid with an invalid-input error, so a caller
  // holding a stale or hand-typed identifier got "the database could not
  // complete this change" instead of the sentence naming what has no policy.
  // The refusal is the whole reason this is not a plain lookup, so it has to
  // survive the case it exists for.
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

/**
 * Every configured schedule, for the settings page and the approval panel.
 *
 * Ordered by the template's name since LAN-265, and no longer by
 * `public.event_type`'s declared order. The old order existed because the seven
 * rows *were* the seven types and the settings page grouped them that way; the
 * rows are now whatever the club has created, several may share a class, and the
 * only ordering an operator can perceive is the one they can read. `lower()` so
 * a name's casing does not decide its neighbourhood.
 */
export async function listMessagingSchedulesIn(tx: Tx): Promise<readonly MessagingSchedule[]> {
  const result = await tx.query<ScheduleRow>(
    `select ${SCHEDULE_COLUMNS} from ${SCHEDULE_FROM} order by lower(t.name)`,
  );
  return result.rows.map(toSchedule);
}

/**
 * The cadence a template created today starts from — LAN-265.
 *
 * Brian, 2026-09-09: a new template's cadence "starts from a default cadence and
 * can then be edited on the Messaging schedule screen like the seven existing
 * ones". These are the numbers six of the seven shipped rows already carry, and
 * which `20260825120000_messaging_schedule_and_chase.sql` calls the routine
 * events': answer two days before, invite five days before, a rung a day, two
 * WhatsApps counting the invitation, one email, and the President told twelve
 * hours after the deadline. A game's seven days and a social's five are
 * decisions about a game and a social, and there is nothing to base such a
 * decision on for a kind of event that did not exist a minute ago.
 *
 * Exported because `createEventTemplate` records it in the audit context: the
 * cadence a template started life with is a fact about a club decision, and a
 * later edit on `/operate/admin/messaging` should be readable as a change from
 * something rather than as the first thing anybody ever said.
 */
export const DEFAULT_MESSAGING_SCHEDULE: MessagingScheduleChange = Object.freeze({
  rsvpByDays: 2,
  invitationLeadDays: 5,
  reminderCadenceHours: 24,
  whatsappReminderCount: 2,
  emailReminderCount: 1,
  escalationHours: 12,
});

/**
 * The cadence row that a newly created template gets, before anybody edits it.
 *
 * `event_type` travels with it because `messaging_schedules_template_fkey` is
 * composite — the class on this row is provably the template's own rather than
 * conventionally so — and because
 * `messaging_schedules_recruit_fields_are_recruitment_only` still reads it: a
 * template of the `recruitment` class must carry the two recruit columns and any
 * other class must not. Operators cannot create a recruitment-class template
 * (`DEFAULT_TEMPLATE_CLASS` is `practice` and nothing offers the choice), so the
 * two columns are left null here; the day that changes, this is where the
 * recruit defaults go, and the check constraint is what will insist on it.
 */
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

/**
 * Changes one event type's policy, attributed.
 *
 * Not a surface — LAN-171 builds `/operate/admin/messaging` on top of this —
 * but the write belongs here beside the arithmetic it governs, so the settings
 * page cannot grow its own SQL and a second reading of these columns.
 *
 * `insert` is deliberately absent: the seven rows exist from the migration and
 * an event type with no row is a refusal, not an invitation to create one.
 */
export interface MessagingScheduleChange {
  readonly rsvpByDays: number;
  readonly invitationLeadDays: number;
  readonly reminderCadenceHours: number;
  readonly whatsappReminderCount: number;
  readonly emailReminderCount: number;
  readonly escalationHours: number;
  /**
   * The Recruits audience's own two fields (LAN-203) — present only when the
   * caller is saving the Recruitment row's Recruits group. `undefined` on
   * every other event type's save, which leaves the column untouched rather
   * than writing a value the database would refuse
   * (`messaging_schedules_recruit_fields_are_recruitment_only`).
   */
  readonly recruitInvitationLeadDays?: number;
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

  // W7: every change is attributed, and the trade it names is that a rule
  // change stops being a reviewed pull request and becomes a runtime edit. The
  // audit row is the whole of what replaces version control here, so it carries
  // both the old and the new values rather than only the new ones.
  //
  // `entityId` is the template's own id, and OWNER-LAN171-01's workaround is
  // retired with it. `audit_events.entity_id` is `uuid not null`, and this table
  // used to be keyed by `public.event_type` — a plain enum label such as
  // `"practice"`, which Postgres rejects outright as a uuid, rolling back the
  // whole transaction and silently failing every save. The key that LAN-265 gave
  // this table *is* a uuid, so the audit row now names the real row rather than
  // a hash of its natural key, and `context` goes on carrying the full before
  // and after.
  await recordAudit(tx, {
    actorPersonId,
    action: "messaging_schedule.changed",
    entityTable: "messaging_schedules",
    entityId: templateId,
    context: { before, after: change },
  });

  // Re-read rather than `returning ${SCHEDULE_COLUMNS}`: those columns are
  // qualified against the join that carries the template's name, and a
  // `returning` clause cannot join. One extra read on a rarely used
  // administrative write, in exchange for one definition of what a schedule row
  // reads as.
  return readMessagingScheduleIn(tx, updated.rows[0].template_id);
}
