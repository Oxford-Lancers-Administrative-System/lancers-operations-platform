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

/**
 * The other refusal: approved, but the sheet has not opened yet.
 *
 * Separate from the message above because the step that lifts it is different,
 * and `docs/ux/standards.md` rule 4 asks a refusal to name that step.
 */
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
 * The latest committed value wins, and the row says whose it is — the
 * approved MVP behaviour. Made safe rather than merely likely by taking the
 * event lock first and then locking the attendance row itself: two recorders
 * saving the same person at the same instant serialise, and both audit rows
 * survive, in order.
 */
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

/**
 * Records somebody who turned up and was never invited — invariant P6 — and
 * puts them into recruitment. Decision history: docs/ux/tickets/LAN-80-attendance.md · docs/ux/tickets/LAN-205-walk-up-and-recruits-first.md.
 *
 * Writes three things and no fourth: the **person**, their **contact
 * points** (phone always, email when given), and a **recruitment prospect**
 * for the event's season at `identified`. No season membership — conversion
 * is the only route from prospect to member, and the schema enforces that.
 *
 * There is no walk-up column: `public.rsvp_attendance_mismatches` already
 * classifies an attendance record with no invitation as
 * `attended_without_invitation`, so the board cannot disagree with reality.
 *
 * Capacity is `recruit`, anchored to the person — not `guest`, and not
 * matched against an existing roster membership; a duplicate is
 * reconciliation's problem. LAN-205, packet amendment 1: the touchline checks
 * nothing else.
 *
 * The door's one send — LAN-205, corrected 2026-09-01 — is the verbal
 * read-back at the touchline, authorising exactly the signed, prefilled link
 * to the sign-up form (`recruit_welcome`); {@link authoriseWalkUpMessagingIn}
 * is the whole of that wiring. The phone is validated and normalised to
 * E.164 (`requirePhoneE164`) so that one send cannot fail on a malformed
 * number.
 */
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
    // `mintWalkUpProspect` always anchors a walk-up to a freshly minted
    // person, never a membership — `target.personId` is `string | null` only
    // because `ResolvedTarget` is shared with every other capacity.
    await authoriseWalkUpMessagingIn(tx, event, actorPersonId, target.personId as string);

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
 * The door's one send, wired end to end — the amendment to LAN-205, Brian
 * 2026-09-01: "a package that introduces a message builds the whole path for
 * it." Decision history: docs/ux/tickets/LAN-80-attendance.md · docs/ux/tickets/LAN-205-walk-up-and-recruits-first.md.
 *
 * Two acts, both inside the walk-up's own transaction so the recruit, their
 * consent and the cycle's jobs are one atomic write: records the opt-in
 * (`walk_up_read_back`), then declares the cycle's jobs
 * (`declareRecruitmentCycleJobsIn`, LAN-203) for whichever tracks are still
 * incomplete. Declaring a job is not sending one — `runMessagingSweep`'s own
 * scheduled sweep claims and dispatches it later.
 */
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

/**
 * Removes one attendance record.
 *
 * The only reason this exists: somebody can be recorded against an event they
 * were never at, and no value in the four states says "this row should not be
 * here". Deleting an observation is a real loss, so it is audited with the
 * value that was removed, and it is not offered as a way to change what
 * somebody did: that is what a correction is for.
 */
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
    // `event_status` is written as the literal `approved` rather than copied
    // from the event we read, so that this statement states the rule it is
    // relying on. If the event is not `approved` the composite foreign key has
    // nothing to point at and the insert is refused — which is why writing the
    // literal still holds invariant P5 here even though the check constraint
    // now also admits `cancelled`: a cancelled event has no `(id, 'approved')`
    // row to reference. The clock half was proved in `closedReasonFor`.
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

/**
 * The event, locked, and proved to have an open register.
 *
 * The lock is taken before the question is asked so that an operator cancelling
 * the event and a recorder saving a value cannot both proceed on a picture the
 * other is changing. The refusal is `InvalidTransition` rather than
 * `NotPermitted`: the recorder is allowed to do this, the event is not yet in a
 * state where there is anything to record.
 *
 * **It asks exactly the question the board asks**, through the same
 * `closedReasonFor` (`./shared`). That identity is the point rather than a
 * convenience: a screen that offers a sheet the save then refuses is the
 * defect LAN-152 fixed on the event page, and one rule written twice is how
 * it comes back.
 */
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

/**
 * Turns a posted key into an anchor, using only rows that already exist for
 * **this** event.
 *
 * A key naming somebody the event has neither invited nor recorded is a
 * `NotFound`, not a new participant: a posted `player:<any membership id>`
 * would otherwise write an attendance record for a person who was never at
 * the event, with whatever capacity the browser said it was.
 *
 * `event` is passed (rather than just `eventId`) so a recruitment event's
 * fallback below can read `seasonId` and `eventType` without a second round
 * trip — both callers already hold it, from `requireOpenRegister`.
 */
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

  // W12, D11's own fallback: a recruit shown on a recruitment event's sheet
  // because they are on the board this season, never because this event
  // invited or recorded them, has neither row above to be found by — the
  // exact gap `readAttendanceBoard`'s `RECRUIT_ROSTER_QUERY` fills for
  // reading. Recording their first attendance is the same gap on the write
  // side, so it asks the same table the board read from, narrowed to a
  // recruit this event could actually have shown: on the board, this season,
  // not `joined` or `void`. Anybody else — a key naming no such prospect —
  // still falls through to the refusal below.
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

/**
 * Mints the person, their contact points and their recruitment prospect, and
 * returns the anchor the attendance row hangs off.
 *
 * All three in the caller's transaction, so a walk-on is one atomic act: there
 * is no state in which the club has a person nobody is following up, or a
 * prospect who was never at anything.
 *
 * `season_id` comes from the **event**, not from "the open season" — they are
 * the same row today, and the event's is the one this person is actually
 * connected to.
 */
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

  // The phone is preferred because it is the one the club insisted on and the
  // one somebody will actually use. `raw_value` is exactly as typed, per that
  // column's own comment; `normalised_value` is the same number's E.164
  // digits, already validated by `requirePhoneE164` — mobile is mandatory at
  // this door precisely so `selectMobileNumber` (`src/lib/delivery/phone.ts`)
  // never has to guess at send time.
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

  // `identified` is the honest status: somebody turned up and gave a number.
  // Nothing about that says they have engaged or committed, and the schema
  // requires a date for either of those. `source` records where they came
  // from in the club's own words — Brian locked "walk-up" as the word,
  // 2026-08-31, and this string is what the recruit board's own Source column
  // shows, so it has to say it too.
  await tx.query(
    `insert into public.recruitment_prospects
       (person_id, season_id, status, source, first_contact_on)
     values ($1::uuid, $2::uuid, 'identified', $3, $4::date)`,
    [personId, event.seasonId, `Walk-up at ${event.name}`, event.scheduledOn],
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
 * Validates and normalises the walk-up's mobile number — Brian, 2026-09-01.
 *
 * Reuses the sign-up form's own shared validator (`person-validation.ts`'s
 * `validatePhoneNumber`, LAN-183) rather than re-deriving one, on the same
 * reasoning that module's own note gives: a wrong guess sends a working link
 * to a stranger, and this door's one send is exactly that link.
 *
 * Returns the E.164 digits (no `+`), stored as the phone contact point's
 * `normalised_value`; the raw text stays exactly as typed in `raw_value`,
 * unvalidated, per that column's own comment.
 */
function requirePhoneE164(value: string): string {
  const validation = validatePhoneNumber(value);
  if (!validation.valid || !validation.e164) {
    throw new ConstraintViolated(validation.message, { rule: `walk_up_${validation.rule}` });
  }
  return validation.e164;
}

/**
 * Shape check as forgiving as LAN-74's intake, and for the same recorded
 * reason: `contact_points.raw_value` has no format constraint, and a contact
 * the club cannot store is a contact the club loses. Catches only a slip at
 * the keyboard — an address with no `@`.
 */
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
