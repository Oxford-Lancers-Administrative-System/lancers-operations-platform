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
