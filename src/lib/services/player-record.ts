import "server-only";

import { isServiceError, withTransaction, type Tx } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import { isAttendancePresence, type AttendancePresence } from "./attendance-vocabulary";
import { derivedEventState, type DerivedEventState, type EventStatus } from "./event-input";
import {
  readMembership,
  type MembershipRecord,
  type MembershipStatus,
  type MembershipStatusEvent,
  type OnboardingItem,
} from "./membership";
import { readPersonRecord, type PersonRecord } from "./person-record";
import {
  readPositionOptions,
  type BluesValue,
  type FormalwearItemKey,
  type PositionOptions,
} from "./roster-board";

/**
 * The player record aggregate — `WP-player-record`, LAN-187, W6.
 *
 * ## Why this is a new module rather than an addition to an existing one
 *
 * The same reasoning `roster-board.ts`'s own module note gives for itself:
 * this package's collision domain is `src/app/operate/roster/[membershipId]/**`
 * and a fresh file that *reads* the substrate other packages already built —
 * `membership.ts` for the membership and its history, `person-record.ts` for
 * the durable person facts, `roster-board.ts` for the season's position
 * vocabulary — rather than editing any of them. Nothing here duplicates a
 * write path: every commit this page makes reuses `roster-board.ts`'s own
 * `commitPosition`, `commitJerseyNumbers`, `commitCoachGroup`,
 * `commitFormalwearItem`, `commitBlues`, `commitEligibility`,
 * `commitAvailability` and `commitEntry`, and `membership.ts`'s own
 * `setMembershipStatus` and `resolveOnboardingItem` — called from this
 * package's own `record-actions.ts`, never reimplemented.
 *
 * ## What this module adds that no existing read covers
 *
 * `listRosterBoard()` assembles the *whole current season's* board in one
 * pass and does not expose a single-membership read — this membership may
 * belong to a past, closed season (a departed or archived record from an
 * earlier year), which `listRosterBoard()` never reaches at all. This module
 * is the single-membership equivalent: the same seven board columns
 * (positions, jersey numbers, coach group, formalwear, Blues, eligibility,
 * availability), the season's jersey holder map, and the season's position
 * vocabulary, all scoped to *this membership's own season* rather than
 * whichever season happens to be current.
 *
 * Three facts this page states that neither existing read computes on its
 * own:
 *
 *   * **The Blues total across seasons** — already derived, unmodified, by
 *     `person-record.ts`'s `halfBlueCount` / `fullBlueCount`
 *     (`public.person_blues_totals`). This module adds nothing; it surfaces
 *     what `readPersonRecord()` already returns.
 *   * **Constitutional membership** — `public.constitutional_membership`,
 *     invariant I5, read directly by `season_membership_id` rather than
 *     reimplemented: admitted and paid, for this one season's membership.
 *   * **The person's other seasons** — every other `season_memberships` row
 *     for the same person, with that season's label, status, predominant Blue
 *     jersey number and Blues award, for the "Their other seasons" panel.
 */

export interface PlayerSeasonFacts {
  offencePosition: string | null;
  defencePosition: string | null;
  specialTeamsPosition: string | null;
  blueNumbers: string[];
  whiteNumbers: string[];
  coachGroup: string | null;
  formalwear: Record<FormalwearItemKey, boolean>;
  blues: BluesValue;
  /** `public.eligibility_status` for the `club_play` competition, or `null`. */
  eligibility: string | null;
  /** `public.availability_level`, or `null` when nothing has ever been recorded. */
  availability: string | null;
}

export interface JerseyHolders {
  blue: Record<string, string>;
  white: Record<string, string>;
}

export interface OtherSeasonSummary {
  membershipId: string;
  seasonId: string;
  seasonLabel: string;
  status: MembershipStatus;
  /** The predominant Blue-kit number, or `null` when none was ever issued. */
  blueJerseyNumber: string | null;
  blues: BluesValue;
}

/**
 * `public.invitations.status` — never `pending` on a row this module returns:
 * `readAttendanceHistoryIn` excludes it below, the same "sent" filter
 * `Q15-attendance`'s approved design applies.
 */
export type AttendanceInvitationStatus = "issued" | "responded" | "expired" | "cancelled";

/** `public.rsvp_value` — binary, no "maybe" (Requirement 5). */
export type AttendanceRsvp = "yes" | "no";

/**
 * One event this membership held a sent invitation for, this season —
 * `WP-player-record`'s Attendance band, `Q15-attendance`. Every event the
 * membership was actually asked about, whether or not it has an attendance
 * record yet.
 */
export interface AttendanceEvent {
  id: string;
  eventName: string;
  /** `YYYY-MM-DD`, or `null` on the rare approved event scheduled with no date yet. */
  date: string | null;
  isMandatory: boolean;
  invitationStatus: AttendanceInvitationStatus;
  /** `null` is `not recorded` — never blank, never defaulted. */
  rsvp: AttendanceRsvp | null;
  /**
   * `null` is no attendance record yet — an event that has not occurred, or an
   * invitation cancelled before one was taken. Never defaulted to `absent`: an
   * unrecorded event is a different fact from a recorded miss, and the score
   * this band shows excludes both for the same reason it reads this column
   * rather than the calendar or the invitation status.
   */
  attendance: AttendancePresence | null;
  /**
   * What the event itself looks like now — `derivedEventState()` in
   * `event-input.ts`, the same D30 derivation `/operate/events` already uses
   * for its own Status column and filter (Q-6). Nothing new is stored or
   * asserted: this is the event's own `status` and `scheduled_on`, read once
   * here rather than recomputed by the component (W1, Q-19).
   */
  eventStatus: DerivedEventState;
}

export interface PlayerRecordData {
  membershipId: string;
  personId: string;
  seasonId: string;
  seasonLabel: string;
  status: MembershipStatus;
  entry: string;
  confirmedOn: string | null;
  activatedOn: string | null;
  departedOn: string | null;
  expectedReturnOn: string | null;
  inactivityLabel: string | null;
  /** `public.constitutional_membership.is_constitutional_member`, this season. */
  isConstitutionalMember: boolean;
  onboardingItems: OnboardingItem[];
  outstandingRequired: OnboardingItem[];
  statusHistory: MembershipStatusEvent[];
  season: PlayerSeasonFacts;
  /** This membership's season's own vocabulary — never hardcoded (S3). */
  positionOptions: PositionOptions;
  /** Every current holder in this membership's season, both kits — never the filtered view. */
  jerseyHolders: JerseyHolders;
  otherSeasons: OtherSeasonSummary[];
  /**
   * Every event this membership had an invitation sent for, this season —
   * `Q15-attendance`. Displayed, never edited; Mission 2 owns the write path.
   */
  attendance: AttendanceEvent[];
  /** The full, unredacted person record. The caller redacts for the viewer's role. */
  person: PersonRecord;
}

const BOARD_ELIGIBILITY_COMPETITION = "club_play";

async function readSeasonFactsIn(
  tx: Tx,
  membershipId: string,
  seasonId: string,
): Promise<PlayerSeasonFacts> {
  const [positions, jersey, coachGroup, formalwear, blues, eligibility, availability] =
    await Promise.all([
      tx.query<{ side: string; code: string }>(
        `select pa.side::text as side, pos.code
           from public.position_assignments pa
           join public.positions pos on pos.id = pa.position_id
          where pa.season_membership_id = $1::uuid and pa.effective_to is null`,
        [membershipId],
      ),
      tx.query<{ kit: string; number: number }>(
        `select kit::text as kit, number
           from public.jersey_assignments
          where season_membership_id = $1::uuid and effective_to is null
          order by number`,
        [membershipId],
      ),
      tx.query<{ coach_group: string }>(
        `select coach_group from public.coach_group_assignments where season_membership_id = $1::uuid`,
        [membershipId],
      ),
      tx.query<{ item: string; ownership: string }>(
        `select item::text as item, ownership
           from public.formalwear_records
          where season_membership_id = $1::uuid`,
        [membershipId],
      ),
      tx.query<{ half_blue_awarded: boolean; full_blue_awarded: boolean }>(
        `select half_blue_awarded, full_blue_awarded
           from public.blues_awards
          where season_membership_id = $1::uuid`,
        [membershipId],
      ),
      tx.query<{ status: string }>(
        `select status::text as status
           from public.eligibility_records
          where season_membership_id = $1::uuid and competition = $2::public.competition_scope
            and effective_to is null`,
        [membershipId, BOARD_ELIGIBILITY_COMPETITION],
      ),
      tx.query<{ level: string }>(
        `select level::text as level from public.current_availability where season_membership_id = $1::uuid`,
        [membershipId],
      ),
    ]);

  let offencePosition: string | null = null;
  let defencePosition: string | null = null;
  let specialTeamsPosition: string | null = null;
  for (const row of positions.rows) {
    if (row.side === "offence") offencePosition = row.code;
    else if (row.side === "defence") defencePosition = row.code;
    else specialTeamsPosition = row.code;
  }

  const blueNumbers: string[] = [];
  const whiteNumbers: string[] = [];
  for (const row of jersey.rows) {
    (row.kit === "blue" ? blueNumbers : whiteNumbers).push(String(row.number));
  }

  const formalwearRecord: Record<FormalwearItemKey, boolean> = {
    tie: false,
    bowtie: false,
    socks: false,
  };
  for (const row of formalwear.rows) {
    formalwearRecord[row.item as FormalwearItemKey] = row.ownership !== "No";
  }

  const bluesRow = blues.rows[0];
  const bluesValue: BluesValue = bluesRow?.full_blue_awarded
    ? "Full"
    : bluesRow?.half_blue_awarded
      ? "Half"
      : "None";

  // Unreachable without the season's own vocabulary — never hardcoded (S3).
  void seasonId;

  return {
    offencePosition,
    defencePosition,
    specialTeamsPosition,
    blueNumbers,
    whiteNumbers,
    coachGroup: coachGroup.rows[0]?.coach_group ?? null,
    formalwear: formalwearRecord,
    blues: bluesValue,
    eligibility: eligibility.rows[0]?.status ?? null,
    availability: availability.rows[0]?.level ?? null,
  };
}

interface AttendanceEventRow {
  event_id: string;
  event_name: string;
  date: string | null;
  is_mandatory: boolean;
  invitation_status: string;
  rsvp: string | null;
  presence: string | null;
  event_status: string;
}

/**
 * The Attendance band's own read — `WP-player-record`'s correction round,
 * `Q15-attendance`. Brian ruled the prose stands: this season's RSVP and
 * attendance history renders here, read-only, from Mission 2's own tables.
 *
 * ## Every event with a *sent* invitation, this season
 *
 * `public.invitations.status <> 'pending'` is the whole filter — `pending`
 * never reached the player, so there is nothing yet to show them (the same
 * read `chore/roster-fidelity-attendance`'s approved mockup demonstrates).
 * `cancelled` and `expired` invitations stay rows: the invitation was sent,
 * whatever became of it afterwards.
 *
 * ## `rsvp` and `attendance` are two independent reads, never one derived
 * from the other (locked Requirement 7) — `public.current_rsvp` for the
 * standing answer, `public.attendance_records` for what was actually
 * observed. Neither implies the other, and either may be `null` while the
 * invitation itself is real.
 *
 * ## Scoring is the caller's job
 *
 * This function returns the raw rows only. `attendance-section.tsx` computes
 * the mandatory-attendance score against whichever rows the viewer's filters
 * currently show — "the score follows the filter" is a presentation rule,
 * not a second query.
 *
 * ## `eventStatus` is derived here, once, from the event's own date and status
 *
 * W1/Q-19: Brian's walkthrough found the table listing every invited event —
 * including ones that have not happened yet — above a score that only counts
 * occurred ones, so a correct number sat over a table that looked like it
 * contradicted it. Each row now carries `derivedEventState()`'s answer
 * (`event-input.ts`, D30, the same rule `/operate/events` already shows in its
 * own Status column), read against `todayInClubZone()` at the moment of the
 * read. No new column, no migration — the event's `status` and `scheduled_on`
 * are exactly what `events` already stores.
 */
async function readAttendanceHistoryIn(
  tx: Tx,
  membershipId: string,
  seasonId: string,
): Promise<AttendanceEvent[]> {
  const today = todayInClubZone();
  const result = await tx.query<AttendanceEventRow>(
    `select e.id as event_id, e.name as event_name,
            to_char(e.scheduled_on, 'YYYY-MM-DD') as date,
            e.is_mandatory,
            i.status::text as invitation_status,
            cr.response::text as rsvp,
            ar.presence::text as presence,
            e.status::text as event_status
       from public.invitations i
       join public.events e on e.id = i.event_id
       left join public.current_rsvp cr on cr.invitation_id = i.id
       left join public.attendance_records ar
         on ar.event_id = i.event_id and ar.season_membership_id = i.season_membership_id
      where i.season_membership_id = $1::uuid
        and i.season_id = $2::uuid
        and i.status <> 'pending'
      order by e.scheduled_on desc nulls last, e.name`,
    [membershipId, seasonId],
  );

  return result.rows.map((row) => ({
    id: row.event_id,
    eventName: row.event_name,
    date: row.date,
    isMandatory: row.is_mandatory,
    invitationStatus: row.invitation_status as AttendanceInvitationStatus,
    rsvp: row.rsvp === "yes" || row.rsvp === "no" ? row.rsvp : null,
    attendance: isAttendancePresence(row.presence) ? row.presence : null,
    eventStatus: derivedEventState(
      { status: row.event_status as EventStatus, scheduledOn: row.date },
      today,
    ),
  }));
}

/**
 * Every current jersey holder in this membership's season, both kits — built
 * from every membership in the season, never the filtered view, so a number
 * worn by somebody Departed or Archived is still shown as issued. The same
 * rule `roster-board.ts`'s own `jerseyHolders` follows, scoped here to one
 * season rather than assumed to be the current one.
 */
async function readJerseyHoldersIn(tx: Tx, seasonId: string): Promise<JerseyHolders> {
  const result = await tx.query<{
    kit: string;
    number: number;
    given_name: string;
    family_name: string | null;
  }>(
    `select ja.kit::text as kit, ja.number, p.given_name, p.family_name
       from public.jersey_assignments ja
       join public.season_memberships sm on sm.id = ja.season_membership_id
       join public.people p on p.id = sm.person_id
      where ja.season_id = $1::uuid and ja.effective_to is null`,
    [seasonId],
  );

  const holders: JerseyHolders = { blue: {}, white: {} };
  for (const row of result.rows) {
    const name = row.family_name ? `${row.given_name} ${row.family_name}` : row.given_name;
    const target = row.kit === "blue" ? holders.blue : holders.white;
    target[String(row.number)] = name;
  }
  return holders;
}

async function readConstitutionalMembershipIn(tx: Tx, membershipId: string): Promise<boolean> {
  const result = await tx.query<{ is_constitutional_member: boolean }>(
    `select is_constitutional_member
       from public.constitutional_membership
      where season_membership_id = $1::uuid`,
    [membershipId],
  );
  return result.rows[0]?.is_constitutional_member ?? false;
}

async function readOtherSeasonsIn(
  tx: Tx,
  personId: string,
  membershipId: string,
): Promise<OtherSeasonSummary[]> {
  const result = await tx.query<{
    season_membership_id: string;
    season_id: string;
    season_label: string;
    status: MembershipStatus;
    blue_jersey_number: number | null;
    half_blue_awarded: boolean | null;
    full_blue_awarded: boolean | null;
  }>(
    `select sm.id as season_membership_id, s.id as season_id, s.label as season_label,
            sm.status::text as status,
            (select ja.number from public.jersey_assignments ja
              where ja.season_membership_id = sm.id and ja.kit = 'blue'
                and ja.effective_to is null and ja.is_predominant
              limit 1) as blue_jersey_number,
            ba.half_blue_awarded, ba.full_blue_awarded
       from public.season_memberships sm
       join public.seasons s on s.id = sm.season_id
       left join public.blues_awards ba on ba.season_membership_id = sm.id
      where sm.person_id = $1::uuid and sm.id <> $2::uuid
      order by s.starts_on desc nulls last, s.label desc`,
    [personId, membershipId],
  );

  return result.rows.map((row) => ({
    membershipId: row.season_membership_id,
    seasonId: row.season_id,
    seasonLabel: row.season_label,
    status: row.status,
    blueJerseyNumber: row.blue_jersey_number === null ? null : String(row.blue_jersey_number),
    blues: row.full_blue_awarded ? "Full" : row.half_blue_awarded ? "Half" : "None",
  }));
}

async function readMilestonesIn(
  tx: Tx,
  membershipId: string,
): Promise<{ departedOn: string | null; expectedReturnOn: string | null }> {
  const result = await tx.query<{ departed_on: string | null; expected_return_on: string | null }>(
    `select to_char(departed_on, 'YYYY-MM-DD') as departed_on,
            to_char(expected_return_on, 'YYYY-MM-DD') as expected_return_on
       from public.season_memberships
      where id = $1::uuid`,
    [membershipId],
  );
  return {
    departedOn: result.rows[0]?.departed_on ?? null,
    expectedReturnOn: result.rows[0]?.expected_return_on ?? null,
  };
}

/**
 * A membership whose person was merged away — invariant I6, W1-09. The
 * `season_memberships` row still names the losing `people.id` (a merge
 * repoints no foreign key; it only marks the loser's own row), so this
 * membership resolves instead to wherever the survivor's own record for the
 * *same season* lives, or to the survivor's person record when they never
 * held one.
 */
export interface PlayerRecordRedirect {
  kind: "redirect";
  href: string;
}

export interface PlayerRecordFound {
  kind: "record";
  data: PlayerRecordData;
}

export type PlayerRecordResult = PlayerRecordFound | PlayerRecordRedirect;

async function survivorRedirectIn(tx: Tx, personId: string, seasonId: string): Promise<string> {
  const survivor = await tx.query<{ merged_into_person_id: string | null }>(
    `select merged_into_person_id from public.people where id = $1::uuid`,
    [personId],
  );
  const survivorPersonId = survivor.rows[0]?.merged_into_person_id;
  if (!survivorPersonId) {
    // The person genuinely does not exist rather than having been merged —
    // the caller's own `readMembership` already proved the membership row
    // exists, so this would be a data inconsistency rather than a normal
    // outcome; there is nothing better to resolve to than the roster.
    return "/operate/roster";
  }

  const survivorMembership = await tx.query<{ id: string }>(
    `select id from public.season_memberships where person_id = $1::uuid and season_id = $2::uuid`,
    [survivorPersonId, seasonId],
  );
  const membershipId = survivorMembership.rows[0]?.id;
  return membershipId ? `/operate/roster/${membershipId}` : `/operate/people/${survivorPersonId}`;
}

/**
 * One player's whole record for one season — everything W6 states as fact,
 * assembled from the substrate this mission already built rather than a
 * second copy of any of it.
 *
 * Not atomic across every sub-read: this is a display page, not a write path,
 * and the membership, the person and the season facts are independently
 * consistent reads rather than one locked snapshot — the same posture
 * `people-directory.ts`'s combined reads take, and never a concern for a
 * screen that renders and reloads rather than computing a balance.
 */
export async function readPlayerRecord(membershipId: string): Promise<PlayerRecordResult> {
  const membership: MembershipRecord = await readMembership(membershipId);

  let person: PersonRecord;
  try {
    person = await readPersonRecord(membership.personId);
  } catch (error) {
    if (
      isServiceError(error) &&
      error.kind === "not_found" &&
      error.rule === "person_merged_away"
    ) {
      const href = await withTransaction((tx) =>
        survivorRedirectIn(tx, membership.personId, membership.seasonId),
      );
      return { kind: "redirect", href };
    }
    throw error;
  }

  const [
    seasonFacts,
    jerseyHolders,
    positionOptions,
    isConstitutionalMember,
    otherSeasons,
    milestones,
    attendance,
  ] = await withTransaction(async (tx) =>
    Promise.all([
      readSeasonFactsIn(tx, membershipId, membership.seasonId),
      readJerseyHoldersIn(tx, membership.seasonId),
      readPositionOptions(membership.seasonId),
      readConstitutionalMembershipIn(tx, membershipId),
      readOtherSeasonsIn(tx, membership.personId, membershipId),
      readMilestonesIn(tx, membershipId),
      readAttendanceHistoryIn(tx, membershipId, membership.seasonId),
    ]),
  );

  const data: PlayerRecordData = {
    membershipId: membership.membershipId,
    personId: membership.personId,
    seasonId: membership.seasonId,
    seasonLabel: membership.seasonLabel,
    status: membership.status,
    entry: membership.entry,
    confirmedOn: membership.confirmedOn,
    activatedOn: membership.activatedOn,
    departedOn: milestones.departedOn,
    expectedReturnOn: milestones.expectedReturnOn,
    inactivityLabel: membership.inactivityLabel,
    isConstitutionalMember,
    onboardingItems: membership.onboardingItems,
    outstandingRequired: membership.outstandingRequired,
    statusHistory: membership.statusHistory,
    season: seasonFacts,
    positionOptions,
    jerseyHolders,
    otherSeasons,
    attendance,
    person,
  };

  return { kind: "record", data };
}
