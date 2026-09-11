import "server-only";

import { withTransaction } from "@/lib/db";
import {
  isAttendancePresence,
  SHOWED_PRESENCES,
  summariseAttendance,
  type AttendanceParticipant,
  type AttendanceSummary,
} from "../attendance-vocabulary";
import { registerOpensAt } from "../attendance-window";
import { readEventIn, type EventDetail } from "../events";
import { personDisplayNameSql as displayName } from "../sql-text";
import { closedReasonFor, participantKey, type AttendanceClosedReason } from "./shared";

/** The board and the headline numbers — LAN-152, D62, D73, D74. */

/** The board, and the event it belongs to. */
export interface AttendanceBoard {
  event: EventDetail;
  isOpen: boolean; // closedReasonFor's own rule, not the database's approved-or-cancelled backstop
  closedReason: AttendanceClosedReason | null; // null when the register is open
  registerOpensAt: string | null; // ISO-8601, returned whether open or not; null for an event with no date
  participants: AttendanceParticipant[];
  summary: AttendanceSummary; // the same numbers the event page's headline reads
  invitedCount: number;
  recordedCount: number;
  walkUpCount: number;
  mismatchCount: number;
}

interface ParticipantRow {
  invitation_id: string | null;
  attendance_id: string | null;
  capacity: string;
  season_membership_id: string | null;
  person_id: string | null;
  display_name: string | null;
  rsvp: string | null;
  presence: string | null;
  recorded_at: Date | string | null;
  recorded_by_name: string | null;
}

// Every invitee and every walk-up, in one list — a full outer join so a walk-up is a row with a
// null left side (invariant P6), not a caller-assembled special case. Both sides compute
// coalesce(season_membership_id, person_id) as one anchor_id (P8 guarantees exactly one non-null),
// since PostgreSQL's full outer join needs a mergeable equality, not a disjunction of two.
const PARTICIPANT_QUERY = `
  with invited as (
    select i.id as invitation_id,
           i.capacity::text as capacity,
           i.season_membership_id,
           i.person_id,
           coalesce(i.season_membership_id, i.person_id) as anchor_id,
           coalesce(i.person_id, m.person_id) as subject_person_id
      from public.invitations i
      left join public.season_memberships m on m.id = i.season_membership_id
     where i.event_id = $1
  ),
  recorded as (
    select a.id as attendance_id,
           a.capacity::text as capacity,
           a.season_membership_id,
           a.person_id,
           coalesce(a.season_membership_id, a.person_id) as anchor_id,
           a.presence::text as presence,
           a.recorded_at,
           a.recorded_by_person_id,
           coalesce(a.person_id, m.person_id) as subject_person_id
      from public.attendance_records a
      left join public.season_memberships m on m.id = a.season_membership_id
     where a.event_id = $1
  )
  select inv.invitation_id,
         rec.attendance_id,
         coalesce(inv.capacity, rec.capacity) as capacity,
         coalesce(inv.season_membership_id, rec.season_membership_id) as season_membership_id,
         coalesce(inv.person_id, rec.person_id) as person_id,
         ${displayName("p")} as display_name,
         r.response::text as rsvp,
         rec.presence,
         rec.recorded_at,
         ${displayName("rp")} as recorded_by_name
    from invited inv
    full outer join recorded rec on rec.anchor_id = inv.anchor_id
    left join public.people p
      on p.id = coalesce(inv.subject_person_id, rec.subject_person_id)
    left join public.current_rsvp r on r.invitation_id = inv.invitation_id
    left join public.people rp on rp.id = rec.recorded_by_person_id
   order by inv.invitation_id is null, display_name, coalesce(inv.capacity, rec.capacity)`;

// Every recruit on the board this season, for a recruitment event's sheet only (LAN-200; see
// relocations.md) — not an invitation filter, a recruit belongs by being an open/recently-exited
// prospect this season. `joined` excluded (now a player); `void` excluded (a wrong record, not a fact).
const RECRUIT_ROSTER_QUERY = `
  select rp.person_id,
         ${displayName("p")} as display_name,
         (i.id is not null or a.id is not null) as already_on_sheet
    from public.recruitment_prospects rp
    join public.people p on p.id = rp.person_id
    left join public.invitations i
      on i.event_id = $1 and i.capacity = 'recruit' and i.person_id = rp.person_id
    left join public.attendance_records a
      on a.event_id = $1 and a.capacity = 'recruit' and a.person_id = rp.person_id
   where rp.season_id = $2
     and rp.status not in ('joined', 'void')
   order by display_name`;

interface RecruitRosterRow {
  person_id: string;
  display_name: string | null;
  already_on_sheet: boolean;
}

interface MismatchRow {
  season_membership_id: string | null;
  person_id: string | null;
  capacity: string;
  mismatch: string | null;
}

function asIsoString(value: Date | string | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value : value.toISOString();
}

// The board for one event, in whatever state it is in — does not refuse a non-occurred event (the
// route renders UX-71 for one); isOpen is the answer, and write paths ask again for themselves.
export async function readAttendanceBoard(
  eventId: string,
  now: Date = new Date(),
): Promise<AttendanceBoard> {
  return withTransaction(async (tx) => {
    const event = await readEventIn(tx, eventId);
    const opensAt = registerOpensAt(event);
    const opensAtIso = opensAt === null ? null : opensAt.toISOString();

    const closedReason = await closedReasonFor(tx, event, now);

    if (closedReason !== null) {
      return {
        event,
        isOpen: false,
        closedReason,
        registerOpensAt: opensAtIso,
        participants: [],
        summary: summariseAttendance([]),
        invitedCount: 0,
        recordedCount: 0,
        walkUpCount: 0,
        mismatchCount: 0,
      };
    }

    const rows = await tx.query<ParticipantRow>(PARTICIPANT_QUERY, [eventId]);

    // Read, not recomputed — the view is the club's definition of a mismatch. weekly-report counts
    // walk-ups off attendance_records instead (LAN-151), leaving this the only reader of the view.
    const mismatches = await tx.query<MismatchRow>(
      `select season_membership_id, person_id, capacity::text as capacity, mismatch
         from public.rsvp_attendance_mismatches
        where event_id = $1`,
      [eventId],
    );

    // D74: a mismatch is a disagreement between two records. Where the second record does not
    // exist there is no disagreement, only *not recorded* — the one classification
    // (said_yes_no_attendance_recorded) this view can emit for that case is dropped here, not in
    // the view itself (schema is a different package's; see relocations.md for the residual risk).
    const flagged = new Map<string, string>();
    for (const row of mismatches.rows) {
      if (!row.mismatch || row.mismatch === "said_yes_no_attendance_recorded") continue;
      flagged.set(
        participantKey(row.capacity, row.season_membership_id, row.person_id),
        row.mismatch,
      );
    }

    const participants = rows.rows.map((row) => {
      const key = participantKey(row.capacity, row.season_membership_id, row.person_id);
      return {
        key,
        displayName: row.display_name ?? "Unnamed participant",
        capacity: row.capacity,
        rsvp: row.rsvp === "yes" || row.rsvp === "no" ? row.rsvp : null,
        isWalkUp: row.invitation_id === null,
        presence: isAttendancePresence(row.presence) ? row.presence : null,
        recordedAt: asIsoString(row.recorded_at),
        recordedByName: row.recorded_by_name,
        mismatch: flagged.get(key) ?? null,
      } satisfies AttendanceParticipant;
    });

    // W12, D11: every recruit joins a recruitment event's sheet, invited or not — skipping any
    // PARTICIPANT_QUERY already produced a real row for.
    if (event.eventType === "recruitment") {
      const onBoard = await tx.query<RecruitRosterRow>(RECRUIT_ROSTER_QUERY, [
        eventId,
        event.seasonId,
      ]);
      for (const row of onBoard.rows) {
        if (row.already_on_sheet) continue;
        participants.push({
          key: participantKey("recruit", null, row.person_id),
          displayName: row.display_name ?? "Unnamed participant",
          capacity: "recruit",
          rsvp: null,
          isWalkUp: false,
          presence: null,
          recordedAt: null,
          recordedByName: null,
          mismatch: null,
        });
      }
    }

    const summary = summariseAttendance(participants);

    return {
      event,
      isOpen: true,
      closedReason: null,
      registerOpensAt: opensAtIso,
      participants,
      summary,
      invitedCount: summary.invited,
      recordedCount: summary.recorded,
      walkUpCount: summary.walkUps,
      mismatchCount: participants.filter((participant) => participant.mismatch !== null).length,
    };
  });
}

interface SummaryRow {
  invited: string;
  said_yes: string;
  showed: string;
  recorded: string;
  walk_ups: string;
}

// The three headline numbers — REQ-headline-numbers, D62/D73/D74, LAN-152. Not readAttendanceBoard:
// the headline answers a different question than "may the register open, and who's on it?" (see
// relocations.md). Reports registerSaved and leaves "nobody came" vs "nobody looked" to the caller.
export async function readEventAttendanceSummary(eventId: string): Promise<AttendanceSummary> {
  return withTransaction(async (tx) => {
    await readEventIn(tx, eventId); // proves the event exists, refuses with a sentence rather than five zeroes

    const result = await tx.query<SummaryRow>(
      `with invited as (
         select i.id,
                coalesce(i.season_membership_id, i.person_id) as anchor_id
           from public.invitations i
          where i.event_id = $1
       ),
       recorded as (
         select a.id,
                a.presence::text as presence,
                coalesce(a.season_membership_id, a.person_id) as anchor_id
           from public.attendance_records a
          where a.event_id = $1
       )
       select (select count(*) from invited)::text as invited,
              (select count(*)
                 from public.current_rsvp r
                 join invited iv on iv.id = r.invitation_id
                where r.response = 'yes')::text as said_yes,
              (select count(*) from recorded
                where presence = any($2::text[]))::text as showed,
              (select count(*) from recorded)::text as recorded,
              (select count(*) from recorded rec
                where not exists (select 1 from invited iv
                                   where iv.anchor_id = rec.anchor_id))::text as walk_ups`,
      [eventId, [...SHOWED_PRESENCES]],
    );

    const row = result.rows[0];
    const recorded = Number(row.recorded);

    return {
      invited: Number(row.invited),
      saidYes: Number(row.said_yes),
      showed: Number(row.showed),
      recorded,
      walkUps: Number(row.walk_ups),
      registerSaved: recorded > 0,
    } satisfies AttendanceSummary;
  });
}
