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
 * Membership activation is checked against the catalogue's own structure
 * rather than against a list retyped here: it is exactly the constitutional
 * offices plus the General Manager, which is what "Exec/GM" was read as. A
 * fifth office would fail it, and the grant would be revisited deliberately.
 *
 * The attendance-recorder grant is checked the same way — "exactly the
 * `season`-scoped seats" — and that tripwire has now fired twice, which is
 * worth reading as a whole, because it is the clearest example in the
 * repository of a test doing its job.
 *
 * It fired first when LAN-128 installed the approved twenty-role catalogue and
 * the coaching staff went from three seats to ten. The catalogue growing was
 * not a grant widening — the packet that approved the ten says in terms that
 * the catalogue includes roles carrying no privileged capability yet — so
 * LAN-128 replaced it with the stricter pair it meant: the three seats Brian
 * decided on 12 August 2026, and the seven added since holding **nothing**, in
 * any capability.
 *
 * It fired again when LAN-129 applied `REQ-coach-operator-onboarding` — "every
 * fixed coaching role receives only the approved narrow attendance capability"
 * — which is the owner decision the first firing was waiting for. The
 * scope-derived form is correct again, and is paired with a seat-by-seat check
 * that the ten hold those two capabilities and nothing else. An eleventh
 * season-scoped seat added without a decision fails both.
 *
 * Local Supabase only, and the seeded dataset — `openLocalClient` refuses any
 * non-loopback host. Requires `npm run db:seed`; CI does it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  CAPABILITY_KEYS,
  LEADERSHIP_TIERS,
  PROTECTED_LEADERSHIP_AUTHORITY,
  roleLabel,
  ROLE_LABELS,
  type CapabilityKey,
} from "@/lib/auth/capabilities";
import { openLocalClient, type Client } from "./helpers/domain-fixture";

const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.DATABASE_URL);

if (process.env.REQUIRE_SUPABASE_TESTS === "1" && !configured) {
  throw new Error("REQUIRE_SUPABASE_TESTS=1 but the local database is not configured.");
}

interface RoleRow {
  code: string;
  name: string;
  scope: string;
  is_constitutional_office: boolean;
  is_single_holder_seat: boolean;
}

let client: Client;
let catalogue: RoleRow[];

describe.runIf(configured)("the capability map against public.roles", () => {
  beforeAll(async () => {
    client = await openLocalClient();
    const result = await client.query<RoleRow>(
      "select code, name, scope, is_constitutional_office, is_single_holder_seat " +
        "from public.roles order by code",
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

  it("has the approved ten coaching seats in the catalogue", () => {
    const coachingSeats = catalogue
      .filter((role) => role.scope === "season")
      .map((role) => role.code)
      .sort();

    // REQ-static-role-catalogue, the Coaching Staff group, checked against the
    // database rather than against the migration's own text.
    expect(coachingSeats).toEqual(
      [
        "defence_coach",
        "defensive_backs_coach",
        "defensive_line_coach",
        "head_coach",
        "linebackers_coach",
        "offence_coach",
        "offensive_line_coach",
        "quarterbacks_coach",
        "special_teams_coach",
        "wide_receivers_coach",
      ].sort(),
    );
  });

  it("grants the narrow coach surface to every season-scoped seat, plus the administrator", () => {
    // Brian, 12 August 2026 (LAN-108/LAN-110) for the first three, and Brian,
    // 18 August 2026 (REQ-coach-operator-onboarding, applied by LAN-129) for
    // the other seven: "every fixed coaching role receives only the approved
    // narrow attendance capability".
    //
    // Checked against the catalogue's own `scope` rather than a list retyped
    // here, which is the shape this assertion had before LAN-128 grew the
    // catalogue and it is correct again now that the decision covers all ten.
    // An eleventh season-scoped seat added without a decision fails here, which
    // is the conversation this assertion exists to force.
    const coachingSeats = catalogue
      .filter((role) => role.scope === "season")
      .map((role) => role.code);

    expect([...CAPABILITIES.attendance_recorder.roleCodes].sort()).toEqual(
      [...coachingSeats, "it_officer"].sort(),
    );
    // `it_officer` is `committee_year`-scoped, so it is emphatically not one of
    // the season-scoped coaching seats — it is named separately, by LAN-124.
    expect(catalogue.find((role) => role.code === "it_officer")?.scope).toBe("committee_year");
  });

  it("grants the ten coaching seats those two capabilities and nothing else", () => {
    // The other half of the sentence above, and the boundary
    // REQ-coach-operator-onboarding draws: coaches "cannot confirm Green, see
    // availability history or actor identity, see injury/medical narrative or
    // general roster/contact data, or use football-assignment/depth-chart
    // self-service". Nothing in this repository implements those, and the
    // capabilities that do exist are refused seat by seat, against the real
    // catalogue.
    const coachingSeats = catalogue
      .filter((role) => role.scope === "season")
      .map((role) => role.code);

    expect(coachingSeats).toHaveLength(10);

    for (const code of coachingSeats) {
      for (const key of CAPABILITY_KEYS) {
        const expected = key === "attendance_recorder" || key === "attendance_recording";
        expect(CAPABILITIES[key].roleCodes.includes(code), `${key} / ${code}`).toBe(expected);
      }
    }
  });

  it("grants membership activation to exactly the constitutional offices plus the GM", () => {
    const offices = catalogue
      .filter((role) => role.is_constitutional_office)
      .map((role) => role.code);

    expect(offices.sort()).toEqual(["president", "secretary", "treasurer", "vice_president"]);
    expect([...CAPABILITIES.membership_activation.roleCodes].sort()).toEqual(
      [...offices, "general_manager", "it_officer"].sort(),
    );
  });

  it("grants event approval to the four calendar roles, and to no coaching seat", () => {
    // Was President-only, as a lead assumption LAN-73 recorded and deferred.
    // Brian settled it on LAN-77: the same four roles that manage the calendar.
    expect([...CAPABILITIES.event_approval.roleCodes].sort()).toEqual([
      "general_manager",
      "it_officer",
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
    // `delivery_administration` left this list in LAN-78, `leadership_report`
    // in LAN-81 and `role_management` in LAN-124, each of which decided its
    // grant. Nothing is undecided today, so the check that remains is the one
    // that matters against the real catalogue: every code a grant names has to
    // exist in `public.roles`, or the grant denies a legitimate operator
    // forever.
    const undecided: CapabilityKey[] = [];
    for (const key of undecided) {
      expect(CAPABILITIES[key].roleCodes).toEqual([]);
    }

    const known = new Set(catalogue.map((role) => role.code));
    for (const key of CAPABILITY_KEYS) {
      expect(CAPABILITIES[key].roleCodes.length, `${key} grants nobody`).toBeGreaterThan(0);
      for (const code of CAPABILITIES[key].roleCodes) {
        expect(known, `${key} names ${code}, which public.roles does not have`).toContain(code);
      }
    }
  });

  it("grants role management to three seats the catalogue really has", () => {
    // Brian's LAN-124 decision, widened by DEC-role-management-authority on 18
    // August 2026 and applied by LAN-129. Checked against `public.roles` rather
    // than a list in a test, because a seat renamed in the migration would
    // otherwise leave the club's administrative capability held by nobody — and
    // this is the one capability whose silent absence locks the club out of
    // fixing itself.
    expect([...CAPABILITIES.role_management.roleCodes].sort()).toEqual([
      "general_manager",
      "it_officer",
      "president",
    ]);

    for (const code of CAPABILITIES.role_management.roleCodes) {
      expect(
        catalogue.find((role) => role.code === code),
        `${code} is not in public.roles`,
      ).toBeDefined();
    }

    // One constitutional office, and two seats that are not — the two-tier
    // model does not track the constitution, and asserting it against the real
    // catalogue is what proves that rather than assuming it.
    expect(catalogue.find((role) => role.code === "president")?.is_constitutional_office).toBe(
      true,
    );
    expect(
      catalogue.find((role) => role.code === "general_manager")?.is_constitutional_office,
    ).toBe(false);
    expect(catalogue.find((role) => role.code === "it_officer")?.is_constitutional_office).toBe(
      false,
    );
  });

  it("protects only seats the catalogue really has, and the General Manager is single-holder", () => {
    // LAN-129's leadership tiers, against the database. A tier keyed on a code
    // the catalogue does not have would protect nobody, silently, and would be
    // invisible in every unit test in the repository.
    const known = new Set(catalogue.map((role) => role.code));

    for (const code of Object.keys(LEADERSHIP_TIERS)) {
      expect(known, `LEADERSHIP_TIERS names ${code}, which public.roles does not have`).toContain(
        code,
      );
    }

    for (const tier of ["standing_continuity", "presiding"] as const) {
      for (const kind of ["management", "recovery"] as const) {
        for (const code of PROTECTED_LEADERSHIP_AUTHORITY[tier][kind]) {
          expect(known, `${tier}/${kind} names ${code}`).toContain(code);
        }
      }
    }

    // DEC-general-manager-standing, and the reason the seat's management list
    // is empty: there is exactly one General Manager, so any General Manager
    // acting on a General Manager is acting on themselves.
    expect(catalogue.find((role) => role.code === "general_manager")?.is_single_holder_seat).toBe(
      true,
    );
  });

  it("labels every catalogue seat exactly as public.roles names it", () => {
    // Review finding LAN128-A1. `ROLE_LABELS` is a second copy of
    // migration-owned display names, and until LAN-129 nothing asserted the two
    // agreed — so renaming a seat in a migration left the application saying
    // the old name, or falling back to the raw code. It cannot be removed (the
    // capability map may not open a database) so it is pinned instead, here,
    // character for character.
    const named = catalogue.map((role) => role.code).sort();
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(named);

    for (const role of catalogue) {
      expect(roleLabel(role.code), `${role.code} is labelled wrongly`).toBe(role.name);
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
