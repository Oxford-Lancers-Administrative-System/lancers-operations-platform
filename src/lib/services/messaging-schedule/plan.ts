import "server-only";

import { ConstraintViolated, withTransaction, type Tx } from "@/lib/db";
import { addClubDays, CLUB_TIME_ZONE, todayInClubZone } from "@/lib/club-time";
import {
  listMessagingSchedulesIn,
  readMessagingScheduleIn,
  type MessagingSchedule,
} from "./schedule";

/** The ladder arithmetic — `buildLadder`, `resolveMessagingPlanIn`, and the settings page's worked-example preview. LAN-300 split of `messaging-schedule.ts`; see `./index`. */

const PLAN_NEEDS_A_DATE_RULE = "messaging_plan_requires_a_date";

export interface LadderRung {
  readonly rung: number;
  readonly kind: "invitation" | "reminder";
  readonly channel: "whatsapp" | "email";
  readonly at: Date;
}

/** The recruit ladder — REQ-two-ladders. One invitation and at most one polite follow-up, never a second (`REQ-never-harsh`), never escalated. Present when {@link MessagingSchedule.recruitInvitationLeadDays} is configured (today: Recruitment events). */
export interface RecruitMessagingLadder {
  readonly invitationAt: Date;
  readonly configuredInvitationAt: Date;
  readonly dispatchesImmediately: boolean;
  readonly followUpAt: Date | null;
}

export interface MessagingPlan {
  readonly templateId: string;
  readonly schedule: MessagingSchedule;
  readonly eventStartsAt: Date;
  readonly responseDeadlineAt: Date;
  readonly configuredDeadlineAt: Date;
  readonly deadlineClamped: boolean;
  readonly invitationAt: Date;
  readonly configuredInvitationAt: Date;
  /** W1's guarantee. */
  readonly dispatchesImmediately: boolean;
  readonly lateApproval: boolean;
  readonly rungs: readonly LadderRung[];
  readonly escalationAt: Date | null;
  /** REQ-approval-shows-both-ladders; `null` on every event type but `recruitment`. */
  readonly recruitLadder: RecruitMessagingLadder | null;
}

/** The subset of an event this module needs, deliberately not the whole record. */
export interface PlannableEvent {
  readonly templateId: string;
  readonly scheduledOn: string | null;
  /** Local wall-clock `HH:MM`, or null where the event records no time. */
  readonly startsAt: string | null;
}

const HOUR_MS = 60 * 60 * 1000;

/** The ladder, fixed order, counting forward from the invitation (`REQ-count-forward`). `available` caps how many cadence steps fit before the deadline. Exported so the LAN-171 preview and the approved-event replay share one arithmetic. `whatsappReminders`/`emailReminders` are rungs after rung 0 (see Q-19 below). */
export function buildLadder(
  invitationAt: Date,
  cadenceHours: number,
  whatsappReminders: number,
  emailReminders: number,
  available: number,
): readonly LadderRung[] {
  const rungs: LadderRung[] = [
    // Rung 0 is unconditional — `REQ-late-approval`'s "at least one WhatsApp always goes out".
    { rung: 0, kind: "invitation", channel: "whatsapp", at: invitationAt },
  ];

  const scheduled = Math.max(0, Math.min(whatsappReminders + emailReminders, available));

  for (let step = 1; step <= scheduled; step += 1) {
    rungs.push({
      rung: step,
      kind: "reminder",
      channel: step <= whatsappReminders ? "whatsapp" : "email",
      at: new Date(invitationAt.getTime() + step * cadenceHours * HOUR_MS),
    });
  }

  return rungs;
}

/** The whole plan for one event, resolved against a moment (`asOf`: approval instant, or `now()` for preview). Every instant is computed by PostgreSQL (IANA zone database) rather than JavaScript. */
export async function resolveMessagingPlanIn(
  tx: Tx,
  event: PlannableEvent,
  asOf?: Date,
): Promise<MessagingPlan> {
  const schedule = await readMessagingScheduleIn(tx, event.templateId);

  if (event.scheduledOn === null) {
    // Invariant E1a requires a date from approval onward; told here rather than as a constraint name.
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

  // ADR 0021: a past deadline is clamped to the approval moment, never refusing approval for being late.
  const deadlineClamped = row.configured_deadline_at.getTime() <= now.getTime();
  const responseDeadlineAt = deadlineClamped ? now : row.configured_deadline_at;

  const dispatchesImmediately = row.configured_invitation_at.getTime() <= now.getTime();
  const invitationAt = dispatchesImmediately ? now : row.configured_invitation_at;

  const cadenceMs = schedule.reminderCadenceHours * HOUR_MS;
  const runwayMs = responseDeadlineAt.getTime() - invitationAt.getTime();
  const available = runwayMs <= 0 ? 0 : Math.floor(runwayMs / cadenceMs);

  // Q-19, OWNER-LAN171-05: `whatsappReminderCount` counts the invitation as WhatsApp #1; buildLadder wants only the further rungs.
  const whatsappRemindersAfterInvitation = Math.max(0, schedule.whatsappReminderCount - 1);
  const wanted = whatsappRemindersAfterInvitation + schedule.emailReminderCount;

  const lateApproval = available < wanted;

  const whatsappScheduled = lateApproval
    ? Math.max(0, Math.min(whatsappRemindersAfterInvitation, available))
    : whatsappRemindersAfterInvitation;

  const emailScheduled = lateApproval ? 0 : schedule.emailReminderCount;

  const rungs = buildLadder(
    invitationAt,
    schedule.reminderCadenceHours,
    whatsappScheduled,
    emailScheduled,
    whatsappScheduled + emailScheduled,
  );

  // A late-approval event never escalates; it still appears in W5's Follow-ups queue for manual chasing.
  const escalationAt = lateApproval
    ? null
    : new Date(responseDeadlineAt.getTime() + schedule.escalationHours * HOUR_MS);

  // REQ-two-ladders: independent of confirmed audience; never escalates (`REQ-never-harsh`).
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
    // `<=`, not `<`: a rung exactly on the deadline still fits.
    recruitLadder = {
      invitationAt: recruitInvitationAt,
      configuredInvitationAt: configuredRecruitInvitationAt,
      dispatchesImmediately: recruitDispatchesImmediately,
      followUpAt:
        candidateFollowUpAt.getTime() <= responseDeadlineAt.getTime() ? candidateFollowUpAt : null,
    };
  }

  return {
    templateId: event.templateId,
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

/** One event type's schedule, and the worked-example plan it would produce today (LAN-171, W7). */
export interface MessagingScheduleWithPreview {
  readonly schedule: MessagingSchedule;
  readonly preview: MessagingPlan;
}

/** Every configured schedule with the plan for the same synthetic worked example (four weeks out, 20:00, approved today), so the previews are comparable and read from `resolveMessagingPlanIn`'s own arithmetic. Only reader: `/operate/admin/messaging`. */
export async function listMessagingSchedulesWithPreview(): Promise<
  readonly MessagingScheduleWithPreview[]
> {
  const scheduledOn = addClubDays(todayInClubZone(), 28) ?? todayInClubZone();

  return withTransaction(async (tx) => {
    const schedules = await listMessagingSchedulesIn(tx);
    const withPreview: MessagingScheduleWithPreview[] = [];
    for (const schedule of schedules) {
      const preview = await resolveMessagingPlanIn(tx, {
        templateId: schedule.templateId,
        scheduledOn,
        startsAt: "20:00",
      });
      withPreview.push({ schedule, preview });
    }
    return withPreview;
  });
}
