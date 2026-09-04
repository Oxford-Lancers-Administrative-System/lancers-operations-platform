// @vitest-environment node
/**
 * The roster board's read and write path against the real local database.
 * LAN-186.
 *
 * The suite mints its own person and season membership, tagged with a marker
 * unique to this file, and cleans up every child row it wrote in dependency
 * order in `afterAll` — the same discipline `roster.test.ts` documents at
 * length: these are commits, not rollbacks, because a rollback test cannot
 * prove a GiST exclusion constraint or a real supersede sequence actually
 * committed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import { resolveOpenSeason } from "./roster";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import {
  commitAvailability,
  commitBlues,
  commitBps,
  commitCoachGroup,
  commitEligibility,
  commitFormalwearItem,
  commitJerseyNumbers,
  commitPosition,
  listRosterBoard,
  readPositionOptions,
} from "./roster-board";

const MARKER = "LAN186Board";

let observer: Client;
let actorPersonId: string;
let seasonId: string;
let personId: string;
let membershipId: string;

async function cleanUp(): Promise<void> {
  await observer.query(
    `delete from public.position_assignments where season_membership_id = $1::uuid`,
    [membershipId],
  );
  await observer.query(
    `delete from public.jersey_assignments where season_membership_id = $1::uuid`,
    [membershipId],
  );
  await observer.query(
    `delete from public.coach_group_assignments where season_membership_id = $1::uuid`,
    [membershipId],
  );
  await observer.query(
    `delete from public.formalwear_records where season_membership_id = $1::uuid`,
    [membershipId],
  );
  await observer.query(`delete from public.blues_awards where season_membership_id = $1::uuid`, [
    membershipId,
  ]);
  await observer.query(
    `delete from public.eligibility_records where season_membership_id = $1::uuid`,
    [membershipId],
  );
  await observer.query(
    `delete from public.availability_statuses where season_membership_id = $1::uuid`,
    [membershipId],
  );
  await observer.query(`delete from public.bps_selections where season_membership_id = $1::uuid`, [
    membershipId,
  ]);
  await observer.query(
    `delete from public.season_membership_status_events where season_membership_id = $1::uuid`,
    [membershipId],
  );
  await observer.query(`delete from public.audit_events where entity_id = $1::uuid`, [
    membershipId,
  ]);
  await observer.query(`delete from public.season_memberships where id = $1::uuid`, [membershipId]);
  await observer.query(`delete from public.people where id = $1::uuid`, [personId]);
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);

  const season = await withTransaction((tx) => resolveOpenSeason(tx));
  seasonId = season.id;

  const person = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [MARKER, "Fixture"],
  );
  personId = person.rows[0].id;

  const membership = await observer.query<{ id: string }>(
    `insert into public.season_memberships (person_id, season_id, status, entry)
     values ($1::uuid, $2::uuid, 'onboarding', 'new') returning id`,
    [personId, seasonId],
  );
  membershipId = membership.rows[0].id;
});

afterAll(async () => {
  await cleanUp();
  await observer.end();
  await closePool();
});

/**
 * LAN186-F1: `RosterBoardRow` has to carry alias data at all, read from
 * `person_aliases` — the same substrate `WP-people-read`'s `searchPeople`
 * already reads — including an alias that is not the display name.
 */
describe("listRosterBoard — aliases, LAN186-F1", () => {
  it("carries every alias on the person, not only the display name", async () => {
    await observer.query(
      `insert into public.person_aliases (person_id, alias) values ($1::uuid, $2), ($1::uuid, $3)`,
      [personId, "Fixture", "Not The Display Name"],
    );

    const board = await listRosterBoard();
    const row = board.rows.find((entry) => entry.membershipId === membershipId);
    expect(row?.aliases.sort()).toEqual(["Fixture", "Not The Display Name"]);
  });
});

describe("readPositionOptions — S3, never hardcoded", () => {
  it("reads the season's own vocabulary, not a fixed list", async () => {
    const options = await readPositionOptions(seasonId);
    expect(options.offence.length).toBeGreaterThan(0);
    expect(options.defence.length).toBeGreaterThan(0);
    // Special teams is the one part of the vocabulary LAN-190 left untouched —
    // present regardless of which offence/defence codes this season's
    // vocabulary happens to carry.
    expect(options.specialTeams.map((option) => option.code).sort()).toEqual([
      "FG",
      "KO",
      "KR",
      "PUNT",
    ]);
  });
});

describe("commitPosition — offence and defence, S1/S4", () => {
  it("supersedes rather than adding a second row or deleting the first", async () => {
    const options = await readPositionOptions(seasonId);
    const [first, second] = options.offence;
    expect(
      second,
      "this season's vocabulary needs at least two offence codes for this test",
    ).toBeDefined();

    await commitPosition({
      actorPersonId,
      membershipId,
      seasonId,
      column: "offence",
      code: first.code,
    });

    const afterFirst = await observer.query<{ code: string; effective_to: string | null }>(
      `select pos.code, pa.effective_to
         from public.position_assignments pa
         join public.positions pos on pos.id = pa.position_id
        where pa.season_membership_id = $1::uuid and pa.side = 'offence'`,
      [membershipId],
    );
    expect(afterFirst.rows).toHaveLength(1);
    expect(afterFirst.rows[0].code).toBe(first.code);
    expect(afterFirst.rows[0].effective_to).toBeNull();

    // Backdated to simulate a row that has genuinely lived through a calendar
    // day, which is the case `closeCurrentRow` supersedes rather than deletes
    // — done by SQL directly because the service always writes `current_date`,
    // and this is the one thing a fast integration run cannot itself produce.
    await observer.query(
      `update public.position_assignments set effective_from = current_date - 1
        where season_membership_id = $1::uuid and side = 'offence'`,
      [membershipId],
    );

    await commitPosition({
      actorPersonId,
      membershipId,
      seasonId,
      column: "offence",
      code: second.code,
    });

    const afterSecond = await observer.query<{ code: string; effective_to: string | null }>(
      `select pos.code, pa.effective_to
         from public.position_assignments pa
         join public.positions pos on pos.id = pa.position_id
        where pa.season_membership_id = $1::uuid and pa.side = 'offence'
        order by pa.created_at`,
      [membershipId],
    );
    expect(afterSecond.rows).toHaveLength(2);
    expect(afterSecond.rows[0]).toMatchObject({ code: first.code });
    expect(afterSecond.rows[0].effective_to).not.toBeNull(); // superseded, not deleted
    expect(afterSecond.rows[1]).toMatchObject({ code: second.code, effective_to: null }); // current
  });

  /**
   * `..._period_ordered` requires `effective_to > effective_from`, strictly —
   * two `date` columns, no time component. A same-day correction (open at
   * 10am, fix at 2pm) would otherwise ask the database to set `effective_to`
   * equal to `effective_from`, which it refuses. There is no history in a row
   * that lived zero calendar days for anybody to have read as the club's
   * answer, so `closeCurrentRow` deletes it outright rather than superseding —
   * still never a *second* concurrent row, and still never silently ignored.
   */
  it("deletes rather than supersedes a same-day correction, never leaving two rows", async () => {
    const options = await readPositionOptions(seasonId);
    const [first, second] = options.defence;
    expect(second).toBeDefined();

    await commitPosition({
      actorPersonId,
      membershipId,
      seasonId,
      column: "defence",
      code: first.code,
    });
    await commitPosition({
      actorPersonId,
      membershipId,
      seasonId,
      column: "defence",
      code: second.code,
    });

    const rows = await observer.query<{ code: string }>(
      `select pos.code
         from public.position_assignments pa
         join public.positions pos on pos.id = pa.position_id
        where pa.season_membership_id = $1::uuid and pa.side = 'defence'`,
      [membershipId],
    );
    expect(rows.rows).toEqual([{ code: second.code }]);
  });

  it("refuses a code that is not in this season's vocabulary for that side", async () => {
    await expect(
      commitPosition({
        actorPersonId,
        membershipId,
        seasonId,
        column: "offence",
        code: "NOT-A-REAL-CODE",
      }),
    ).rejects.toMatchObject({ rule: "position_assignments_position_in_vocabulary" });
  });
});

describe("commitPosition — special teams, the one board-level narrowing", () => {
  it("closes whichever slot was open and opens the newly chosen one, across a day boundary", async () => {
    await commitPosition({
      actorPersonId,
      membershipId,
      seasonId,
      column: "specialTeams",
      code: "KO",
    });
    // Backdated for the same reason the offence/defence test backdates: a
    // same-day correction deletes rather than supersedes, and this proves the
    // cross-slot close specifically preserves history when there is one.
    await observer.query(
      `update public.position_assignments set effective_from = current_date - 1
        where season_membership_id = $1::uuid and side = 'special_teams'`,
      [membershipId],
    );

    await commitPosition({
      actorPersonId,
      membershipId,
      seasonId,
      column: "specialTeams",
      code: "PUNT",
    });

    const rows = await observer.query<{ slot: string; effective_to: string | null }>(
      `select slot::text as slot, effective_to
         from public.position_assignments
        where season_membership_id = $1::uuid and side = 'special_teams'
        order by created_at`,
      [membershipId],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toMatchObject({ slot: "kickoff" });
    expect(rows.rows[0].effective_to).not.toBeNull();
    expect(rows.rows[1]).toMatchObject({ slot: "punt", effective_to: null });

    const board = await listRosterBoard();
    const row = board.rows.find((entry) => entry.membershipId === membershipId);
    expect(row?.specialTeamsPosition).toBe("PUNT");
  });

  it("deletes a same-day special-teams correction rather than leaving two rows", async () => {
    await commitPosition({
      actorPersonId,
      membershipId,
      seasonId,
      column: "specialTeams",
      code: "FG",
    });

    const rows = await observer.query<{ slot: string }>(
      `select slot::text as slot from public.position_assignments
        where season_membership_id = $1::uuid and side = 'special_teams'
          and effective_to is null`,
      [membershipId],
    );
    expect(rows.rows).toEqual([{ slot: "field_goal" }]);
  });
});

describe("commitJerseyNumbers — Q-7/Q-8", () => {
  it("adds, removes by effective-dating (never deleting), and refuses a held number", async () => {
    await commitJerseyNumbers({
      actorPersonId,
      membershipId,
      seasonId,
      kit: "blue",
      numbers: ["17", "42"],
    });

    let held = await observer.query<{ number: number; effective_to: string | null }>(
      `select number, effective_to from public.jersey_assignments
        where season_membership_id = $1::uuid and kit = 'blue'`,
      [membershipId],
    );
    expect(held.rows.map((row) => row.number).sort()).toEqual([17, 42]);
    expect(held.rows.every((row) => row.effective_to === null)).toBe(true);

    // Backdated so unassigning 42 below supersedes rather than deletes — a
    // same-day correction deletes outright, proved in its own test below.
    await observer.query(
      `update public.jersey_assignments set effective_from = current_date - 1
        where season_membership_id = $1::uuid and kit = 'blue' and number = 42`,
      [membershipId],
    );

    await commitJerseyNumbers({
      actorPersonId,
      membershipId,
      seasonId,
      kit: "blue",
      numbers: ["17"],
    });

    held = await observer.query<{ number: number; effective_to: string | null }>(
      `select number, effective_to from public.jersey_assignments
        where season_membership_id = $1::uuid and kit = 'blue'`,
      [membershipId],
    );
    expect(held.rows).toHaveLength(2); // both rows still exist
    const current = held.rows.filter((row) => row.effective_to === null);
    expect(current.map((row) => row.number)).toEqual([17]);
    const superseded = held.rows.find((row) => row.number === 42);
    expect(superseded?.effective_to).not.toBeNull();

    // A second membership contending for the same number is refused. A fresh
    // fixture person, because a person may hold only one membership per season.
    const contender = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
      [MARKER, "Contender"],
    );
    const contenderMembership = await observer.query<{ id: string }>(
      `insert into public.season_memberships (person_id, season_id, status, entry)
       values ($1::uuid, $2::uuid, 'onboarding', 'new') returning id`,
      [contender.rows[0].id, seasonId],
    );

    // LAN186-F2: this has to be the *application*-level rule, not the
    // database's own `jersey_assignments_unique_within_season_and_kit`
    // exclusion — see that guard's comment in `roster-board.ts`. Asserting the
    // shared name here is exactly what let a disabled guard go unnoticed: the
    // exclusion constraint one statement later threw the identical string.
    await expect(
      commitJerseyNumbers({
        actorPersonId,
        membershipId: contenderMembership.rows[0].id,
        seasonId,
        kit: "blue",
        numbers: ["17"],
      }),
    ).rejects.toMatchObject({ rule: "roster_board_jersey_number_held_by_another_membership" });

    await observer.query(
      `delete from public.jersey_assignments where season_membership_id = $1::uuid`,
      [contenderMembership.rows[0].id],
    );
    await observer.query(`delete from public.season_memberships where id = $1::uuid`, [
      contenderMembership.rows[0].id,
    ]);
    await observer.query(`delete from public.people where id = $1::uuid`, [contender.rows[0].id]);

    const board = await listRosterBoard();
    expect(board.jerseyHolders.blue["17"]).toBe(`${MARKER} Fixture`);
  });

  it("deletes a same-day unassignment rather than superseding it", async () => {
    await commitJerseyNumbers({
      actorPersonId,
      membershipId,
      seasonId,
      kit: "white",
      numbers: ["9"],
    });
    await commitJerseyNumbers({ actorPersonId, membershipId, seasonId, kit: "white", numbers: [] });

    const rows = await observer.query(
      `select 1 from public.jersey_assignments where season_membership_id = $1::uuid and kit = 'white'`,
      [membershipId],
    );
    expect(rows.rows).toHaveLength(0);
  });
});

describe("coach group, formalwear, Blues, eligibility, availability, BPS — round trip", () => {
  it("commits and reads back through listRosterBoard", async () => {
    await commitCoachGroup({ actorPersonId, membershipId, seasonId, coachGroup: "Offense" });
    await commitFormalwearItem({ actorPersonId, membershipId, seasonId, item: "tie", owned: true });
    await commitBlues({ actorPersonId, membershipId, seasonId, value: "Half" });
    await commitEligibility({ actorPersonId, membershipId, seasonId, status: "eligible" });
    await commitAvailability({ actorPersonId, membershipId, level: "green" });
    await commitBps({ actorPersonId, membershipId, seasonId, value: "Yes" });

    const board = await listRosterBoard();
    const row = board.rows.find((entry) => entry.membershipId === membershipId);
    expect(row).toMatchObject({
      coachGroup: "Offense",
      formalwear: { tie: true, bowtie: false, socks: false },
      blues: "Half",
      eligibility: "eligible",
      availability: "green",
      bps: "Yes",
    });

    const confirmer = await observer.query<{ confirmed_by_person_id: string | null }>(
      `select confirmed_by_person_id from public.availability_statuses
        where season_membership_id = $1::uuid order by recorded_at desc limit 1`,
      [membershipId],
    );
    expect(confirmer.rows[0].confirmed_by_person_id).toBe(actorPersonId);
  });
});

/**
 * BPS — item 5 of the item-and-ask inventory, a roster attribute rather than
 * an onboarding item (`WP-operator-record`, LAN-217, mission
 * owner-question Q-2/Q-3). Exactly `commitBlues`'s own shape: a no-op when
 * unchanged, an upsert on the row's own one-per-membership constraint, and
 * an audited transition otherwise.
 */
describe("commitBps — the roster attribute BPS left the checklist to become", () => {
  it("defaults to No, is a no-op when unchanged, and toggles with an audited transition", async () => {
    // A clean slate: an earlier suite in this file (the round-trip test) may
    // already have set this membership's own row, and "defaults to No" is a
    // claim about no row existing at all, not about execution order.
    await observer.query(
      `delete from public.bps_selections where season_membership_id = $1::uuid`,
      [membershipId],
    );

    const before = await listRosterBoard();
    expect(before.rows.find((entry) => entry.membershipId === membershipId)?.bps).toBe("No");

    // Committing the value it already has writes nothing.
    await commitBps({ actorPersonId, membershipId, seasonId, value: "No" });
    const stillNone = await observer.query(
      `select 1 from public.bps_selections where season_membership_id = $1::uuid`,
      [membershipId],
    );
    expect(stillNone.rows).toHaveLength(0);

    await commitBps({ actorPersonId, membershipId, seasonId, value: "Yes" });
    const selected = await observer.query<{ is_selected: boolean; recorded_by_person_id: string }>(
      `select is_selected, recorded_by_person_id from public.bps_selections
        where season_membership_id = $1::uuid`,
      [membershipId],
    );
    expect(selected.rows[0]).toMatchObject({
      is_selected: true,
      recorded_by_person_id: actorPersonId,
    });

    const audit = await observer.query<{ from_state: string; to_state: string }>(
      `select from_state, to_state from public.audit_events
        where entity_id = $1::uuid and action = 'bps_changed'
        order by occurred_at desc limit 1`,
      [membershipId],
    );
    expect(audit.rows[0]).toMatchObject({ from_state: "No", to_state: "Yes" });

    // Rotated off — never chased, never gating, just flipped back.
    await commitBps({ actorPersonId, membershipId, seasonId, value: "No" });
    const rotatedOff = await observer.query<{ is_selected: boolean }>(
      `select is_selected from public.bps_selections where season_membership_id = $1::uuid`,
      [membershipId],
    );
    expect(rotatedOff.rows[0].is_selected).toBe(false);
  });

  it("never appears as an onboarding item — flipping it moves no checklist count", async () => {
    const before = await listRosterBoard();
    const beforeRow = before.rows.find((entry) => entry.membershipId === membershipId)!;

    await commitBps({ actorPersonId, membershipId, seasonId, value: "Yes" });

    const after = await listRosterBoard();
    const afterRow = after.rows.find((entry) => entry.membershipId === membershipId)!;
    expect(afterRow.bps).toBe("Yes");
    expect(afterRow.itemsTotal).toBe(beforeRow.itemsTotal);
    expect(afterRow.itemsResolved).toBe(beforeRow.itemsResolved);
    expect(afterRow.requiredOutstanding).toBe(beforeRow.requiredOutstanding);

    const type = await observer.query(
      `select 1 from public.onboarding_item_types where code = 'bps'`,
    );
    expect(type.rows).toHaveLength(0);
  });
});
