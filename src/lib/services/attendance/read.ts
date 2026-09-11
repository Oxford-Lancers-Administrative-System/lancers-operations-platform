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
  /**
   * Whether the register may be opened. Everything else renders UX-71 or UX-75.
   *
   * The approval is `closedReasonFor`'s own rule and not the database's
   * backstop: `attendance_records_require_an_approved_event` admits
   * `cancelled` as well as `approved`, because a cancellation cascades its
   * status onto the register's rows and W6 says those rows survive it.
   */
  isOpen: boolean;
  /** `null` when the register is open. */
  closedReason: AttendanceClosedReason | null;
  /**
   * When the buffer lifts, ISO-8601, or `null` for an event with no date.
   *
   * Returned whether the register is open or not, because a screen saying "not
   * yet" has to say *when*, and one saying "open" has said nothing wrong.
   */
  registerOpensAt: string | null;
  participants: AttendanceParticipant[];
  /** The same numbers the event page's headline reads. See `AttendanceSummary`. */
  summary: AttendanceSummary;
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

/**
 * Every invitee and every walk-up for the event, in one list.
 *
 * A `full outer join` rather than two queries stitched together in TypeScript:
 * the two sides are "was asked" and "was observed", and the whole point of this
 * screen is the people who appear on one side and not the other. Joining them
 * in SQL means a walk-up is a row with a null left side, which is exactly what
 * invariant P6 describes, rather than a special case the caller has to remember
 * to append.
 *
 * ## Why both sides carry an `anchor_id`
 *
 * The natural way to write the join is "the same membership, **or** the same
 * person", because invariant P8 puts the anchor in one of two columns depending
 * on capacity. PostgreSQL refuses it: a `full outer join` has to have a
 * merge-joinable or hash-joinable condition, and a disjunction of two equalities
 * is neither. So each side computes the one anchor it actually has —
 * `coalesce(season_membership_id, person_id)`, which P8 guarantees is exactly
 * one non-null value — and the join is a plain equality on that. Same rows,
 * and a plan the planner will accept.
 */
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

/**
 * Every recruit on the board this season, for a recruitment event's sheet
 * only — Brian, 2026-09-01, on the running fidelity mockup (LAN-200). W12's
 * own "recruits first" is therefore not an invitation filter the way a
 * player's row is; a recruit belongs on the sheet by virtue of being an open
 * or recently-exited prospect for this season, invited to this particular
 * event or not. Decision history: docs/ux/tickets/LAN-80-attendance.md · docs/ux/tickets/LAN-205-walk-up-and-recruits-first.md.
 *
 * `joined` is excluded — a converted prospect is a player now, tracked by
 * their season membership like anybody else. `void` is excluded on the
 * schema's own steer: a void row says the record itself is wrong, never a
 * fact about the person.
 *
 * Left-joined against this event's own invitations and attendance so
 * {@link readAttendanceBoard} can tell which recruits `PARTICIPANT_QUERY`
 * above has already produced a row for (`already_on_sheet`) and skip them.
 */
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

/**
 * The board for one event, in whatever state it is in.
 *
 * It does **not** refuse a non-occurred event: the route has to render UX-71
 * for one, which needs the event. `isOpen` is the answer, and the write paths
 * ask the question again for themselves rather than trusting that a caller
 * looked at it.
 */
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

    // Read rather than recomputed. The view is the club's definition of a
    // mismatch, and a second definition written here would drift from it. It
    // was also what the Monday report read, until LAN-151: the view derives
    // occurrence against `now()`, so a report about last March would have
    // depended on today's date. `weekly-report` counts walk-ups off
    // `attendance_records` instead, which leaves this the only reader.
    const mismatches = await tx.query<MismatchRow>(
      `select season_membership_id, person_id, capacity::text as capacity, mismatch
         from public.rsvp_attendance_mismatches
        where event_id = $1`,
      [eventId],
    );

    /*
      D74, and the defect it exists to prevent — LAN-152, corrected by LAN-165.
      Decision history: docs/ux/tickets/LAN-80-attendance.md · docs/ux/tickets/LAN-205-walk-up-and-recruits-first.md.

      A mismatch is a **disagreement between two records**. Where the second
      record does not exist there is no disagreement — there is an absence,
      and the club already has a word for it: *not recorded*. `said_yes_no_
      attendance_recorded` is the only classification this view can emit for a
      person with nothing recorded — dropping it, per person, is both
      necessary and sufficient.

      Filtered **here** rather than in `public.rsvp_attendance_mismatches`
      deliberately: the view is schema, and this mission's schema belongs to
      the status-and-occurrence migration package. This function is the
      view's only reader today, so the rule is applied wherever the view is
      read — but a future direct reader of the view, written after this
      package and not looking here, would over-count every unrecorded yes on
      a sheet somebody has started. Recorded in the residual-risk section of
      the pull request that merged LAN-165.
    */
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

    // W12, D11 — every recruit on the board joins a recruitment event's sheet,
    // invited to this event or not. Only the ones `PARTICIPANT_QUERY` has not
    // already produced a row for; a recruit that query already found (an
    // invitation, an attendance record, or both) keeps that real row rather
    // than gaining a second, always-blank one.
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

/**
 * The three headline numbers, for the event page — REQ-headline-numbers, D62,
 * D73, D74. LAN-152.
 *
 * ## Why this is not `readAttendanceBoard`
 *
 * The board answers "may the register be opened, and who is on it?", and for
 * an event whose buffer has not lifted the honest answer to the first half is
 * no — so it returns no participants. The headline is a different question:
 * **forty-seven people were asked and twenty-one said yes** is true of an
 * approved event a fortnight away, and the event page has to print it.
 *
 * So it is five counts in one round trip rather than a `full outer join` and a
 * view read the page has no use for.
 *
 * ## What it does not do
 *
 * Judge. It reports `registerSaved` and leaves the difference between "nobody
 * came" and "nobody looked" to the two values — D74's own two-state axis.
 */
export async function readEventAttendanceSummary(eventId: string): Promise<AttendanceSummary> {
  return withTransaction(async (tx) => {
    // Proves the event exists, and refuses with a sentence rather than
    // returning five zeroes for an identifier that names nothing.
    await readEventIn(tx, eventId);

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
