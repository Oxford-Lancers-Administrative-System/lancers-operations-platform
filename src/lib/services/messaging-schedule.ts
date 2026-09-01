import "server-only";

import { addClubDays, CLUB_TIME_ZONE, todayInClubZone } from "@/lib/club-time";
import { ConstraintViolated, withTransaction, type Tx } from "@/lib/db";

import { deriveEntityIdFromNaturalKey, recordAudit } from "./audit";

/**
 * The club's messaging schedule, and the plan one approval freezes. LAN-169.
 *
 * ## What this module owns, and what it deliberately does not
 *
 * It owns the **arithmetic**: given an event and a moment, when does the
 * invitation go, when does each reminder follow it, when is the RSVP deadline,
 * and when — if ever — is the President told. It owns nothing about sending. A
 * plan is a projection, and reading one sends nothing and creates no job, which
 * is W1's explicit safety rule for the approval panel.
 *
 * The **order** of the ladder is not here and is not configurable: WhatsApp,
 * WhatsApp again, email, then the President (`REQ-ladder-order`). That sequence
 * is expressed as code in {@link buildLadder} rather than as rows, because rows
 * would make it look tunable. Only the spacing and the counts are policy, and
 * those live in `public.messaging_schedules`.
 *
 * ## Why the values moved out of TypeScript
 *
 * ADR 0021 put the response deadlines in `response-deadline.ts` as a frozen
 * table and said Release One would have no configuration-administration
 * surface. Brian reversed that on 2026-08-25 and the reversal is recorded in
 * `docs/adr/0036-messaging-schedule-configuration.md`. The values now live in
 * `public.messaging_schedules` so the settings page W7 describes — built by
 * LAN-171, not here — reads and writes the same rows the scheduler obeys.
 * W7 is explicit that they must be "read from the same source, never
 * transcribed", so there is no second copy of any of these numbers anywhere in
 * this repository.
 *
 * Three of ADR 0021's rules survive verbatim, and each has a home here:
 *
 *   * **The table is complete and there is no default arm.** An event type with
 *     no row is {@link SCHEDULE_NOT_CONFIGURED_RULE}, a refusal that names
 *     itself, never an inherited two days.
 *   * **A past deadline is clamped to the approval moment** and the approver is
 *     shown "Due immediately". Approval is never refused for being late.
 *   * **There is no per-event override.** Nothing in this module takes a
 *     per-event value; every number arrives from the type's row.
 *
 * ## The one value ADR 0021 recorded that this changes
 *
 * The anchor. ADR 0021 fixed every deadline at 18:00 Europe/London wall clock.
 * `REQ-deadline-from-event-start` keeps the day counts and measures them from
 * the event's own start instead: a 20:00 practice answers by 20:00 two days
 * before, and a 14:00 game by 14:00 seven days before. Brian, 2026-08-25:
 * "'by 18:00' is a little bit confusing. It should just be '2 days before the
 * start of the event' because the event is going to be different."
 *
 * The British Summer Time requirement does not go away with the fixed clock —
 * "two days before this event's start" still has to be resolved in the club's
 * zone — so every instant below is still computed by PostgreSQL rather than in
 * JavaScript. See {@link resolveMessagingPlanIn}.
 *
 * ## There are no quiet hours
 *
 * `REQ-no-quiet-hours` is absolute and it constrains this file more than any
 * other: nothing here inspects the hour of day, and no rung is ever moved,
 * delayed or dropped because of when it lands. An early-morning event produces
 * an early-morning deadline and an early-morning reminder, and that is the
 * intended behaviour rather than a defect to be smoothed over later.
 */

/** One event type's policy, as `public.messaging_schedules` holds it. */
export interface MessagingSchedule {
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

export const SCHEDULE_NOT_CONFIGURED_RULE = "messaging_schedule_not_configured";
export const PLAN_NEEDS_A_DATE_RULE = "messaging_plan_requires_a_date";
export const PLAN_NOT_FROZEN_RULE = "messaging_plan_not_frozen";

const SCHEDULE_COLUMNS = `
  event_type::text as event_type,
  rsvp_by_days,
  invitation_lead_days,
  reminder_cadence_hours,
  whatsapp_reminder_count,
  email_reminder_count,
  escalation_hours,
  recruit_invitation_lead_days,
  recruit_follow_up_cadence_hours,
  updated_at`;

interface ScheduleRow {
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
 * The schedule for one event type, or a refusal naming the gap.
 *
 * The refusal is ADR 0021's first surviving rule and it is the point of the
 * function. If a later migration widens `public.event_type` without a row being
 * added here, approving such an event fails loudly and says which type has no
 * policy — rather than quietly inheriting a practice's two days and messaging
 * forty people on a schedule nobody approved.
 */
export async function readMessagingScheduleIn(
  tx: Tx,
  eventType: string,
): Promise<MessagingSchedule> {
  // Compared as text, deliberately, and not by casting the parameter to
  // `public.event_type`. The cast is the natural way to write this and it
  // defeats the refusal below: PostgreSQL rejects an unknown label with an
  // invalid-input error, so a widened enum — or a typo in a caller — produced
  // "The database could not complete this change" instead of a sentence naming
  // the event type that has no policy. The refusal is the whole reason this
  // function is not a plain lookup, so it must survive the case it exists for.
  const result = await tx.query<ScheduleRow>(
    `select ${SCHEDULE_COLUMNS} from public.messaging_schedules where event_type::text = $1`,
    [eventType],
  );

  const row = result.rows[0];
  if (!row) {
    throw new ConstraintViolated(
      `No messaging schedule has been agreed for ${eventType} events, so this event cannot ` +
        "be approved. That is a club decision rather than a fault in the app.",
      { rule: SCHEDULE_NOT_CONFIGURED_RULE },
    );
  }
  return toSchedule(row);
}

/**
 * Every configured schedule, for the settings page and the approval panel.
 *
 * `order by t.event_type` — the table-qualified, still-enum-typed column —
 * deliberately, and not the bare `event_type` the `select` list also produces.
 * `SCHEDULE_COLUMNS` casts the column to text for its output alias, and
 * PostgreSQL resolves a bare `ORDER BY` name against an output alias of the
 * same name before it considers the source column: unqualified, this sorted
 * alphabetically by the cast text ("chalk, game, meeting, practice…") rather
 * than by `public.event_type`'s own declared order ("practice,
 * strength_and_conditioning, chalk, game…") — the order LAN-171's settings
 * page groups by, and the order the seed inserts in. Qualifying it is what
 * makes `ORDER BY` see the real enum column instead of the aliased text.
 */
export async function listMessagingSchedulesIn(tx: Tx): Promise<readonly MessagingSchedule[]> {
  const result = await tx.query<ScheduleRow>(
    `select ${SCHEDULE_COLUMNS} from public.messaging_schedules t order by t.event_type`,
  );
  return result.rows.map(toSchedule);
}

/**
 * One event type's schedule, and the worked-example plan it would produce
 * today — LAN-171, W7's "if the invitation went out today, when does
 * everything else happen?".
 */
export interface MessagingScheduleWithPreview {
  readonly schedule: MessagingSchedule;
  readonly preview: MessagingPlan;
}

/**
 * Every configured schedule, each carrying the plan it would produce for one
 * worked example: an event of that type, four weeks from today at 20:00,
 * approved today. Every row uses the same synthetic event so the seven
 * previews are comparable, and every instant in `preview` is
 * `resolveMessagingPlanIn`'s own arithmetic — W7's acceptance evidence that
 * "the values shown are the ones the scheduler actually uses — read from the
 * same source, never transcribed".
 *
 * `/operate/admin/messaging` is the only reader. It lives here rather than in
 * that page because assembling a plan from a schedule is exactly the
 * arithmetic this module owns, and a page composing it directly would be a
 * second reader reaching past the service boundary for a business rule.
 */
export async function listMessagingSchedulesWithPreview(): Promise<
  readonly MessagingScheduleWithPreview[]
> {
  const scheduledOn = addClubDays(todayInClubZone(), 28) ?? todayInClubZone();

  return withTransaction(async (tx) => {
    const schedules = await listMessagingSchedulesIn(tx);
    const withPreview: MessagingScheduleWithPreview[] = [];
    for (const schedule of schedules) {
      const preview = await resolveMessagingPlanIn(tx, {
        eventType: schedule.eventType,
        scheduledOn,
        startsAt: "20:00",
      });
      withPreview.push({ schedule, preview });
    }
    return withPreview;
  });
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
  eventType: string,
  change: MessagingScheduleChange,
): Promise<MessagingSchedule> {
  const before = await readMessagingScheduleIn(tx, eventType);

  const updated = await tx.query<ScheduleRow>(
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
      where event_type = $1
     returning ${SCHEDULE_COLUMNS}`,
    [
      eventType,
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
  // `entityId` is derived, not `eventType` itself (OWNER-LAN171-01):
  // `audit_events.entity_id` is `uuid not null`, and `messaging_schedules` is
  // keyed by `public.event_type` — a plain enum label such as `"practice"`,
  // which Postgres rejects outright as a uuid. That rejection used to roll
  // back this whole transaction, discarding the schedule UPDATE above along
  // with the audit insert, so every save silently failed. `entity_table`
  // still says `messaging_schedules` and `context` carries the full before
  // and after, so the derived id and that pair together still identify
  // exactly which row changed. See `deriveEntityIdFromNaturalKey`'s own
  // comment for why this is not a migration.
  await recordAudit(tx, {
    actorPersonId,
    action: "messaging_schedule.changed",
    entityTable: "messaging_schedules",
    entityId: deriveEntityIdFromNaturalKey("messaging_schedules", eventType),
    context: { before, after: change },
  });

  return toSchedule(updated.rows[0]);
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/** What one rung of the ladder is, and when it happens. */
export interface LadderRung {
  /** 0 is the invitation. Reminders follow in order. */
  readonly rung: number;
  readonly kind: "invitation" | "reminder";
  readonly channel: "whatsapp" | "email";
  readonly at: Date;
}

/**
 * The recruit ladder — REQ-two-ladders. One invitation and at most one polite
 * follow-up, and nothing else: no escalation, and never a second reminder
 * (`REQ-never-harsh`). Present only when {@link MessagingSchedule.recruitInvitationLeadDays}
 * is configured, which today is exactly the Recruitment event type — computed
 * unconditionally there, independent of whether this particular event's
 * audience actually carries a recruit, on the same footing the player ladder
 * is computed independent of whether any player was invited.
 */
export interface RecruitMessagingLadder {
  /** When the recruit invitation dispatches: `max(now, event start − recruit lead)`. */
  readonly invitationAt: Date;
  readonly configuredInvitationAt: Date;
  readonly dispatchesImmediately: boolean;
  /**
   * When the one permitted follow-up fires, or `null` where the shared
   * response deadline left no runway for it. Never a second one.
   */
  readonly followUpAt: Date | null;
}

export interface MessagingPlan {
  readonly eventType: string;
  readonly schedule: MessagingSchedule;
  /** The event's own start instant, in the club's zone. */
  readonly eventStartsAt: Date;
  /** The instant stored on the event and on every invitation. */
  readonly responseDeadlineAt: Date;
  /** Where the rule alone put the deadline, before any clamp. Shown for transparency. */
  readonly configuredDeadlineAt: Date;
  /** The configured deadline had already passed and was clamped to the approval moment. */
  readonly deadlineClamped: boolean;
  /** When the invitation dispatches: `max(now, event start − lead)`. */
  readonly invitationAt: Date;
  /** Where the rule alone put the invitation, before the `max`. */
  readonly configuredInvitationAt: Date;
  /**
   * The event is closer than its own invitation lead, so the invitation goes
   * now. W1's guarantee, stated rather than derived, because an approver
   * depends on it: "if practice happens in 2 days and we're approving and we're
   * sending it out, that needs to go out now, right? It should say that."
   */
  readonly dispatchesImmediately: boolean;
  /**
   * The runway was too short to run the ordinary ladder before the deadline.
   *
   * Replaces compression entirely (Brian, 2026-08-25). Such an event still
   * chases — it is not downgraded to a single announcement — but it is WhatsApp
   * only and it never escalates.
   */
  readonly lateApproval: boolean;
  /** Every rung, in order, invitation first. Always at least one. */
  readonly rungs: readonly LadderRung[];
  /** When the President is told, or null where this event will never escalate. */
  readonly escalationAt: Date | null;
  /**
   * REQ-approval-shows-both-ladders. `null` on every event type but
   * `recruitment` — see {@link RecruitMessagingLadder}.
   */
  readonly recruitLadder: RecruitMessagingLadder | null;
}

/** The subset of an event this module needs. Deliberately not the whole record. */
export interface PlannableEvent {
  readonly eventType: string;
  /** `YYYY-MM-DD` in the club's zone. */
  readonly scheduledOn: string | null;
  /** Local wall-clock `HH:MM`, or null where the event records no time. */
  readonly startsAt: string | null;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The ladder, in its fixed order, counting **forward** from the invitation.
 *
 * `REQ-count-forward`, and Brian's words on 2026-08-25: "Count forward from the
 * invitations." Anchoring backwards from the deadline was the earlier model and
 * it produced the gap W7's preview exposed — a game invited twenty-one days out
 * finishing its ladder eleven days before the deadline it was chasing.
 *
 * `available` is how many cadence steps fit between the invitation and the
 * deadline. Rungs beyond it are not scheduled, because a reminder that lands
 * after the answer was due is chasing nothing.
 */
/**
 * Exported for one reason: LAN-171's schedule page previews the dates a policy
 * *would* produce for a worked example, without an event to resolve one
 * against. Replaying this same function against a frozen plan's stored
 * `invitationAt` and counts is also how the event page renders an **approved**
 * event's committed ladder, since `event_messaging_plans` stores the counts and
 * the anchor but not each rung's own instant. Both callers get the one
 * arithmetic rather than a second copy of it.
 *
 * `whatsappReminders` and `emailReminders` are rungs **after** the invitation
 * — the invitation is rung 0, built unconditionally below. Neither caller
 * passes `schedule.whatsappReminderCount` unchanged: `resolveMessagingPlanIn`
 * passes `schedule.whatsappReminderCount - 1`, because that column counts the
 * invitation as WhatsApp #1 (Q-19); the event page passes a frozen plan's own
 * `whatsappRemindersScheduled`, which was computed the same way at approval
 * and already excludes it.
 */
export function buildLadder(
  invitationAt: Date,
  cadenceHours: number,
  whatsappReminders: number,
  emailReminders: number,
  available: number,
): readonly LadderRung[] {
  const rungs: LadderRung[] = [
    // Rung 0 is unconditional, and it is the whole of `REQ-late-approval`'s
    // "at least one WhatsApp always goes out, however short the runway". No
    // approved event is ever silent, and the guarantee costs no arithmetic
    // because the invitation is not part of the runway calculation at all.
    { rung: 0, kind: "invitation", channel: "whatsapp", at: invitationAt },
  ];

  const scheduled = Math.max(0, Math.min(whatsappReminders + emailReminders, available));

  for (let step = 1; step <= scheduled; step += 1) {
    rungs.push({
      rung: step,
      kind: "reminder",
      // The order is fixed: every WhatsApp reminder precedes the email. A
      // shortened ladder therefore loses the email first, which is what
      // `REQ-late-approval`'s "WhatsApp only" describes from the other end.
      channel: step <= whatsappReminders ? "whatsapp" : "email",
      at: new Date(invitationAt.getTime() + step * cadenceHours * HOUR_MS),
    });
  }

  return rungs;
}

/**
 * The whole plan for one event, resolved against a specific moment.
 *
 * `asOf` is the approval instant on the write path and `now()` on the preview
 * path, so the approver reads the same plan the transaction is about to freeze.
 *
 * ## Why every instant is computed by PostgreSQL
 *
 * `events.scheduled_on` is a bare `date` and `starts_at` a bare `time`; neither
 * carries a zone. "Two days before this event's start" is therefore a
 * wall-clock rule, and Britain changes offset twice inside a season. PostgreSQL
 * carries the IANA database and `((date - n) + time) at time zone 'Europe/London'`
 * is correct across both transitions. The equivalent in JavaScript is a
 * hand-rolled offset search that is one edge case away from putting a deadline
 * an hour out every October.
 *
 * The subtraction happens on the **date**, before the zone is applied, which is
 * what makes "two days before, at the same local time" true rather than "48
 * hours before". Those differ by an hour twice a year, and the club means the
 * former.
 */
export async function resolveMessagingPlanIn(
  tx: Tx,
  event: PlannableEvent,
  asOf?: Date,
): Promise<MessagingPlan> {
  const schedule = await readMessagingScheduleIn(tx, event.eventType);

  if (event.scheduledOn === null) {
    // Invariant E1a requires a date from approval onward and the database would
    // refuse the row anyway. Refusing here means the operator is told which
    // fact is missing instead of being shown a constraint name.
    throw new ConstraintViolated(
      "This event needs a date before its messaging plan can be worked out — every time in " +
        "the plan is measured from when the event starts.",
      { rule: PLAN_NEEDS_A_DATE_RULE },
    );
  }

  const startsAt = event.startsAt ?? "00:00";

  const resolved = await tx.query<{
    event_starts_at: Date;
    configured_deadline_at: Date;
    configured_invitation_at: Date;
    configured_recruit_invitation_at: Date | null;
    as_of: Date;
  }>(
    `select ($1::date + $2::time) at time zone $5 as event_starts_at,
            (($1::date - $3::integer) + $2::time) at time zone $5 as configured_deadline_at,
            (($1::date - $4::integer) + $2::time) at time zone $5 as configured_invitation_at,
            case when $7::integer is not null
                 then (($1::date - $7::integer) + $2::time) at time zone $5
            end as configured_recruit_invitation_at,
            coalesce($6::timestamptz, now()) as as_of`,
    [
      event.scheduledOn,
      startsAt,
      schedule.rsvpByDays,
      schedule.invitationLeadDays,
      CLUB_TIME_ZONE,
      asOf ?? null,
      schedule.recruitInvitationLeadDays,
    ],
  );

  const row = resolved.rows[0];
  const now = row.as_of;

  // ADR 0021's second surviving rule. A deadline already in the past is clamped
  // to the approval moment and never moved beyond the club's own already-missed
  // planning point; the approver is shown "Due immediately" and approval is
  // never refused for being late.
  const deadlineClamped = row.configured_deadline_at.getTime() <= now.getTime();
  const responseDeadlineAt = deadlineClamped ? now : row.configured_deadline_at;

  // `max(now, event start − lead)`. The rule never sends into the past and
  // never delays an event that is already close.
  const dispatchesImmediately = row.configured_invitation_at.getTime() <= now.getTime();
  const invitationAt = dispatchesImmediately ? now : row.configured_invitation_at;

  const cadenceMs = schedule.reminderCadenceHours * HOUR_MS;
  const runwayMs = responseDeadlineAt.getTime() - invitationAt.getTime();
  const available = runwayMs <= 0 ? 0 : Math.floor(runwayMs / cadenceMs);

  // `schedule.whatsappReminderCount` counts the invitation as WhatsApp #1
  // (Q-19, OWNER-LAN171-05): the invitation itself is rung 0, unconditional,
  // built below regardless of any count. What `buildLadder` wants here is how
  // many *further* WhatsApp rungs follow it, which is one fewer.
  const whatsappRemindersAfterInvitation = Math.max(0, schedule.whatsappReminderCount - 1);
  const wanted = whatsappRemindersAfterInvitation + schedule.emailReminderCount;

  // A late approval is one whose runway cannot carry the ladder the club
  // configured — not merely one that dispatches immediately. The two differ:
  // a practice approved four days out with a five-day lead dispatches
  // immediately AND has room for only two of its three rungs, so it is both;
  // a game approved on its lead day exactly is neither.
  const lateApproval = available < wanted;

  const whatsappScheduled = lateApproval
    ? Math.max(0, Math.min(whatsappRemindersAfterInvitation, available))
    : whatsappRemindersAfterInvitation;

  // WhatsApp only. Brian, 2026-08-25: "Late events should be WhatsApp only."
  // On a short runway the club uses the channel everybody has and does not add
  // a second one — so the email rung is dropped even where a spare cadence step
  // would have carried it.
  const emailScheduled = lateApproval ? 0 : schedule.emailReminderCount;

  const rungs = buildLadder(
    invitationAt,
    schedule.reminderCadenceHours,
    whatsappScheduled,
    emailScheduled,
    whatsappScheduled + emailScheduled,
  );

  // "The President is not told." Nobody had a fair chance to answer, so
  // escalating would be noise that trains the office to ignore the alert. The
  // event still appears in W5's Follow-ups queue, so an operator can see it and
  // chase by hand if it matters.
  const escalationAt = lateApproval
    ? null
    : new Date(responseDeadlineAt.getTime() + schedule.escalationHours * HOUR_MS);

  // REQ-two-ladders. Computed whenever the schedule carries recruit config —
  // today exactly the Recruitment event type — independent of whether this
  // particular event's confirmed audience actually includes a recruit,
  // exactly as the player ladder above is computed independent of whether
  // any player was invited. Never escalates and never carries more than one
  // follow-up (`REQ-never-harsh`): there is no late-approval concession to
  // make, because this ladder was WhatsApp-only and un-escalated from the
  // start.
  let recruitLadder: RecruitMessagingLadder | null = null;
  if (
    schedule.recruitFollowUpCadenceHours !== null &&
    row.configured_recruit_invitation_at !== null
  ) {
    const configuredRecruitInvitationAt = row.configured_recruit_invitation_at;
    const recruitDispatchesImmediately = configuredRecruitInvitationAt.getTime() <= now.getTime();
    const recruitInvitationAt = recruitDispatchesImmediately ? now : configuredRecruitInvitationAt;
    const candidateFollowUpAt = new Date(
      recruitInvitationAt.getTime() + schedule.recruitFollowUpCadenceHours * HOUR_MS,
    );
    // The same "chasing nothing after the deadline" reasoning the player
    // ladder's own `available = floor(runway / cadence)` arithmetic uses, at
    // a cap of one rung — including its boundary: `available` counts a rung
    // landing exactly on the deadline as fitting (a runway of exactly two
    // cadence periods schedules two rungs, the second at the deadline
    // itself), so this is `<=`, not `<`. With the shipped defaults
    // (`recruit_invitation_lead_days = 5`, `recruit_follow_up_cadence_hours =
    // 72`, the Recruitment row's own `rsvp_by_days = 2`) the follow-up lands
    // exactly at the shared deadline — five days minus three days is two —
    // and a strict `<` would silently never schedule it under the defaults
    // this table ships with.
    recruitLadder = {
      invitationAt: recruitInvitationAt,
      configuredInvitationAt: configuredRecruitInvitationAt,
      dispatchesImmediately: recruitDispatchesImmediately,
      followUpAt:
        candidateFollowUpAt.getTime() <= responseDeadlineAt.getTime() ? candidateFollowUpAt : null,
    };
  }

  return {
    eventType: event.eventType,
    schedule,
    eventStartsAt: row.event_starts_at,
    responseDeadlineAt,
    configuredDeadlineAt: row.configured_deadline_at,
    deadlineClamped,
    invitationAt,
    configuredInvitationAt: row.configured_invitation_at,
    dispatchesImmediately,
    lateApproval,
    rungs,
    escalationAt,
    recruitLadder,
  };
}

// ---------------------------------------------------------------------------
// Freezing the plan
// ---------------------------------------------------------------------------

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

export async function readFrozenPlanIn(
  tx: Tx,
  eventId: string,
): Promise<FrozenMessagingPlan | null> {
  const result = await tx.query<{
    event_id: string;
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
    `select p.event_id, e.event_type::text as event_type,
            p.rsvp_by_days, p.invitation_lead_days, p.reminder_cadence_hours,
            p.whatsapp_reminder_count, p.email_reminder_count, p.escalation_hours,
            p.response_deadline_at, p.invitation_at, p.escalation_at,
            p.dispatches_immediately, p.late_approval,
            p.whatsapp_reminders_scheduled, p.email_reminders_scheduled, p.frozen_at,
            p.recruit_invitation_lead_days, p.recruit_follow_up_cadence_hours,
            p.recruit_invitation_at, p.recruit_dispatches_immediately, p.recruit_follow_up_at
       from public.event_messaging_plans p
       join public.events e on e.id = p.event_id
      where p.event_id = $1`,
    [eventId],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    eventId: row.event_id,
    schedule: {
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
