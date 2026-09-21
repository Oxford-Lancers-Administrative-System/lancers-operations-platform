// @vitest-environment node
/**
 * `scripts/production/baseline/season-2026-27.sql` — LAN-350 — proved against
 * **local** Supabase only. The file itself is an owner-run production
 * procedure (`scripts/production/README.md`); nothing here runs it anywhere
 * but the local stack, and nothing here is a way to reach production.
 *
 * This is a gate-lane suite (`GATE_SUITES` in vitest.config.ts), not a hot-lane
 * one: proving it correctly means running against the database CI seeds with
 * the full synthetic dataset (`.github/workflows/ci.yml` resets, then seeds,
 * then runs the gate project) — which already carries its own active season
 * and open committee year with different natural keys from this file's. The
 * suite neutralizes exactly those two ambient facts for the duration of its
 * own run and restores them afterwards, the same shape
 * `tests/production-bootstrap-contract.test.ts` uses for the seats the
 * synthetic seed fills.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveLocalDatabaseUrl } from "../scripts/lib/local-db.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const BASELINE_SQL = readFileSync(
  path.join(repoRoot, "scripts/production/baseline/season-2026-27.sql"),
  "utf8",
);

/**
 * How many positions the file seats, counted from the file itself — LAN-401.
 *
 * It was written down here as well until Stewart's vocabulary corrections
 * showed what that costs: the baseline is an owner-run production procedure
 * that agents may not edit, so its diff lands by Brian's hand, on his clock,
 * and a number typed twice means the suite is wrong on one side of that moment
 * whichever way it is set. Counted, it is right on both.
 */
const BASELINE_POSITION_COUNT = (() => {
  const block = BASELINE_SQL.match(
    /insert into public\.positions[\s\S]*?cross join \(values([\s\S]*?)\) as p\(/,
  );
  if (!block) {
    throw new Error(
      "The baseline's positions insert no longer has the `cross join (values …) as p(` shape " +
        "this suite counts its rows from.",
    );
  }
  return (block[1].match(/^\s*\('/gm) ?? []).length;
})();

const VOCAB_CODE = "oulafc_2026";
const SEASON_LABEL = "2026–27";
const COMMITTEE_LABEL = "2026–27";
const BASELINE_START = "2026-06-01";

interface Counts {
  vocabularies: number;
  positions: number;
  activeSeasons: number;
  terms: number;
  openCommitteeYears: number;
}

interface OperatorAccountRow {
  id: string;
  auth_user_id: string;
  person_id: string;
  is_active: boolean;
  disabled_at: string | null;
  disabled_reason: string | null;
  created_at: string;
  updated_at: string;
}

describe("the 2026–27 production baseline, run against local Supabase", () => {
  let client: pg.Client;

  /** Any ambient active season this suite temporarily parks, restored after. */
  let vacatedSeasons: { id: string; status: string }[] = [];
  /** Any ambient committee year overlapping this file's range, restored after. */
  let vacatedCommitteeYears: { id: string; starts_on: string; ends_on: string | null }[] = [];
  /** The whole `operator_accounts` table, snapshotted so a test can empty it. */
  let savedOperatorAccounts: OperatorAccountRow[] = [];
  let fixtureOperator: { authUserId: string; personId: string } | null = null;

  async function removeBaselineRows(): Promise<void> {
    // Reverse dependency order. A crashed earlier run of this suite could
    // leave any subset of these behind, so every delete is unconditional on
    // the others having run.
    await client.query("delete from public.committee_years where label = $1", [COMMITTEE_LABEL]);
    await client.query("delete from public.terms where academic_year = $1", [SEASON_LABEL]);
    await client.query("delete from public.seasons where label = $1", [SEASON_LABEL]);
    await client.query(
      `delete from public.positions
        where vocabulary_id = (select id from public.position_vocabularies where code = $1)`,
      [VOCAB_CODE],
    );
    await client.query("delete from public.position_vocabularies where code = $1", [VOCAB_CODE]);
  }

  async function vacateAmbientConflicts(): Promise<void> {
    const seasons = await client.query<{ id: string; status: string }>(
      "select id, status from public.seasons where status = 'active' and label <> $1",
      [SEASON_LABEL],
    );
    vacatedSeasons = seasons.rows;
    for (const row of vacatedSeasons) {
      await client.query("update public.seasons set status = 'planning' where id = $1", [row.id]);
    }

    const committeeYears = await client.query<{
      id: string;
      starts_on: string;
      ends_on: string | null;
    }>(
      `select id, starts_on::text, ends_on::text
         from public.committee_years
        where label <> $1
          and daterange(starts_on, ends_on, '[)') && daterange($2::date, null, '[)')`,
      [COMMITTEE_LABEL, BASELINE_START],
    );
    vacatedCommitteeYears = committeeYears.rows;
    for (const row of vacatedCommitteeYears) {
      await client.query(
        "update public.committee_years set starts_on = date '1900-01-01', ends_on = date '1900-06-01' where id = $1",
        [row.id],
      );
    }
  }

  async function restoreAmbientConflicts(): Promise<void> {
    for (const row of vacatedCommitteeYears) {
      await client.query(
        "update public.committee_years set starts_on = $2, ends_on = $3 where id = $1",
        [row.id, row.starts_on, row.ends_on],
      );
    }
    vacatedCommitteeYears = [];
    for (const row of vacatedSeasons) {
      await client.query("update public.seasons set status = $2 where id = $1", [
        row.id,
        row.status,
      ]);
    }
    vacatedSeasons = [];
  }

  async function snapshotOperatorAccounts(): Promise<void> {
    const { rows } = await client.query<OperatorAccountRow>(
      `select id, auth_user_id, person_id, is_active, disabled_at, disabled_reason,
              created_at::text, updated_at::text
         from public.operator_accounts`,
    );
    savedOperatorAccounts = rows;
  }

  async function clearOperatorAccounts(): Promise<void> {
    await client.query("delete from public.operator_accounts");
  }

  async function restoreOperatorAccounts(): Promise<void> {
    for (const row of savedOperatorAccounts) {
      await client.query(
        `insert into public.operator_accounts
           (id, auth_user_id, person_id, is_active, disabled_at, disabled_reason, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (id) do nothing`,
        [
          row.id,
          row.auth_user_id,
          row.person_id,
          row.is_active,
          row.disabled_at,
          row.disabled_reason,
          row.created_at,
          row.updated_at,
        ],
      );
    }
    savedOperatorAccounts = [];
  }

  /** One auth user and one Person, linked, so the happy-path tests have an opener. */
  async function createFixtureOperator(
    suffix: string,
  ): Promise<{ authUserId: string; personId: string }> {
    const user = await client.query<{ id: string }>(
      "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
      [`lan-350-baseline-${suffix}@oxfordlancers.local`],
    );
    const person = await client.query<{ id: string }>(
      "insert into public.people (given_name, family_name) values ('LAN-350', $1) returning id",
      [`Baseline fixture ${suffix}`],
    );
    await client.query(
      "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
      [user.rows[0].id, person.rows[0].id],
    );
    return { authUserId: user.rows[0].id, personId: person.rows[0].id };
  }

  async function removeFixtureOperator(): Promise<void> {
    if (!fixtureOperator) return;
    await client.query("delete from public.operator_accounts where person_id = $1", [
      fixtureOperator.personId,
    ]);
    await client.query("delete from public.people where id = $1", [fixtureOperator.personId]);
    await client.query("delete from auth.users where id = $1", [fixtureOperator.authUserId]);
    fixtureOperator = null;
  }

  async function verificationCounts(): Promise<Counts> {
    const { rows } = await client.query<{
      vocabularies: string;
      positions: string;
      active_seasons: string;
      terms: string;
      open_committee_years: string;
    }>(
      `select
         (select count(*) from public.position_vocabularies where code = $1) as vocabularies,
         (select count(*) from public.positions
            where vocabulary_id = (select id from public.position_vocabularies where code = $1))
           as positions,
         (select count(*) from public.seasons where label = $2 and status = 'active') as active_seasons,
         (select count(*) from public.terms where academic_year = $2) as terms,
         (select count(*) from public.committee_years where label = $3 and ends_on is null)
           as open_committee_years`,
      [VOCAB_CODE, SEASON_LABEL, COMMITTEE_LABEL],
    );
    const row = rows[0];
    return {
      vocabularies: Number(row.vocabularies),
      positions: Number(row.positions),
      activeSeasons: Number(row.active_seasons),
      terms: Number(row.terms),
      openCommitteeYears: Number(row.open_committee_years),
    };
  }

  /** A content digest of every row this file may write, across the five tables. */
  async function baselineDigest(): Promise<string> {
    const { rows } = await client.query<{ digest: string | null }>(
      `select md5(coalesce(string_agg(fingerprint, '|' order by fingerprint), '')) as digest
         from (
           select row(pv.*)::text as fingerprint
             from public.position_vocabularies pv where pv.code = $1
           union all
           select row(p.*)::text
             from public.positions p
            where p.vocabulary_id = (select id from public.position_vocabularies where code = $1)
           union all
           select row(s.*)::text from public.seasons s where s.label = $2
           union all
           select row(t.*)::text from public.terms t where t.academic_year = $2
           union all
           select row(c.*)::text from public.committee_years c where c.label = $3
         ) rows_by_table`,
      [VOCAB_CODE, SEASON_LABEL, COMMITTEE_LABEL],
    );
    return rows[0].digest ?? "";
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: resolveLocalDatabaseUrl() });
    await client.connect();
    // A previous crashed run of this exact suite is the only thing that could
    // leave these rows present before the first test runs.
    await removeBaselineRows();
    await vacateAmbientConflicts();
  }, 30_000);

  afterAll(async () => {
    await removeFixtureOperator();
    await removeBaselineRows();
    await restoreAmbientConflicts();
    await client?.end();
  });

  it("refuses to run when public.operator_accounts is empty", async () => {
    await snapshotOperatorAccounts();
    await clearOperatorAccounts();

    try {
      await expect(client.query(BASELINE_SQL)).rejects.toThrow(/operator_accounts/i);
    } finally {
      // The failed multi-statement batch leaves the session's transaction
      // aborted; clear it before the next statement, and before undoing the
      // snapshot below.
      await client.query("rollback").catch(() => undefined);
      await restoreOperatorAccounts();
    }

    // The refusal must roll back the whole file, not just abort the failing
    // statement inside it — nothing from the vocabulary insert above it in
    // the file may have survived.
    const counts = await verificationCounts();
    expect(counts).toEqual({
      vocabularies: 0,
      positions: 0,
      activeSeasons: 0,
      terms: 0,
      openCommitteeYears: 0,
    });
  });

  it("creates the vocabulary, positions, season, terms and committee year", async () => {
    fixtureOperator = await createFixtureOperator("a");

    await client.query(BASELINE_SQL);

    const counts = await verificationCounts();
    expect(counts).toEqual({
      vocabularies: 1,
      positions: BASELINE_POSITION_COUNT,
      activeSeasons: 1,
      terms: 3,
      openCommitteeYears: 1,
    });
  });

  it("seats the four special-teams positions last in the vocabulary", async () => {
    const { rows } = await client.query<{ code: string; sort_order: number }>(
      `select code, sort_order from public.positions
        where vocabulary_id = (select id from public.position_vocabularies where code = $1)
          and side = 'special_teams'
        order by sort_order`,
      [VOCAB_CODE],
    );
    expect(rows.map((row) => row.code)).toEqual(["KO", "KR", "PUNT", "FG"]);
  });

  it("opens the season from the earliest-created active operator account", async () => {
    // Not necessarily this suite's own fixture — the file picks whichever
    // active operator_accounts row was created first, and other durable
    // identities may already be older. That determinism is what is under
    // test, so the expectation is computed the same way the file computes it.
    const expected = await client.query<{ person_id: string }>(
      `select person_id from public.operator_accounts
        where is_active
        order by created_at asc
        limit 1`,
    );
    const { rows } = await client.query<{ opener: string }>(
      "select opened_by_person_id::text as opener from public.seasons where label = $1",
      [SEASON_LABEL],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].opener).toBe(expected.rows[0].person_id);
  });

  it("is idempotent — running the file again changes nothing", async () => {
    const before = {
      counts: await verificationCounts(),
      digest: await baselineDigest(),
    };

    await client.query(BASELINE_SQL);

    const after = {
      counts: await verificationCounts(),
      digest: await baselineDigest(),
    };
    expect(after).toEqual(before);
  });
});
