// @vitest-environment node
/**
 * The capability map against the real role catalogue — LAN-73, rows 9, 11, 12.
 *
 * `src/lib/auth/capabilities.test.ts` proves the policy is what was decided.
 * This proves the policy is expressible: every role code it names exists in
 * `public.roles`, in the database, spelled the way the catalogue spells it. A
 * capability keyed on `offensive_coordinator` would pass every unit test in the
 * repository and deny the Offensive Coordinator forever, silently, because a
 * role code that matches nothing simply never matches.
 *
 * Two of the three grants are also checked against the catalogue's own
 * structure rather than against a list retyped here:
 *
 *   * the attendance recorders are exactly the `season`-scoped seats — which is
 *     what "the coaching staff" means in this schema;
 *   * membership activation is exactly the constitutional offices plus the
 *     General Manager — which is what "Exec/GM" was read as.
 *
 * If somebody adds a fourth coaching seat or a fifth office to the catalogue,
 * these fail and the grant gets revisited deliberately, with Brian, instead of
 * drifting.
 *
 * Local Supabase only, and the seeded dataset — `openLocalClient` refuses any
 * non-loopback host. Requires `npm run db:seed`; CI does it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CAPABILITIES, CAPABILITY_KEYS } from "@/lib/auth/capabilities";
import { openLocalClient, type Client } from "./helpers/domain-fixture";

const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.DATABASE_URL);

if (process.env.REQUIRE_SUPABASE_TESTS === "1" && !configured) {
  throw new Error("REQUIRE_SUPABASE_TESTS=1 but the local database is not configured.");
}

interface RoleRow {
  code: string;
  scope: string;
  is_constitutional_office: boolean;
}

let client: Client;
let catalogue: RoleRow[];

describe.runIf(configured)("the capability map against public.roles", () => {
  beforeAll(async () => {
    client = await openLocalClient();
    const result = await client.query<RoleRow>(
      "select code, scope, is_constitutional_office from public.roles order by code",
    );
    catalogue = result.rows;
  });

  afterAll(async () => {
    await client?.end();
  });

  it("has a seeded catalogue to check against at all", () => {
    // Without this, every assertion below would pass vacuously against an empty
    // table — which is exactly the state hosted Supabase is in today.
    expect(catalogue.length).toBeGreaterThan(0);
  });

  it("names only role codes that exist in the catalogue", () => {
    const known = new Set(catalogue.map((role) => role.code));

    for (const key of CAPABILITY_KEYS) {
      for (const code of CAPABILITIES[key].roleCodes) {
        expect(known, `${key} names a role code the catalogue does not have: ${code}`).toContain(
          code,
        );
      }
    }
  });

  it("grants attendance recording to exactly the coaching seats the catalogue has", () => {
    const coachingSeats = catalogue
      .filter((role) => role.scope === "season")
      .map((role) => role.code)
      .sort();

    expect(coachingSeats).toEqual(["defence_coach", "head_coach", "offence_coach"]);
    expect([...CAPABILITIES.attendance_recorder.roleCodes].sort()).toEqual(coachingSeats);
  });

  it("grants membership activation to exactly the constitutional offices plus the GM", () => {
    const offices = catalogue
      .filter((role) => role.is_constitutional_office)
      .map((role) => role.code);

    expect(offices.sort()).toEqual(["president", "secretary", "treasurer", "vice_president"]);
    expect([...CAPABILITIES.membership_activation.roleCodes].sort()).toEqual(
      [...offices, "general_manager"].sort(),
    );
  });

  it("grants event approval to a single constitutional office", () => {
    expect(CAPABILITIES.event_approval.roleCodes).toEqual(["president"]);

    const president = catalogue.find((role) => role.code === "president");
    expect(president?.is_constitutional_office).toBe(true);
  });

  it("leaves no undecided capability holding a code by accident", () => {
    for (const key of [
      "role_management",
      "delivery_administration",
      "leadership_report",
    ] as const) {
      expect(CAPABILITIES[key].roleCodes).toEqual([]);
    }
  });

  it("does not grant anything to a seat the catalogue calls generic coaching", () => {
    // LAN-108: permission is never inferred from a broad "coach" label. There
    // is no such row, and if one is ever added it must not silently pick up the
    // attendance capability.
    const generic = catalogue.filter((role) => /^coach$|assistant/i.test(role.code));
    expect(generic).toEqual([]);
  });
});
