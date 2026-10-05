import "server-only";

import type { Tx } from "@/lib/db";
import { EXIT_STATUSES } from "./recruitment-vocabulary";
import { hasGrantedSeasonMessagingConsentIn } from "./messaging-consent";
import { isLightsOut, lightsOutNow, lightsOutReleaseAt } from "./messaging-schedule/lights-out";
import { EVENT_START_SQL } from "./attendance-sheet-email";

/**
 * The recruit event reminder — LAN-464 (Stu, 2 October 2026; Brian's
 * decisions on the ticket).
 *
 * A recruit who answers Yes to a recruitment event gets **one WhatsApp
 * reminder** before it (`recruit_event_reminder_v1`): what, when and where.
 * The Recruitment row of the messaging schedule says how many hours before
 * (`recruit_event_reminder_hours`, default 1, zero is off), and approval
 * freezes the resulting instant onto the event's plan
 * (`event_messaging_plans.recruit_event_reminder_at`). A reschedule re-freezes
 * it, so a moved event moves its reminder.
 *
 * ## Declared at the reminder moment, not at approval
 *
 * Who gets it is decided when the moment arrives, on the attendance sheet's
 * idiom: {@link declareDueRecruitEventRemindersIn} runs at the top of every
 * sweep tick and writes one job per recruit who, at that tick,
 *
 *   * holds a recruit-capacity invitation to an approved event that has not
 *     started, and whose plan's reminder moment has passed;
 *   * has a current answer of **Yes**, recorded at or before that moment — a
 *     Yes that arrives after it gets no reminder (Brian's ticket leaves this
 *     to judgement; this is the judgement);
 *   * has not left recruitment (an exit status, or `joined`: LAN-341's
 *     cancellations stand both ladders down, and this one with them); and
 *   * has granted messaging consent for the event's season.
 *
 * Nobody else: no player, no coach, no committee, no recruit who said No or
 * has not answered.
 *
 * ## One per recruit per event
 *
 * The key is `recruit-event-reminder:<event>:<invitation>` and the insert is
 * `on conflict do nothing`, so a second tick, a second sweep, or a reschedule
 * after it went produces no second message.
 *
 * ## Lights-out
 *
 * Not exempt (`LIGHTS_OUT_EXEMPT.recruit_event_reminder`). A reminder whose
 * moment falls between 22:00 and 07:00 waits for 07:00 like every other
 * recruit send — but only while 07:00 is still before the event starts. If it
 * is not, the job is cancelled with {@link RECRUIT_EVENT_REMINDER_QUIET_HOURS_REASON}
 * rather than sent late, and the message queue shows that reason.
 *
 * Dispatch is `dispatchRecruitEventReminderJob` in `messaging-scheduler.ts`,
 * which reads every one of these facts again before it sends.
 */

/** The `notification_jobs.idempotency_key` prefix every reminder carries. */
export const RECRUIT_EVENT_REMINDER_KEY_PREFIX = "recruit-event-reminder:";

/** Why a reminder held by lights-out was dropped. Shown on the message queue. */
export const RECRUIT_EVENT_REMINDER_QUIET_HOURS_REASON = "Quiet hours ran past the event start.";

/** Why a reminder was refused because its event is no longer approved and ahead. */
export const RECRUIT_EVENT_REMINDER_NO_EVENT_REASON =
  "This event is no longer approved and ahead, so no reminder is sent.";

/** Why a reminder was stood down at dispatch because the answer is no longer Yes. */
export const RECRUIT_EVENT_REMINDER_NOT_YES_REASON = "The recruit's answer is no longer Yes.";

/** Why a reminder was stood down because the recruit has left recruitment. */
export const RECRUIT_EVENT_REMINDER_LEFT_REASON = "The recruit has left recruitment.";

/** Why a reminder was stood down because the event's plan no longer carries one. */
export const RECRUIT_EVENT_REMINDER_OFF_REASON = "This event no longer has a recruit reminder.";

/** The recruit statuses that end the recruit relationship: the exits, and the flip to the roster. */
export const RECRUIT_EVENT_REMINDER_ENDED_STATUSES: readonly string[] = Object.freeze([
  ...EXIT_STATUSES,
  "joined",
]);

export function recruitEventReminderIdempotencyKey(eventId: string, invitationId: string): string {
  return `${RECRUIT_EVENT_REMINDER_KEY_PREFIX}${eventId}:${invitationId}`;
}

/**
 * The recruit's standing SQL, for one invitation: whether they have left
 * recruitment in the event's season. `i` is `public.invitations`, `e` is
 * `public.events`; `$param` is {@link RECRUIT_EVENT_REMINDER_ENDED_STATUSES}.
 */
export function recruitHasLeftSql(param: string): string {
  return `exists (
    select 1
      from public.recruitment_prospects rp
     where rp.person_id = coalesce(i.person_id, m.person_id)
       and rp.season_id = e.season_id
       and rp.status::text = any(${param}::text[]))`;
}

/**
 * Declares every reminder whose moment has arrived — never dispatches;
 * `runMessagingSweep` claims and sends them on the same tick. Then, while
 * lights-out is on, drops every queued reminder that 07:00 would deliver at
 * or after its event's start. Returns how many jobs were new, and how many
 * were dropped.
 */
export async function declareDueRecruitEventRemindersIn(
  tx: Tx,
): Promise<{ declared: number; dropped: number }> {
  const candidates = await tx.query<{
    invitation_id: string;
    event_id: string;
    season_id: string;
    person_id: string;
    reminder_at: Date;
  }>(
    `select i.id as invitation_id,
            e.id as event_id,
            e.season_id,
            coalesce(i.person_id, m.person_id) as person_id,
            p.recruit_event_reminder_at as reminder_at
       from public.event_messaging_plans p
       join public.events e on e.id = p.event_id
       join public.invitations i on i.event_id = e.id
       left join public.season_memberships m on m.id = i.season_membership_id
       join public.current_rsvp r on r.invitation_id = i.id
      where p.recruit_event_reminder_at is not null
        and p.recruit_event_reminder_at <= now()
        and e.status = 'approved'
        and e.starts_at is not null
        and ${EVENT_START_SQL} > now()
        and i.capacity = 'recruit'
        and i.status <> 'cancelled'
        and r.response = 'yes'
        and r.recorded_at <= p.recruit_event_reminder_at
        and not ${recruitHasLeftSql("$1")}
        and not exists (
          select 1 from public.notification_jobs j
           where j.idempotency_key = $2 || e.id::text || ':' || i.id::text)
      order by p.recruit_event_reminder_at, i.id`,
    [RECRUIT_EVENT_REMINDER_ENDED_STATUSES, RECRUIT_EVENT_REMINDER_KEY_PREFIX],
  );

  let declared = 0;
  for (const candidate of candidates.rows) {
    if (candidate.person_id === null) continue;
    // Consent is the recruit follow-up's rule: a recruit nobody may message
    // gets no reminder job at all (`scheduleEventLadderIn`).
    if (!(await hasGrantedSeasonMessagingConsentIn(tx, candidate.person_id, candidate.season_id))) {
      continue;
    }
    const inserted = await tx.query<{ id: string }>(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, invitation_id, event_id, person_id, channel,
          scheduled_for, template_variables)
       values ($1, 'other', 'pending', $2::uuid, $3::uuid, $4::uuid, 'whatsapp', $5, '{}'::jsonb)
       on conflict (idempotency_key) do nothing
       returning id`,
      [
        recruitEventReminderIdempotencyKey(candidate.event_id, candidate.invitation_id),
        candidate.invitation_id,
        candidate.event_id,
        candidate.person_id,
        candidate.reminder_at,
      ],
    );
    if (inserted.rows[0]) declared += 1;
  }

  return { declared, dropped: await dropRemindersLightsOutWouldMakeLateIn(tx) };
}

/**
 * While lights-out is on, the next release is 07:00. A queued reminder whose
 * event starts at or before then can only go late, so it is cancelled with a
 * reason instead (decision 2 on LAN-464). Outside the window nothing is held,
 * so nothing is dropped.
 */
async function dropRemindersLightsOutWouldMakeLateIn(tx: Tx): Promise<number> {
  const now = lightsOutNow();
  if (!isLightsOut(now)) return 0;
  const dropped = await tx.query(
    `update public.notification_jobs j
        set status = 'cancelled', cancelled_reason = $2, claimed_at = null, claimed_by = null,
            updated_at = now()
       from public.events e
      where e.id = j.event_id
        and j.job_type = 'other'
        and j.idempotency_key like $3 || '%'
        and j.status in ('pending', 'ready', 'failed')
        and j.held_at is null
        and e.starts_at is not null
        and ${EVENT_START_SQL} <= $1::timestamptz`,
    [
      lightsOutReleaseAt(now),
      RECRUIT_EVENT_REMINDER_QUIET_HOURS_REASON,
      RECRUIT_EVENT_REMINDER_KEY_PREFIX,
    ],
  );
  return dropped.rowCount ?? 0;
}
