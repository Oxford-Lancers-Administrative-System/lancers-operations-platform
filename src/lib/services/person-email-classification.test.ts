// @vitest-environment node
/**
 * LAN-462 — the email an operator is created with, classified, against the
 * real local database. Every case runs inside a transaction that is rolled
 * back. The one-off correction for older rows is proved in
 * `tests/email-classification-correction.test.ts`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg, { type Client } from "pg";

vi.mock("server-only", () => ({}));

import { resolveDatabaseUrl } from "@/lib/db";
import {
  classifyEmailScope,
  recordClassifiedEmailIn,
  recordLoginEmailIfNoneIn,
} from "./person-email-classification";

const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.DATABASE_URL);

if (process.env.REQUIRE_SUPABASE_TESTS === "1" && !configured) {
  throw new Error("REQUIRE_SUPABASE_TESTS=1 but the local database is not configured.");
}

const MARKER = "LAN462Fixture:email-classification";

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

describe("classifyEmailScope", () => {
  it("is college for an Oxford or .edu address and personal for anything else", () => {
    expect(classifyEmailScope("someone@college.ox.ac.uk")).toBe("college");
    expect(classifyEmailScope("  Someone@OX.AC.UK ")).toBe("college");
    expect(classifyEmailScope("visitor@school.edu")).toBe("college");
    expect(classifyEmailScope("someone@example.invalid")).toBe("personal");
    expect(classifyEmailScope("someone@ox.ac.uk.example.invalid")).toBe("personal");
  });
});

describe.runIf(configured)("against the local database", () => {
  beforeAll(async () => {
    client = new pg.Client({ connectionString: resolveDatabaseUrl() });
    await client.connect();
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

  describe("recordClassifiedEmailIn", () => {
    it("stores an Oxford address as the preferred college email", async () => {
      const id = await person("oxford");
      const outcome = await recordClassifiedEmailIn(client, {
        personId: id,
        address: "coach@college.ox.ac.uk",
        source: "test",
      });

      expect(outcome).toEqual({ kind: "inserted", scope: "college", preferred: true });
      expect(await emailsOf(id)).toEqual([
        { scope: "college", raw_value: "coach@college.ox.ac.uk", is_preferred: true },
      ]);
    });

    it("keeps an existing preferred email of the same scope preferred, the new one second", async () => {
      const id = await person("collision");
      await email(id, "first@example.invalid", "personal", true);

      const outcome = await recordClassifiedEmailIn(client, {
        personId: id,
        address: "second@example.invalid",
        source: "test",
      });

      expect(outcome).toEqual({ kind: "inserted", scope: "personal", preferred: false });
      expect(await emailsOf(id)).toEqual([
        { scope: "personal", raw_value: "first@example.invalid", is_preferred: true },
        { scope: "personal", raw_value: "second@example.invalid", is_preferred: false },
      ]);
    });

    it("writes nothing when the person already holds the address classified", async () => {
      const id = await person("already");
      await email(id, "Held@Example.invalid", "personal", true);

      const outcome = await recordClassifiedEmailIn(client, {
        personId: id,
        address: "held@example.invalid",
        source: "test",
      });

      expect(outcome).toEqual({ kind: "already_recorded" });
      expect(await emailsOf(id)).toHaveLength(1);
    });

    it("classifies the person's own unclassified copy of the address in place", async () => {
      const id = await person("in-place");
      await email(id, "own@college.ox.ac.uk", null, true);

      const outcome = await recordClassifiedEmailIn(client, {
        personId: id,
        address: "own@college.ox.ac.uk",
        source: "test",
      });

      expect(outcome).toEqual({ kind: "classified_in_place", scope: "college", preferred: true });
      expect(await emailsOf(id)).toEqual([
        { scope: "college", raw_value: "own@college.ox.ac.uk", is_preferred: true },
      ]);
    });
  });

  describe("recordLoginEmailIfNoneIn", () => {
    it("copies the login email onto a person with none", async () => {
      const id = await person("none");
      expect(
        await recordLoginEmailIfNoneIn(client, {
          personId: id,
          address: "login@example.invalid",
          source: "test",
        }),
      ).toEqual({ kind: "inserted", scope: "personal", preferred: true });
    });

    it("writes nothing for a person who already has an email of either kind", async () => {
      const id = await person("has-one");
      await email(id, "kept@college.ox.ac.uk", "college", true);

      expect(
        await recordLoginEmailIfNoneIn(client, {
          personId: id,
          address: "login@example.invalid",
          source: "test",
        }),
      ).toBeNull();
      expect(await emailsOf(id)).toHaveLength(1);
    });
  });
});
