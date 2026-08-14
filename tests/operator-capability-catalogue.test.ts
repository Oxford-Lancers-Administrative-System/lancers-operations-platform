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

  it("grants event approval to the four calendar roles, and to no coaching seat", () => {
    // Was President-only, as a lead assumption LAN-73 recorded and deferred.
    // Brian settled it on LAN-77: the same four roles that manage the calendar.
    expect([...CAPABILITIES.event_approval.roleCodes].sort()).toEqual([
      "general_manager",
      "president",
      "secretary",
      "vice_president",
    ]);

    // Three offices plus the General Manager, who is deliberately not one —
    // checked against the real catalogue rather than against a list in a test,
    // so that a code renamed in the seed fails here.
    for (const code of CAPABILITIES.event_approval.roleCodes) {
      const role = catalogue.find((candidate) => candidate.code === code);
      expect(role, `${code} is not in public.roles`).toBeDefined();
    }
    expect(
      catalogue.find((role) => role.code === "general_manager")?.is_constitutional_office,
    ).toBe(false);

    // The Treasurer is an office and is not an approver; no coaching seat is.
    expect(CAPABILITIES.event_approval.roleCodes).not.toContain("treasurer");
    for (const code of ["head_coach", "offence_coach", "defence_coach"]) {
      expect(CAPABILITIES.event_approval.roleCodes).not.toContain(code);
    }
  });

  it("leaves no undecided capability holding a code by accident", () => {
    // `delivery_administration` left this list in LAN-78 and
    // `leadership_report` in LAN-81, each of which decided its grant.
    // `role_management` is the one that remains undecided, and it must still
    // hold nothing at all.
    for (const key of ["role_management"] as const) {
      expect(CAPABILITIES[key].roleCodes).toEqual([]);
    }
  });

  it("grants the Monday report only codes the catalogue really has", () => {
    // Same reason as delivery below: a typo in this grant is a permanent silent
    // refusal that no test would otherwise catch, and the report is the one
    // destination in the shell that a wrong code would lock everybody out of.
    expect(CAPABILITIES.leadership_report.roleCodes.length).toBeGreaterThan(0);
    for (const code of CAPABILITIES.leadership_report.roleCodes) {
      expect(catalogue.map((role) => role.code)).toContain(code);
    }
  });

  it("grants delivery administration only codes the catalogue really has", () => {
    // The point of this suite: a typo in a grant is a permanent silent refusal.
    for (const code of CAPABILITIES.delivery_administration.roleCodes) {
      expect(catalogue.map((role) => role.code)).toContain(code);
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
