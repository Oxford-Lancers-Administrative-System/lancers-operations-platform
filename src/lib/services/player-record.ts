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
import {
  readOnboardingActivityLogBySectionIn,
  type OnboardingActivityKind,
} from "./onboarding-activity-log";
import { readOnboardingSendStatusIn, type OnboardingSendStatus } from "./onboarding-chase";
import type { OnboardingActorKind } from "./onboarding-item-history";
import { readPersonRecord, type PersonRecord } from "./person-record";
import {
  readPositionOptions,
  type BluesValue,
  type FormalwearItemKey,
  type PositionOptions,
} from "./roster-board";

/**
 * The player record aggregate — `WP-player-record`, LAN-187, W6. Reads only:
 * assembles `membership.ts`, `person-record.ts` and `roster-board.ts`'s own
 * substrate for one membership's season, rather than duplicating any write
 * path. The single-membership equivalent of `listRosterBoard()`, scoped to
 * this membership's own season (which may not be the current one).
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

interface JerseyHolders {
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

/** `public.invitations.status` — never `pending` on a row this module returns (Q15-attendance). */
type AttendanceInvitationStatus = "issued" | "responded" | "expired" | "cancelled";

/** `public.rsvp_value` — binary, no "maybe" (Requirement 5). */
type AttendanceRsvp = "yes" | "no";

/** One event this membership held a sent invitation for, this season — `Q15-attendance`. */
export interface AttendanceEvent {
  id: string;
  eventName: string;
  /** `YYYY-MM-DD`, or `null` on the rare approved event scheduled with no date yet. */
  date: string | null;
  isMandatory: boolean;
  invitationStatus: AttendanceInvitationStatus;
  /** `null` is `not recorded` — never blank, never defaulted. */
  rsvp: AttendanceRsvp | null;
  /** `null` is no attendance record yet; never defaulted to `absent`. */
  attendance: AttendancePresence | null;
  /** `derivedEventState()` (D30), the same rule `/operate/events` shows in its own Status column. */
  eventStatus: DerivedEventState;
}

/** One recorded transition of one onboarding item, with its actor named — `REQ-item-history`, W6. */
export interface OnboardingItemHistoryEntry {
  fromStatus: OnboardingItem["status"] | null;
  toStatus: OnboardingItem["status"];
  occurredAt: Date;
  actorKind: OnboardingActorKind;
  /** `null` for `actorKind: "system"`, or a person no longer resolvable. */
  actorName: string | null;
  reason: string | null;
}

/** One onboarding item, with its full append-only history attached — oldest first. */
export interface OnboardingItemDisplay extends OnboardingItem {
  history: OnboardingItemHistoryEntry[];
}

/** One entry in the sectioned activity log, with its actor named — `REQ-activity-log`, W6. */
interface OnboardingActivityEntryDisplay {
  kind: OnboardingActivityKind;
  channel: string;
  who: string;
  occurredAt: Date;
}

export interface OnboardingActivitySection {
  section: string;
  entries: OnboardingActivityEntryDisplay[];
}

/** Every onboarding item's history, batched in one query rather than one per item, joined for the actor's name. */
async function readOnboardingItemHistoryDisplayIn(
  tx: Tx,
  items: readonly OnboardingItem[],
): Promise<Map<string, OnboardingItemHistoryEntry[]>> {
  const map = new Map<string, OnboardingItemHistoryEntry[]>();
  if (items.length === 0) return map;

  const result = await tx.query<{
    onboarding_item_id: string;
    from_status: OnboardingItem["status"] | null;
    to_status: OnboardingItem["status"];
    occurred_at: Date;
    actor_kind: OnboardingActorKind;
    reason: string | null;
    actor_name: string | null;
  }>(
    `select h.onboarding_item_id,
            h.from_status::text as from_status, h.to_status::text as to_status,
            h.occurred_at, h.actor_kind::text as actor_kind, h.reason,
            a.given_name || coalesce(' ' || a.family_name, '') as actor_name
       from public.onboarding_item_history h
       left join public.people a on a.id = h.actor_person_id
      where h.onboarding_item_id = any($1::uuid[])
      order by h.onboarding_item_id, h.occurred_at asc`,
    [items.map((item) => item.id)],
  );

  for (const row of result.rows) {
    const entry: OnboardingItemHistoryEntry = {
      fromStatus: row.from_status,
      toStatus: row.to_status,
      occurredAt: row.occurred_at,
      actorKind: row.actor_kind,
      actorName: row.actor_name,
      reason: row.reason,
    };
    const bucket = map.get(row.onboarding_item_id);
    if (bucket) bucket.push(entry);
    else map.set(row.onboarding_item_id, [entry]);
  }
  return map;
}

/**
 * The sectioned activity log, actor names resolved via one extra batched
 * lookup. Ordered newest first, both across sections and within one — the
 * whole season, no pagination.
 */
async function readOnboardingActivityLogDisplayIn(
  tx: Tx,
  membershipId: string,
): Promise<OnboardingActivitySection[]> {
  const bySection = await readOnboardingActivityLogBySectionIn(tx, membershipId);

  const actorIds = Array.from(
    new Set(
      bySection.flatMap((section) =>
        section.entries
          .map((entry) => entry.actorPersonId)
          .filter((id): id is string => id !== null),
      ),
    ),
  );
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const result = await tx.query<{ id: string; name: string }>(
      `select id, given_name || coalesce(' ' || family_name, '') as name
         from public.people
        where id = any($1::uuid[])`,
      [actorIds],
    );
    for (const row of result.rows) names.set(row.id, row.name);
  }

  return bySection
    .map(({ section, entries }) => ({
      section,
      entries: entries
        .map((entry) => ({
          kind: entry.kind,
          channel: entry.channel,
          who:
            (entry.actorPersonId ? names.get(entry.actorPersonId) : null) ??
            entry.actorLabel ??
            "the club",
          occurredAt: entry.occurredAt,
        }))
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()),
    }))
    .sort((a, b) => {
      const latest = (section: OnboardingActivitySection) =>
        section.entries[0]?.occurredAt.getTime() ?? 0;
      return latest(b) - latest(a);
    });
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
  onboardingItems: OnboardingItemDisplay[];
  outstandingRequired: OnboardingItem[];
  /** `REQ-activity-log`: every ask and every answer, grouped by section, newest first. */
  activityLog: OnboardingActivitySection[];
  statusHistory: MembershipStatusEvent[];
  season: PlayerSeasonFacts;
  /** This membership's season's own vocabulary — never hardcoded (S3). */
  positionOptions: PositionOptions;
  /** Every current holder in this membership's season, both kits — never the filtered view. */
  jerseyHolders: JerseyHolders;
  otherSeasons: OtherSeasonSummary[];
  /** Every event this membership had an invitation sent for, this season — `Q15-attendance`. */
  attendance: AttendanceEvent[];
  /** The full, unredacted person record. The caller redacts for the viewer's role. */
  person: PersonRecord;
  /** What the **Send onboarding questionnaire** control shows and whether it may be pressed — LAN-266. */
  send: OnboardingSendStatus;
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
 * The Attendance band's own read — `Q15-attendance`. Every event with a
 * *sent* invitation this season (`status <> 'pending'`); `rsvp` and
 * `attendance` are two independent reads, never one derived from the other
 * (locked Requirement 7). Returns raw rows only — scoring is the caller's
 * job. `eventStatus` is `derivedEventState()`'s answer (D30), read against
 * `todayInClubZone()` at read time.
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

/** Every current jersey holder in this membership's season, both kits — never the filtered view. */
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

/** A membership whose person was merged away — invariant I6, W1-09. Resolves to the survivor's own record for the same season, or their person record. */
interface PlayerRecordRedirect {
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
    // Data inconsistency, not a normal outcome — nothing better to resolve to than the roster.
    return "/operate/roster";
  }

  const survivorMembership = await tx.query<{ id: string }>(
    `select id from public.season_memberships where person_id = $1::uuid and season_id = $2::uuid`,
    [survivorPersonId, seasonId],
  );
  const membershipId = survivorMembership.rows[0]?.id;
  return membershipId ? `/operate/roster/${membershipId}` : `/operate/people/${survivorPersonId}`;
}

/** One player's whole record for one season, assembled from existing substrate. Not atomic across sub-reads — a display page, not a write path. */
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
    itemHistoryByItem,
    activityLog,
    send,
  ] = await withTransaction(async (tx) =>
    Promise.all([
      readSeasonFactsIn(tx, membershipId, membership.seasonId),
      readJerseyHoldersIn(tx, membership.seasonId),
      readPositionOptions(membership.seasonId),
      readConstitutionalMembershipIn(tx, membershipId),
      readOtherSeasonsIn(tx, membership.personId, membershipId),
      readMilestonesIn(tx, membershipId),
      readAttendanceHistoryIn(tx, membershipId, membership.seasonId),
      readOnboardingItemHistoryDisplayIn(tx, membership.onboardingItems),
      readOnboardingActivityLogDisplayIn(tx, membershipId),
      readOnboardingSendStatusIn(tx, membershipId),
    ]),
  );

  const onboardingItems: OnboardingItemDisplay[] = membership.onboardingItems.map((item) => ({
    ...item,
    history: itemHistoryByItem.get(item.id) ?? [],
  }));

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
    onboardingItems,
    outstandingRequired: membership.outstandingRequired,
    activityLog,
    statusHistory: membership.statusHistory,
    season: seasonFacts,
    positionOptions,
    jerseyHolders,
    otherSeasons,
    attendance,
    person,
    send,
  };

  return { kind: "record", data };
}
