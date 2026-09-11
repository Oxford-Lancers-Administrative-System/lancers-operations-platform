import "server-only";

import { ConstraintViolated, withTransaction, type Tx } from "@/lib/db";
import { addClubDays, CLUB_TIME_ZONE, todayInClubZone } from "@/lib/club-time";
import {
  listMessagingSchedulesIn,
  readMessagingScheduleIn,
  type MessagingSchedule,
} from "./schedule";

/**
 * The ladder arithmetic — `buildLadder`, `resolveMessagingPlanIn`, and the
 * settings page's worked-example preview. LAN-300 split of
 * `messaging-schedule.ts`; see `./index`.
 */

const PLAN_NEEDS_A_DATE_RULE = "messaging_plan_requires_a_date";

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
  /** LAN-265. The template the cadence was resolved from. */
  readonly templateId: string;
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
  /** LAN-265. The cadence is the template's, so this is what resolves it. */
  readonly templateId: string;
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
  const schedule = await readMessagingScheduleIn(tx, event.templateId);

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
        templateId: schedule.templateId,
        scheduledOn,
        startsAt: "20:00",
      });
      withPreview.push({ schedule, preview });
    }
    return withPreview;
  });
}
