// @vitest-environment node
/**
 * LAN-401 — the position-vocabulary edits, replayed.
 *
 * The migration has already run on any database these tests can reach, so
 * asserting on the seeded vocabulary would only prove what the seed says.
 * What has to be proved is the *edit*: that a vocabulary spelled the old way
 * comes out spelled the new way, and that an assignment recorded against the
 * old spelling still reads as the same player in the same slot afterwards.
 *
 * So each case builds a vocabulary with the old spellings, records an
 * assignment against it, and replays the migration's own vocabulary block —
 * sliced out of the migration file by the markers written there for exactly
 * this, so the statements under test can never drift from the statements that
 * shipped. The block is idempotent by construction; the last test re-runs it
 * to hold that true.
 *
 * Every case runs inside a transaction that is rolled back, so the seeded
 * dataset the replay also touches is never left changed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";

import { one, openLocalClient, type Client } from "./helpers/domain-fixture";

const repoRoot = path.resolve(import.meta.dirname, "..");
const MIGRATION_SQL = readFileSync(
  path.join(repoRoot, "supabase/migrations/20261001090000_roster_vocabulary_and_warmup.sql"),
  "utf8",
);

const BEGIN_MARKER = "-- LAN-401 VOCABULARY EDITS — BEGIN";
const END_MARKER = "-- LAN-401 VOCABULARY EDITS — END";

/** The migration's own vocabulary statements, as they stand in the file. */
const VOCABULARY_EDITS = (() => {
  const start = MIGRATION_SQL.indexOf(BEGIN_MARKER);
  const end = MIGRATION_SQL.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      "The LAN-401 migration no longer carries its vocabulary-edit markers, so this suite " +
        "cannot replay the statements it is meant to be testing.",
    );
  }
  return MIGRATION_SQL.slice(start + BEGIN_MARKER.length, end);
})();

interface Fixture {
  vocabularyId: string;
  seasonId: string;
  membershipId: string;
}

describe("LAN-401 — Stewart's position vocabulary edits", () => {
  let client: Client;
  let personId: string;
  let counter = 0;

  beforeAll(async () => {
    client = await openLocalClient();
  }, 30_000);

  afterAll(async () => {
    await client?.end();
  });

  beforeEach(async () => {
    await client.query("begin");
    const person = await one<{ id: string }>(
      client,
      "insert into public.people (given_name, family_name) values ('LAN401', 'Fixture') returning id",
    );
    personId = person.id;
    counter += 1;
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  /** A live season on a vocabulary of its own, with one player in it. */
  async function vocabularyWith(
    positions: readonly (readonly [code: string, label: string, side: string])[],
  ): Promise<Fixture> {
    const suffix = `lan401-${counter}`;
    const vocabulary = await one<{ id: string }>(
      client,
      `insert into public.position_vocabularies (code, label, adopted_on)
       values ($1, 'LAN-401 replay vocabulary', '2026-08-01') returning id`,
      [suffix],
    );
    for (const [index, [code, label, side]] of positions.entries()) {
      await client.query(
        `insert into public.positions (vocabulary_id, code, label, side, sort_order)
         values ($1, $2, $3, $4::public.position_side, $5)`,
        [vocabulary.id, code, label, side, index],
      );
    }
    const season = await one<{ id: string }>(
      client,
      `insert into public.seasons
         (label, status, position_vocabulary_id, starts_on, opened_at, opened_by_person_id)
       values ($1, 'active', $2, '2026-09-27', now(), $3) returning id`,
      [`LAN-401 replay ${suffix}`, vocabulary.id, personId],
    );
    const membership = await one<{ id: string }>(
      client,
      `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on, activated_on)
       values ($1, $2, 'active', 'new', '2026-09-20', '2026-10-04') returning id`,
      [personId, season.id],
    );
    return { vocabularyId: vocabulary.id, seasonId: season.id, membershipId: membership.id };
  }

  async function assignPosition(
    fixture: Fixture,
    code: string,
    slot: "offence" | "defence",
  ): Promise<void> {
    await client.query(
      `insert into public.position_assignments
         (season_membership_id, season_id, position_vocabulary_id, position_id, side, slot,
          effective_from, recorded_by_person_id)
       select $1, $2, $3, p.id, p.side, $4::public.position_slot, '2026-09-27', $5
         from public.positions p
        where p.vocabulary_id = $3 and p.code = $6`,
      [fixture.membershipId, fixture.seasonId, fixture.vocabularyId, slot, personId, code],
    );
  }

  /** What the board would read for this membership's slot — the code, through the assignment. */
  async function assignedCode(fixture: Fixture, slot: string): Promise<string | null> {
    const { rows } = await client.query<{ code: string }>(
      `select p.code
         from public.position_assignments a
         join public.positions p on p.id = a.position_id
        where a.season_membership_id = $1 and a.slot = $2::public.position_slot`,
      [fixture.membershipId, slot],
    );
    return rows[0]?.code ?? null;
  }

  async function vocabulary(
    fixture: Fixture,
  ): Promise<{ code: string; label: string; side: string; sort_order: number }[]> {
    const { rows } = await client.query<{
      code: string;
      label: string;
      side: string;
      sort_order: number;
    }>(
      `select code, label, side::text as side, sort_order
         from public.positions where vocabulary_id = $1
        order by side, sort_order, code`,
      [fixture.vocabularyId],
    );
    return rows;
  }

  it("renames N/T to NT in place, and the assignment comes with it", async () => {
    const fixture = await vocabularyWith([
      ["T", "Tackle", "offence"],
      ["G", "Guard", "offence"],
      ["E", "End", "defence"],
      ["N/T", "Nose Tackle", "defence"],
    ]);
    await assignPosition(fixture, "N/T", "defence");
    const before = await one<{ position_id: string }>(
      client,
      `select position_id::text as position_id from public.position_assignments
        where season_membership_id = $1`,
      [fixture.membershipId],
    );

    await client.query(VOCABULARY_EDITS);

    expect(await assignedCode(fixture, "defence")).toBe("NT");
    // Renamed in place: the row the assignment points at never moved.
    const after = await one<{ position_id: string }>(
      client,
      `select position_id::text as position_id from public.position_assignments
        where season_membership_id = $1`,
      [fixture.membershipId],
    );
    expect(after.position_id).toBe(before.position_id);

    const rows = await vocabulary(fixture);
    expect(rows.find((row) => row.code === "NT")).toMatchObject({
      label: "Nose Tackle",
      side: "defence",
    });
    expect(rows.some((row) => row.code === "N/T")).toBe(false);
  });

  it("collapses N/T onto an NT the vocabulary already holds, carrying the assignment", async () => {
    const fixture = await vocabularyWith([
      ["NT", "Nose Tackle", "defence"],
      ["N/T", "Nose Tackle", "defence"],
    ]);
    await assignPosition(fixture, "N/T", "defence");

    await client.query(VOCABULARY_EDITS);

    expect(await assignedCode(fixture, "defence")).toBe("NT");
    const rows = await vocabulary(fixture);
    expect(rows.filter((row) => row.code === "NT")).toHaveLength(1);
    expect(rows.some((row) => row.code === "N/T")).toBe(false);
  });

  it("relabels E from End to Edge and leaves it the only E", async () => {
    const fixture = await vocabularyWith([
      ["E", "End", "defence"],
      ["CB", "Cornerback", "defence"],
    ]);
    await assignPosition(fixture, "E", "defence");

    await client.query(VOCABULARY_EDITS);

    expect(await assignedCode(fixture, "defence")).toBe("E");
    const rows = await vocabulary(fixture);
    expect(rows.filter((row) => row.code === "E")).toHaveLength(1);
    expect(rows.find((row) => row.code === "E")?.label).toBe("Edge");
  });

  it("collapses an Edge row under another code onto E, re-pointing its assignment", async () => {
    const fixture = await vocabularyWith([
      ["E", "End", "defence"],
      ["EDG", "Edge", "defence"],
    ]);
    await assignPosition(fixture, "EDG", "defence");

    await client.query(VOCABULARY_EDITS);

    expect(await assignedCode(fixture, "defence")).toBe("E");
    const rows = await vocabulary(fixture);
    expect(rows.filter((row) => row.label === "Edge")).toHaveLength(1);
    expect(rows.find((row) => row.label === "Edge")?.code).toBe("E");
    expect(rows.some((row) => row.code === "EDG")).toBe(false);
  });

  it("adds DT, DE, LG, RG, LT and RT at the end of their own side, leaving G and T alone", async () => {
    const fixture = await vocabularyWith([
      ["T", "Tackle", "offence"],
      ["G", "Guard", "offence"],
      ["C", "Centre", "offence"],
      ["E", "End", "defence"],
      ["N/T", "Nose Tackle", "defence"],
    ]);

    await client.query(VOCABULARY_EDITS);

    const rows = await vocabulary(fixture);
    const offence = rows.filter((row) => row.side === "offence").map((row) => row.code);
    const defence = rows.filter((row) => row.side === "defence").map((row) => row.code);

    expect(offence).toEqual(["T", "G", "C", "LG", "RG", "LT", "RT"]);
    expect(defence).toEqual(["E", "NT", "DT", "DE"]);

    // The generic pair is untouched — Brian, 2026-09-21.
    expect(rows.find((row) => row.code === "G")).toMatchObject({ label: "Guard", sort_order: 1 });
    expect(rows.find((row) => row.code === "T")).toMatchObject({ label: "Tackle", sort_order: 0 });

    expect(rows.find((row) => row.code === "DT")?.label).toBe("Defensive Tackle");
    expect(rows.find((row) => row.code === "DE")?.label).toBe("Defensive End");
    expect(rows.find((row) => row.code === "LG")?.label).toBe("Left Guard");
    expect(rows.find((row) => row.code === "RG")?.label).toBe("Right Guard");
    expect(rows.find((row) => row.code === "LT")?.label).toBe("Left Tackle");
    expect(rows.find((row) => row.code === "RT")?.label).toBe("Right Tackle");
  });

  it("leaves an archived season's vocabulary unwidened, and still corrects its spellings", async () => {
    const suffix = `lan401-archived-${counter}`;
    const vocabularyRow = await one<{ id: string }>(
      client,
      `insert into public.position_vocabularies (code, label, adopted_on)
       values ($1, 'LAN-401 archived vocabulary', '2022-08-01') returning id`,
      [suffix],
    );
    await client.query(
      `insert into public.positions (vocabulary_id, code, label, side, sort_order) values
         ($1, 'N/T', 'Nose Tackle', 'defence', 0),
         ($1, 'E', 'End', 'defence', 1)`,
      [vocabularyRow.id],
    );
    await client.query(
      `insert into public.seasons
         (label, status, position_vocabulary_id, starts_on, ends_on,
          opened_at, opened_by_person_id, closed_at, closed_by_person_id)
       values ($1, 'archived', $2, '2022-09-27', '2023-06-20', now(), $3, now(), $3)`,
      [`LAN-401 archived ${suffix}`, vocabularyRow.id, personId],
    );

    await client.query(VOCABULARY_EDITS);

    const { rows } = await client.query<{ code: string; label: string }>(
      "select code, label from public.positions where vocabulary_id = $1 order by sort_order",
      [vocabularyRow.id],
    );
    // Corrected — a nose tackle recorded in 2022 is the same position.
    expect(rows.map((row) => row.code)).toEqual(["NT", "E"]);
    expect(rows.map((row) => row.label)).toEqual(["Nose Tackle", "Edge"]);
    // Not widened — invariant S3, and LAN-387's own precedent.
    expect(rows.some((row) => ["DT", "DE", "LG", "RG", "LT", "RT"].includes(row.code))).toBe(false);
  });

  it("is re-runnable: a second pass over an already-edited vocabulary changes nothing", async () => {
    const fixture = await vocabularyWith([
      ["T", "Tackle", "offence"],
      ["E", "End", "defence"],
      ["N/T", "Nose Tackle", "defence"],
    ]);
    await assignPosition(fixture, "N/T", "defence");

    await client.query(VOCABULARY_EDITS);
    const first = await vocabulary(fixture);
    await client.query(VOCABULARY_EDITS);
    const second = await vocabulary(fixture);

    expect(second).toEqual(first);
    expect(await assignedCode(fixture, "defence")).toBe("NT");
  });
});
