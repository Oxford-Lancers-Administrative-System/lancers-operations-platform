import "server-only";

import { LEADERSHIP_TIER_SEATS } from "@/lib/auth/capabilities";
import type { Tx } from "@/lib/db";

/**
 * The attendance-sheet email — LAN-465 (Stu, 1 October 2026; the rule settled on
 * the call of 2 October and confirmed by Brian the same day).
 *
 * **One hour before an approved event starts**, one email with a link to that
 * event's attendance page goes to:
 *
 *   * whoever holds the **General Manager** seat today;
 *   * whoever holds the **President** seat today;
 *   * every **coach who answered Yes** to that event — an invitation in the
 *     `coach` capacity whose current answer is Yes. A coach who is not going
 *     gets nothing.
 *
 * Hard-coded: nobody controls it from a screen. Email only, to whatever email
 * the person has on file, whichever kind it is.
 *
 * ## How "one hour before" is kept
 *
 * The messaging sweep runs every five minutes, and {@link declareDueAttendanceSheetEmailsIn}
 * runs at the top of every tick, before the tick reads what is due. An event
 * whose start is within the next hour and still ahead gets one job per
 * recipient that tick, and the same tick dispatches it. So the email goes on
 * the first tick at or after the one-hour mark — up to five minutes after it.
 *
 * ## One per person per event
 *
 * The job's idempotency key is `attendance-sheet:<event>:<person>` and the
 * insert is `on conflict do nothing`, so a person who is both President and a
 * coach who answered Yes, or a tick that runs twice, still produces one job.
 * A coach who answers Yes inside the last hour is declared on the next tick
 * and gets their copy then; a coach who answers Yes after the start gets
 * nothing, because the event has started.
 *
 * ## Cancelled, moved, no start time
 *
 * Only an approved event with a start time is ever declared. Cancelling an
 * event cancels its queued jobs (`event-amendment/cancel.ts`), and the due
 * predicate refuses a job whose event is no longer approved or has started.
 * A move is read at dispatch: a job whose event now starts more than an hour
 * away is put back to the new one-hour mark rather than sent.
 *
 * Lights-out (22:00–07:00) holds this email like every other automated
 * message: an event starting before 08:00, or after 23:00, gets its sheet at
 * 07:00 if it has not started by then, and none if it has.
 */

/** The `notification_jobs.idempotency_key` prefix every attendance-sheet job carries. */
export const ATTENDANCE_SHEET_KEY_PREFIX = "attendance-sheet:";

/** How long before the start the sheet goes. */
export const ATTENDANCE_SHEET_LEAD_MINUTES = 60;

export function attendanceSheetIdempotencyKey(eventId: string, personId: string): string {
  return `${ATTENDANCE_SHEET_KEY_PREFIX}${eventId}:${personId}`;
}

/** `[eventId, personId]` from a key {@link attendanceSheetIdempotencyKey} wrote, or `null`. */
export function parseAttendanceSheetKey(
  idempotencyKey: string,
): { eventId: string; personId: string } | null {
  if (!idempotencyKey.startsWith(ATTENDANCE_SHEET_KEY_PREFIX)) return null;
  const [eventId, personId, ...rest] = idempotencyKey
    .slice(ATTENDANCE_SHEET_KEY_PREFIX.length)
    .split(":");
  if (!eventId || !personId || rest.length > 0) return null;
  return { eventId, personId };
}

/** The event's start, as an SQL instant in the club's zone. `e` is `public.events`. */
export const EVENT_START_SQL = `((e.scheduled_on + e.starts_at) at time zone 'Europe/London')`;

/**
 * Everybody one event's sheet goes to, each once: the two seat holders and
 * every coach whose current answer is Yes. A merged-away person is never a
 * recipient (their survivor is).
 */
export async function listAttendanceSheetRecipientsIn(tx: Tx, eventId: string): Promise<string[]> {
  const result = await tx.query<{ person_id: string }>(
    `with seat_holders as (
       select a.person_id
         from public.role_assignments a
         join public.roles r on r.id = a.role_id
        where r.code = any($2::text[])
          and a.effective_from <= current_date
          and (a.effective_to is null or a.effective_to > current_date)
     ),
     coaches_going as (
       select coalesce(i.person_id, m.person_id) as person_id
         from public.invitations i
         left join public.season_memberships m on m.id = i.season_membership_id
         join public.current_rsvp r on r.invitation_id = i.id
        where i.event_id = $1::uuid
          and i.capacity = 'coach'
          and i.status <> 'cancelled'
          and r.response = 'yes'
     )
     select distinct p.id as person_id
       from (select person_id from seat_holders
             union
             select person_id from coaches_going) recipients
       join public.people p on p.id = recipients.person_id
      where p.merged_into_person_id is null
      order by p.id`,
    [eventId, [LEADERSHIP_TIER_SEATS.standing_continuity, LEADERSHIP_TIER_SEATS.presiding]],
  );
  return result.rows.map((row) => row.person_id);
}

/**
 * Declares the sheet for every approved event whose start is within the next
 * hour and still ahead — never dispatches; `runMessagingSweep` claims and sends
 * it on the same tick. Returns how many jobs were new.
 */
export async function declareDueAttendanceSheetEmailsIn(tx: Tx): Promise<{ declared: number }> {
  const events = await tx.query<{ id: string }>(
    `select e.id
       from public.events e
      where e.status = 'approved'
        and e.starts_at is not null
        and ${EVENT_START_SQL} > now()
        and ${EVENT_START_SQL} - make_interval(mins => $1) <= now()`,
    [ATTENDANCE_SHEET_LEAD_MINUTES],
  );

  let declared = 0;
  for (const event of events.rows) {
    for (const personId of await listAttendanceSheetRecipientsIn(tx, event.id)) {
      const inserted = await tx.query<{ id: string }>(
        `insert into public.notification_jobs
           (idempotency_key, job_type, status, event_id, person_id, channel, scheduled_for,
            template_variables)
         values ($1, 'other', 'pending', $2::uuid, $3::uuid, 'email', now(), '{}'::jsonb)
         on conflict (idempotency_key) do nothing
         returning id`,
        [attendanceSheetIdempotencyKey(event.id, personId), event.id, personId],
      );
      if (inserted.rows[0]) declared += 1;
    }
  }
  return { declared };
}
