// @vitest-environment node
/**
 * LAN-462 — the one-off correction Brian runs against hosted for emails stored
 * before the application classified them
 * (`scripts/pilot/lan-462/classify-unclassified-emails.sql`), proved against
 * the local database with synthetic rows: the plain cases, the preferred-slot
 * collision and both duplicate shapes.
 *
 * The script classifies every unclassified email in the database it runs
 * against, so it never runs here outside a transaction: its own `begin;` and
 * `commit;` are stripped, and each case is rolled back.
 *
 * In `tests/` rather than beside the service because no file under `src/` may
 * name the pilot directory (`tests/pilot-data-contract.test.ts`).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openLocalClient, type Client } from "./helpers/domain-fixture";

const root = resolve(import.meta.dirname, "..");
const SCRIPT = join(root, "scripts", "pilot", "lan-462", "classify-unclassified-emails.sql");

const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.DATABASE_URL);

if (process.env.REQUIRE_SUPABASE_TESTS === "1" && !configured) {
  throw new Error("REQUIRE_SUPABASE_TESTS=1 but the local database is not configured.");
}

const MARKER = "LAN462Fixture:email-correction";

let client: Client;

interface EmailRow {
  scope: string | null;
  raw_value: string;
  is_preferred: boolean;
}

async function person(tag: string): Promise<string> {
  const inserted = await client.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [MARKER, tag],
  );
  return inserted.rows[0].id;
}

async function email(
  personId: string,
  rawValue: string,
  scope: "college" | "personal" | null,
  preferred: boolean,
  createdAt = "2026-09-01T10:00:00Z",
): Promise<void> {
  await client.query(
    `insert into public.contact_points
       (person_id, kind, scope, raw_value, is_preferred, source, created_at)
     values ($1, 'email', $2::public.contact_point_scope, $3, $4, 'fixture', $5)`,
    [personId, scope, rawValue, preferred, createdAt],
  );
}

async function emailsOf(personId: string): Promise<EmailRow[]> {
  const result = await client.query<EmailRow>(
    `select scope::text as scope, raw_value, is_preferred from public.contact_points
      where person_id = $1 and kind = 'email'
      order by scope nulls first, is_preferred desc, raw_value`,
    [personId],
  );
  return result.rows;
}

async function runCorrection(): Promise<void> {
  const sql = readFileSync(SCRIPT, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "begin;" && line.trim() !== "commit;")
    .join("\n");
  await client.query(sql);
}

describe("the LAN-462 correction script's shape", () => {
  it("is one transaction that opens with a preflight and closes with a commit", () => {
    const sql = readFileSync(SCRIPT, "utf8");
    const statements = sql
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.trim().startsWith("--"));
    expect(statements[0]).toBe("begin;");
    expect(statements.at(-1)).toBe("commit;");
    expect(sql).toMatch(/do \$preflight\$/);
    expect(sql).toMatch(/raise exception/);
    // Classifies by rule: no table but contact_points is written.
    expect(sql).not.toMatch(/\b(insert into|create table|alter table|grant)\b/i);
  });
});

describe.runIf(configured)("the LAN-462 correction, against the local database", () => {
  beforeAll(async () => {
    client = await openLocalClient();
  });

  beforeEach(async () => {
    await client.query("begin");
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  afterAll(async () => {
    await client?.end();
  });

  it("classifies by rule, keeps the classified preferred, and removes duplicates", async () => {
    // Plain cases: one unclassified Oxford address, one personal.
    const oxford = await person("oxford");
    await email(oxford, "player@college.ox.ac.uk", null, true);
    const personal = await person("personal");
    await email(personal, "coach@example.invalid", null, true);

    // Collision: a preferred personal email already classified, and the
    // operator's unclassified personal one. The classified one stays preferred.
    const collision = await person("collision");
    await email(collision, "classified@example.invalid", "personal", true);
    await email(collision, "operator@example.invalid", null, true);

    // Same address twice, classified and unclassified: the unclassified copy goes.
    const duplicate = await person("duplicate");
    await email(duplicate, "twice@college.ox.ac.uk", "college", true);
    await email(duplicate, "Twice@College.ox.ac.uk", null, true);

    // Same address twice, both unclassified: the preferred copy is kept.
    const doubled = await person("doubled");
    await email(doubled, "doubled@example.invalid", null, false, "2026-08-01T10:00:00Z");
    await email(doubled, "doubled@example.invalid", null, true, "2026-09-01T10:00:00Z");

    // An unclassified Oxford address beside a personal one: two scopes, both preferred.
    const both = await person("both");
    await email(both, "home@example.invalid", "personal", true);
    await email(both, "study@college.ox.ac.uk", null, true);

    await runCorrection();

    expect(await emailsOf(oxford)).toEqual([
      { scope: "college", raw_value: "player@college.ox.ac.uk", is_preferred: true },
    ]);
    expect(await emailsOf(personal)).toEqual([
      { scope: "personal", raw_value: "coach@example.invalid", is_preferred: true },
    ]);
    expect(await emailsOf(collision)).toEqual([
      { scope: "personal", raw_value: "classified@example.invalid", is_preferred: true },
      { scope: "personal", raw_value: "operator@example.invalid", is_preferred: false },
    ]);
    expect(await emailsOf(duplicate)).toEqual([
      { scope: "college", raw_value: "twice@college.ox.ac.uk", is_preferred: true },
    ]);
    expect(await emailsOf(doubled)).toEqual([
      { scope: "personal", raw_value: "doubled@example.invalid", is_preferred: true },
    ]);
    expect(await emailsOf(both)).toEqual([
      { scope: "college", raw_value: "study@college.ox.ac.uk", is_preferred: true },
      { scope: "personal", raw_value: "home@example.invalid", is_preferred: true },
    ]);

    const left = await client.query(
      "select 1 from public.contact_points where kind = 'email' and scope is null",
    );
    expect(left.rowCount).toBe(0);
  });

  it("changes nothing on a second run", async () => {
    const id = await person("rerun");
    await email(id, "classified@example.invalid", "personal", true);
    await email(id, "operator@example.invalid", null, true);

    await runCorrection();
    const once = await emailsOf(id);
    await runCorrection();

    expect(await emailsOf(id)).toEqual(once);
  });
});
