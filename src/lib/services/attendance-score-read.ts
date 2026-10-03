import "server-only";

import type { Tx } from "@/lib/db";
import { isAttendancePresence } from "./attendance-vocabulary";
import {
  EMPTY_ATTENDANCE_SCORE,
  scoreAttendance,
  type AttendanceScore,
  type AttendanceScoreInput,
} from "./attendance-score";

/**
 * The attendance score's one read — LAN-457. Every player-anchored invitation
 * in a season, each with its event's facts and the register's mark, scored by
 * `scoreAttendance`. The board reads a whole season in one query (the LAN-228
 * pattern: once per season, never per row); the player record reads the same
 * query narrowed to one membership, so both show the same figures.
 */
export async function readAttendanceScoresIn(
  tx: Tx,
  seasonId: string,
  today: string,
  membershipIds?: readonly string[],
): Promise<Map<string, AttendanceScore>> {
  const result = await tx.query<{
    season_membership_id: string;
    is_mandatory: boolean;
    event_type: string;
    event_status: string;
    scheduled_on: string | null;
    capacity: string;
    messaged: boolean;
    presence: string | null;
  }>(
    `select i.season_membership_id, e.is_mandatory, e.event_type::text as event_type,
            e.status::text as event_status,
            to_char(e.scheduled_on, 'YYYY-MM-DD') as scheduled_on,
            i.capacity::text as capacity,
            (i.message_withheld_reason is null) as messaged,
            ar.presence::text as presence
       from public.invitations i
       join public.events e on e.id = i.event_id
       left join public.attendance_records ar
         on ar.event_id = i.event_id and ar.season_membership_id = i.season_membership_id
      where i.season_id = $1::uuid
        and i.season_membership_id is not null
        and ($2::uuid[] is null or i.season_membership_id = any($2::uuid[]))`,
    [seasonId, membershipIds ? [...membershipIds] : null],
  );

  const inputs = new Map<string, AttendanceScoreInput[]>();
  for (const row of result.rows) {
    const list = inputs.get(row.season_membership_id) ?? [];
    list.push({
      isMandatory: row.is_mandatory,
      eventType: row.event_type,
      eventStatus: row.event_status,
      scheduledOn: row.scheduled_on,
      capacity: row.capacity,
      messaged: row.messaged,
      presence: isAttendancePresence(row.presence) ? row.presence : null,
    });
    inputs.set(row.season_membership_id, list);
  }

  const scores = new Map<string, AttendanceScore>();
  for (const [membershipId, list] of inputs) {
    scores.set(membershipId, scoreAttendance(list, today));
  }
  for (const membershipId of membershipIds ?? []) {
    if (!scores.has(membershipId)) scores.set(membershipId, EMPTY_ATTENDANCE_SCORE);
  }
  return scores;
}
