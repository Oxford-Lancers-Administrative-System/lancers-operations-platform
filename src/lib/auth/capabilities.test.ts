// @vitest-environment node
/**
 * The capability map — LAN-73, test-matrix rows 8, 9, 11 and 12.
 *
 * These assertions are written as **exact sets**, not as "contains". A test
 * that checks the President is permitted to approve an event still passes when
 * somebody adds the IT Officer next to them; a test that checks the permitted
 * set *is* `["president"]` does not. Every grant here was a recorded decision,
 * so widening one silently is precisely the failure worth catching.
 *
 * The role codes are also checked against the real catalogue in
 * tests/operator-capability-catalogue.test.ts, against the seeded database.
 * This file is about the policy; that one is about the codes existing.
 */
import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  CAPABILITY_KEYS,
  capabilityRequirement,
  capabilityRoleCodes,
  describeRoleRequirement,
  describeRoles,
  roleCodesPermit,
  type CapabilityKey,
} from "./capabilities";

/** The three coaching seats, per Brian's 12 August 2026 decision. */
const COACHES = ["head_coach", "offence_coach", "defence_coach"];

/**
 * The four roles Brian named for the club calendar, sorted, and now also the
 * approvers — LAN-76's clarification for the first, LAN-77's for the second.
 */
const CALENDAR = ["general_manager", "president", "secretary", "vice_president"];

/** Every role code in the catalogue, mirroring `scripts/seed-local.mjs`. */
const CATALOGUE = [
  "president",
  "vice_president",
  "secretary",
  "treasurer",
  "social_secretary",
  "gameday_secretary",
  "kit_manager",
  "media_secretary",
  "it_officer",
  "general_manager",
  "head_coach",
  "offence_coach",
  "defence_coach",
];

function permittedSet(key: CapabilityKey): string[] {
  return [...capabilityRoleCodes(key)].sort();
}

/**
 * The codes each capability must refuse, written out rather than derived from
 * the map.
 *
 * Deriving them — "every catalogue code this capability does not list" — reads
 * better and proves less: widen a grant and the derived list quietly stops
 * testing the code that was just added, so the very change the suite exists to
 * catch removes its own assertion. These are literal, so widening a grant fails
 * here as well as at the exact-set assertion.
 */
const MUST_REFUSE: Readonly<Record<string, readonly string[]>> = {
  attendance_recorder: [
    "president",
    "vice_president",
    "secretary",
    "treasurer",
    "social_secretary",
    "gameday_secretary",
    "kit_manager",
    "media_secretary",
    "it_officer",
    "general_manager",
  ],
  membership_activation: [
    "social_secretary",
    "gameday_secretary",
    "kit_manager",
    "media_secretary",
    "it_officer",
    "head_coach",
    "offence_coach",
    "defence_coach",
  ],
  event_calendar_management: [
    "treasurer",
    "social_secretary",
    "gameday_secretary",
    "kit_manager",
    "media_secretary",
    "it_officer",
    "head_coach",
    "offence_coach",
    "defence_coach",
  ],
  event_approval: [
    "treasurer",
    "social_secretary",
    "gameday_secretary",
    "kit_manager",
    "media_secretary",
    "it_officer",
    "head_coach",
    "offence_coach",
    "defence_coach",
  ],
};

it("checks every catalogue code against every settled capability", () => {
  // The three lists above, plus each capability's own grant, must between them
  // account for the whole catalogue — otherwise a code goes unasserted.
  for (const [key, refused] of Object.entries(MUST_REFUSE)) {
    const covered = [...refused, ...capabilityRoleCodes(key as CapabilityKey)].sort();
    expect(covered, `${key} leaves a catalogue code unasserted`).toEqual([...CATALOGUE].sort());
  }
});

describe("row 9 — the attendance-recorder grant is exactly the three coaching seats", () => {
  it("permits Head Coach, Offence Coach and Defence Coach, and nothing else", () => {
    expect(permittedSet("attendance_recorder")).toEqual([...COACHES].sort());
  });

  it.each(COACHES)("permits %s on its own", (code) => {
    expect(roleCodesPermit([code], "attendance_recorder")).toBe(true);
  });

  it.each(MUST_REFUSE.attendance_recorder)("refuses %s", (code) => {
    expect(roleCodesPermit([code], "attendance_recorder")).toBe(false);
  });

  it("refuses an operator holding no role at all", () => {
    expect(roleCodesPermit([], "attendance_recorder")).toBe(false);
  });

  it("refuses a role code that is not in the catalogue at all", () => {
    // A typo, a renamed seat, or an invented one. None of them is permission.
    expect(roleCodesPermit(["coach"], "attendance_recorder")).toBe(false);
    expect(roleCodesPermit(["assistant_coach"], "attendance_recorder")).toBe(false);
    expect(roleCodesPermit(["offensive_coordinator"], "attendance_recorder")).toBe(false);
  });
});

describe("row 11 — the membership-activation grant is Exec plus the General Manager", () => {
  it("permits exactly the four offices and the General Manager", () => {
    expect(permittedSet("membership_activation")).toEqual(
      ["general_manager", "president", "secretary", "treasurer", "vice_president"].sort(),
    );
  });

  it.each(["president", "vice_president", "secretary", "treasurer", "general_manager"])(
    "permits %s on its own",
    (code) => {
      expect(roleCodesPermit([code], "membership_activation")).toBe(true);
    },
  );

  it.each(COACHES)("refuses %s — a coach never activates a membership", (code) => {
    expect(roleCodesPermit([code], "membership_activation")).toBe(false);
  });

  it.each(MUST_REFUSE.membership_activation)("refuses %s", (code) => {
    expect(roleCodesPermit([code], "membership_activation")).toBe(false);
  });
});

describe("the calendar-management grant is the four roles Brian named", () => {
  it("permits exactly those four", () => {
    expect(permittedSet("event_calendar_management")).toEqual(CALENDAR);
  });

  it.each(CALENDAR)("permits %s on its own", (code) => {
    expect(roleCodesPermit([code], "event_calendar_management")).toBe(true);
  });

  it.each(MUST_REFUSE.event_calendar_management)("refuses %s", (code) => {
    expect(roleCodesPermit([code], "event_calendar_management")).toBe(false);
  });

  it("refuses the Treasurer, who is Exec but not on the calendar", () => {
    // The one seat most likely to be added by mistake: the Treasurer holds
    // membership activation and is a constitutional office, so a reader
    // pattern-matching on "Exec" would include them. Brian's clarification
    // names four roles and the Treasurer is not among them.
    expect(roleCodesPermit(["treasurer"], "event_calendar_management")).toBe(false);
    expect(roleCodesPermit(["treasurer"], "membership_activation")).toBe(true);
  });

  it("refuses an operator holding no role at all", () => {
    expect(roleCodesPermit([], "event_calendar_management")).toBe(false);
  });
});

describe("row 12 — event approval is the four calendar roles", () => {
  /**
   * This was `["president"]` — a lead assumption that recorded the gap and
   * deferred it to LAN-77, because `slice-ux.md` said "normally President or
   * delegated lead" and delegation is unrepresentable in the frozen model.
   *
   * Brian answered it in LAN-77's owner clarification: the President,
   * Vice-President, Secretary and General Manager are each authorized, and any
   * one of them may approve their own draft. The exact-set assertion is
   * unchanged in strength; only the recorded decision it encodes has moved.
   */
  it("permits exactly the four calendar roles", () => {
    expect(permittedSet("event_approval")).toEqual(CALENDAR);
  });

  it.each(MUST_REFUSE.event_approval)("refuses %s", (code) => {
    expect(roleCodesPermit([code], "event_approval")).toBe(false);
  });

  it("refuses the Treasurer, who is an Office but not a calendar role", () => {
    // The one result most likely to be "corrected" by somebody reading
    // "the four constitutional offices" and assuming this is that set. It is
    // not: the General Manager is in and the Treasurer is out.
    expect(roleCodesPermit(["treasurer"], "event_approval")).toBe(false);
    expect(roleCodesPermit(["general_manager"], "event_approval")).toBe(true);
  });

  it("refuses every coaching seat", () => {
    for (const code of COACHES) {
      expect(roleCodesPermit([code], "event_approval")).toBe(false);
    }
  });

  it("grants nothing that calendar management does not also grant", () => {
    // The two are separate capabilities that currently agree. If approval ever
    // widens past the people who may edit the event, that is a decision rather
    // than a refactor, and this is where it surfaces.
    expect(permittedSet("event_approval")).toEqual(permittedSet("event_calendar_management"));
  });
});

describe("delivery administration — decided by LAN-78", () => {
  /**
   * This capability was one of the undecided three until LAN-78 built delivery.
   * Its assertions have moved here rather than been deleted: the grant is now a
   * decision with a shape, and the shape is what needs proving.
   */
  it("grants exactly the four event-workflow roles", () => {
    expect([...capabilityRoleCodes("delivery_administration")].sort()).toEqual(
      ["general_manager", "president", "secretary", "vice_president"].sort(),
    );
  });

  it("agrees with event approval, because delivery repair continues it", () => {
    expect(permittedSet("delivery_administration")).toEqual(permittedSet("event_approval"));
  });

  it("refuses every coaching seat", () => {
    // slice-ux.md § 3 names delivery among the surfaces a coaching seat never
    // receives, so this is a contract rather than a preference.
    for (const code of COACHES) {
      expect(roleCodesPermit([code], "delivery_administration")).toBe(false);
    }
  });

  it("refuses the Treasurer, as calendar management does", () => {
    expect(capabilityRoleCodes("delivery_administration")).not.toContain("treasurer");
  });

  it("records who decided it and when", () => {
    expect(CAPABILITIES.delivery_administration.decision).toMatch(/LAN-78/);
    expect(CAPABILITIES.delivery_administration.decision).not.toMatch(/undecided/i);
  });
});

describe("the undecided capabilities are refused to everybody", () => {
  // Two, since LAN-78 decided the third. Both still name the issue that owes
  // the answer, and both are still refused to the whole catalogue at once.
  const undecided: CapabilityKey[] = ["role_management", "leadership_report"];

  it.each(undecided)("%s permits no role code at all", (key) => {
    expect(capabilityRoleCodes(key)).toEqual([]);
  });

  it.each(undecided)("%s refuses even the President", (key) => {
    expect(roleCodesPermit(["president"], key)).toBe(false);
  });

  it.each(undecided)("%s refuses every code in the catalogue", (key) => {
    for (const code of CATALOGUE) {
      expect(roleCodesPermit([code], key)).toBe(false);
    }
    // And the whole catalogue held at once, which is the strongest actor there
    // could be. An empty grant that widens under enough roles is not empty.
    expect(roleCodesPermit(CATALOGUE, key)).toBe(false);
  });

  it.each(undecided)("%s records which issue owes the decision", (key) => {
    expect(CAPABILITIES[key].decision).toMatch(/undecided/i);
  });
});

describe("row 8 — the map is the single source of truth, and is not editable at runtime", () => {
  it("names every privileged action the slice can refuse", () => {
    expect([...CAPABILITY_KEYS].sort()).toEqual(
      [
        "attendance_recorder",
        "delivery_administration",
        "event_approval",
        "event_calendar_management",
        "leadership_report",
        "membership_activation",
        "role_management",
      ].sort(),
    );
  });

  it("records provenance for every grant", () => {
    for (const key of CAPABILITY_KEYS) {
      expect(CAPABILITIES[key].decision.length).toBeGreaterThan(20);
      expect(CAPABILITIES[key].action.length).toBeGreaterThan(5);
    }
  });

  it("refuses a mutation of a grant at runtime", () => {
    const codes = capabilityRoleCodes("event_approval") as string[];
    expect(() => codes.push("it_officer")).toThrow();
    expect([...capabilityRoleCodes("event_approval")].sort()).toEqual(CALENDAR);
  });

  it("refuses a replacement of a whole capability at runtime", () => {
    const map = CAPABILITIES as Record<string, unknown>;
    expect(() => {
      map.event_approval = { key: "event_approval", roleCodes: ["it_officer"] };
    }).toThrow();
    expect([...capabilityRoleCodes("event_approval")].sort()).toEqual(CALENDAR);
  });
});

describe("row 6 — a requirement sentence names the action's need, never the actor's holdings", () => {
  it("names one role in the singular", () => {
    // Tested through the pure function rather than through a capability,
    // because no capability grants exactly one role any more — LAN-77 widened
    // event approval from President-only to the four calendar roles. The
    // singular branch is still reachable the moment any grant narrows to one,
    // so it keeps its coverage rather than losing it to that change.
    expect(describeRoleRequirement(["president"])).toBe("This action requires the President role.");
  });

  it("names the approvers as the list they now are", () => {
    expect(capabilityRequirement("event_approval")).toBe(
      "This action requires one of these roles: President, Vice-President, Secretary " +
        "or General Manager.",
    );
  });

  it("lists several readably", () => {
    expect(capabilityRequirement("membership_activation")).toBe(
      "This action requires one of these roles: President, Vice-President, Secretary, " +
        "Treasurer or General Manager.",
    );
  });

  it("says plainly that nobody is authorized, rather than naming an empty list", () => {
    expect(capabilityRequirement("leadership_report")).toBe(
      "No club role is currently authorized to perform this action.",
    );
  });

  it("uses the club's names for the two coordinator seats", () => {
    expect(capabilityRequirement("attendance_recorder")).toBe(
      "This action requires one of these roles: Head Coach, Offence Coach or Defence Coach.",
    );
  });

  it("falls back to the raw code rather than inventing a label", () => {
    expect(describeRoles(["gameday_secretary"])).toBe("gameday_secretary");
    expect(describeRoleRequirement(["gameday_secretary"])).toBe(
      "This action requires the gameday_secretary role.",
    );
  });

  it("never mentions a person, an account or a holder", () => {
    for (const key of CAPABILITY_KEYS) {
      const sentence = capabilityRequirement(key);
      expect(sentence).not.toMatch(/you hold|your role|currently hold|assigned to|held by/i);
    }
  });
});
