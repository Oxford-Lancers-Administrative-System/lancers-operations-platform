/**
 * The LAN-151 migration's legacy mapping, exercised against legacy rows — B-1.
 *
 * ## The gap this closes
 *
 * `supabase/migrations/20260822120000_events_target_state.sql` narrows
 * `event_status` from eight values to three and `event_type` from ten to seven,
 * and rewrites the rows it finds on the way. Independent review corrupted
 * `not_held -> cancelled` into `not_held -> draft` in **both** casts and watched
 * `supabase db reset`, `db:seed`, `check:rls` and 178 tests pass. It repeated
 * the exercise on `camp -> social` with the same result.
 *
 * The cause was structural rather than a missing assertion. Every other database
 * suite applies the migrations to an empty database and then seeds rows in the
 * **new** vocabulary, so no `case` arm ever evaluates: the mapping is dead code
 * everywhere it is currently observed. `grep` over `tests/` finds the retired
 * values only inside comments.
 *
 * That matters here more than it usually would. This mapping is the one artifact
 * in the mission that cannot be forward-fixed: after it runs the retired enum
 * values are gone, `opponent`, `side` and the two outcome columns are dropped,
 * and a wrong mapping is recovered by restoring the single production database
 * from a backup. A future edit to these lines, or a later migration re-touching
 * these enums, would ship with fully green CI, and the first person to see it
 * would be Brian, afterwards.
 *
 * ## How it is tested
 *
 * `tests/helpers/scratch-database.ts` builds a real database with the migrations
 * replayed up to the one before LAN-151 — the world this migration was written
 * for — and this file inserts one row in **every** legacy status and **every**
 * legacy type, plus the two cases that carry their own rule: a `not_held` event
 * with no `decision_reason`, which the migration must back-fill because
 * `cancelled` demands one, and an `event_series`, whose type column is cast by a
 * second copy of the same `case`.
 *
 * Then it applies the migration and reads the rows back. Every arm is asserted
 * by name, and the two totality claims are asserted as claims: nothing is left
 * outside the new enums, and no row was lost.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createScratchDatabase,
  LAN_151_MIGRATION,
  MIGRATION_BEFORE_LAN_151,
  type ScratchDatabase,
} from "./helpers/scratch-database";

/**
 * `public.event_status` as it stood before LAN-151, and where each value goes.
 *
 * Written as data rather than as a sequence of assertions so that the test
 * reads like the mapping table in the migration's own header, and so that an
 * arm added or removed there without a change here fails the totality check
 * below rather than passing silently.
 */
const STATUS_MAPPING: ReadonlyArray<readonly [legacy: string, expected: string]> = [
  ["draft", "draft"],
  ["pending_approval", "draft"],
  ["approved", "approved"],
  ["rejected", "draft"],
  ["withdrawn", "draft"],
  ["cancelled", "cancelled"],
  ["occurred", "approved"],
  ["not_held", "cancelled"],
];

/** `public.event_type` as it stood before LAN-151 (D12 narrowed it to seven). */
const TYPE_MAPPING: ReadonlyArray<readonly [legacy: string, expected: string]> = [
  ["practice", "practice"],
  ["strength_and_conditioning", "strength_and_conditioning"],
  ["chalk", "chalk"],
  ["camp", "practice"],
  ["fixture", "game"],
  ["varsity", "game"],
  ["social", "social"],
  ["recruitment", "recruitment"],
  ["meeting", "meeting"],
  ["other", "meeting"],
];

const NEW_STATUSES = ["draft", "approved", "cancelled"];
const NEW_TYPES = [
  "practice",
  "strength_and_conditioning",
  "chalk",
  "game",
  "social",
  "recruitment",
  "meeting",
];

let scratch: ScratchDatabase;
let statusRows: Map<string, { status: string; decision_reason: string | null }>;
let typeRows: Map<string, string>;
let seriesRows: Map<string, string>;

/** The statuses invariant E1a lets an event hold without an approver. */
const PRE_APPROVAL = new Set(["draft", "pending_approval", "rejected", "withdrawn"]);

/** Invariant E5: an asserted outcome names its author. */
const ASSERTED = new Set(["occurred", "not_held"]);

/** Invariant `events_negative_decisions_are_explained`. */
const EXPLAINED = new Set(["rejected", "cancelled", "withdrawn"]);

beforeAll(async () => {
  scratch = await createScratchDatabase("lancers_lan151_legacy_map", MIGRATION_BEFORE_LAN_151);
  const db = scratch.client;

  // The minimum a legal event needs, in the pre-LAN-151 schema.
  const person = await db.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ('Legacy', 'Fixture') returning id",
  );
  const personId = person.rows[0].id;

  const vocabulary = await db.query<{ id: string }>(
    `insert into public.position_vocabularies (code, label, adopted_on)
     values ('legacy-map', 'Legacy mapping fixture', date '2020-01-01') returning id`,
  );
  const season = await db.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on, opened_at, opened_by_person_id)
     values ('2020-21', 'active', $1, date '2020-09-01', date '2021-06-30', now(), $2)
     returning id`,
    [vocabulary.rows[0].id, personId],
  );
  const seasonId = season.rows[0].id;

  // One event per legacy status. Every other column is the minimum each status
  // legally requires — E1a's approver and audience, E5's outcome author, and an
  // explanation for the three statuses that demand one.
  for (const [legacy] of STATUS_MAPPING) {
    const approved = !PRE_APPROVAL.has(legacy);
    await db.query(
      `insert into public.events
         (season_id, name, event_type, status, scheduled_on,
          approved_at, approved_by_person_id,
          audience_confirmed_at, audience_confirmed_by_person_id,
          outcome_recorded_at, outcome_recorded_by_person_id, decision_reason)
       values ($1, $2, 'practice', $3::public.event_status, date '2020-10-14',
               case when $4 then now() end, case when $4 then $6::uuid end,
               case when $4 then now() end, case when $4 then $6::uuid end,
               case when $5 then now() end, case when $5 then $6::uuid end,
               $7)`,
      [
        seasonId,
        `status:${legacy}`,
        legacy,
        approved,
        ASSERTED.has(legacy),
        personId,
        // Deliberately blank for `not_held`: the migration has to supply one,
        // because `cancelled` is an explained decision and `not_held` was not.
        legacy === "not_held" ? null : EXPLAINED.has(legacy) ? `Recorded as ${legacy}.` : null,
      ],
    );
  }

  // One event per legacy type, and one series per legacy type — the second
  // copy of the same `case`, on a table nothing else in this repository
  // exercises with a retired value.
  for (const [legacy] of TYPE_MAPPING) {
    await db.query(
      `insert into public.events (season_id, name, event_type, status, scheduled_on)
       values ($1, $2, $3::public.event_type, 'draft', date '2020-10-14')`,
      [seasonId, `type:${legacy}`, legacy],
    );
    await db.query(
      `insert into public.event_series (season_id, name, event_type)
       values ($1, $2, $3::public.event_type)`,
      [seasonId, `series:${legacy}`, legacy],
    );
  }

  await scratch.apply(LAN_151_MIGRATION);

  const events = await db.query<{
    name: string;
    status: string;
    event_type: string;
    decision_reason: string | null;
  }>(
    `select name, status::text as status, event_type::text as event_type, decision_reason
       from public.events order by name`,
  );
  statusRows = new Map(
    events.rows
      .filter((row) => row.name.startsWith("status:"))
      .map((row) => [row.name.slice("status:".length), row]),
  );
  typeRows = new Map(
    events.rows
      .filter((row) => row.name.startsWith("type:"))
      .map((row) => [row.name.slice("type:".length), row.event_type]),
  );

  const series = await db.query<{ name: string; event_type: string }>(
    "select name, event_type::text as event_type from public.event_series order by name",
  );
  seriesRows = new Map(
    series.rows.map((row) => [row.name.slice("series:".length), row.event_type]),
  );
}, 180_000);

afterAll(async () => {
  await scratch?.close();
});

describe("the status mapping, arm by arm", () => {
  for (const [legacy, expected] of STATUS_MAPPING) {
    it(`carries ${legacy} to ${expected}`, () => {
      expect(statusRows.get(legacy)?.status, `legacy status ${legacy}`).toBe(expected);
    });
  }

  it("leaves every row inside the new three-value enum", () => {
    // The totality claim, asserted rather than assumed. A `case` with a missing
    // arm falls through to `else status::text`, which for a retired value is a
    // cast failure — but a *wrong* arm is silent, and this is what catches an
    // arm added to the enum without one here.
    expect(statusRows.size).toBe(STATUS_MAPPING.length);
    for (const [legacy, row] of statusRows) {
      expect(NEW_STATUSES, `legacy status ${legacy}`).toContain(row.status);
    }
  });

  it("back-fills a reason onto the not-held event it turns into a cancellation", () => {
    // `events_negative_decisions_are_explained` demands a reason from every
    // cancellation. `not_held` never carried one, so the migration has to write
    // it — and a blank one would abort the whole apply on the single production
    // database, by hand, with Brian watching.
    const notHeld = statusRows.get("not_held");
    expect(notHeld?.status).toBe("cancelled");
    expect(notHeld?.decision_reason?.trim()).toBeTruthy();
  });

  it("leaves a reason that was already there alone", () => {
    expect(statusRows.get("cancelled")?.decision_reason).toBe("Recorded as cancelled.");
  });
});

describe("the type mapping, arm by arm", () => {
  for (const [legacy, expected] of TYPE_MAPPING) {
    it(`carries ${legacy} to ${expected}`, () => {
      expect(typeRows.get(legacy), `legacy type ${legacy}`).toBe(expected);
    });

    it(`carries a ${legacy} series to ${expected}`, () => {
      // The same `case`, written twice in the migration. Two copies of one rule
      // is how they drift, so both are read back.
      expect(seriesRows.get(legacy), `legacy series type ${legacy}`).toBe(expected);
    });
  }

  it("leaves every row inside the new seven-value enum", () => {
    expect(typeRows.size).toBe(TYPE_MAPPING.length);
    for (const [legacy, type] of typeRows) {
      expect(NEW_TYPES, `legacy type ${legacy}`).toContain(type);
    }
    for (const [legacy, type] of seriesRows) {
      expect(NEW_TYPES, `legacy series type ${legacy}`).toContain(type);
    }
  });
});

describe("what the enums hold afterwards", () => {
  it("is exactly three statuses and seven types", async () => {
    const labels = async (typname: string) =>
      (
        await scratch.client.query<{ label: string }>(
          `select e.enumlabel as label
             from pg_enum e join pg_type t on t.oid = e.enumtypid
            where t.typname = $1 order by e.enumsortorder`,
          [typname],
        )
      ).rows.map((row) => row.label);

    expect(await labels("event_status")).toEqual(NEW_STATUSES);
    expect(await labels("event_type")).toEqual(NEW_TYPES);
  });

  it("keeps every event it was given", () => {
    // A mapping that lost rows would be a different kind of disaster, and an
    // `alter column ... using` is perfectly capable of it via a failed cast.
    expect(statusRows.size + typeRows.size).toBe(STATUS_MAPPING.length + TYPE_MAPPING.length);
    expect(seriesRows.size).toBe(TYPE_MAPPING.length);
  });
});
