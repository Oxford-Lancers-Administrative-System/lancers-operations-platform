// @vitest-environment node
/**
 * The approved static twenty-role catalogue — LAN-128, mission
 * M-OPERATOR-ADMIN-WITHOUT-SQL, REQ-static-role-catalogue and
 * REQ-role-definition-and-permission-boundary.
 *
 * What makes this suite worth having is *which database it reads*. The
 * catalogue used to exist only in `scripts/seed-local.mjs`, a script that
 * refuses any non-loopback host by design, so hosted Supabase had no roles at
 * all and every capability in `src/lib/auth/capabilities.ts` keyed on codes
 * that did not exist in production. The catalogue is now a migration. These
 * tests read what the migration left behind, which is the same artifact Brian
 * applies to hosted — so "hosted and local get the same catalogue" is checked
 * rather than asserted.
 *
 * Four properties, and each one is a requirement rather than an implementation
 * detail:
 *
 *   1. the twenty seats, their names, and the order they appear in;
 *   2. cardinality — the constitution's four Offices, plus General Manager,
 *      and nothing else;
 *   3. the catalogue is the *only* definition: seeding does not redefine it,
 *      and no script carries a second copy;
 *   4. the migration is idempotent, proved by running it again.
 *
 * Local Supabase only, and after `npm run db:reset` — `openLocalClient` refuses
 * any non-loopback host.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { openLocalClient, expectRejected, type Client } from "./helpers/domain-fixture";

const root = resolve(import.meta.dirname, "..");
const CATALOGUE_MIGRATION = join(
  root,
  "supabase",
  "migrations",
  "20260819090100_role_catalogue.sql",
);

const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.DATABASE_URL);

if (process.env.REQUIRE_SUPABASE_TESTS === "1" && !configured) {
  throw new Error("REQUIRE_SUPABASE_TESTS=1 but the local database is not configured.");
}

/**
 * The catalogue exactly as REQ-static-role-catalogue words it, in the order it
 * words it: group by group, seat by seat. Retyped from the requirement on
 * purpose — a test that derived this from the migration would agree with the
 * migration about everything, including a mistake.
 */
const APPROVED: readonly (readonly [group: string, code: string, name: string])[] = [
  ["Operational Administration", "general_manager", "General Manager"],
  ["Operational Administration", "it_officer", "IT Officer"],
  ["Club Committee", "president", "President"],
  ["Club Committee", "vice_president", "Vice-President"],
  ["Club Committee", "secretary", "Secretary"],
  ["Club Committee", "treasurer", "Treasurer"],
  ["Club Committee", "social_secretary", "Social Secretary"],
  ["Club Committee", "gameday_secretary", "Gameday Secretary"],
  ["Club Committee", "kit_manager", "Kit Manager"],
  ["Club Committee", "media_secretary", "Media Secretary"],
  ["Coaching Staff", "head_coach", "Head Coach"],
  ["Coaching Staff", "offence_coach", "Offensive Coordinator"],
  ["Coaching Staff", "defence_coach", "Defensive Coordinator"],
  ["Coaching Staff", "quarterbacks_coach", "Quarterbacks Coach"],
  ["Coaching Staff", "offensive_line_coach", "Offensive Line Coach"],
  ["Coaching Staff", "wide_receivers_coach", "Wide Receivers Coach"],
  ["Coaching Staff", "defensive_line_coach", "Defensive Line Coach"],
  ["Coaching Staff", "linebackers_coach", "Linebackers Coach"],
  ["Coaching Staff", "defensive_backs_coach", "Defensive Backs Coach"],
  ["Coaching Staff", "special_teams_coach", "Special Teams Coach"],
];

interface CatalogueRow {
  group_label: string;
  code: string;
  name: string;
  scope: string;
  is_constitutional_office: boolean;
  is_single_holder_seat: boolean;
  admits_multiple_holders: boolean;
}

const CATALOGUE_QUERY = `
  select groups.label as group_label,
         roles.code,
         roles.name,
         roles.scope::text as scope,
         roles.is_constitutional_office,
         roles.is_single_holder_seat,
         roles.admits_multiple_holders
    from public.roles
    join public.role_groups groups on groups.id = roles.role_group_id
   order by groups.sort_order, roles.sort_order`;

let client: Client;

describe.runIf(configured)("the approved role catalogue", () => {
  beforeAll(async () => {
    client = await openLocalClient();
  });

  afterAll(async () => {
    await client?.end();
  });

  it("is the twenty approved seats, in the approved group order", async () => {
    const { rows } = await client.query<CatalogueRow>(CATALOGUE_QUERY);

    expect(rows.map((row) => [row.group_label, row.code, row.name])).toEqual(
      APPROVED.map((entry) => [...entry]),
    );
  });

  it("has three groups, in the order the requirement names them", async () => {
    const { rows } = await client.query<{ label: string }>(
      "select label from public.role_groups order by sort_order",
    );

    expect(rows.map((row) => row.label)).toEqual([
      "Operational Administration",
      "Club Committee",
      "Coaching Staff",
    ]);
  });

  it("puts every seat in a group and gives it a position", async () => {
    // `role_group_id` and `sort_order` are NOT NULL after the catalogue
    // migration, so this is really a check that nothing added a seat outside
    // the catalogue by relaxing them.
    const { rows } = await client.query<{ n: string }>(
      `select count(*) as n from public.roles
        where role_group_id is null or sort_order is null`,
    );

    expect(Number(rows[0].n)).toBe(0);
  });

  describe("cardinality — who may have more than one holder", () => {
    it("marks the four constitutional Offices, and only those", async () => {
      const { rows } = await client.query<{ code: string }>(
        "select code from public.roles where is_constitutional_office order by code",
      );

      expect(rows.map((row) => row.code)).toEqual([
        "president",
        "secretary",
        "treasurer",
        "vice_president",
      ]);
    });

    it("marks General Manager single-holder, without calling it an Office", async () => {
      // The point of the separate flag. The constitution constrains four seats;
      // General Manager is single-holder because Brian decided so on
      // 18 August 2026, and the schema must not state the constitution says it.
      const { rows } = await client.query<{ code: string }>(
        "select code from public.roles where is_single_holder_seat order by code",
      );

      expect(rows.map((row) => row.code)).toEqual(["general_manager"]);

      const gm = await client.query<{
        is_constitutional_office: boolean;
        admits_multiple_holders: boolean;
      }>(
        `select is_constitutional_office, admits_multiple_holders
           from public.roles where code = 'general_manager'`,
      );
      expect(gm.rows[0].is_constitutional_office).toBe(false);
      expect(gm.rows[0].admits_multiple_holders).toBe(false);
    });

    it("lets every other seat have as many holders as the club appoints", async () => {
      const { rows } = await client.query<CatalogueRow>(CATALOGUE_QUERY);

      const single = rows.filter((row) => !row.admits_multiple_holders).map((row) => row.code);
      expect(single.sort()).toEqual(
        ["general_manager", "president", "secretary", "treasurer", "vice_president"].sort(),
      );

      // The derived column is the one a reader consults, so it must agree with
      // both of the flags it is derived from rather than being separately true.
      for (const row of rows) {
        expect(row.admits_multiple_holders, row.code).toBe(
          !row.is_constitutional_office && !row.is_single_holder_seat,
        );
      }
    });
  });

  describe("the seats that were renamed keep their identity", () => {
    it("renames the two coordinators without renaming their codes", async () => {
      const { rows } = await client.query<{ code: string; name: string }>(
        `select code, name from public.roles
          where code in ('offence_coach', 'defence_coach') order by code`,
      );

      expect(rows).toEqual([
        { code: "defence_coach", name: "Defensive Coordinator" },
        { code: "offence_coach", name: "Offensive Coordinator" },
      ]);
    });

    it("keeps the previous names resolvable, as the Gameday seat's are", async () => {
      const { rows } = await client.query<{ code: string; alias: string }>(
        `select roles.code, role_aliases.alias
           from public.role_aliases
           join public.roles on roles.id = role_aliases.role_id
          order by roles.code, role_aliases.alias`,
      );

      const byCode = (code: string) =>
        rows.filter((row) => row.code === code).map((row) => row.alias);

      expect(byCode("offence_coach")).toEqual(["Offence Coach"]);
      expect(byCode("defence_coach")).toEqual(["Defence Coach"]);
      // LAN-42's five-names-in-a-decade finding, which used to reach the local
      // seed only.
      expect(byCode("gameday_secretary")).toEqual([
        "Fixtures Secretary",
        "Game Day Coordinator",
        "Gameday Lead",
        "Match Secretary",
      ]);
    });
  });

  describe("the catalogue is read-only to the application", () => {
    // REQ-static-role-catalogue: it "cannot be edited in the application", and
    // DEC-no-runtime-role-editing makes a catalogue change a reviewed owner
    // decision and a code change. Privilege is how that is held, not intent.
    it("grants the application role SELECT and nothing else", async () => {
      const { rows } = await client.query<{ table_name: string; granted: string }>(
        `select table_name, string_agg(privilege_type, ',' order by privilege_type) as granted
           from information_schema.role_table_grants
          where table_schema = 'public'
            and grantee = 'service_role'
            and table_name in ('roles', 'role_aliases', 'role_groups')
          group by table_name
          order by table_name`,
        [],
      );

      expect(rows).toEqual([
        { table_name: "role_aliases", granted: "SELECT" },
        { table_name: "role_groups", granted: "SELECT" },
        { table_name: "roles", granted: "SELECT" },
      ]);
    });

    it("really refuses a write issued as the application role", async () => {
      await client.query("begin");
      await client.query("set local role service_role");

      await expectRejected(
        client,
        `insert into public.roles (code, name, scope, is_constitutional_office, role_group_id, sort_order)
         select 'invented_seat', 'Invented Seat', 'committee_year', false, id, 99
           from public.role_groups where code = 'club_committee'`,
        [],
        /permission denied/,
      );
      await expectRejected(
        client,
        "update public.roles set name = 'Renamed' where code = 'president'",
        [],
        /permission denied/,
      );
      await expectRejected(client, "delete from public.roles", [], /permission denied/);
      await expectRejected(
        client,
        "insert into public.role_groups (code, label, sort_order) values ('invented', 'Invented', 99)",
        [],
        /permission denied/,
      );

      await client.query("rollback");
    });

    it("still lets the application read it", async () => {
      await client.query("begin");
      await client.query("set local role service_role");

      const { rows } = await client.query<{ n: string }>("select count(*) as n from public.roles");
      expect(Number(rows[0].n)).toBe(APPROVED.length);

      await client.query("rollback");
    });
  });

  describe("there is exactly one definition of the catalogue", () => {
    it("is not redefined by the local seed", () => {
      // The seed reads `public.roles`; it must not write it, and it must not
      // carry a second hand-written list that can drift from the migration.
      const seed = readFileSync(join(root, "scripts", "seed-local.mjs"), "utf8");

      expect(seed).not.toContain("ROLE_SPEC");
      expect(seed).not.toContain('"public.roles"');
      expect(seed).not.toContain('"public.role_aliases"');
      expect(seed).not.toContain('add("role_aliases"');
    });

    it("is not redefined by the owner-run showcase loader", () => {
      const showcase = readFileSync(
        join(root, "scripts", "production", "showcase", "plan.mjs"),
        "utf8",
      );

      expect(showcase).not.toContain("ROLE_SPEC");
      // It may still *write* assignments; what it may not do is create a seat.
      expect(showcase).not.toContain('add(\n        "public.roles"');
      expect(showcase).not.toContain('"public.roles",\n      {');
    });

    it("survives a seed run with the catalogue untouched", async () => {
      // `npm run db:reset` applies the migrations and then seeds. If seeding
      // truncated or rewrote the catalogue, this suite would be reading the
      // seed's opinion of it rather than the migration's — so assert the state
      // the whole file depends on.
      const { rows } = await client.query<{ n: string }>("select count(*) as n from public.roles");
      expect(Number(rows[0].n)).toBe(APPROVED.length);
    });
  });

  it("is idempotent: applying the catalogue migration again changes nothing", async () => {
    // REQ-one-time-bootstrap asks for "one versioned idempotent database
    // migration". Idempotent is a claim about what happens on a second run, so
    // this runs it a second time, against a database that already has the
    // catalogue, and compares the whole table before and after.
    const before = await client.query<CatalogueRow>(CATALOGUE_QUERY);
    const aliasesBefore = await client.query<{ n: string }>(
      "select count(*) as n from public.role_aliases",
    );
    const idsBefore = await client.query<{ id: string; code: string }>(
      "select id, code from public.roles order by code",
    );

    await client.query("begin");
    await client.query(readFileSync(CATALOGUE_MIGRATION, "utf8"));

    const after = await client.query<CatalogueRow>(CATALOGUE_QUERY);
    const aliasesAfter = await client.query<{ n: string }>(
      "select count(*) as n from public.role_aliases",
    );
    const idsAfter = await client.query<{ id: string; code: string }>(
      "select id, code from public.roles order by code",
    );

    await client.query("rollback");

    expect(after.rows).toEqual(before.rows);
    expect(aliasesAfter.rows[0].n).toBe(aliasesBefore.rows[0].n);
    // Identifiers matter more than counts here: `role_assignments` references
    // them, so a re-run that replaced a seat with a fresh identifier would
    // orphan every assignment in hosted.
    expect(idsAfter.rows).toEqual(idsBefore.rows);
  });
});
