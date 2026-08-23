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
  SHOWED_PRESENCES,
  summariseAttendance,
  type AttendanceParticipant,
  type AttendancePresence,
  type AttendanceSummary,
  type WalkUpInput,
} from "./attendance-vocabulary";
import { isRegisterAvailable, isRegisterOpen, registerOpensAt } from "./attendance-window";
import { lockEventIn, readEventIn, type EventDetail } from "./events";
import { type EventStatus } from "./event-input";
import { personDisplayNameSql as displayName } from "./sql-text";

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
 *   * **Invariant P5** — attendance belongs to an event that is really going
 *     to have happened, and since LAN-151 occurrence is derived rather than
 *     asserted (D30). The rule is in two halves, deliberately. The database
 *     holds "the event is approved", with a cascading composite foreign key
 *     plus `check (event_status = 'approved')`, so it is true of every row in
 *     the table at every instant including rows written by a script that never
 *     called this module. Cancelling an event that carries attendance is
 *     refused by the same cascade.
 *
 *     The other half is the **clock**, which a check constraint cannot read, so
 *     it is enforced here: the register opens on D71's buffer before the event
 *     starts and never closes (D72), which `./attendance-window.ts` decides.
 *     Note that this is deliberately *not* "the date has passed" — a coach
 *     standing at the pitch as people arrive is the person this surface exists
 *     for, and refusing them until the evening is over would be a rule nobody
 *     asked for. That half is a genuine service-layer guarantee rather than a
 *     courtesy, which is why `requireOpenRegister` takes the row lock before
 *     asking.
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
  isShowedPresence,
  SHOWED_PRESENCES,
  summariseAttendance,
  type AttendanceParticipant,
  type AttendancePresence,
  type AttendanceSummary,
  type WalkUpInput,
} from "./attendance-vocabulary";

export {
  ATTENDANCE_REGISTER_BUFFER_HOURS,
  ATTENDANCE_REGISTER_BUFFER_MS,
  eventStartInstant,
  isRegisterAvailable,
  isRegisterOpen,
  registerOpensAt,
} from "./attendance-window";

/**
 * The stored status an event must be in for a register to exist at all.
 *
 * One value, and it is `approved` rather than `occurred`, because LAN-151
 * retired the occurrence assertion: a draft has no audience to take a register
 * of and a cancelled event did not happen, and nothing else is stored.
 *
 * **When** the register opens is a separate question, and it belongs to the
 * clock rather than to this constant — `./attendance-window.ts` opens it on
 * D71's buffer before the event starts, which is deliberately *before* the
 * event has happened. That is why no `hasOccurred` conjunct joins it here: a
 * coach with the sheet in front of them at kick-off is exactly who this
 * surface is for.
 */
export const ATTENDANCE_OPEN_STATUS: EventStatus = "approved";

export const ATTENDANCE_CLOSED_MESSAGE =
  "Attendance can only be recorded against an approved event.";

/**
 * The other refusal: approved, but the sheet has not opened yet.
 *
 * Separate from the message above because the step that lifts it is different,
 * and `docs/ux/standards.md` rule 4 asks a refusal to name that step. Neither
 * sentence describes the register as waiting for the event to be over, which is
 * what the previous one said and what D71 is not.
 */
export const ATTENDANCE_TOO_EARLY_MESSAGE =
  "This event's register has not opened yet. It opens shortly before the event starts.";

export const PARTICIPANT_NOT_FOUND_MESSAGE =
  "That person is not on this event's list. Add them as a walk-up if they turned up uninvited.";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Why a closed register is closed — LAN-152, reconciled to LAN-151's model.
 *
 * Two reasons, and the screen says different things for them, because
 * `docs/ux/standards.md` rule 4 requires a refused control to name the step
 * that lifts it and the two steps are not the same one. `not_approved` waits on
 * a person; `before_buffer` waits on the clock, and nobody can do anything
 * about it.
 *
 * It was `not_yet_asserted` while an occurrence assertion existed. Nothing
 * asserts occurrence any more (D30), so the state a register waits on is the
 * approval — which is also the only stored fact left that can withhold one.
 */
export type AttendanceClosedReason = "not_approved" | "before_buffer";

/** The board, and the event it belongs to. */
export interface AttendanceBoard {
  event: EventDetail;
  /**
   * Whether the register may be opened. Everything else renders UX-71 or UX-75.
   *
   * Two conditions, both of them the club's rule, since LAN-151 retired the
   * third. D71 says the register opens on a buffer before the event and D72
   * says it never closes — `./attendance-window.ts` holds the first, and
   * `closedReasonFor` below holds the second by treating a register with
   * anything recorded against it as one that is already open. What remains of
   * the stored half is the approval: `attendance_records_require_an_occurred_event`
   * was a check constraint and this branch's migration replaces it with
   * `attendance_records_require_an_approved_event`, which is the same conjunct
   * one state earlier.
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
 * Why this event's register is closed, or `null` because it is not — LAN-152.
 *
 * ## The buffer opens it; nothing closes it
 *
 * D72 is that the register never closes, and the third branch below is what
 * makes that literally true rather than nearly true. **A register with anything
 * recorded against it has already been opened**, whatever the clock now says
 * about the event's start, so the buffer cannot take it back.
 *
 * That is not a hypothetical tidy-up. It was found on the screen: the synthetic
 * season carries sessions recorded as having happened whose dates are still
 * ahead of today — an assertion invariant E5 permits and the seed makes — and
 * without this branch the product refused to show a coach a register they had
 * already filled in twenty-one names on. A rule that shuts a sheet somebody is
 * halfway through is the opposite of the one D72 asks for.
 *
 * The extra round trip is one `exists` and is taken only on the path that would
 * otherwise refuse.
 */
async function closedReasonFor(
  tx: Tx,
  event: EventDetail,
  now: Date,
): Promise<AttendanceClosedReason | null> {
  if (event.status !== ATTENDANCE_OPEN_STATUS) return "not_approved";
  if (isRegisterOpen(event, now)) return null;

  const saved = await tx.query<{ saved: boolean }>(
    "select exists (select 1 from public.attendance_records where event_id = $1) as saved",
    [event.id],
  );
  return isRegisterAvailable(event, saved.rows[0].saved, now) ? null : "before_buffer";
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

    /*
      D74, and the defect it exists to prevent — LAN-152.

      The board on `main` reported **zero recorded and thirty mismatches at the
      same time**, on every occurred event whose register nobody had opened.
      It is a counting fault rather than a display one, and it lives in one
      classification: `said_yes_no_attendance_recorded` fires per person, so a
      session nobody assessed came back as thirty separate accusations that
      thirty people had let the club down. An unrecorded event read as a bad
      one, which is the exact reading D74's two-state axis forbids.

      A mismatch is a **disagreement between two records**. Where the second
      record does not exist there is no disagreement — there is an absence, and
      the club already has a word for it: *not recorded*. So while nothing at
      all has been recorded against the event, no participant carries a
      mismatch and the count is zero. The moment somebody saves anything the
      sheet exists, and a person who said yes and is not on it is a genuine
      exception again — a partly-filled register still flags them.

      Suppressed **here** rather than in `public.rsvp_attendance_mismatches`
      deliberately. The view is the durable home for this rule and it should
      carry it, but the view is schema, and this mission's schema belongs to
      the status-and-occurrence migration package; two packages writing
      migrations at once is what the collision rules exist to prevent.

      Nothing else over-counts in the meantime, and the reason is now simpler
      than it was: **no code reads that view at all.** `weekly-report.ts` was
      its only caller and LAN-151 stopped it reading the view entirely, because
      the view derives occurrence against `now()` and a report about last March
      must not depend on today's date — it counts walk-ups straight off
      `attendance_records`. So the only reader this suppression protects is a
      future one.

      That makes moving the rule into the view a real follow-up rather than a
      tidy-up: a direct reader of `rsvp_attendance_mismatches` written after
      this package, and not looking here, would over-count every session nobody
      has taken a register for. It is recorded in the residual-risk section of
      pull request #72, which is the one that merges.
    */
    const registerSaved = rows.rows.some((row) => row.attendance_id !== null);

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
        mismatch: registerSaved ? (flagged.get(key) ?? null) : null,
      } satisfies AttendanceParticipant;
    });

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
 * approved event a fortnight away, and the event page has to print it. Reading
 * the board for it would make the numbers vanish exactly when they are most
 * useful.
 *
 * So it is five counts in one round trip rather than a `full outer join` and a
 * view read the page has no use for. `attendance.test.ts` pins this to
 * `summariseAttendance` over the board's own rows, on one event, because
 * `docs/ux/standards.md` rule 7 is about precisely this pair.
 *
 * ## What it does not do
 *
 * Judge. It reports `registerSaved` and leaves the difference between "nobody
 * came" and "nobody looked" to the two values, which is what D74 asks for and
 * what the packet means by "the application explains neither value in words".
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
  now: Date = new Date(),
): Promise<RecordedAttendance> {
  requireActor(actorPersonId);
  requirePresence(presence);

  return withTransaction(async (tx) => {
    const event = await requireOpenRegister(tx, eventId, now);
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
  requirePhoneShape(phone);
  const email = input.email === null || input.email.trim() === "" ? null : input.email.trim();
  if (email !== null) requireEmailShape(email);

  return withTransaction(async (tx) => {
    const event = await requireOpenRegister(tx, eventId, now);
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
 * The only reason this exists: somebody can be recorded against an event they
 * were never at — a walk-up entered twice, a name tapped by mistake — and no
 * value in the four states says "this row should not be here". Deleting an
 * observation is a real loss, so it is audited with the value that was removed,
 * and it is not offered as a way to change what somebody did: that is what a
 * correction is for.
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
 * The event, locked, and proved to have an open register.
 *
 * The lock is taken before the question is asked so that an operator cancelling
 * the event and a recorder saving a value cannot both proceed on a picture the
 * other is changing. The refusal is `InvalidTransition` rather than
 * `NotPermitted`: the recorder is allowed to do this, the event is not yet in a
 * state where there is anything to record.
 *
 * **It asks exactly the question the board asks**, through the same
 * `closedReasonFor`. That identity is the point rather than a convenience: a
 * screen that offers a sheet the save then refuses is the defect LAN-152 fixed
 * on the event page, and one rule written twice is how it comes back. So the
 * status half is `approved` — LAN-151 retired the occurrence assertion, and a
 * draft has no audience while a cancelled event did not happen — and the
 * timing half is D71's buffer, which opens the sheet *before* the event starts.
 *
 * The two refusals are named apart because the steps that lift them are not the
 * same one: an approval is a person's, and the buffer is only the clock's.
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
