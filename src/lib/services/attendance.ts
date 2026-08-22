import "server-only";

import {
  ConstraintViolated,
  InvalidTransition,
  NotFound,
  withTransaction,
  type Tx,
} from "@/lib/db";
import { recordAudit } from "./audit";
import { actorRequirement } from "./actor";
import {
  isAttendancePresence,
  type AttendanceParticipant,
  type AttendancePresence,
  type WalkUpInput,
} from "./attendance-vocabulary";
import { hasOccurred, lockEventIn, readEventIn, type EventDetail } from "./events";
import { type EventStatus } from "./event-input";
import { personDisplayNameSql as displayName } from "./sql-text";
import { todayInClubZone } from "@/lib/club-time";

/**
 * Attendance — locked Requirement 7, invariants P5, P6 and P8. LAN-80.
 *
 * ## The one rule the whole module exists to hold
 *
 * **A Yes never becomes a Present.** RSVP is intent and attendance is
 * observation, and they are two authoritative records with no path between
 * them. There is deliberately no function here that reads `rsvp_responses` or
 * `current_rsvp` and writes `attendance_records`; the board below reads the
 * standing answer only so a recorder can see it beside the person's name, and
 * `tests/…/attendance.test.ts` asserts that a `yes` with nothing recorded stays
 * absent from `attendance_records` entirely.
 *
 * The database agrees structurally: `attendance_records` has no foreign key to
 * an invitation or a response, which is what makes invariant P6's walk-up — a
 * person who was never invited and never answered — an ordinary row rather than
 * an exception.
 *
 * ## What is enforced where
 *
 * Nothing in this file re-implements a rule the schema already carries, and the
 * two that matter are worth naming:
 *
 *   * **Invariant P5** — attendance requires an event that has occurred, and
 *     since LAN-151 occurrence is derived rather than asserted (D30). The rule
 *     is therefore in two halves, deliberately. The database holds "the event
 *     is approved", with a cascading composite foreign key plus
 *     `check (event_status = 'approved')`, so it is true of every row in the
 *     table at every instant including rows written by a script that never
 *     called this module. The other half — "its date has passed" — cannot be a
 *     check constraint, because a check constraint cannot read the clock, so it
 *     is `hasOccurred` in `./event-input` and is enforced here. That half is a
 *     genuine service-layer guarantee rather than a courtesy, which is why
 *     `requireOccurredEvent` takes the row lock before asking.
 *
 *   * **Invariant P8** — player capacity anchors to the season membership;
 *     coach, committee, guest and recruit anchor to the durable person. Held by
 *     `attendance_records_anchor_matches_capacity`. This module never lets a
 *     caller choose both: a target resolves to exactly one anchor, from rows
 *     that already exist for the event.
 *
 * ## What a caller may name
 *
 * A recorder posts a **participant key**, and the key is resolved against the
 * event's own invitations and its own attendance rows. It is not a pair of
 * columns the browser fills in. That matters because the alternative — trusting
 * a posted capacity and anchor id — would let anybody with a session record
 * attendance for an arbitrary membership at an arbitrary event, which is a
 * write against a person who was never involved. Adding somebody who genuinely
 * was not invited is a separate, deliberate action: `recordWalkUpAttendance`.
 *
 * ## Mismatches are shown and never resolved
 *
 * `public.rsvp_attendance_mismatches` computes them and this module reads it.
 * Nothing here writes, hides, suppresses or "reconciles" one — the frozen model
 * says mismatches are "computed, surfaced as exceptions, and never silently
 * reconciled", and a said-no-but-showed-up is a fact about the evening rather
 * than a data-entry error to clean up.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Re-exported from `./attendance-vocabulary`, which is pure and is what the
 * client components import. A server caller imports everything from here and
 * does not have to know the split exists; see that module's header for why it
 * has to — a client component importing the four state names from this module
 * would drag `pg` into the browser bundle, and the build refuses it.
 */
export {
  ATTENDANCE_PRESENCES,
  isAttendancePresence,
  type AttendanceParticipant,
  type AttendancePresence,
  type WalkUpInput,
} from "./attendance-vocabulary";

/**
 * The stored status an event must be in for a register to exist at all.
 *
 * Necessary and not sufficient: `hasOccurred` adds the half the database cannot
 * hold. A draft was never held and a cancelled event did not happen, and
 * neither can carry attendance.
 */
export const ATTENDANCE_OPEN_STATUS: EventStatus = "approved";

export const ATTENDANCE_CLOSED_MESSAGE =
  "Attendance can only be recorded against an event that has happened — an approved event " +
  "whose date has passed.";

export const PARTICIPANT_NOT_FOUND_MESSAGE =
  "That person is not on this event's list. Add them as a walk-up if they turned up uninvited.";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The board, and the event it belongs to. */
export interface AttendanceBoard {
  event: EventDetail;
  /** `true` only for `occurred`. Everything else renders UX-71 or UX-75. */
  isOpen: boolean;
  participants: AttendanceParticipant[];
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

interface MismatchRow {
  season_membership_id: string | null;
  person_id: string | null;
  capacity: string;
  mismatch: string | null;
}

/** `capacity:anchorId`. The anchor is whichever of the two columns is set. */
function participantKey(capacity: string, membershipId: string | null, personId: string | null) {
  return `${capacity}:${membershipId ?? personId ?? ""}`;
}

/**
 * The board for one event, in whatever state it is in.
 *
 * It does **not** refuse a non-occurred event: the route has to render UX-71
 * for one, which needs the event. `isOpen` is the answer, and the write paths
 * ask the question again for themselves rather than trusting that a caller
 * looked at it.
 */
export async function readAttendanceBoard(eventId: string): Promise<AttendanceBoard> {
  return withTransaction(async (tx) => {
    const event = await readEventIn(tx, eventId);

    if (!hasOccurred(event, todayInClubZone())) {
      return {
        event,
        isOpen: false,
        participants: [],
        invitedCount: 0,
        recordedCount: 0,
        walkUpCount: 0,
        mismatchCount: 0,
      };
    }

    const rows = await tx.query<ParticipantRow>(PARTICIPANT_QUERY, [eventId]);

    // Read rather than recomputed. The view is the club's definition of a
    // mismatch and it is what the Monday report will read; a second definition
    // written here would drift from it and the two would disagree in public.
    const mismatches = await tx.query<MismatchRow>(
      `select season_membership_id, person_id, capacity::text as capacity, mismatch
         from public.rsvp_attendance_mismatches
        where event_id = $1`,
      [eventId],
    );

    const flagged = new Map<string, string>();
    for (const row of mismatches.rows) {
      if (!row.mismatch) continue;
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

    return {
      event,
      isOpen: true,
      participants,
      invitedCount: participants.filter((participant) => !participant.isWalkUp).length,
      recordedCount: participants.filter((participant) => participant.presence !== null).length,
      walkUpCount: participants.filter((participant) => participant.isWalkUp).length,
      mismatchCount: participants.filter((participant) => participant.mismatch !== null).length,
    };
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** What one save committed, for the interface's Saved line. */
export interface RecordedAttendance {
  key: string;
  displayName: string;
  presence: AttendancePresence;
  recordedAt: string;
  recordedByName: string | null;
  /** The value this replaced, or `null` when it is the first one. */
  previousPresence: AttendancePresence | null;
}

interface ResolvedTarget {
  capacity: string;
  membershipId: string | null;
  personId: string | null;
}

/**
 * Records or corrects one participant's attendance.
 *
 * The same function for both, because the difference is whether a row already
 * existed — and the audit trail is what distinguishes them, not two code paths
 * that could drift. A correction replaces the value, the actor and the time on
 * the row, and writes an audit event carrying the **previous** value in
 * `from_state` and the new one in `to_state`. Nothing is deleted; the earlier
 * value survives in `audit_events` exactly as the frozen model requires.
 *
 * ## Two recorders on one row
 *
 * The latest committed value wins, and the row says whose it is. That is the
 * approved MVP behaviour — "no complex merge workflow is added" — and it is
 * made safe rather than merely likely by taking the event lock first and then
 * locking the attendance row itself: two recorders saving the same person at
 * the same instant serialise, and both audit rows survive, in order.
 */
export async function recordAttendance(
  actorPersonId: string,
  eventId: string,
  participantKeyValue: string,
  presence: AttendancePresence,
): Promise<RecordedAttendance> {
  requireActor(actorPersonId);
  requirePresence(presence);

  return withTransaction(async (tx) => {
    const event = await requireOccurredEvent(tx, eventId);
    const target = await resolveParticipant(tx, eventId, participantKeyValue);

    return writeAttendance(tx, {
      actorPersonId,
      event,
      target,
      presence,
      action: "attendance.recorded",
    });
  });
}

export const WALK_UP_GIVEN_NAME_REQUIRED = "Enter a first name.";

export const WALK_UP_FAMILY_NAME_REQUIRED =
  "Enter a last name. A walk-on has to be findable afterwards.";

export const WALK_UP_PHONE_REQUIRED =
  "Enter a phone number. It is how the club follows this person up.";

export const WALK_UP_PHONE_SHAPE =
  "This does not look like a phone number. Enter it as it was given.";

export const WALK_UP_EMAIL_SHAPE =
  "This does not look like an email address. Enter it as it was given, including the @, " +
  "or leave it blank.";

/**
 * Records somebody who turned up and was never invited — invariant P6 — and
 * puts them into recruitment.
 *
 * ## What changed, and who decided it
 *
 * Brian, 14 August 2026, reviewing the built screen. The first version captured
 * a single name and an optional contact and wrote nothing but a `people` row,
 * on his 12 August decision that the recruitment workflow must not be launched
 * at the side of a pitch. Looking at it, he changed his mind about where the
 * person lands: "add walk-on attendance should go in like a new person is being
 * added, not in the roster, not in the season roster, but in the person in the
 * recruitment… they're not on the team yet. That's how they're a walk-on."
 *
 * So this now writes three things and still not a fourth:
 *
 *   * the **person**, with first and last name;
 *   * their **contact points** — phone always, email when given;
 *   * a **recruitment prospect** for the event's season, at `identified`.
 *
 * And **no season membership**. Somebody who turned up once is not on the
 * roster, and putting them there would mean somebody had to take them off
 * again. Conversion is the only route from prospect to member, and the schema
 * enforces that; this is the near end of it.
 *
 * LAN-85 still owns everything after this point — following the prospect up,
 * converting them, and what the club does with them across future events. What
 * this owes that work is a person with a number and a record saying where they
 * came from, which is what it now leaves behind.
 *
 * ## How the walk-up flag works, and why it is not a column
 *
 * There is none. A walk-up is an attendance record with no invitation, and
 * `public.rsvp_attendance_mismatches` already classifies exactly that as
 * `attended_without_invitation`. Adding a boolean to say so would be a second
 * source of truth for a fact the schema already carries structurally — and one
 * that could be set to `false` on a row that still had no invitation. The
 * board reads the view, so the flag cannot disagree with reality.
 *
 * ## Which capacity, and why it moved
 *
 * `recruit`, anchored to the person. It used to be `guest`, and the reason
 * given was that "`recruit` asserts the club is recruiting them, which is a
 * judgement nobody made at the moment somebody wrote a name on a phone". That
 * judgement is now exactly what the form makes: the same act creates the
 * prospect record. `guest` would leave the attendance row disagreeing with the
 * recruitment row about what this person is.
 *
 * There is no longer a roster-match path. It offered to anchor the row to an
 * existing membership at `player` capacity, and Brian removed it — "they know
 * who's on their roster, there are only 40 people". A walk-on is now always a
 * new person; a duplicate is reconciliation's problem, which is what the
 * prospect record exists for.
 */
export async function recordWalkUpAttendance(
  actorPersonId: string,
  eventId: string,
  input: WalkUpInput,
): Promise<RecordedAttendance> {
  requireActor(actorPersonId);
  requirePresence(input.presence);

  const givenName = requireWalkUpField(input.givenName, WALK_UP_GIVEN_NAME_REQUIRED, "given_name");
  const familyName = requireWalkUpField(
    input.familyName,
    WALK_UP_FAMILY_NAME_REQUIRED,
    "family_name",
  );
  const phone = requireWalkUpField(input.phone, WALK_UP_PHONE_REQUIRED, "phone");
  requirePhoneShape(phone);
  const email = input.email === null || input.email.trim() === "" ? null : input.email.trim();
  if (email !== null) requireEmailShape(email);

  return withTransaction(async (tx) => {
    const event = await requireOccurredEvent(tx, eventId);
    const target = await mintWalkUpProspect(tx, event, { givenName, familyName, phone, email });

    return writeAttendance(tx, {
      actorPersonId,
      event,
      target,
      presence: input.presence,
      action: "attendance.walk_up_recorded",
    });
  });
}

/**
 * Removes one attendance record.
 *
 * The only reason this exists: an occurrence assertion cannot be corrected
 * while attendance rows hang off it (`services/events.ts` refuses it, and the
 * cascading foreign key refuses it underneath), so an operator who marked the
 * wrong event as occurred would otherwise be stuck with it forever. Deleting an
 * observation is a real loss, so it is audited with the value that was removed
 * and it is not offered as a way to "clear" a mistake in the four states — that
 * is what a correction is for.
 */
export async function removeAttendance(
  actorPersonId: string,
  eventId: string,
  participantKeyValue: string,
): Promise<{ key: string; removedPresence: AttendancePresence | null }> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const event = await requireOccurredEvent(tx, eventId);
    const target = await resolveParticipant(tx, eventId, participantKeyValue);

    const removed = await tx.query<{ id: string; presence: string }>(
      // `is not distinct from` on both anchors rather than `=`: exactly one of
      // them is non-null for any row (invariant P8), so an `=` comparison
      // against the null one is `unknown` and matches nothing.
      `delete from public.attendance_records
        where event_id = $1
          and season_membership_id is not distinct from $2::uuid
          and person_id is not distinct from $3::uuid
       returning id, presence::text as presence`,
      [event.id, target.membershipId, target.personId],
    );

    const row = removed.rows[0];
    if (!row) {
      throw new NotFound("There is no attendance recorded for that person at this event.", {
        rule: "attendance_record_not_found",
      });
    }

    await recordAudit(tx, {
      actorPersonId,
      action: "attendance.removed",
      entityTable: "attendance_records",
      entityId: row.id,
      fromState: row.presence,
      toState: null,
      context: { eventId: event.id, capacity: target.capacity },
    });

    return {
      key: participantKey(target.capacity, target.membershipId, target.personId),
      removedPresence: isAttendancePresence(row.presence) ? row.presence : null,
    };
  });
}

// ---------------------------------------------------------------------------
// The shared write
// ---------------------------------------------------------------------------

async function writeAttendance(
  tx: Tx,
  params: {
    actorPersonId: string;
    event: EventDetail;
    target: ResolvedTarget;
    presence: AttendancePresence;
    action: string;
  },
): Promise<RecordedAttendance> {
  const { actorPersonId, event, target, presence } = params;

  // Locked before it is read, for the same reason the event is: the decision
  // "is this an insert or an update, and what value am I replacing?" is a read
  // that the next statement acts on.
  const existing = await tx.query<{ id: string; presence: string }>(
    `select id, presence::text as presence
       from public.attendance_records
      where event_id = $1
        and season_membership_id is not distinct from $2::uuid
        and person_id is not distinct from $3::uuid
      for update`,
    [event.id, target.membershipId, target.personId],
  );

  const previous = existing.rows[0] ?? null;
  const previousPresence =
    previous && isAttendancePresence(previous.presence) ? previous.presence : null;

  let attendanceId: string;
  let recordedAt: Date;

  if (previous) {
    const updated = await tx.query<{ id: string; recorded_at: Date }>(
      `update public.attendance_records
          set presence = $2::public.attendance_presence,
              recorded_at = now(),
              recorded_by_person_id = $3::uuid
        where id = $1
       returning id, recorded_at`,
      [previous.id, presence, actorPersonId],
    );
    attendanceId = updated.rows[0].id;
    recordedAt = updated.rows[0].recorded_at;
  } else {
    // `event_status` is written as the literal the check constraint admits
    // rather than copied from the event we read, so that this statement states
    // the rule it is relying on. If the event is not `approved` the composite
    // foreign key has nothing to point at and the insert is refused — which is
    // the database's half of invariant P5 holding without this module being
    // trusted. The other half, that the date has passed, was proved above.
    const inserted = await tx.query<{ id: string; recorded_at: Date }>(
      `insert into public.attendance_records
         (event_id, event_status, season_id, capacity, season_membership_id, person_id,
          presence, recorded_by_person_id)
       values ($1, 'approved', $2, $3::public.invitation_capacity, $4::uuid, $5::uuid,
               $6::public.attendance_presence, $7::uuid)
       returning id, recorded_at`,
      [
        event.id,
        event.seasonId,
        target.capacity,
        target.membershipId,
        target.personId,
        presence,
        actorPersonId,
      ],
    );
    attendanceId = inserted.rows[0].id;
    recordedAt = inserted.rows[0].recorded_at;
  }

  await recordAudit(tx, {
    actorPersonId,
    action: previous ? "attendance.corrected" : params.action,
    entityTable: "attendance_records",
    entityId: attendanceId,
    fromState: previousPresence,
    toState: presence,
    context: { eventId: event.id, capacity: target.capacity },
  });

  const recorder = await tx.query<{ display_name: string | null }>(
    `select ${displayName("p")} as display_name from public.people p where p.id = $1`,
    [actorPersonId],
  );

  const named = await tx.query<{ display_name: string | null }>(
    `select ${displayName("p")} as display_name
       from public.people p
      where p.id = coalesce(
        $2::uuid,
        (select sm.person_id from public.season_memberships sm where sm.id = $1::uuid))`,
    [target.membershipId, target.personId],
  );

  return {
    key: participantKey(target.capacity, target.membershipId, target.personId),
    displayName: named.rows[0]?.display_name ?? "Unnamed participant",
    presence,
    recordedAt: recordedAt.toISOString(),
    recordedByName: recorder.rows[0]?.display_name ?? null,
    previousPresence,
  };
}

// ---------------------------------------------------------------------------
// Resolution and refusals
// ---------------------------------------------------------------------------

/**
 * The event, locked, and proved to have occurred.
 *
 * The lock is taken before the question is asked so that an operator cancelling
 * the event and a recorder saving a value cannot both proceed on a picture the
 * other is changing. The refusal is `InvalidTransition` rather than
 * `NotPermitted`: the recorder is allowed to do this, the event is not yet in a
 * state where there is anything to record.
 *
 * Both halves of invariant P5 are asked here, through the one derivation
 * (`hasOccurred`) that every other reader also uses.
 */
async function requireOccurredEvent(tx: Tx, eventId: string): Promise<EventDetail> {
  const event = await lockEventIn(tx, eventId);
  if (!hasOccurred(event, todayInClubZone())) {
    throw new InvalidTransition(ATTENDANCE_CLOSED_MESSAGE, {
      rule: "attendance_records_require_an_approved_event",
    });
  }
  return event;
}

/**
 * Turns a posted key into an anchor, using only rows that already exist for
 * **this** event.
 *
 * A key naming somebody the event has neither invited nor recorded is a
 * `NotFound`, not a new participant. That is the boundary described in this
 * module's header: without it, a posted `player:<any membership id>` would
 * write an attendance record for a person who was never at the event, and the
 * capacity would be whatever the browser said it was.
 */
async function resolveParticipant(tx: Tx, eventId: string, key: string): Promise<ResolvedTarget> {
  const separator = key.indexOf(":");
  const capacity = separator === -1 ? "" : key.slice(0, separator);
  const anchorId = separator === -1 ? "" : key.slice(separator + 1);

  if (capacity === "" || anchorId === "") {
    throw new NotFound(PARTICIPANT_NOT_FOUND_MESSAGE, { rule: "attendance_participant_unknown" });
  }

  const result = await tx.query<{
    capacity: string;
    season_membership_id: string | null;
    person_id: string | null;
  }>(
    `select capacity::text as capacity, season_membership_id, person_id
       from (
         select capacity, season_membership_id, person_id
           from public.invitations where event_id = $1
         union all
         select capacity, season_membership_id, person_id
           from public.attendance_records where event_id = $1
       ) participants
      where capacity::text = $2
        and coalesce(season_membership_id, person_id)::text = $3
      limit 1`,
    [eventId, capacity, anchorId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new NotFound(PARTICIPANT_NOT_FOUND_MESSAGE, { rule: "attendance_participant_unknown" });
  }

  return {
    capacity: row.capacity,
    membershipId: row.season_membership_id,
    personId: row.person_id,
  };
}

/**
 * Mints the person, their contact points and their recruitment prospect, and
 * returns the anchor the attendance row hangs off.
 *
 * All three in the caller's transaction, so a walk-on is one atomic act: there
 * is no state in which the club has a person nobody is following up, or a
 * prospect who was never at anything.
 *
 * `season_id` comes from the **event**, not from "the open season". They are
 * the same row today, and the event's is the one this person is actually
 * connected to — if the club ever runs an event outside the open season, a
 * prospect filed against the wrong one would be a prospect nobody finds.
 */
async function mintWalkUpProspect(
  tx: Tx,
  event: EventDetail,
  input: { givenName: string; familyName: string; phone: string; email: string | null },
): Promise<ResolvedTarget> {
  const person = await tx.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [input.givenName, input.familyName],
  );
  const personId = person.rows[0].id;

  // The phone is preferred because it is the one the club insisted on and the
  // one somebody will actually use. `normalised_value` stays null for the same
  // reason it does at intake: normalisation is a separate, reversible step, and
  // a phone-format policy does not belong beside a pitch.
  await tx.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
     values ($1::uuid, 'phone', $2, true, 'walk-on attendance')`,
    [personId, input.phone],
  );

  if (input.email !== null) {
    await tx.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1::uuid, 'email', $2, false, 'walk-on attendance')`,
      [personId, input.email],
    );
  }

  // `identified` is the honest status: somebody turned up and gave a number.
  // Nothing about that says they have engaged or committed, and the schema
  // requires a date for either of those. `source` records where they came from
  // in the club's own words, because "walk-on" and the event name are what
  // whoever picks this up next will recognise.
  await tx.query(
    `insert into public.recruitment_prospects
       (person_id, season_id, status, source, first_contact_on)
     values ($1::uuid, $2::uuid, 'identified', $3, $4::date)`,
    [personId, event.seasonId, `Walk-on at ${event.name}`, event.scheduledOn],
  );

  return { capacity: "recruit", membershipId: null, personId };
}

/** Trims, and refuses a field the walk-on form requires. */
function requireWalkUpField(value: string, message: string, rule: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") throw new ConstraintViolated(message, { rule: `walk_up_${rule}_required` });
  return trimmed;
}

/**
 * Shape checks as forgiving as LAN-74's intake, and for the same recorded
 * reason: the club's real files contain a reversed top-level domain and a
 * number one digit short, `contact_points.raw_value` has no format constraint,
 * and a contact the club cannot store is a contact the club loses. So these
 * catch a slip at the keyboard — an address with no `@`, a number with no
 * digits — and let everything else through exactly as typed.
 */
function requirePhoneShape(value: string): void {
  if (value.replace(/\D/g, "").length < 7) {
    throw new ConstraintViolated(WALK_UP_PHONE_SHAPE, { rule: "walk_up_phone_shape" });
  }
}

function requireEmailShape(value: string): void {
  if (!/^[^\s@]+@[^\s@]+$/.test(value.trim())) {
    throw new ConstraintViolated(WALK_UP_EMAIL_SHAPE, { rule: "walk_up_email_shape" });
  }
}

const requireActor = actorRequirement("An attendance record has to name who recorded it.");

function requirePresence(presence: string): void {
  if (!isAttendancePresence(presence)) {
    throw new ConstraintViolated("Choose Present, Late, Excused or Absent.", {
      rule: "attendance_presence_unknown",
    });
  }
}

function asIsoString(value: Date | string | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value : value.toISOString();
}
