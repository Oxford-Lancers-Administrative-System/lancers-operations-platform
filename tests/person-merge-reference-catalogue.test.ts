// @vitest-environment node
/**
 * "Ask the catalogue, not the migrations." LAN-185's merge re-points every
 * foreign key to `public.people` it is not explicitly excluded from — see the
 * module note on `person-merge.ts`. This proves the declared set against
 * `pg_constraint` directly, so a later migration that adds a new
 * person-referencing column fails this test rather than silently merging
 * incompletely.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { openLocalClient, type Client } from "./helpers/domain-fixture";
import {
  PERSON_REFERENCE_COLUMNS,
  PERSON_REFERENCE_COLUMNS_EXCLUDED,
} from "@/lib/services/person-merge";

let client: Client;

describe("PERSON_REFERENCE_COLUMNS accounts for every foreign key to people", () => {
  it("matches pg_constraint exactly, once the declared exclusions are added back", async () => {
    client = await openLocalClient();
    const result = await client.query<{ table_name: string; column_name: string }>(
      `select
         conrelid::regclass::text as table_name,
         (select attname from pg_attribute
           where attrelid = conrelid and attnum = conkey[1]) as column_name
       from pg_constraint
      where contype = 'f'
        and confrelid = 'public.people'::regclass`,
    );

    const fromCatalogue = new Set(
      result.rows.map((row) => `${row.table_name.replace(/^public\./, "")}.${row.column_name}`),
    );

    const declared = new Set([
      ...PERSON_REFERENCE_COLUMNS.map((c) => `${c.table}.${c.column}`),
      ...PERSON_REFERENCE_COLUMNS_EXCLUDED.map((c) => `${c.table}.${c.column}`),
    ]);

    const missingFromDeclaration = [...fromCatalogue].filter((key) => !declared.has(key));
    const declaredButNotReal = [...declared].filter((key) => !fromCatalogue.has(key));

    expect(missingFromDeclaration, "a real FK this module says nothing about").toEqual([]);
    expect(declaredButNotReal, "a declared FK that no longer exists").toEqual([]);
  });
});

afterAll(async () => {
  await client?.end();
});
