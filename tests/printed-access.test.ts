// @vitest-environment node
/**
 * The printed access matrix — LAN-429 (mission M-GRANULAR-ROLES-AND-PERMISSIONS,
 * parent LAN-423).
 *
 * Reads every seat's every grant line from `public.role_access_grants`, after
 * `db:reset`, prints it one line per (seat, line) in the catalogue's own order,
 * and compares the print with `tests/fixtures/printed-access.txt`, which is
 * checked in and reviewed as the seed. A change to the seed is therefore a
 * change to that file, visible in a diff, and nothing else.
 *
 * The seed rule is also asserted independently of the fixture, in the style of
 * `tests/role-catalogue.test.ts`: the President, General Manager, IT Officer,
 * Vice-President and Secretary at the maximum of every line; every other seat
 * at `none` on every line. The rule is retyped here rather than imported, so a
 * mistake in `src/lib/auth` cannot agree with itself.
 *
 * Only the seven templates the templates migration seeds are printed (by their
 * fixed ids): a template another suite creates and deletes is not the seed.
 *
 * Local Supabase only, and after `npm run db:reset` — `openLocalClient`
 * refuses any non-loopback host. In `DATABASE_TEST_SUITES` and `GATE_SUITES`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { openLocalClient, type Client } from "./helpers/domain-fixture";

const root = resolve(import.meta.dirname, "..");
const FIXTURE = join(root, "tests", "fixtures", "printed-access.txt");

const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.DATABASE_URL);

if (process.env.REQUIRE_SUPABASE_TESTS === "1" && !configured) {
  throw new Error("REQUIRE_SUPABASE_TESTS=1 but the local database is not configured.");
}

/** `20260916090000_event_templates.sql`'s seven, by the ids it fixes. */
const SEEDED_TEMPLATES = [
  "7e34a764-7ed1-535e-8cef-73e00a62eafc",
  "8fb4acfc-1d41-53b0-bda8-202f454a8629",
  "b547e0b3-f48c-5601-9dc6-e8725fc434f9",
  "67fbd6c7-1c6c-55d5-ab83-f85816c4c2ae",
  "8de00424-52a8-52ad-9c9f-a29823f9c4bf",
  "ae03257b-292e-5a97-b6ef-c3a6a2b839d7",
  "660cdcb7-51e3-5a19-aaa2-08c5256af288",
];

/** Brian, 2026-09-25 (W1 "Floor"). Retyped, not imported. */
const FULL_SEATS = ["president", "general_manager", "it_officer", "vice_president", "secretary"];

/** The lines in the order the seat page lists them. Retyped, not imported. */
const LINE_ORDER = [
  "roster_category person",
  "roster_category contact_emergency",
  "roster_category onboarding",
  "roster_category membership",
  "roster_category availability",
  "roster_category coaching",
  "roster_category offensive",
  "roster_category defensive",
  "roster_category special_teams",
  "roster_category warmup",
  "roster_category kit",
  "recruiting_category recruit_person",
  "recruiting_category recruit_details",
  "recruiting_category recruit_events",
  "switch add_to_roster",
  "switch add_recruits",
];

interface MatrixRow {
  role_code: string;
  subject_kind: string;
  subject_key: string | null;
  template_name: string | null;
  level: string;
}

const MATRIX_QUERY = `
  select roles.code as role_code,
         grants.subject_kind,
         grants.subject_key,
         templates.name as template_name,
         grants.level
    from public.role_access_grants grants
    join public.roles on roles.id = grants.role_id
    join public.role_groups groups on groups.id = roles.role_group_id
    left join public.event_templates templates on templates.id = grants.template_id
   where grants.template_id is null or grants.template_id = any($1::uuid[])
   order by groups.sort_order, roles.sort_order`;

function lineOf(row: MatrixRow): string {
  return row.subject_kind === "event_template"
    ? `event_template ${row.template_name}`
    : `${row.subject_kind} ${row.subject_key}`;
}

function rank(line: string): number {
  const index = LINE_ORDER.indexOf(line);
  // Templates sit between the recruiting lines and the switches, by name.
  return index >= 0 ? (index < 14 ? index : index + 100) : 50;
}

function maximumOf(row: MatrixRow): string {
  if (row.subject_kind === "event_template") return "manage";
  if (row.subject_kind === "switch") return "yes";
  return row.subject_key === "recruit_events" ? "view" : "edit";
}

let client: Client;
let rows: MatrixRow[];

describe.runIf(configured)("the printed access matrix — LAN-429", () => {
  beforeAll(async () => {
    client = await openLocalClient();
    rows = (await client.query<MatrixRow>(MATRIX_QUERY, [SEEDED_TEMPLATES])).rows;
  });

  afterAll(async () => {
    await client?.end();
  });

  it("prints exactly the checked-in fixture", () => {
    const seatOrder = [...new Set(rows.map((row) => row.role_code))];
    const printed = [...rows]
      .sort(
        (a, b) =>
          seatOrder.indexOf(a.role_code) - seatOrder.indexOf(b.role_code) ||
          rank(lineOf(a)) - rank(lineOf(b)) ||
          lineOf(a).localeCompare(lineOf(b)),
      )
      .map((row) => `${row.role_code.padEnd(22)} ${lineOf(row).padEnd(44)} ${row.level}`)
      .join("\n");

    expect(`${printed}\n`).toBe(readFileSync(FIXTURE, "utf8"));
  });

  it("gives every one of the twenty seats every line: 11 + 3 + 7 templates + 2", async () => {
    const seats = await client.query<{ code: string }>("select code from public.roles");
    expect(seats.rows).toHaveLength(20);
    for (const { code } of seats.rows) {
      expect(
        rows.filter((row) => row.role_code === code),
        code,
      ).toHaveLength(23);
    }
  });

  it("holds the five named seats at the maximum of every line", () => {
    for (const row of rows.filter((entry) => FULL_SEATS.includes(entry.role_code))) {
      expect(row.level, `${row.role_code} ${lineOf(row)}`).toBe(maximumOf(row));
    }
  });

  it("holds every other seat at none on every line", () => {
    const others = rows.filter((entry) => !FULL_SEATS.includes(entry.role_code));
    expect(others).toHaveLength(15 * 23);
    for (const row of others) {
      expect(row.level, `${row.role_code} ${lineOf(row)}`).toBe("none");
    }
  });

  it("seeds the roster group colours from the packet", async () => {
    const colours = await client.query<{ group_key: string; colour_key: string }>(
      "select group_key, colour_key from public.roster_group_colours order by group_key",
    );
    expect(Object.fromEntries(colours.rows.map((row) => [row.group_key, row.colour_key]))).toEqual({
      availability: "slate",
      coaching: "indigo",
      defensive: "purple",
      kit: "lancer_gold",
      membership: "blue",
      offensive: "teal",
      onboarding: "lancer_gold",
      person: "blue",
      special_teams: "brown",
      warmup: "cyan",
    });
  });
});
