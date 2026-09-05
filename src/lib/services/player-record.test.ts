// @vitest-environment node
/**
 * The player record's read path against the real local database. LAN-187,
 * `WP-player-record`.
 *
 * The suite mints its own person and two season memberships (this season and
 * a past one), tagged with a marker unique to this file, and cleans up every
 * child row it wrote in dependency order in `afterAll` — the same discipline
 * `roster-board.test.ts` documents at length: these are commits, not
 * rollbacks, because a rollback test cannot prove a real supersede sequence
 * or a merge redirect actually committed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import { generateOnboardingItems, resolveOnboardingItem } from "./membership";
import { recordOnboardingActivityIn } from "./onboarding-activity-log";
import { resolveOpenSeason } from "./roster";
import { commitBlues, commitCoachGroup, commitPosition, readPositionOptions } from "./roster-board";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import { readPlayerRecord, type PlayerRecordFound } from "./player-record";

const MARKER = "LAN187Record";

let observer: Client;
let actorPersonId: string;
let seasonId: string;
let pastSeasonId: string;
let personId: string;
let membershipId: string;
let pastMembershipId: string;

async function cleanUp(): Promise<void> {
  for (const id of [membershipId, pastMembershipId]) {
    // `onboarding_item_history` restricts deletion of the item it names, and
    // `onboarding_items` in turn restricts deletion of the membership it
    // belongs to — both have to go before `season_memberships` does, below.
    await observer.query(
      `delete from public.onboarding_item_history
        where onboarding_item_id in (
          select id from public.onboarding_items where season_membership_id = $1::uuid)`,
      [id],
    );
    await observer.query(
      `delete from public.onboarding_activity_log where season_membership_id = $1::uuid`,
      [id],
    );
    await observer.query(
      `delete from public.onboarding_items where season_membership_id = $1::uuid`,
      [id],
    );
    await observer.query(
      `delete from public.position_assignments where season_membership_id = $1::uuid`,
      [id],
    );
    await observer.query(
      `delete from public.jersey_assignments where season_membership_id = $1::uuid`,
      [id],
    );
    await observer.query(
      `delete from public.coach_group_assignments where season_membership_id = $1::uuid`,
      [id],
    );
    await observer.query(`delete from public.blues_awards where season_membership_id = $1::uuid`, [
      id,
    ]);
    await observer.query(
      `delete from public.eligibility_records where season_membership_id = $1::uuid`,
      [id],
    );
    await observer.query(
      `delete from public.availability_statuses where season_membership_id = $1::uuid`,
      [id],
    );
    await observer.query(
      `delete from public.season_membership_status_events where season_membership_id = $1::uuid`,
      [id],
    );
    await observer.query(`delete from public.audit_events where entity_id = $1::uuid`, [id]);
  }
  await observer.query(`delete from public.season_memberships where id = any($1::uuid[])`, [
    [membershipId, pastMembershipId],
  ]);
  await observer.query(`delete from public.people where id = $1::uuid`, [personId]);
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);

  const season = await withTransaction((tx) => resolveOpenSeason(tx));
  seasonId = season.id;

  const past = await observer.query<{ id: string }>(
    `select id from public.seasons where label = '2025-26'`,
  );
  pastSeasonId = past.rows[0].id;

  const person = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [MARKER, "Fixture"],
  );
  personId = person.rows[0].id;

  const membership = await observer.query<{ id: string }>(
    `insert into public.season_memberships (person_id, season_id, status, entry, activated_on)
     values ($1::uuid, $2::uuid, 'active', 'new', current_date) returning id`,
    [personId, seasonId],
  );
  membershipId = membership.rows[0].id;

  const pastMembership = await observer.query<{ id: string }>(
    `insert into public.season_memberships (person_id, season_id, status, entry, activated_on)
     values ($1::uuid, $2::uuid, 'archived', 'new', current_date) returning id`,
    [personId, pastSeasonId],
  );
  pastMembershipId = pastMembership.rows[0].id;

  await observer.query(
    `insert into public.jersey_assignments (season_membership_id, season_id, kit, number, effective_from, is_predominant)
     values ($1::uuid, $2::uuid, 'blue', 42, current_date, true)`,
    [pastMembershipId, pastSeasonId],
  );
  await observer.query(
    `insert into public.blues_awards (season_membership_id, season_id, half_blue_awarded, full_blue_awarded, awarded_on)
     values ($1::uuid, $2::uuid, true, false, current_date)`,
    [pastMembershipId, pastSeasonId],
  );
});

afterAll(async () => {
  await cleanUp();
  await observer.end();
  await closePool();
});

describe("readPlayerRecord — assembling one season's board facts for one membership", () => {
  it("carries the committed position, coach group and Blues for this membership's own season", async () => {
    const options = await readPositionOptions(seasonId);
    const offenceCode = options.offence[0]?.code;
    expect(offenceCode).toBeTruthy();

    await commitPosition({
      actorPersonId,
      membershipId,
      seasonId,
      column: "offence",
      code: offenceCode!,
    });
    await commitCoachGroup({ actorPersonId, membershipId, seasonId, coachGroup: "Offense" });
    await commitBlues({ actorPersonId, membershipId, seasonId, value: "Full" });

    const result = await readPlayerRecord(membershipId);
    expect(result.kind).toBe("record");
    const data = (result as PlayerRecordFound).data;

    expect(data.season.offencePosition).toBe(offenceCode);
    expect(data.season.coachGroup).toBe("Offense");
    expect(data.season.blues).toBe("Full");
    expect(data.season.defencePosition).toBeNull();
    expect(data.positionOptions.offence.length).toBeGreaterThan(0);
  });

  it("reads the season's own vocabulary rather than a fixed list (S3)", async () => {
    const result = await readPlayerRecord(membershipId);
    const data = (result as PlayerRecordFound).data;
    expect(data.positionOptions.specialTeams.map((option) => option.code).sort()).toEqual([
      "FG",
      "KO",
      "KR",
      "PUNT",
    ]);
  });

  it("names this membership's own season's jersey holders, not another season's", async () => {
    const result = await readPlayerRecord(membershipId);
    const data = (result as PlayerRecordFound).data;
    // The number minted onto the *past* season's fixture must not leak into
    // this season's holder map.
    expect(data.jerseyHolders.blue["42"]).toBeUndefined();
  });

  it("lists the person's other seasons, with that season's predominant Blue number and award", async () => {
    const result = await readPlayerRecord(membershipId);
    const data = (result as PlayerRecordFound).data;
    const other = data.otherSeasons.find((season) => season.membershipId === pastMembershipId);
    expect(other).toBeDefined();
    expect(other?.status).toBe("archived");
    expect(other?.blueJerseyNumber).toBe("42");
    expect(other?.blues).toBe("Half");
  });

  it("derives the Blues total across seasons from person-record.ts, unmodified", async () => {
    const result = await readPlayerRecord(membershipId);
    const data = (result as PlayerRecordFound).data;
    // The Half Blue minted on the past-season fixture, plus the Full Blue the
    // earlier test in this file committed onto the current-season membership
    // — both belong to the same person, and the total is across seasons.
    expect(data.person.halfBlueCount).toBe(1);
    expect(data.person.fullBlueCount).toBe(1);
  });

  it("reports constitutional membership from the existing view, for this season", async () => {
    const result = await readPlayerRecord(membershipId);
    const data = (result as PlayerRecordFound).data;
    // No subscription item exists for this fixture membership, so it reads
    // false — admitted but not (yet) paid.
    expect(data.isConstitutionalMember).toBe(false);
  });

  it("throws NotFound for a membership that does not exist", async () => {
    await expect(readPlayerRecord("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});

describe("readPlayerRecord — Attendance band, Q15-attendance", () => {
  let attendedEventId: string;
  let cancelledEventId: string;
  let pendingEventId: string;
  let expiredEventId: string;
  const eventIds: string[] = [];
  const audienceMemberIds: string[] = [];
  const invitationIds: string[] = [];

  async function insertEvent(name: string, isMandatory: boolean): Promise<string> {
    const event = await observer.query<{ id: string }>(
      `insert into public.events (
         season_id, name, event_type, status, scheduled_on, is_mandatory,
         audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
       values ($1::uuid, $2, 'practice', 'approved', current_date - 7, $3,
               now(), $4::uuid, now(), $4::uuid)
       returning id`,
      [seasonId, name, isMandatory, actorPersonId],
    );
    const id = event.rows[0].id;
    eventIds.push(id);
    return id;
  }

  async function inviteMembership(eventId: string, status: string): Promise<string> {
    const audience = await observer.query<{ id: string }>(
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id, added_by_person_id)
       values ($1::uuid, $2::uuid, 'player', $3::uuid, $4::uuid) returning id`,
      [eventId, seasonId, membershipId, actorPersonId],
    );
    audienceMemberIds.push(audience.rows[0].id);

    const invitation = await observer.query<{ id: string }>(
      `insert into public.invitations (
         event_id, event_status, season_id, audience_member_id,
         capacity, season_membership_id, status,
         issued_at, cancelled_at)
       values ($1::uuid, 'approved', $2::uuid, $3::uuid, 'player', $4::uuid, $5::public.invitation_status,
               case when $5 = 'pending' then null else now() end,
               case when $5 = 'cancelled' then now() else null end)
       returning id`,
      [eventId, seasonId, audience.rows[0].id, membershipId, status],
    );
    invitationIds.push(invitation.rows[0].id);
    return invitation.rows[0].id;
  }

  beforeAll(async () => {
    // Attended: mandatory, invited, RSVP'd yes, and Present is on file — the
    // ordinary scored-and-attended row.
    attendedEventId = await insertEvent(`${MARKER} attended`, true);
    const attendedInvitationId = await inviteMembership(attendedEventId, "responded");
    await observer.query(
      `insert into public.rsvp_responses (invitation_id, response, source, responded_at, recorded_by_person_id)
       values ($1::uuid, 'yes', 'operator', now(), $2::uuid)`,
      [attendedInvitationId, actorPersonId],
    );
    await observer.query(
      `insert into public.attendance_records (event_id, event_status, season_id, capacity, season_membership_id, presence, recorded_by_person_id)
       values ($1::uuid, 'approved', $2::uuid, 'player', $3::uuid, 'present', $4::uuid)`,
      [attendedEventId, seasonId, membershipId, actorPersonId],
    );

    // Cancelled: the invitation was sent and then cancelled before anyone
    // took a register — a row, with no RSVP and no attendance record.
    cancelledEventId = await insertEvent(`${MARKER} cancelled`, true);
    await inviteMembership(cancelledEventId, "cancelled");

    // Pending: never sent. Must not appear at all.
    pendingEventId = await insertEvent(`${MARKER} pending`, false);
    await inviteMembership(pendingEventId, "pending");

    // Expired: lapsed unanswered, but the event still happened and Absent was
    // recorded — attendance reads attendance, not the invitation's own status.
    expiredEventId = await insertEvent(`${MARKER} expired`, true);
    await inviteMembership(expiredEventId, "expired");
    await observer.query(
      `insert into public.attendance_records (event_id, event_status, season_id, capacity, season_membership_id, presence, recorded_by_person_id)
       values ($1::uuid, 'approved', $2::uuid, 'player', $3::uuid, 'absent', $4::uuid)`,
      [expiredEventId, seasonId, membershipId, actorPersonId],
    );
  });

  afterAll(async () => {
    await observer.query(`delete from public.attendance_records where event_id = any($1::uuid[])`, [
      eventIds,
    ]);
    await observer.query(
      `delete from public.rsvp_responses where invitation_id = any($1::uuid[])`,
      [invitationIds],
    );
    await observer.query(`delete from public.invitations where id = any($1::uuid[])`, [
      invitationIds,
    ]);
    await observer.query(`delete from public.event_audience_members where id = any($1::uuid[])`, [
      audienceMemberIds,
    ]);
    await observer.query(`delete from public.events where id = any($1::uuid[])`, [eventIds]);
  });

  it("lists only invitations actually sent, excluding a pending one", async () => {
    const result = await readPlayerRecord(membershipId);
    const data = (result as PlayerRecordFound).data;
    const ids = data.attendance.map((event) => event.id);
    expect(ids).toEqual(
      expect.arrayContaining([attendedEventId, cancelledEventId, expiredEventId]),
    );
    expect(ids).not.toContain(pendingEventId);
  });

  it("reads RSVP and attendance as two independent records, neither implying the other", async () => {
    const result = await readPlayerRecord(membershipId);
    const data = (result as PlayerRecordFound).data;
    const attended = data.attendance.find((event) => event.id === attendedEventId);
    expect(attended?.isMandatory).toBe(true);
    expect(attended?.rsvp).toBe("yes");
    expect(attended?.attendance).toBe("present");
  });

  // W1, Q-19: the Event status column reads a real derivation against the
  // database, not a client-side guess — `insertEvent()` schedules every
  // fixture event 7 days in the past and approved, so each row here is
  // genuinely `occurred` under `derivedEventState()`.
  it("derives Event status as occurred for a past, approved event (W1, Q-19)", async () => {
    const result = await readPlayerRecord(membershipId);
    const data = (result as PlayerRecordFound).data;
    const attended = data.attendance.find((event) => event.id === attendedEventId);
    const expired = data.attendance.find((event) => event.id === expiredEventId);
    expect(attended?.eventStatus).toBe("occurred");
    expect(expired?.eventStatus).toBe("occurred");
  });

  it("keeps a cancelled invitation as a row with no RSVP and no attendance record", async () => {
    const result = await readPlayerRecord(membershipId);
    const data = (result as PlayerRecordFound).data;
    const cancelled = data.attendance.find((event) => event.id === cancelledEventId);
    expect(cancelled).toBeDefined();
    expect(cancelled?.invitationStatus).toBe("cancelled");
    expect(cancelled?.rsvp).toBeNull();
    expect(cancelled?.attendance).toBeNull();
  });

  it("reads an expired invitation's real recorded attendance rather than treating expiry as a value", async () => {
    const result = await readPlayerRecord(membershipId);
    const data = (result as PlayerRecordFound).data;
    const expired = data.attendance.find((event) => event.id === expiredEventId);
    expect(expired).toBeDefined();
    expect(expired?.invitationStatus).toBe("expired");
    expect(expired?.rsvp).toBeNull();
    expect(expired?.attendance).toBe("absent");
  });
});

/**
 * `REQ-item-history` and `REQ-activity-log` — `WP-operator-record`, LAN-217.
 * `onboarding-item-history.ts` and `onboarding-activity-log.ts` are the
 * substrate's own writer and reader (LAN-214), already proved append-only and
 * correctly grouped in their own suites and in `membership.test.ts`. What is
 * new here, and what this file is the one place to prove against a real
 * database, is the actor-name join `readPlayerRecord` adds on top of both.
 */
describe("readPlayerRecord — per-item history and the activity log, named", () => {
  it("attaches every real transition to its onboarding item, with the actor's name resolved", async () => {
    await withTransaction((tx) => generateOnboardingItems(tx, membershipId, seasonId));
    const before = await readPlayerRecord(membershipId);
    const item = (before as PlayerRecordFound).data.onboardingItems[0];
    expect(item).toBeDefined();

    await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: item.id,
      status: "complete",
    });
    await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: item.id,
      status: "pending",
    });

    const actorName = await observer.query<{ name: string }>(
      `select given_name || coalesce(' ' || family_name, '') as name
         from public.people where id = $1::uuid`,
      [actorPersonId],
    );
    const expectedName = actorName.rows[0].name;

    const after = await readPlayerRecord(membershipId);
    const data = (after as PlayerRecordFound).data;
    const resolved = data.onboardingItems.find((entry) => entry.id === item.id)!;

    expect(resolved.history.map((entry) => [entry.fromStatus, entry.toStatus])).toEqual([
      ["pending", "complete"],
      ["complete", "pending"],
    ]);
    for (const entry of resolved.history) {
      expect(entry.actorKind).toBe("operator");
      expect(entry.actorName).toBe(expectedName);
    }
  });

  it("groups the activity log by section, newest first, with the actor's name resolved from an actorPersonId", async () => {
    await withTransaction((tx) =>
      recordOnboardingActivityIn(tx, {
        membershipId,
        seasonId,
        section: "LAN217Record activity",
        kind: "ask",
        channel: "email",
        actorLabel: "the club",
        occurredAt: new Date("2026-08-01T09:00:00Z"),
      }),
    );
    await withTransaction((tx) =>
      recordOnboardingActivityIn(tx, {
        membershipId,
        seasonId,
        section: "LAN217Record activity",
        kind: "answer",
        channel: "signed link",
        actorPersonId,
        occurredAt: new Date("2026-08-05T09:00:00Z"),
      }),
    );

    const actorName = await observer.query<{ name: string }>(
      `select given_name || coalesce(' ' || family_name, '') as name
         from public.people where id = $1::uuid`,
      [actorPersonId],
    );
    const expectedName = actorName.rows[0].name;

    const result = await readPlayerRecord(membershipId);
    const data = (result as PlayerRecordFound).data;
    const section = data.activityLog.find((s) => s.section === "LAN217Record activity");
    expect(section).toBeDefined();
    expect(section!.entries).toHaveLength(2);
    // Newest first.
    expect(section!.entries[0].kind).toBe("answer");
    expect(section!.entries[0].who).toBe(expectedName);
    expect(section!.entries[1].kind).toBe("ask");
    expect(section!.entries[1].who).toBe("the club");
  });
});

describe("readPlayerRecord — a membership whose person was merged away (I6, W1-09)", () => {
  let loserId: string;
  let loserMembershipId: string;

  beforeAll(async () => {
    const loser = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
      [MARKER, "Loser"],
    );
    loserId = loser.rows[0].id;

    const loserMembership = await observer.query<{ id: string }>(
      `insert into public.season_memberships (person_id, season_id, status, entry, activated_on)
       values ($1::uuid, $2::uuid, 'active', 'new', current_date) returning id`,
      [loserId, seasonId],
    );
    loserMembershipId = loserMembership.rows[0].id;

    await observer.query(
      `update public.people
          set merged_into_person_id = $2::uuid, merged_at = now(),
              merged_by_person_id = $3::uuid, merge_reason = 'Test fixture merge'
        where id = $1::uuid`,
      [loserId, personId, actorPersonId],
    );
  });

  afterAll(async () => {
    await observer.query(`delete from public.season_memberships where id = $1::uuid`, [
      loserMembershipId,
    ]);
    await observer.query(`delete from public.people where id = $1::uuid`, [loserId]);
  });

  it("resolves to the survivor's own membership for the same season", async () => {
    const result = await readPlayerRecord(loserMembershipId);
    expect(result).toEqual({ kind: "redirect", href: `/operate/roster/${membershipId}` });
  });
});
