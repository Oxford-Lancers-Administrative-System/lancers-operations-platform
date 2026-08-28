// @vitest-environment node
/**
 * REQ-restricted-fields, asserted structurally rather than promised in prose.
 *
 * An emergency contact is third-party personal data about somebody who never
 * agreed to be in this system. LAN-182 records it in
 * `public.person_emergency_contacts`, and the packet's word for how it is
 * protected is **structurally**: not by a convention anybody has to remember,
 * and not by a permission somebody could widen, but by the table being
 * unreachable from the machinery that reaches people.
 *
 * "Unreachable" is three separate claims, and each is checked here against the
 * live catalogue or the source rather than against a comment:
 *
 *   1. it is not a `people` row and not a `contact_point`, so nothing that walks
 *      either finds it;
 *   2. no audience, messaging, delivery or export module names it, so no query
 *      that assembles who to write to can carry it;
 *   3. it appears in no view, so an export built by selecting a view — which is
 *      how a leadership export would be built — cannot include it by accident.
 *
 * Date of birth is held to the second and third of those for the same reason:
 * REQ-restricted-fields keeps it off every list, board and queue, and the
 * derived `person_standing.is_under_18` is what those surfaces may read.
 *
 * The point of asserting it here is that the protection survives somebody who
 * has never read the packet. A later change that joins the table into an
 * audience query fails a test rather than shipping.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { one, openLocalClient, type Client } from "./helpers/domain-fixture";

const repoRoot = path.resolve(import.meta.dirname, "..");
const servicesDir = path.join(repoRoot, "src", "lib", "services");

/**
 * Every module that decides who the club writes to, or renders a list of
 * people. Named individually rather than matched by prefix: a glob would
 * silently stop covering a module somebody renames, and this list failing to
 * mention a new one is a smaller risk than it silently covering nothing.
 */
const REACHES_PEOPLE = [
  "audience-selection.ts",
  "event-audience.ts",
  "event-approval.ts",
  "delivery.ts",
  "messaging-schedule.ts",
  "messaging-scheduler.ts",
  "follow-ups.ts",
  "weekly-report.ts",
  "administration-directory.ts",
  "roster.ts",
  "membership.ts",
  "rsvp.ts",
  "rsvp-tokens.ts",
  "player-home.ts",
];

const RESTRICTED = ["person_emergency_contacts", "date_of_birth"];

describe("the restricted person fields are locked down structurally", () => {
  it("names modules that actually exist, so this list cannot rot into a no-op", () => {
    const present = new Set(readdirSync(servicesDir));
    for (const file of REACHES_PEOPLE) {
      expect(present.has(file), `${file} is named here but not in the repository`).toBe(true);
    }
  });

  for (const file of REACHES_PEOPLE) {
    it(`${file} reaches no restricted field`, () => {
      const source = readFileSync(path.join(servicesDir, file), "utf8");
      // Comments stripped: a module is allowed to explain why it does not read
      // these, and an explanation must not read as a violation.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
      for (const field of RESTRICTED) {
        expect(code, `${file} names ${field}`).not.toContain(field);
      }
    });
  }
});

describe("the restricted person fields against the live schema", () => {
  let client: Client;

  beforeAll(async () => {
    client = await openLocalClient();
  });

  afterAll(async () => {
    await client.end();
  });

  it("keeps the emergency contact out of people and out of contact_points", async () => {
    const columns = await client.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name
         from information_schema.columns
        where table_schema = 'public'
          and table_name in ('people', 'contact_points')`,
    );
    const names = columns.rows.map((row) => `${row.table_name}.${row.column_name}`);
    for (const name of names) {
      expect(name).not.toMatch(/emergency/i);
    }
  });

  it("is one row per person, joined to nothing else", async () => {
    const references = await client.query<{ referenced: string }>(
      `select (n.nspname || '.' || parent.relname) as referenced
         from pg_constraint con
         join pg_class child on child.oid = con.conrelid
         join pg_class parent on parent.oid = con.confrelid
         join pg_namespace n on n.oid = parent.relnamespace
        where con.contype = 'f'
          and child.relname = 'person_emergency_contacts'
        order by 1`,
    );
    // `people` twice: the subject, and the operator who recorded it.
    expect([...new Set(references.rows.map((row) => row.referenced))]).toEqual(["public.people"]);

    const unique = await one<{ n: string }>(
      client,
      `select count(*)::text as n from pg_constraint
        where conrelid = 'public.person_emergency_contacts'::regclass
          and contype = 'u'`,
    );
    expect(unique.n).toBe("1");
  });

  it("appears in no view, so nothing built from views can carry it", async () => {
    const views = await client.query<{ viewname: string }>(
      `select viewname from pg_views
        where schemaname = 'public'
          and definition ilike '%person_emergency_contacts%'`,
    );
    expect(views.rows.map((row) => row.viewname)).toEqual([]);
  });

  it("exposes a date of birth as a column on no view at all", async () => {
    // Reading one is allowed and is the point — `person_standing` derives the
    // under-18 flag from it. Handing it out is not: a view with a
    // `date_of_birth` column is a list, board or queue away from showing it.
    const columns = await client.query<{ table_name: string }>(
      `select c.table_name
         from information_schema.columns c
         join pg_views v
           on v.schemaname = c.table_schema and v.viewname = c.table_name
        where c.table_schema = 'public' and c.column_name = 'date_of_birth'`,
    );
    expect(columns.rows.map((row) => row.table_name)).toEqual([]);
  });

  it("derives the under-18 flag without exposing the date it comes from", async () => {
    const columns = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'person_standing'
        order by 1`,
    );
    const names = columns.rows.map((row) => row.column_name);
    expect(names).toContain("is_under_18");
    expect(names).not.toContain("date_of_birth");
  });

  it("computes that flag from a date of birth rather than always answering null", async () => {
    // The derivation asserted against a row, because a view that returned null
    // for everybody would satisfy every assertion above.
    await client.query("begin");
    try {
      const child = await one<{ id: string }>(
        client,
        `insert into public.people (given_name, family_name, date_of_birth)
         values ('Underage', 'Testcase', current_date - interval '14 years')
         returning id`,
      );
      const adult = await one<{ id: string }>(
        client,
        `insert into public.people (given_name, family_name, date_of_birth)
         values ('Grown', 'Testcase', current_date - interval '30 years')
         returning id`,
      );
      const unknown = await one<{ id: string }>(
        client,
        `insert into public.people (given_name, family_name)
         values ('Undated', 'Testcase') returning id`,
      );

      const standing = await client.query<{ person_id: string; is_under_18: boolean | null }>(
        "select person_id, is_under_18 from public.person_standing where person_id = any($1::uuid[])",
        [[child.id, adult.id, unknown.id]],
      );
      const byPerson = new Map(standing.rows.map((row) => [row.person_id, row.is_under_18]));

      expect(byPerson.get(child.id)).toBe(true);
      expect(byPerson.get(adult.id)).toBe(false);
      // Null, not false. "We do not know" and "they are an adult" are different
      // answers, and a surface that treated the first as the second would be
      // asserting something nobody told it.
      expect(byPerson.get(unknown.id)).toBeNull();
    } finally {
      await client.query("rollback");
    }
  });
});
