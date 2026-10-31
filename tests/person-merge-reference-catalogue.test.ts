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

/**
 * Blind re-points the server role is not granted `update` on, recorded as they
 * stood before LAN-508. Hosted, the runtime connects as `app_runtime`, a member
 * of `service_role`, so each of these refuses the whole merge there today. They
 * are a decision for Brian, not fixed here; this list only stops a new one
 * joining them unnoticed, and is shortened as each is resolved.
 */
const UPDATE_GRANT_GAPS_BEFORE_LAN_508: readonly string[] = [
  "audit_events.actor_person_id",
  "availability_statuses.confirmed_by_person_id",
  // LAN-514 (main, merged into LAN-508): `club_messages` grants the server role
  // only `select, insert`, yet the merge re-points `sent_by_person_id`.
  "club_messages.sent_by_person_id",
  "availability_statuses.reported_by_person_id",
  "delivery_results.actor_person_id",
  "membership_position_groups.recorded_by_person_id",
  "onboarding_activity_log.actor_person_id",
  "onboarding_item_history.actor_person_id",
  "recruitment_prospect_notes.author_person_id",
  "recruitment_prospect_status_events.actor_person_id",
  "rsvp_responses.recorded_by_person_id",
  "schedule_changes.approved_by_person_id",
  "schedule_changes.recorded_by_person_id",
  "season_membership_status_events.actor_person_id",
  "weekly_reports.generated_by_person_id",
];

describe("every blind re-point runs as the server role", () => {
  it("is refused only where it already was before LAN-508", async () => {
    client ??= await openLocalClient();
    const loser = "00000000-0000-4000-8000-000000000508";
    const survivor = "00000000-0000-4000-8000-000000000509";
    const refused: string[] = [];
    await client.query("begin");
    try {
      // The statement the merge itself runs, as the role the application runs as.
      await client.query("set local role service_role");
      for (const { table, column } of PERSON_REFERENCE_COLUMNS) {
        const qualified = table.includes(".") ? table : `public.${table}`;
        await client.query("savepoint repoint");
        try {
          await client.query(
            `update ${qualified} set ${column} = $2::uuid where ${column} = $1::uuid`,
            [loser, survivor],
          );
          await client.query("release savepoint repoint");
        } catch (error) {
          if ((error as { code?: string }).code !== "42501") throw error;
          refused.push(`${table}.${column}`);
          await client.query("rollback to savepoint repoint");
        }
      }
    } finally {
      await client.query("rollback");
    }

    expect(
      refused.filter((key) => !UPDATE_GRANT_GAPS_BEFORE_LAN_508.includes(key)),
      "a blind re-point the server role may not run",
    ).toEqual([]);
    expect(
      UPDATE_GRANT_GAPS_BEFORE_LAN_508.filter((key) => !refused.includes(key)),
      "a recorded gap that has since been granted: remove it from the list",
    ).toEqual([]);
    // LAN-508's append-only tables are never re-pointed at all.
    expect(PERSON_REFERENCE_COLUMNS.filter((c) => c.table.startsWith("event_message"))).toEqual([]);
  });
});

afterAll(async () => {
  await client?.end();
});
