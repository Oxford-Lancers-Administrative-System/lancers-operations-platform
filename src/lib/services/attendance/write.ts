import "server-only";

import {
  ConstraintViolated,
  InvalidTransition,
  NotFound,
  withTransaction,
  type Tx,
} from "@/lib/db";
import { recordAudit } from "../audit";
import { actorRequirement } from "../actor";
import {
  isAttendancePresence,
  type AttendancePresence,
  type WalkUpInput,
} from "../attendance-vocabulary";
import { lockEventIn, type EventDetail } from "../events";
import { validatePhoneNumber } from "../person-validation";
import { declareRecruitmentCycleJobsIn } from "../recruitment-cycle";
import { personDisplayNameSql as displayName } from "../sql-text";
import { closedReasonFor, participantKey } from "./shared";

/**
 * Recording, correcting, walking-on and removing attendance — LAN-80, LAN-152,
 * LAN-205. Decision history: docs/ux/tickets/LAN-80-attendance.md · docs/ux/tickets/LAN-205-walk-up-and-recruits-first.md.
 */

export const ATTENDANCE_CLOSED_MESSAGE =
  "Attendance can only be recorded against an approved event.";

// The other refusal: approved, but not open yet — separate message since the step that lifts it differs (docs/ux/standards.md rule 4).
export const ATTENDANCE_TOO_EARLY_MESSAGE =
  "This event's register has not opened yet. It opens shortly before the event starts.";

export const PARTICIPANT_NOT_FOUND_MESSAGE =
  "That person is not on this event's list. Add them as a walk-up if they turned up uninvited.";

/** What one save committed, for the interface's Saved line. */
export interface RecordedAttendance {
  key: string;
  displayName: string;
  presence: AttendancePresence;
  recordedAt: string;
  recordedByName: string | null;
  previousPresence: AttendancePresence | null; // the value this replaced, or null when it is the first
}

interface ResolvedTarget {
  capacity: string;
  membershipId: string | null;
  personId: string | null;
}

// Records or corrects — the same function for both; the audit trail distinguishes them. Two
// recorders on one row serialise via the event lock then the attendance row's own lock.
export async function recordAttendance(
  actorPersonId: string,
  eventId: string,
  participantKeyValue: string,
  presence: AttendancePresence,
  now: Date = new Date(),
): Promise<RecordedAttendance> {
  requireActor(actorPersonId);
  requirePresence(presence);

  return withTransaction(async (tx) => {
    const event = await requireOpenRegister(tx, eventId, now);
    const target = await resolveParticipant(tx, event, participantKeyValue);

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
  "Enter a last name. A walk-up has to be findable afterwards.";

export const WALK_UP_PHONE_REQUIRED =
  "Enter a phone number. It is how the club follows this person up.";

const WALK_UP_EMAIL_SHAPE =
  "This does not look like an email address. Enter it as it was given, including the @, " +
  "or leave it blank.";

// Records somebody who turned up uninvited (invariant P6) and puts them into recruitment (LAN-205):
// person, contact points, a prospect at `identified` — no membership (conversion is the only
// route). Capacity `recruit`, anchored to the person, never matched to an existing roster row.
export async function recordWalkUpAttendance(
  actorPersonId: string,
  eventId: string,
  input: WalkUpInput,
  now: Date = new Date(),
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
  const phoneE164 = requirePhoneE164(phone);
  const email = input.email === null || input.email.trim() === "" ? null : input.email.trim();
  if (email !== null) requireEmailShape(email);

  return withTransaction(async (tx) => {
    const event = await requireOpenRegister(tx, eventId, now);
    const target = await mintWalkUpProspect(tx, event, {
      givenName,
      familyName,
      phone,
      phoneE164,
      email,
    });
    await authoriseWalkUpMessagingIn(tx, event, actorPersonId, target.personId as string); // always a freshly minted person, never a membership

    return writeAttendance(tx, {
      actorPersonId,
      event,
      target,
      presence: input.presence,
      action: "attendance.walk_up_recorded",
    });
  });
}

// The door's one send, wired end to end (LAN-205 amendment; see relocations.md). Records the opt-in,
// then declares the recruitment cycle's jobs (LAN-203); declaring is not sending — the sweep does that.
async function authoriseWalkUpMessagingIn(
  tx: Tx,
  event: EventDetail,
  actorPersonId: string,
  personId: string,
): Promise<void> {
  await tx.query(
    `insert into public.season_messaging_consents
       (person_id, season_id, state, source, changed_at, recorded_by_person_id)
     values ($1::uuid, $2::uuid, 'granted', 'walk_up_read_back', now(), $3::uuid)
     on conflict (person_id, season_id) do update
       set state = 'granted', source = excluded.source, changed_at = now(),
           recorded_by_person_id = excluded.recorded_by_person_id`,
    [personId, event.seasonId, actorPersonId],
  );

  await declareRecruitmentCycleJobsIn(tx, personId, event.seasonId);
}

// A real loss, so audited with the removed value; not a way to change what somebody did (that's a correction).
export async function removeAttendance(
  actorPersonId: string,
  eventId: string,
  participantKeyValue: string,
  now: Date = new Date(),
): Promise<{ key: string; removedPresence: AttendancePresence | null }> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const event = await requireOpenRegister(tx, eventId, now);
    const target = await resolveParticipant(tx, event, participantKeyValue);

    const removed = await tx.query<{ id: string; presence: string }>(
      // is not distinct from on both anchors, not =: exactly one is non-null (invariant P8), and = against the null one matches nothing
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

  const existing = await tx.query<{ id: string; presence: string }>( // locked before read, same reason as the event
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
    // event_status written as the literal 'approved', not copied from the read event — invariant P5.
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

// Locks the event before asking whether the register is open. InvalidTransition, not NotPermitted:
// the recorder may do this, the event just isn't in a state to record against (closedReasonFor).
async function requireOpenRegister(
  tx: Tx,
  eventId: string,
  now: Date = new Date(),
): Promise<EventDetail> {
  const event = await lockEventIn(tx, eventId);
  const closedReason = await closedReasonFor(tx, event, now);
  if (closedReason === null) return event;

  throw new InvalidTransition(
    closedReason === "not_approved" ? ATTENDANCE_CLOSED_MESSAGE : ATTENDANCE_TOO_EARLY_MESSAGE,
    {
      rule:
        closedReason === "not_approved"
          ? "attendance_records_require_an_approved_event"
          : "attendance_records_require_an_open_register",
    },
  );
}

// Turns a posted key into an anchor, using only rows that already exist for this event — a key
// naming nobody invited or recorded is NotFound, not a new participant (never trusts a posted capacity).
async function resolveParticipant(
  tx: Tx,
  event: EventDetail,
  key: string,
): Promise<ResolvedTarget> {
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
    [event.id, capacity, anchorId],
  );

  const row = result.rows[0];
  if (row) {
    return {
      capacity: row.capacity,
      membershipId: row.season_membership_id,
      personId: row.person_id,
    };
  }

  // W12/D11 fallback: a recruit shown only because they're on this season's board (RECRUIT_ROSTER_QUERY
  // in read.ts) has no row above to be found by — recording their first attendance hits the same
  // table the board read from, narrowed the same way. Anything else falls through to the refusal.
  if (capacity === "recruit" && event.eventType === "recruitment") {
    const prospect = await tx.query<{ person_id: string }>(
      `select person_id from public.recruitment_prospects
        where season_id = $1::uuid and person_id = $2::uuid
          and status not in ('joined', 'void')
        limit 1`,
      [event.seasonId, anchorId],
    );
    if (prospect.rows[0]) {
      return { capacity: "recruit", membershipId: null, personId: prospect.rows[0].person_id };
    }
  }

  throw new NotFound(PARTICIPANT_NOT_FOUND_MESSAGE, { rule: "attendance_participant_unknown" });
}

// Mints the person, contact points and recruitment prospect, all in the caller's transaction so a
// walk-on is one atomic act. season_id comes from the event, not "the open season".
async function mintWalkUpProspect(
  tx: Tx,
  event: EventDetail,
  input: {
    givenName: string;
    familyName: string;
    phone: string;
    phoneE164: string;
    email: string | null;
  },
): Promise<ResolvedTarget> {
  const person = await tx.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [input.givenName, input.familyName],
  );
  const personId = person.rows[0].id;

  // raw_value exactly as typed; normalised_value is the validated E.164 digits — mobile is
  // mandatory here so selectMobileNumber (src/lib/delivery/phone.ts) never has to guess at send time.
  await tx.query(
    `insert into public.contact_points
       (person_id, kind, raw_value, normalised_value, is_preferred, source)
     values ($1::uuid, 'phone', $2, $3, true, 'walk-on attendance')`,
    [personId, input.phone, input.phoneE164],
  );

  if (input.email !== null) {
    await tx.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1::uuid, 'email', $2, false, 'walk-on attendance')`,
      [personId, input.email],
    );
  }

  // 'identified' is the honest status — nothing here says engaged or committed. source is the
  // club's own word for it (Brian locked "walk-up", 2026-08-31), matching the board's Source column.
  await tx.query(
    `insert into public.recruitment_prospects
       (person_id, season_id, status, source, first_contact_on)
     values ($1::uuid, $2::uuid, 'identified', $3, $4::date)`,
    [personId, event.seasonId, `Walk-up at ${event.name}`, event.scheduledOn],
  );

  return { capacity: "recruit", membershipId: null, personId };
}

function requireWalkUpField(value: string, message: string, rule: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") throw new ConstraintViolated(message, { rule: `walk_up_${rule}_required` });
  return trimmed;
}

// Reuses the sign-up form's own validator (person-validation.ts, LAN-183) rather than re-deriving
// one — a wrong guess would send a working link to a stranger. Returns E.164 digits (no +).
function requirePhoneE164(value: string): string {
  const validation = validatePhoneNumber(value);
  if (!validation.valid || !validation.e164) {
    throw new ConstraintViolated(validation.message, { rule: `walk_up_${validation.rule}` });
  }
  return validation.e164;
}

// As forgiving as LAN-74's intake (contact_points.raw_value has no format constraint) — catches only a keyboard slip, no @.
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
