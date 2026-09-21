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
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { Client as PgClient, type Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import { readPersonRecord } from "./person-record";
import { readPlayerRecord } from "./player-record";
import { resolveOpenSeason } from "./roster";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import {
  commitAvailability,
  commitBlues,
  commitBps,
  commitCoachingGroups,
  commitEligibility,
  commitFormalwearItems,
  commitJerseyNumbers,
  commitPosition,
  commitPositionGroups,
  commitKitItem,
  commitKitItemValues,
  commitSpecialTeamsAssignment,
  commitWarmupSmallGroup,
  WARMUP_SMALL_GROUP_VALUES,
  KIT_DISTRIBUTED_ITEMS,
  KIT_ITEMS,
  kitCellKey,
  listRosterBoard,
  readPositionOptions,
  SPECIAL_TEAMS_SLOTS,
  SPECIAL_TEAMS_SQUADS,
  specialTeamsCellKey,
} from "./roster-board";
import { generateOnboardingItems, resolveOnboardingItem } from "./membership";

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
    `delete from public.membership_position_groups where season_membership_id = $1::uuid`,
    [membershipId],
  );
  await observer.query(
    `delete from public.special_teams_assignments where season_membership_id = $1::uuid`,
    [membershipId],
  );
  await observer.query(
    `delete from public.kit_issue_records where season_membership_id = $1::uuid`,
    [membershipId],
  );
  await observer.query(
    `delete from public.warmup_group_assignments where season_membership_id = $1::uuid`,
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
  // Correction round 2, item 5: generateOnboardingItems/resolveOnboardingItem
  // mint items, their history and their own audit rows for this membership.
  await observer.query(
    `delete from public.onboarding_item_history where season_membership_id = $1::uuid`,
    [membershipId],
  );
  await observer.query(
    `delete from public.audit_events
      where entity_table = 'onboarding_items'
        and entity_id in (select id from public.onboarding_items where season_membership_id = $1::uuid)`,
    [membershipId],
  );
  await observer.query(
    `delete from public.onboarding_items where season_membership_id = $1::uuid`,
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
    // LAN-387 merged Stewart's additions into the live vocabulary; the board's
    // dropdown is that vocabulary and nothing else.
    expect(options.offence.map((option) => option.code)).toContain("OL");
    expect(options.defence.map((option) => option.code)).toContain("ILB");
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

describe("commitPosition — the backup slot beside the primary, LAN-387", () => {
  it("keeps the primary and the backup independent, and allows the same code in both", async () => {
    const options = await readPositionOptions(seasonId);
    const [first, second] = options.offence;

    await commitPosition({
      actorPersonId,
      membershipId,
      seasonId,
      column: "offence",
      code: first.code,
    });
    await commitPosition({
      actorPersonId,
      membershipId,
      seasonId,
      column: "offenceBackup",
      code: second.code,
    });

    let board = await listRosterBoard();
    let row = board.rows.find((entry) => entry.membershipId === membershipId);
    expect(row?.offencePosition).toBe(first.code);
    expect(row?.offenceBackupPosition).toBe(second.code);

    // Changing the backup leaves the primary exactly where it was.
    await commitPosition({
      actorPersonId,
      membershipId,
      seasonId,
      column: "offenceBackup",
      code: first.code,
    });
    board = await listRosterBoard();
    row = board.rows.find((entry) => entry.membershipId === membershipId);
    expect(row?.offencePosition).toBe(first.code);
    // No rule says the two differ — Stewart's sheet lists players the same twice.
    expect(row?.offenceBackupPosition).toBe(first.code);

    const slots = await observer.query<{ slot: string }>(
      `select slot::text as slot from public.position_assignments
        where season_membership_id = $1::uuid and effective_to is null and side = 'offence'
        order by slot`,
      [membershipId],
    );
    expect(slots.rows.map((entry) => entry.slot)).toEqual(["offence", "offence_backup"]);
  });

  it("clears a backup without touching the primary", async () => {
    const options = await readPositionOptions(seasonId);
    await commitPosition({
      actorPersonId,
      membershipId,
      seasonId,
      column: "defence",
      code: options.defence[0].code,
    });
    await commitPosition({
      actorPersonId,
      membershipId,
      seasonId,
      column: "defenceBackup",
      code: options.defence[0].code,
    });
    await commitPosition({
      actorPersonId,
      membershipId,
      seasonId,
      column: "defenceBackup",
      code: null,
    });

    const board = await listRosterBoard();
    const row = board.rows.find((entry) => entry.membershipId === membershipId);
    expect(row?.defencePosition).toBe(options.defence[0].code);
    expect(row?.defenceBackupPosition).toBeNull();
  });
});

/** Two numbers nobody in this season holds. Read, never hardcoded: the seed hands them out at random and which ones are free moves with it. */
async function freeNumbers(kit: "blue" | "white", howMany: number): Promise<string[]> {
  const held = await observer.query<{ number: number }>(
    `select number from public.jersey_assignments
      where season_id = $1::uuid and kit = $2::public.kit and effective_to is null`,
    [seasonId, kit],
  );
  const taken = new Set(held.rows.map((row) => row.number));
  const free: string[] = [];
  for (let number = 1; number <= 99 && free.length < howMany; number += 1) {
    if (!taken.has(number)) free.push(String(number));
  }
  expect(free.length, "the season needs free jersey numbers for this test").toBe(howMany);
  return free;
}

describe("commitJerseyNumbers — Q-7/Q-8", () => {
  it("adds, removes by effective-dating (never deleting), and refuses a held number", async () => {
    const [kept, dropped] = await freeNumbers("blue", 2);
    await commitJerseyNumbers({
      actorPersonId,
      membershipId,
      seasonId,
      kit: "blue",
      numbers: [kept, dropped],
    });

    let held = await observer.query<{ number: number; effective_to: string | null }>(
      `select number, effective_to from public.jersey_assignments
        where season_membership_id = $1::uuid and kit = 'blue'`,
      [membershipId],
    );
    expect(held.rows.map((row) => row.number).sort((a, b) => a - b)).toEqual(
      [Number(kept), Number(dropped)].sort((a, b) => a - b),
    );
    expect(held.rows.every((row) => row.effective_to === null)).toBe(true);

    // Backdated so unassigning 42 below supersedes rather than deletes — a
    // same-day correction deletes outright, proved in its own test below.
    await observer.query(
      `update public.jersey_assignments set effective_from = current_date - 1
        where season_membership_id = $1::uuid and kit = 'blue' and number = $2::smallint`,
      [membershipId, dropped],
    );

    await commitJerseyNumbers({
      actorPersonId,
      membershipId,
      seasonId,
      kit: "blue",
      numbers: [kept],
    });

    held = await observer.query<{ number: number; effective_to: string | null }>(
      `select number, effective_to from public.jersey_assignments
        where season_membership_id = $1::uuid and kit = 'blue'`,
      [membershipId],
    );
    expect(held.rows).toHaveLength(2); // both rows still exist
    const current = held.rows.filter((row) => row.effective_to === null);
    expect(current.map((row) => row.number)).toEqual([Number(kept)]);
    const superseded = held.rows.find((row) => row.number === Number(dropped));
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
        numbers: [kept],
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
    expect(board.jerseyHolders.blue[kept]).toBe(`${MARKER} Fixture`);
  });

  it("deletes a same-day unassignment rather than superseding it", async () => {
    const [number] = await freeNumbers("white", 1);
    await commitJerseyNumbers({
      actorPersonId,
      membershipId,
      seasonId,
      kit: "white",
      numbers: [number],
    });
    await commitJerseyNumbers({ actorPersonId, membershipId, seasonId, kit: "white", numbers: [] });

    const rows = await observer.query(
      `select 1 from public.jersey_assignments where season_membership_id = $1::uuid and kit = 'white'`,
      [membershipId],
    );
    expect(rows.rows).toHaveLength(0);
  });
});

describe("coaching groups, formalwear, Blues, eligibility, availability, BPS — round trip", () => {
  it("commits and reads back through listRosterBoard", async () => {
    await commitCoachingGroups({
      actorPersonId,
      membershipId,
      seasonId,
      groups: ["Offense", "Special Teams"],
    });
    await commitPositionGroups({
      actorPersonId,
      membershipId,
      seasonId,
      side: "offence",
      groups: ["Quarterbacks", "Wide Receivers"],
    });
    await commitFormalwearItems({ actorPersonId, membershipId, seasonId, items: ["tie"] });
    await commitBlues({ actorPersonId, membershipId, seasonId, value: "Half" });
    await commitEligibility({ actorPersonId, membershipId, seasonId, status: "eligible" });
    await commitAvailability({ actorPersonId, membershipId, level: "green" });
    await commitBps({ actorPersonId, membershipId, seasonId, value: "Yes" });

    const board = await listRosterBoard();
    const row = board.rows.find((entry) => entry.membershipId === membershipId);
    expect(row).toMatchObject({
      coachingGroups: ["Offense", "Special Teams"],
      offensivePositionGroups: ["Quarterbacks", "Wide Receivers"],
      formalwear: { tie: true, bowtie: false },
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

  it("refuses a value outside the column's own vocabulary", async () => {
    await expect(
      commitCoachingGroups({ actorPersonId, membershipId, seasonId, groups: ["Kicking"] }),
    ).rejects.toMatchObject({ rule: "membership_group_in_vocabulary" });
    await expect(
      commitPositionGroups({
        actorPersonId,
        membershipId,
        seasonId,
        side: "defence",
        groups: ["Quarterbacks"],
      }),
    ).rejects.toMatchObject({ rule: "membership_group_in_vocabulary" });
  });

  it("replaces the whole selection, uncapped, and takes an empty one", async () => {
    await commitCoachingGroups({
      actorPersonId,
      membershipId,
      seasonId,
      groups: ["Offense", "Defense", "Special Teams"],
    });
    let board = await listRosterBoard();
    expect(board.rows.find((entry) => entry.membershipId === membershipId)?.coachingGroups).toEqual(
      ["Defense", "Offense", "Special Teams"],
    );

    await commitCoachingGroups({ actorPersonId, membershipId, seasonId, groups: [] });
    board = await listRosterBoard();
    expect(board.rows.find((entry) => entry.membershipId === membershipId)?.coachingGroups).toEqual(
      [],
    );
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

/**
 * Correction round 2, item 5 (`WP-operator-record`, LAN-217): the roster
 * board's own onboarding-item columns. `listRosterBoard`'s `onboardingItems`
 * carries the same seven items the record page's own row edits, keyed by
 * `onboarding_item_types.code`, id and status intact.
 */
describe("onboardingItems — the roster board's own onboarding columns", () => {
  it("carries every item's id and status, and reflects a resolution through the same service call the record page uses", async () => {
    await withTransaction((tx) => generateOnboardingItems(tx, membershipId, seasonId));

    const before = await listRosterBoard();
    const beforeRow = before.rows.find((entry) => entry.membershipId === membershipId)!;
    expect(beforeRow.onboardingItems["kit_sorted"]).toMatchObject({ status: "pending" });
    expect(beforeRow.onboardingItems["subs_invoiced"]).toMatchObject({ status: "pending" });

    // Kit Distributed became derived in LAN-375, so the column that proves
    // this is Subscription invoiced, which is still typed.
    const invoicedItemId = beforeRow.onboardingItems["subs_invoiced"].id;
    await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: invoicedItemId,
      status: "complete",
    });

    const after = await listRosterBoard();
    const afterRow = after.rows.find((entry) => entry.membershipId === membershipId)!;
    expect(afterRow.onboardingItems["subs_invoiced"]).toMatchObject({
      id: invoicedItemId,
      status: "complete",
    });
    // Untouched items stay untouched — one column's edit is not a checklist-wide rewrite.
    expect(afterRow.onboardingItems["kit_sorted"]).toMatchObject({ status: "pending" });
  });

  it("refuses Kit Distributed any hand-set state at all — it is derived (LAN-375)", async () => {
    const board = await listRosterBoard();
    const row = board.rows.find((entry) => entry.membershipId === membershipId)!;
    const kitItemId = row.onboardingItems["kit_sorted"]?.id;
    expect(kitItemId).toBeDefined();

    await expect(
      resolveOnboardingItem({
        actorPersonId,
        membershipId,
        itemId: kitItemId!,
        status: "waived",
        reason: "Handed over informally",
      }),
    ).rejects.toMatchObject({ kind: "constraint_violated" });
  });
});

/**
 * LAN-301. `pg` warned on every roster load that `client.query()` was being
 * called while that client was already executing one. It is a warning, not an
 * error, because `pg` queues the second call and runs it afterwards — so the
 * `Promise.all`s that caused it never overlapped a single round trip and only
 * bought a deprecation notice in Brian's console, on a driver that says it
 * will stop accepting this at pg@9.
 *
 * Asserted by counting overlaps rather than by catching the warning:
 * `util.deprecate` fires once per process for the life of that closure, so a
 * suite that merely listens for it passes for free the moment anything else
 * has already triggered it.
 */
describe("LAN-301 — no read overlaps a query already running on its own client", () => {
  async function overlapsDuring(work: () => Promise<unknown>): Promise<number> {
    const inFlight = new WeakMap<object, number>();
    let overlaps = 0;
    const original = PgClient.prototype.query;

    PgClient.prototype.query = function patched(this: object, ...args: unknown[]) {
      const running = inFlight.get(this) ?? 0;
      if (running > 0) overlaps += 1;
      inFlight.set(this, running + 1);
      const settle = () => inFlight.set(this, (inFlight.get(this) ?? 1) - 1);
      // The callback form never reaches this codebase, but returning its
      // undefined through `Promise.resolve` would silently drop the query.
      const result = (original as (...a: unknown[]) => unknown).apply(this, args);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        return (result as Promise<unknown>).then(
          (value) => {
            settle();
            return value;
          },
          (error) => {
            settle();
            throw error;
          },
        );
      }
      settle();
      return result;
    } as typeof PgClient.prototype.query;

    try {
      await work();
    } finally {
      PgClient.prototype.query = original;
    }
    return overlaps;
  }

  it("loads the whole roster board without one", async () => {
    expect(await overlapsDuring(() => listRosterBoard())).toBe(0);
  });

  it("assembles a person record without one", async () => {
    expect(await overlapsDuring(() => readPersonRecord(personId))).toBe(0);
  });

  it("assembles a membership record without one", async () => {
    expect(await overlapsDuring(() => readPlayerRecord(membershipId))).toBe(0);
  });

  it("counts an overlap when one really happens, so the three above are not vacuous", async () => {
    const overlaps = await overlapsDuring(() =>
      withTransaction((tx) =>
        Promise.all([tx.query("select 1"), tx.query("select 2"), tx.query("select 3")]),
      ),
    );
    expect(overlaps).toBeGreaterThan(0);
  });
});

describe("special teams assignments — LAN-374", () => {
  it("mirrors the sheet exactly: the reference table and the application's own list agree", async () => {
    const stored = await observer.query<{ squad: string; position_name: string }>(
      `select squad::text as squad, position_name
         from public.special_teams_squad_positions
        order by squad, sort_order`,
    );
    const bySquad = new Map<string, string[]>();
    for (const row of stored.rows) {
      const list = bySquad.get(row.squad) ?? [];
      list.push(row.position_name);
      bySquad.set(row.squad, list);
    }

    expect([...bySquad.keys()].sort()).toEqual(
      SPECIAL_TEAMS_SQUADS.map((squad) => squad.squad).sort(),
    );
    for (const squad of SPECIAL_TEAMS_SQUADS) {
      expect(bySquad.get(squad.squad)).toEqual([...squad.positions]);
    }
  });

  it("stores one pick per cell, blanks by deleting, and never touches a neighbouring cell", async () => {
    await commitSpecialTeamsAssignment({
      actorPersonId,
      membershipId,
      seasonId,
      squad: "punt",
      slot: "starting",
      positionName: "Longsnapper",
    });
    await commitSpecialTeamsAssignment({
      actorPersonId,
      membershipId,
      seasonId,
      squad: "punt",
      slot: "backup_2",
      positionName: "Punter",
    });

    let board = await listRosterBoard();
    let row = board.rows.find((entry) => entry.membershipId === membershipId);
    expect(row?.specialTeams[specialTeamsCellKey("punt", "starting")]).toBe("Longsnapper");
    expect(row?.specialTeams[specialTeamsCellKey("punt", "backup_2")]).toBe("Punter");
    // Not a depth chart: the cells nobody filled in are simply absent.
    expect(row?.specialTeams[specialTeamsCellKey("punt", "backup_1")]).toBeUndefined();

    await commitSpecialTeamsAssignment({
      actorPersonId,
      membershipId,
      seasonId,
      squad: "punt",
      slot: "starting",
      positionName: null,
    });
    board = await listRosterBoard();
    row = board.rows.find((entry) => entry.membershipId === membershipId);
    expect(row?.specialTeams[specialTeamsCellKey("punt", "starting")]).toBeUndefined();
    expect(row?.specialTeams[specialTeamsCellKey("punt", "backup_2")]).toBe("Punter");

    const stored = await observer.query(
      `select 1 from public.special_teams_assignments
        where season_membership_id = $1::uuid and squad = 'punt' and slot = 'starting'`,
      [membershipId],
    );
    expect(stored.rows).toHaveLength(0);
  });

  it("lets the same position stand in several slots of a squad — no cross-cell rule", async () => {
    for (const slot of SPECIAL_TEAMS_SLOTS) {
      await commitSpecialTeamsAssignment({
        actorPersonId,
        membershipId,
        seasonId,
        squad: "kickoff",
        slot: slot.slot,
        positionName: "Kicker",
      });
    }

    const board = await listRosterBoard();
    const row = board.rows.find((entry) => entry.membershipId === membershipId);
    for (const slot of SPECIAL_TEAMS_SLOTS) {
      expect(row?.specialTeams[specialTeamsCellKey("kickoff", slot.slot)]).toBe("Kicker");
    }
  });

  it("refuses a value another squad allows", async () => {
    await expect(
      commitSpecialTeamsAssignment({
        actorPersonId,
        membershipId,
        seasonId,
        squad: "punt_return",
        slot: "starting",
        positionName: "Longsnapper",
      }),
    ).rejects.toMatchObject({ rule: "special_teams_assignments_value_in_squad" });
  });

  it("takes DEF ON FIELD on the two squads whose sheet carries it", async () => {
    await commitSpecialTeamsAssignment({
      actorPersonId,
      membershipId,
      seasonId,
      squad: "field_goal_block",
      slot: "starting",
      positionName: "DEF ON FIELD",
    });

    const board = await listRosterBoard();
    const row = board.rows.find((entry) => entry.membershipId === membershipId);
    expect(row?.specialTeams[specialTeamsCellKey("field_goal_block", "starting")]).toBe(
      "DEF ON FIELD",
    );
  });
});

describe("issued kit and the derived Kit Distributed flag — LAN-375", () => {
  /** The item the flag lives on, for this fixture's membership. */
  async function kitDistributedStatus(): Promise<string | null> {
    const result = await observer.query<{ status: string }>(
      `select i.status::text as status
         from public.onboarding_items i
         join public.onboarding_item_types t on t.id = i.item_type_id
        where i.season_membership_id = $1::uuid and t.code = 'kit_sorted'`,
      [membershipId],
    );
    return result.rows[0]?.status ?? null;
  }

  it("mirrors Clint's sheet exactly: the reference table and the application's own list agree", async () => {
    const stored = await observer.query<{ item: string; value: string }>(
      `select item::text as item, value from public.kit_item_options order by item, sort_order`,
    );
    const byItem = new Map<string, string[]>();
    for (const row of stored.rows) {
      const list = byItem.get(row.item) ?? [];
      list.push(row.value);
      byItem.set(row.item, list);
    }

    expect([...byItem.keys()].sort()).toEqual(KIT_ITEMS.map((item) => item.item).sort());
    for (const item of KIT_ITEMS) {
      expect(byItem.get(item.item)).toEqual([...item.values]);
    }
    // Clint's own spellings, reproduced rather than corrected.
    expect(byItem.get("shoulder_pads")).toContain("Champro all porpose L");
    expect(byItem.get("shoulder_pads")).toContain("Schutt skill S");
  });

  it("gives Braces L and Braces R the same list and keeps them independent", async () => {
    const left = KIT_ITEMS.find((item) => item.item === "braces_left")!;
    const right = KIT_ITEMS.find((item) => item.item === "braces_right")!;
    expect(left.values).toEqual(right.values);
    expect(left.multi).toBe(true);
    expect(right.multi).toBe(true);

    await commitKitItem({
      actorPersonId,
      membershipId,
      seasonId,
      item: "braces_left",
      value: "Ankle - M",
    });
    await commitKitItem({
      actorPersonId,
      membershipId,
      seasonId,
      item: "braces_right",
      value: "Ankle - M",
    });

    const board = await listRosterBoard();
    const row = board.rows.find((entry) => entry.membershipId === membershipId);
    expect(row?.kit[kitCellKey("braces_left")]).toEqual(["Ankle - M"]);
    expect(row?.kit[kitCellKey("braces_right")]).toEqual(["Ankle - M"]);
  });

  /**
   * LAN-409 — Stewart, "Ops Improvements", 2026-09-21: "The braces columns
   * should be able to accept more than one choice (ankle plus knee plus
   * shoulder if needed)."
   */
  it("holds several braces on one side, in the list's own order", async () => {
    await commitKitItemValues({
      actorPersonId,
      membershipId,
      seasonId,
      item: "braces_left",
      // Deliberately out of order: the read sorts by the option's own place.
      values: ["Knee - L", "Ankle - M"],
    });
    await commitKitItemValues({
      actorPersonId,
      membershipId,
      seasonId,
      item: "braces_right",
      values: ["Shoulder"],
    });

    const board = await listRosterBoard();
    const row = board.rows.find((entry) => entry.membershipId === membershipId);
    expect(row?.kit[kitCellKey("braces_left")]).toEqual(["Ankle - M", "Knee - L"]);
    expect(row?.kit[kitCellKey("braces_right")]).toEqual(["Shoulder"]);

    const record = await readPlayerRecord(membershipId);
    if (record.kind !== "record") throw new Error("expected the membership's own record");
    expect(record.data.season.kit[kitCellKey("braces_left")]).toEqual(["Ankle - M", "Knee - L"]);
    expect(record.data.season.kit[kitCellKey("braces_right")]).toEqual(["Shoulder"]);
  });

  it("blanks a side when the whole selection is cleared", async () => {
    await commitKitItemValues({
      actorPersonId,
      membershipId,
      seasonId,
      item: "braces_left",
      values: ["Ankle - M", "Knee - L"],
    });
    await commitKitItemValues({
      actorPersonId,
      membershipId,
      seasonId,
      item: "braces_left",
      values: [],
    });

    const board = await listRosterBoard();
    const row = board.rows.find((entry) => entry.membershipId === membershipId);
    expect(row?.kit[kitCellKey("braces_left")]).toBeUndefined();
  });

  it("refuses a second value on an item that holds one", async () => {
    await expect(
      commitKitItemValues({
        actorPersonId,
        membershipId,
        seasonId,
        item: "helmet",
        values: ["Speedflex M", "Air L"],
      }),
    ).rejects.toMatchObject({ rule: "kit_issue_records_one_per_single_item" });
  });

  it("refuses a brace value that is not on the list", async () => {
    await expect(
      commitKitItemValues({
        actorPersonId,
        membershipId,
        seasonId,
        item: "braces_left",
        values: ["Ankle - M", "Elbow - M"],
      }),
    ).rejects.toMatchObject({ rule: "kit_issue_records_value_in_item" });
  });

  it("refuses a value from another item's list", async () => {
    await expect(
      commitKitItem({
        actorPersonId,
        membershipId,
        seasonId,
        item: "practice_jersey",
        value: "Speedflex M",
      }),
    ).rejects.toMatchObject({ rule: "kit_issue_records_value_in_item" });
  });

  it("reads Kit Distributed from the five items, with Team Mouthguard outside the rule", async () => {
    expect(KIT_DISTRIBUTED_ITEMS).toEqual([
      "helmet",
      "shoulder_pads",
      "lower_pads",
      "lowers",
      "practice_jersey",
    ]);

    await commitKitItem({
      actorPersonId,
      membershipId,
      seasonId,
      item: "team_mouthguard",
      value: "Yes",
    });
    expect(await kitDistributedStatus()).toBe("pending");

    const values: Record<string, string> = {
      helmet: "Air L",
      shoulder_pads: "Riddell Skill L",
      lower_pads: "7 Pad Girdle",
      lowers: "Yes - Solid Blue",
      practice_jersey: "Blue",
    };
    for (const item of KIT_DISTRIBUTED_ITEMS) {
      expect(await kitDistributedStatus()).toBe("pending");
      await commitKitItem({
        actorPersonId,
        membershipId,
        seasonId,
        item,
        value: values[item],
      });
    }
    expect(await kitDistributedStatus()).toBe("complete");

    // And back again the moment one of the five is blanked.
    await commitKitItem({ actorPersonId, membershipId, seasonId, item: "lowers", value: null });
    expect(await kitDistributedStatus()).toBe("pending");

    // Every flip is in the item's own history, as `system`.
    const history = await observer.query<{ to_status: string; actor_kind: string }>(
      `select h.to_status::text as to_status, h.actor_kind::text as actor_kind
         from public.onboarding_item_history h
         join public.onboarding_items i on i.id = h.onboarding_item_id
         join public.onboarding_item_types t on t.id = i.item_type_id
        where i.season_membership_id = $1::uuid and t.code = 'kit_sorted'
        order by h.occurred_at`,
      [membershipId],
    );
    expect(history.rows.filter((row) => row.actor_kind === "system").length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("refuses a hand set of Kit Distributed", async () => {
    const item = await observer.query<{ id: string }>(
      `select i.id from public.onboarding_items i
         join public.onboarding_item_types t on t.id = i.item_type_id
        where i.season_membership_id = $1::uuid and t.code = 'kit_sorted'`,
      [membershipId],
    );
    await expect(
      resolveOnboardingItem({
        actorPersonId,
        membershipId,
        itemId: item.rows[0].id,
        status: "complete",
      }),
    ).rejects.toMatchObject({ rule: "onboarding_item_derived_not_editable" });
  });
});

describe("warmup small groups — LAN-401", () => {
  // One cell shared with every other suite in this file, so each case starts
  // from blank rather than from whatever the case before it left behind.
  beforeEach(async () => {
    await observer.query(
      `delete from public.warmup_group_assignments where season_membership_id = $1::uuid`,
      [membershipId],
    );
    await observer.query(
      `delete from public.audit_events
        where action = 'warmup_small_group_changed' and entity_id = $1::uuid`,
      [membershipId],
    );
  });

  async function storedGroup(): Promise<string | null> {
    const result = await observer.query<{ small_group: string }>(
      `select small_group from public.warmup_group_assignments
        where season_membership_id = $1::uuid`,
      [membershipId],
    );
    return result.rows[0]?.small_group ?? null;
  }

  it("mirrors Stewart's list exactly: the reference table and the application's own list agree", async () => {
    const stored = await observer.query<{ name: string }>(
      `select name from public.warmup_small_groups order by sort_order`,
    );
    expect(stored.rows.map((row) => row.name)).toEqual([...WARMUP_SMALL_GROUP_VALUES]);
    // His order, not alphabetical, and not the board's idea of tidy.
    expect(WARMUP_SMALL_GROUP_VALUES[0]).toBe("Kings");
    expect(WARMUP_SMALL_GROUP_VALUES[WARMUP_SMALL_GROUP_VALUES.length - 1]).toBe("Lancer");
  });

  it("saves a pick, shows it on the board and on the record, and blanks back to nothing", async () => {
    await commitWarmupSmallGroup({
      actorPersonId,
      membershipId,
      seasonId,
      smallGroup: "Phoenix",
    });
    expect(await storedGroup()).toBe("Phoenix");

    const board = await listRosterBoard();
    expect(board.rows.find((entry) => entry.membershipId === membershipId)?.warmupSmallGroup).toBe(
      "Phoenix",
    );

    const record = await readPlayerRecord(membershipId);
    expect(record.kind).toBe("record");
    expect(record.kind === "record" ? record.data.season.warmupSmallGroup : null).toBe("Phoenix");

    // A second pick replaces the first — one cell, one row.
    await commitWarmupSmallGroup({ actorPersonId, membershipId, seasonId, smallGroup: "Gold" });
    expect(await storedGroup()).toBe("Gold");
    const rows = await observer.query(
      `select 1 from public.warmup_group_assignments where season_membership_id = $1::uuid`,
      [membershipId],
    );
    expect(rows.rowCount).toBe(1);

    // Blank is the absence of a row, never a row holding an empty string.
    await commitWarmupSmallGroup({ actorPersonId, membershipId, seasonId, smallGroup: null });
    expect(await storedGroup()).toBeNull();
    const board2 = await listRosterBoard();
    expect(
      board2.rows.find((entry) => entry.membershipId === membershipId)?.warmupSmallGroup,
    ).toBeNull();
  });

  it("refuses a name that is not one of the eight", async () => {
    await expect(
      commitWarmupSmallGroup({
        actorPersonId,
        membershipId,
        seasonId,
        smallGroup: "Dragons",
      }),
    ).rejects.toMatchObject({ rule: "warmup_group_assignments_value_in_vocabulary" });
    expect(await storedGroup()).toBeNull();
  });

  it("refuses a write with no actor — the same requirement every other cell carries", async () => {
    await expect(
      commitWarmupSmallGroup({
        actorPersonId: "",
        membershipId,
        seasonId,
        smallGroup: "Bear",
      }),
    ).rejects.toThrow();
    expect(await storedGroup()).toBeNull();
  });

  it("records the change in the audit trail", async () => {
    await commitWarmupSmallGroup({ actorPersonId, membershipId, seasonId, smallGroup: "Raider" });
    const audit = await observer.query<{ from_state: string | null; to_state: string | null }>(
      `select from_state, to_state from public.audit_events
        where action = 'warmup_small_group_changed' and entity_id = $1::uuid
        order by occurred_at desc limit 1`,
      [membershipId],
    );
    expect(audit.rows[0]).toEqual({ from_state: null, to_state: "Raider" });
  });
});
