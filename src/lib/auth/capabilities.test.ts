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
  COACH_ROLE_CODES,
  describeHeldCoachingSeats,
  describeRoleCapabilities,
  describeRoleRequirement,
  describeRoles,
  FIXED_COACHING_ROLE_CODES,
  isNarrowAttendanceRecorder,
  LEADERSHIP_TIER_SEATS,
  LEADERSHIP_TIERS,
  NARROW_RECORDER_CAPABILITIES,
  NO_CAPABILITY_SUMMARY,
  PROTECTED_LEADERSHIP_AUTHORITY,
  roleCapabilities,
  roleCodesPermit,
  roleLabel,
  ROLE_LABELS,
  type CapabilityKey,
} from "./capabilities";

/**
 * The three coaching seats Brian decided on 12 August 2026 — the ones that held
 * the attendance grant before the catalogue grew to ten.
 *
 * Kept as its own list because several assertions below are about what the
 * catalogue *added*, and that difference is only expressible against the
 * original three.
 */
const COACHES = ["head_coach", "offence_coach", "defence_coach"];

/**
 * The ten fixed coaching seats, which since LAN-129 all hold the narrow
 * attendance pair — `REQ-coach-operator-onboarding`, Brian, 18 August 2026.
 *
 * Written out here rather than imported from the module under test, for the
 * reason the whole file is literal: a grant that is asserted against a list the
 * grant itself produced asserts nothing.
 */
const FIXED_COACHES = [
  ...COACHES,
  "quarterbacks_coach",
  "offensive_line_coach",
  "wide_receivers_coach",
  "defensive_line_coach",
  "linebackers_coach",
  "defensive_backs_coach",
  "special_teams_coach",
];

/** The seven the catalogue added, which held nothing until LAN-129. */
const COACHES_ADDED_BY_THE_CATALOGUE = FIXED_COACHES.filter((code) => !COACHES.includes(code));

/**
 * The four roles Brian named for the club calendar, sorted, and now also the
 * approvers — LAN-76's clarification for the first, LAN-77's for the second.
 */
const CALENDAR = ["general_manager", "president", "secretary", "vice_president"];

/**
 * The club's administrative seat, which since Brian's decision of 15 August
 * 2026 (LAN-124) is written into every grant in the map.
 *
 * Named once and spread into the exact-set assertions below rather than typed
 * into each, so that removing the seat from one capability fails that
 * capability's assertion alone — the point of those assertions being literal is
 * that a grant cannot move without a test moving with it.
 */
const ADMIN = "it_officer";

/** The four calendar roles plus the administrator, sorted. */
const CALENDAR_WITH_ADMIN = [...CALENDAR, ADMIN].sort();

/**
 * The three seats `DEC-role-management-authority` (Brian, 18 August 2026) puts
 * on `role_management`, sorted. Applied by LAN-129 over LAN-124's IT Officer.
 */
const ROLE_ADMINISTRATORS = ["president", "general_manager", ADMIN].sort();

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
  "quarterbacks_coach",
  "offensive_line_coach",
  "wide_receivers_coach",
  "defensive_line_coach",
  "linebackers_coach",
  "defensive_backs_coach",
  "special_teams_coach",
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
  // LAN-129 moved the seven added coaching seats out of this list and into the
  // grant. What is left is every non-coaching seat except the administrator —
  // no officer, coaching or otherwise, gets the constrained coach screen.
  attendance_recorder: [
    "president",
    "vice_president",
    "secretary",
    "treasurer",
    "social_secretary",
    "gameday_secretary",
    "kit_manager",
    "media_secretary",
    "general_manager",
  ],
  membership_activation: [
    "social_secretary",
    "gameday_secretary",
    "kit_manager",
    "media_secretary",
    "head_coach",
    "offence_coach",
    "defence_coach",
    "quarterbacks_coach",
    "offensive_line_coach",
    "wide_receivers_coach",
    "defensive_line_coach",
    "linebackers_coach",
    "defensive_backs_coach",
    "special_teams_coach",
  ],
  // LAN-215's roster_bulk_import reads as the identical Exec-plus-GM grant
  // `membership_activation` already carries (see capabilities.ts's own comment
  // on the entry), so the same roles must be refused here too.
  roster_bulk_import: [
    "social_secretary",
    "gameday_secretary",
    "kit_manager",
    "media_secretary",
    "head_coach",
    "offence_coach",
    "defence_coach",
    "quarterbacks_coach",
    "offensive_line_coach",
    "wide_receivers_coach",
    "defensive_line_coach",
    "linebackers_coach",
    "defensive_backs_coach",
    "special_teams_coach",
  ],
  event_calendar_management: [
    "treasurer",
    "social_secretary",
    "gameday_secretary",
    "kit_manager",
    "media_secretary",
    "head_coach",
    "offence_coach",
    "defence_coach",
    "quarterbacks_coach",
    "offensive_line_coach",
    "wide_receivers_coach",
    "defensive_line_coach",
    "linebackers_coach",
    "defensive_backs_coach",
    "special_teams_coach",
  ],
  event_approval: [
    "treasurer",
    "social_secretary",
    "gameday_secretary",
    "kit_manager",
    "media_secretary",
    "head_coach",
    "offence_coach",
    "defence_coach",
    "quarterbacks_coach",
    "offensive_line_coach",
    "wide_receivers_coach",
    "defensive_line_coach",
    "linebackers_coach",
    "defensive_backs_coach",
    "special_teams_coach",
  ],
  attendance_recording: [
    "treasurer",
    "social_secretary",
    "gameday_secretary",
    "kit_manager",
    "media_secretary",
  ],
  // LAN-129 widened this from `it_officer` alone to the three seats
  // DEC-role-management-authority names. Everything else in the catalogue is
  // refused, listed literally — including the Vice-President and the Secretary,
  // who hold every other operating capability the President does and administer
  // nothing, which is the entire content of the two-tier model.
  role_management: [
    "vice_president",
    "secretary",
    "treasurer",
    "social_secretary",
    "gameday_secretary",
    "kit_manager",
    "media_secretary",
    ...FIXED_COACHES,
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

describe("row 9 — the attendance-recorder grant is the coaching seats plus the administrator", () => {
  it("permits the ten fixed coaching seats and the IT Officer, and nothing else", () => {
    expect(permittedSet("attendance_recorder")).toEqual([...FIXED_COACHES, ADMIN].sort());
  });

  it.each(FIXED_COACHES)("permits %s on its own", (code) => {
    expect(roleCodesPermit([code], "attendance_recorder")).toBe(true);
  });

  it.each(COACHES_ADDED_BY_THE_CATALOGUE)(
    "permits %s, which held nothing before LAN-129",
    (code) => {
      // REQ-coach-operator-onboarding: "every fixed coaching role receives only
      // the approved narrow attendance capability". Asserted seat by seat
      // because the previous state — the seven holding nothing at all — was
      // itself pinned by a test, and this is the deliberate replacement of it.
      expect(roleCodesPermit([code], "attendance_recorder")).toBe(true);
    },
  );

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

/*
 * "LAN-80 — occurrence assertion is the four calendar roles, and no coach"
 * stood here, and is gone with the capability it guarded.
 *
 * `event_occurrence_assertion` protected **Mark occurred**, **Mark not held**
 * and the correction of either. LAN-151 retired all three: an event has
 * occurred when its date has passed and it was not cancelled (D30), so there is
 * no decision left for anybody to hold. The capability was removed rather than
 * left unused, because a capability nobody checks is an authorization decision
 * with no subject — still listed, still grantable, still reading to somebody as
 * a permission the club hands out.
 *
 * `slice-ux.md` § 8's rule that a coach who records attendance may not decide
 * that there was anything to record survives as the fact that there is no such
 * decision. The coaching seats' boundary is still asserted in full below and in
 * the whole-catalogue check above.
 */

describe("LAN-80 — attendance recording is the calendar roles plus the coaching seats", () => {
  /**
   * The union, and the criterion that produced it.
   *
   * The first implementation had no capability here at all: the board admitted
   * any linked operator. Brian's 12 August 2026 coach decision requires that
   * "an unauthorized coach and ordinary player are refused at the service
   * boundary", and an ordinary player holding an operator account is not
   * refused by that floor. The four calendar roles keep the Exec on their own
   * screen; the three coaching seats are on it because the same decision puts
   * them there.
   */
  it("permits exactly the four calendar roles and the ten coaching seats", () => {
    // Was "exactly the seven" — four plus the three coaching seats — until
    // LAN-129 put all ten fixed coaching seats on it, because the approved
    // narrow attendance capability includes "minimal walk-up capture" and
    // walk-up capture is guarded here rather than by `attendance_recorder`.
    expect(permittedSet("attendance_recording")).toEqual(
      [...CALENDAR, ...FIXED_COACHES, ADMIN].sort(),
    );
  });

  it.each([...CALENDAR, ...FIXED_COACHES])("permits %s on its own", (code) => {
    expect(roleCodesPermit([code], "attendance_recording")).toBe(true);
  });

  it.each(MUST_REFUSE.attendance_recording)("refuses %s", (code) => {
    expect(roleCodesPermit([code], "attendance_recording")).toBe(false);
  });

  it("refuses an operator holding no role at all — the ordinary player", () => {
    // The exact case the first implementation admitted.
    expect(roleCodesPermit([], "attendance_recording")).toBe(false);
  });

  it("does not widen the narrow coaching grant it sits beside", () => {
    // Two capabilities, two questions. `attendance_recorder` stays exactly the
    // coaching seats, because LAN-110 uses it to decide who gets the
    // constrained screen — a Secretary records attendance and must not get that
    // one. The two grants moved together in LAN-129 and still differ by exactly
    // the four calendar roles, which is the whole reason they are two.
    expect(permittedSet("attendance_recorder")).toEqual([...FIXED_COACHES, ADMIN].sort());
    for (const code of CALENDAR) {
      expect(roleCodesPermit([code], "attendance_recorder")).toBe(false);
      expect(roleCodesPermit([code], "attendance_recording")).toBe(true);
    }
  });

  it("keeps every one of the ten a narrow recorder rather than half a one", () => {
    // A seat holding `attendance_recorder` without `attendance_recording` is
    // classified narrow, offered the coach's surface and then refused every
    // action on it. The pair must move together, so it is asserted together.
    for (const code of FIXED_COACHES) {
      expect(roleCodesPermit([code], "attendance_recorder"), code).toBe(true);
      expect(roleCodesPermit([code], "attendance_recording"), code).toBe(true);
      expect(isNarrowAttendanceRecorder([code]), code).toBe(true);
    }
  });
});

describe("row 11 — the membership-activation grant is Exec plus the General Manager", () => {
  it("permits exactly the four offices and the General Manager", () => {
    expect(permittedSet("membership_activation")).toEqual(
      ["general_manager", "president", "secretary", "treasurer", "vice_president", ADMIN].sort(),
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

describe("R-002 — roster_bulk_import is the same Exec-plus-GM grant, six-role, proven directly", () => {
  // LAN-215's own capabilities.ts comment reads this grant as "the Exec + GM
  // grouping `membership_activation` already carries" plus `it_officer`, the
  // administrative seat every capability holds (LAN-124). Before this block
  // the only mention of `roster_bulk_import` in this file was the row-8
  // completeness list, which does not fail if the six-code array is mutated
  // in either direction. This proves it directly, mirroring the sibling
  // capabilities above.
  it("permits exactly the four offices, the General Manager and the IT Officer", () => {
    expect(permittedSet("roster_bulk_import")).toEqual(
      ["general_manager", "president", "secretary", "treasurer", "vice_president", ADMIN].sort(),
    );
  });

  it.each(["president", "vice_president", "secretary", "treasurer", "general_manager", ADMIN])(
    "permits %s on its own",
    (code) => {
      expect(roleCodesPermit([code], "roster_bulk_import")).toBe(true);
    },
  );

  it.each(COACHES)("refuses %s — a coach never imports the roster", (code) => {
    expect(roleCodesPermit([code], "roster_bulk_import")).toBe(false);
  });

  it.each(MUST_REFUSE.roster_bulk_import)("refuses %s", (code) => {
    expect(roleCodesPermit([code], "roster_bulk_import")).toBe(false);
  });

  it("refuses an empty role list", () => {
    expect(roleCodesPermit([], "roster_bulk_import")).toBe(false);
  });

  it("agrees with membership_activation, because W1 reads the same grouping", () => {
    expect(permittedSet("roster_bulk_import")).toEqual(permittedSet("membership_activation"));
  });

  it("records who decided it and when", () => {
    expect(CAPABILITIES.roster_bulk_import.decision).toMatch(/LAN-215/);
    expect(CAPABILITIES.roster_bulk_import.decision).not.toMatch(/undecided/i);
  });
});

describe("the calendar-management grant is the four roles Brian named", () => {
  it("permits exactly those four", () => {
    expect(permittedSet("event_calendar_management")).toEqual(CALENDAR_WITH_ADMIN);
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
    expect(permittedSet("event_approval")).toEqual(CALENDAR_WITH_ADMIN);
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
    expect([...capabilityRoleCodes("delivery_administration")].sort()).toEqual(CALENDAR_WITH_ADMIN);
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

describe("the Monday report is the four calendar roles, and no coaching seat", () => {
  // LAN-81 decided this grant, and the sensitive half of what it protects is
  // not the counts: the snapshot leads with the reasons people gave for not
  // attending, which `docs/ux/slice-ux.md` § 3 names among the data a coaching
  // seat never receives, alongside the report itself.
  it("admits each of the four", () => {
    for (const code of ["president", "vice_president", "secretary", "general_manager"]) {
      expect(roleCodesPermit([code], "leadership_report")).toBe(true);
    }
  });

  it("refuses every coaching seat, including all three at once", () => {
    for (const code of COACH_ROLE_CODES) {
      expect(roleCodesPermit([code], "leadership_report")).toBe(false);
    }
    expect(roleCodesPermit([...COACH_ROLE_CODES], "leadership_report")).toBe(false);
  });

  it("refuses the Treasurer, as the rest of the event workflow does", () => {
    expect(roleCodesPermit(["treasurer"], "leadership_report")).toBe(false);
    expect(capabilityRoleCodes("leadership_report")).not.toContain("treasurer");
  });

  it("refuses an ordinary operator holding an unrelated role", () => {
    // Deliberately not `it_officer`: since LAN-124 that seat is the club's
    // administrator and holds this. The pair below hold nothing at all, which
    // is what this assertion is for.
    expect(roleCodesPermit(["media_secretary", "social_secretary"], "leadership_report")).toBe(
      false,
    );
  });

  it("records who decided it and when", () => {
    expect(CAPABILITIES.leadership_report.decision).toMatch(/LAN-81/);
    expect(CAPABILITIES.leadership_report.decision).not.toMatch(/undecided/i);
  });
});

describe("the undecided capabilities are refused to everybody", () => {
  // One, since LAN-78 decided delivery and LAN-81 decided the report. It still
  // names the issue that owes the answer, and it is still refused to the whole
  // catalogue at once — which is the property this block exists for, and which
  // does not weaken as the list shortens.
  // None, since Brian decided `role_management` on 15 August 2026 (LAN-124).
  // The list is kept, empty, because the property it guards outlives the
  // entries: an empty grant must refuse everybody, so if a later issue adds a
  // capability before deciding who holds it, adding the key here is the whole
  // of the work. `no capability is silently empty` below is what stops an
  // empty grant slipping in without appearing on this list.
  const undecided: CapabilityKey[] = [];

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

  it("no capability is silently empty", () => {
    // The counterpart to the (now empty) list above: an empty grant is legal,
    // but only as a recorded decision to grant nothing. One that appears
    // without being listed as undecided is an accident.
    for (const key of CAPABILITY_KEYS) {
      if (undecided.includes(key)) continue;
      expect(
        capabilityRoleCodes(key),
        `${key} grants nobody and is not listed as undecided`,
      ).not.toEqual([]);
    }
  });
});

describe("LAN-124 — the IT Officer is the club's administrative seat", () => {
  // Brian's decision of 15 August 2026. Asserted positively and literally,
  // because the seat holding everything is precisely the kind of grant that
  // should never be arrived at by a rule, a default or an inheritance.
  it("holds every capability in the map", () => {
    for (const key of CAPABILITY_KEYS) {
      expect(roleCodesPermit(["it_officer"], key), key).toBe(true);
    }
  });

  it("holds role management, alongside the two seats LAN-129 added", () => {
    // Was `["it_officer"]` alone. Brian widened it on 18 August 2026
    // (DEC-role-management-authority) to the President and the General Manager
    // as well, and LAN-129 applied that. The assertion is unchanged in
    // strength — an exact set — and only the recorded decision it encodes has
    // moved.
    expect(permittedSet("role_management")).toEqual(ROLE_ADMINISTRATORS);
    for (const code of CATALOGUE) {
      if (ROLE_ADMINISTRATORS.includes(code)) continue;
      expect(roleCodesPermit([code], "role_management"), code).toBe(false);
    }
    // And the whole rest of the catalogue held at once, which is the strongest
    // actor there could be.
    const others = CATALOGUE.filter((code) => !ROLE_ADMINISTRATORS.includes(code));
    expect(roleCodesPermit(others, "role_management")).toBe(false);
  });

  it("still refuses the Vice-President and the Secretary", () => {
    // DEC-role-management-authority states this explicitly, and they are the
    // two seats a reader is most likely to add: they hold every other
    // capability in this file that the President holds.
    for (const code of ["vice_president", "secretary"]) {
      expect(roleCodesPermit([code], "role_management"), code).toBe(false);
      expect(roleCodesPermit([code], "leadership_report"), code).toBe(true);
      expect(roleCodesPermit([code], "event_approval"), code).toBe(true);
    }
  });

  it("records the owner decision rather than inheriting it", () => {
    expect(CAPABILITIES.role_management.decision).toMatch(/LAN-124/);
    expect(CAPABILITIES.role_management.decision).not.toMatch(/undecided/i);
    for (const key of CAPABILITY_KEYS) {
      expect(CAPABILITIES[key].decision, key).toMatch(/LAN-124|it_officer/);
    }
  });

  it("widens nobody else", () => {
    // The change was one seat. If it had been implemented as "administrators
    // hold everything" rather than as data, the roles below would have moved
    // too — they are the ones adjacent enough to be swept up by a rule.
    expect(roleCodesPermit(["treasurer"], "event_approval")).toBe(false);
    expect(roleCodesPermit(["media_secretary"], "leadership_report")).toBe(false);
    expect(roleCodesPermit(["kit_manager"], "role_management")).toBe(false);
    expect(roleCodesPermit(["head_coach"], "delivery_administration")).toBe(false);
  });
});

describe("row 8 — the map is the single source of truth, and is not editable at runtime", () => {
  it("names every privileged action the slice can refuse", () => {
    expect([...CAPABILITY_KEYS].sort()).toEqual(
      [
        "attendance_recorder",
        "attendance_recording",
        "delivery_administration",
        "event_approval",
        "event_calendar_management",
        "leadership_report",
        "membership_activation",
        "person_record_authority",
        "role_management",
        "roster_bulk_import",
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
    // A code the grant does not already hold, so that a push which silently
    // succeeded would be visible in the assertion below.
    expect(() => codes.push("media_secretary")).toThrow();
    expect([...capabilityRoleCodes("event_approval")].sort()).toEqual(CALENDAR_WITH_ADMIN);
  });

  it("refuses a replacement of a whole capability at runtime", () => {
    const map = CAPABILITIES as Record<string, unknown>;
    expect(() => {
      map.event_approval = { key: "event_approval", roleCodes: ["media_secretary"] };
    }).toThrow();
    expect([...capabilityRoleCodes("event_approval")].sort()).toEqual(CALENDAR_WITH_ADMIN);
  });
});

describe("row 6 — a requirement sentence names the action's need, never the actor's holdings", () => {
  it("names one role in the singular", () => {
    // Through the pure function only, again. `role_management` demonstrated the
    // singular branch from the map while LAN-124's grant was the IT Officer
    // alone; LAN-129 applied DEC-role-management-authority and no grant in the
    // map has one role now. The branch still has to be right for the next one
    // that does, so it keeps its coverage here rather than losing it to a
    // change that widened the last example.
    expect(describeRoleRequirement(["president"])).toBe("This action requires the President role.");
    expect(describeRoleRequirement(["general_manager"])).toBe(
      "This action requires the General Manager role.",
    );
  });

  it("names the three administrators for role management", () => {
    expect(capabilityRequirement("role_management")).toBe(
      "This action requires one of these roles: President, General Manager or IT Officer.",
    );
  });

  it("names the approvers as the list they now are", () => {
    expect(capabilityRequirement("event_approval")).toBe(
      "This action requires one of these roles: President, Vice-President, Secretary, " +
        "General Manager or IT Officer.",
    );
  });

  it("lists several readably", () => {
    expect(capabilityRequirement("membership_activation")).toBe(
      "This action requires one of these roles: President, Vice-President, Secretary, " +
        "Treasurer, General Manager or IT Officer.",
    );
  });

  it("says plainly that nobody is authorized, rather than naming an empty list", () => {
    // Through the pure function rather than a capability: `leadership_report`
    // demonstrated this until LAN-81 decided its grant, `role_management` until
    // LAN-124 decided its, and no grant in the map is empty today. The sentence
    // an empty grant produces still has to be right for the next capability
    // added before its decision is taken, so it keeps its coverage here rather
    // than losing it to a change that emptied the last example.
    expect(describeRoleRequirement([])).toBe(
      "No club role is currently authorized to perform this action.",
    );
  });

  it("names the report's authorized operators, now that they are decided", () => {
    expect(capabilityRequirement("leadership_report")).toBe(
      "This action requires one of these roles: President, Vice-President, Secretary, " +
        "General Manager or IT Officer.",
    );
  });

  it("uses the club's names for the two coordinator seats", () => {
    expect(capabilityRequirement("attendance_recorder")).toBe(
      "This action requires one of these roles: Head Coach, Offensive Coordinator, " +
        "Defensive Coordinator, Quarterbacks Coach, Offensive Line Coach, Wide Receivers " +
        "Coach, Defensive Line Coach, Linebackers Coach, Defensive Backs Coach, Special " +
        "Teams Coach or IT Officer.",
    );
  });

  it("falls back to the raw code rather than inventing a label", () => {
    // `gameday_secretary` demonstrated this until LAN-129 completed
    // ROLE_LABELS to the whole catalogue. Nothing in the catalogue reaches the
    // fallback any more, which is the point of completing it — but a mistyped
    // or invented code still must not crash and must not be labelled.
    expect(describeRoles(["gameday_secretary"])).toBe("Gameday Secretary");
    expect(describeRoles(["chairman"])).toBe("chairman");
    expect(describeRoleRequirement(["chairman"])).toBe("This action requires the chairman role.");
  });

  it("never mentions a person, an account or a holder", () => {
    for (const key of CAPABILITY_KEYS) {
      const sentence = capabilityRequirement(key);
      expect(sentence).not.toMatch(/you hold|your role|currently hold|assigned to|held by/i);
    }
  });
});

/**
 * The narrow attendance recorder — LAN-110.
 *
 * `slice-ux.md` § 3 gives a coaching assignment "only the occurred-event
 * attendance surface", and this derivation is what the shell, the gate and both
 * coach screens read to decide it. The last two cases walk the whole map rather
 * than naming examples, because the failure worth catching is a capability
 * added next year that a coaching seat quietly holds.
 */
describe("LAN-110 — who receives the narrow coach surface", () => {
  it("classifies each coaching seat on its own", () => {
    for (const code of COACHES) {
      expect(isNarrowAttendanceRecorder([code]), code).toBe(true);
    }
  });

  it("classifies a coach who holds several coaching seats", () => {
    expect(isNarrowAttendanceRecorder(COACHES)).toBe(true);
    expect(isNarrowAttendanceRecorder(["head_coach", "offence_coach"])).toBe(true);
  });

  it("does not narrow an operator who also holds a non-coaching capability", () => {
    // The case `attendance_recorder`'s own note calls out: a Secretary who also
    // coaches keeps the operator's board. § 3 describes what a coach receives;
    // it is not a rule for taking away authority a recorded decision granted.
    for (const code of ["president", "vice_president", "secretary", "general_manager"]) {
      expect(isNarrowAttendanceRecorder(["head_coach", code]), code).toBe(false);
    }
  });

  it("does not narrow an operator holding no capability at all", () => {
    // An operator with nothing granted is an ordinary operator with nothing
    // granted — they keep the ordinary shell and are refused action by action.
    // Narrowing them would hand the coach's surface to somebody holding no
    // coaching seat, which is the one direction this must never fail in.
    expect(isNarrowAttendanceRecorder([])).toBe(false);
    // `media_secretary` rather than `it_officer`, which since LAN-124 holds
    // every capability — it would still be refused narrowing, but for the
    // opposite reason, and this case is about holding nothing.
    expect(isNarrowAttendanceRecorder(["media_secretary", "kit_manager", "social_secretary"])).toBe(
      false,
    );
    expect(isNarrowAttendanceRecorder(["treasurer"])).toBe(false);
  });

  it("holds exactly the two attendance capabilities, and no other", () => {
    // The set is the definition, so it is asserted as a set. A third capability
    // added to it later would silently widen what a coach may reach.
    expect([...NARROW_RECORDER_CAPABILITIES].sort()).toEqual([
      "attendance_recorder",
      "attendance_recording",
    ]);
  });

  it("narrows nobody who holds a capability outside that set", () => {
    for (const key of CAPABILITY_KEYS) {
      if (NARROW_RECORDER_CAPABILITIES.includes(key)) continue;
      for (const code of capabilityRoleCodes(key)) {
        expect(isNarrowAttendanceRecorder([code, "head_coach"]), `${key} / ${code}`).toBe(false);
      }
    }
  });

  it("never narrows an actor who could not then record attendance", () => {
    // A narrow recorder is offered the attendance surface and nothing else, so
    // one who cannot record would be left with no surface at all.
    for (const codes of [
      [],
      ["president"],
      ["treasurer"],
      ["media_secretary"],
      ["it_officer"],
      COACHES,
    ]) {
      if (!isNarrowAttendanceRecorder(codes)) continue;
      expect(roleCodesPermit(codes, "attendance_recorder"), codes.join()).toBe(true);
      expect(roleCodesPermit(codes, "attendance_recording"), codes.join()).toBe(true);
    }
  });
});

describe("LAN-110 — captioning the coach's own seat", () => {
  it("names the seats this operator holds, and only those", () => {
    expect(describeHeldCoachingSeats(["head_coach"])).toBe("Head Coach");
    expect(describeHeldCoachingSeats(["offence_coach", "defence_coach"])).toBe(
      "Offensive Coordinator or Defensive Coordinator",
    );
  });

  it("says nothing at all for an operator holding no coaching seat", () => {
    expect(describeHeldCoachingSeats(["president"])).toBe("");
    expect(describeHeldCoachingSeats([])).toBe("");
  });

  it("does not name a seat the operator does not hold", () => {
    // The caption is a disclosure to the account's own holder about their own
    // account. Listing the other two coaching seats beside the one they hold
    // would make it a statement about the club's coaching staff instead.
    const caption = describeHeldCoachingSeats(["defence_coach"]);
    expect(caption).toBe("Defensive Coordinator");
    expect(caption).not.toContain("Head Coach");
    expect(caption).not.toContain("Offensive Coordinator");
  });
});

/**
 * LAN-129 — the capability definition is also where the copy comes from.
 *
 * `REQ-capability-copy-consistency`: "Role and coach capability explanations
 * shown in Administration are derived from the same reviewed capability
 * definition used by server enforcement, so a later approved grant change
 * updates authorization and plain-language UI copy together rather than leaving
 * stale duplicated descriptions."
 *
 * The requirement is about a *mechanism*, so these assertions are about the
 * mechanism: the copy is a projection of the grants, and there is nowhere else
 * for it to come from. The strongest of them is the last — every sentence the
 * summary can produce is a string that appears in the map.
 */
describe("LAN-129 — Administration's permission copy is derived, not duplicated", () => {
  it("gives each administering seat the role-management sentence", () => {
    for (const code of ROLE_ADMINISTRATORS) {
      expect(describeRoleCapabilities(code)).toContain(CAPABILITIES.role_management.action);
    }
  });

  it("gives a seat that holds nothing an explicit sentence rather than a blank", () => {
    // Ten of the twenty seats hold nothing, and a blank Permissions summary
    // reads as an omission rather than as the fact it is.
    for (const code of [
      "social_secretary",
      "gameday_secretary",
      "kit_manager",
      "media_secretary",
    ]) {
      expect(roleCapabilities(code), code).toEqual([]);
      expect(describeRoleCapabilities(code), code).toEqual([NO_CAPABILITY_SUMMARY]);
    }
  });

  it("never returns an empty summary for any code, in or out of the catalogue", () => {
    for (const code of [...CATALOGUE, "chairman", ""]) {
      expect(describeRoleCapabilities(code).length, code).toBeGreaterThan(0);
    }
  });

  it("says of a coaching seat exactly what a coaching seat may do", () => {
    // REQ-coach-operator-onboarding's boundary, read off the derived copy: the
    // narrow attendance pair and nothing else. Walked over all ten so a seat
    // that quietly acquires a ninth capability shows up as copy nobody wrote.
    for (const code of FIXED_COACHES) {
      expect(describeRoleCapabilities(code), code).toEqual([
        CAPABILITIES.attendance_recorder.action,
        CAPABILITIES.attendance_recording.action,
      ]);
    }
  });

  it("says of the Vice-President that they do not administer accounts", () => {
    // The two-tier model as the Roles page will state it: they hold the
    // operating capabilities and not role management.
    const summary = describeRoleCapabilities("vice_president");
    expect(summary).toContain(CAPABILITIES.event_approval.action);
    expect(summary).toContain(CAPABILITIES.leadership_report.action);
    expect(summary).not.toContain(CAPABILITIES.role_management.action);
  });

  it("produces only sentences that exist in the capability map", () => {
    // The mechanism, asserted directly. A hand-written description added
    // anywhere in this projection would fail here, which is the "stale
    // duplicated descriptions" the requirement is written against.
    const actions = CAPABILITY_KEYS.map((key) => CAPABILITIES[key].action);
    for (const code of CATALOGUE) {
      for (const sentence of describeRoleCapabilities(code)) {
        expect([...actions, NO_CAPABILITY_SUMMARY], `${code}: ${sentence}`).toContain(sentence);
      }
    }
  });

  it("moves the copy when a grant moves, because it reads the same array", () => {
    // The property the requirement asks for, stated as an equivalence rather
    // than demonstrated by example: a role's summary and its permissions are
    // two readings of one list.
    for (const code of CATALOGUE) {
      const derived = roleCapabilities(code).map((entry) => entry.key);
      const permitted = CAPABILITY_KEYS.filter((key) => roleCodesPermit([code], key));
      expect(derived, code).toEqual(permitted);
    }
  });
});

/**
 * LAN-129, review finding LAN128-A1 — the display names are pinned, not copied
 * and forgotten.
 *
 * The character-for-character check against `public.roles.name` lives in
 * `tests/operator-capability-catalogue.test.ts`, because it needs the database.
 * These are the properties that hold without one.
 */
describe("LAN-129 — role labels cover the catalogue", () => {
  it("labels every code in the catalogue", () => {
    for (const code of CATALOGUE) {
      expect(ROLE_LABELS[code], code).toBeDefined();
      expect(roleLabel(code), code).not.toBe(code);
    }
  });

  it("labels nothing that is not in the catalogue", () => {
    // A label for a seat that does not exist is either a typo or a seat
    // somebody removed from the migration and left here.
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...CATALOGUE].sort());
  });

  it("uses the club's names for the seats whose codes disagree with them", () => {
    expect(roleLabel("offence_coach")).toBe("Offensive Coordinator");
    expect(roleLabel("defence_coach")).toBe("Defensive Coordinator");
  });

  it("returns the raw code for anything else, and never throws", () => {
    expect(roleLabel("chairman")).toBe("chairman");
    expect(roleLabel("")).toBe("");
  });

  it("refuses a mutation at runtime", () => {
    const labels = ROLE_LABELS as Record<string, string>;
    expect(() => {
      labels.president = "Supreme Leader";
    }).toThrow();
    expect(roleLabel("president")).toBe("President");
  });
});

/**
 * LAN-129 — the leadership tier data, which `administration-authority.ts` reads.
 *
 * The *rules* are tested there. What is tested here is that this file's half is
 * data: the right seats, no others, and frozen.
 */
describe("LAN-129 — the leadership tiers are data in the catalogue's file", () => {
  it("names the three seats DEC-two-tier-operating-model names, and no others", () => {
    expect({ ...LEADERSHIP_TIERS }).toEqual({
      general_manager: "standing_continuity",
      president: "presiding",
      it_officer: "technical_administration",
    });
  });

  it("puts the Vice-President and Secretary in no tier at all", () => {
    // "Vice-President and Secretary share the broad ordinary operating tier",
    // which is expressed by their absence from role_management, not by a tier.
    expect(LEADERSHIP_TIERS.vice_president).toBeUndefined();
    expect(LEADERSHIP_TIERS.secretary).toBeUndefined();
  });

  it("leaves the General Manager seat with no ordinary management route", () => {
    // REQ-final-admin-protection: GM replacement "remains exceptional
    // IT/service recovery outside this mission". The empty list is the
    // decision, and an empty list refuses everybody.
    expect([...PROTECTED_LEADERSHIP_AUTHORITY.standing_continuity.management]).toEqual([]);
    expect([...PROTECTED_LEADERSHIP_AUTHORITY.standing_continuity.recovery]).toEqual([
      "it_officer",
    ]);
  });

  it("gives the President seat to the General Manager, and recovery to two", () => {
    expect([...PROTECTED_LEADERSHIP_AUTHORITY.presiding.management]).toEqual(["general_manager"]);
    expect([...PROTECTED_LEADERSHIP_AUTHORITY.presiding.recovery]).toEqual([
      "general_manager",
      "it_officer",
    ]);
  });

  it("keeps recovery at least as wide as management, everywhere", () => {
    // The asymmetry runs one way only: recovery restores access without moving
    // authority, so a seat that may manage must also be able to recover. The
    // reverse — recovery narrower than management — would mean somebody could
    // depose a holder they could not help back in.
    for (const tier of ["standing_continuity", "presiding"] as const) {
      for (const code of PROTECTED_LEADERSHIP_AUTHORITY[tier].management) {
        expect(PROTECTED_LEADERSHIP_AUTHORITY[tier].recovery, tier).toContain(code);
      }
    }
  });

  it("names only real catalogue codes", () => {
    for (const tier of ["standing_continuity", "presiding"] as const) {
      for (const kind of ["management", "recovery"] as const) {
        for (const code of PROTECTED_LEADERSHIP_AUTHORITY[tier][kind]) {
          expect(CATALOGUE, `${tier}/${kind}`).toContain(code);
        }
      }
    }
  });

  it("gives every tiered seat an entry in the tier-to-seat map, and back", () => {
    for (const [code, tier] of Object.entries(LEADERSHIP_TIERS)) {
      expect(LEADERSHIP_TIER_SEATS[tier]).toBe(code);
    }
  });

  it("refuses a mutation at runtime", () => {
    expect(() => {
      (LEADERSHIP_TIERS as Record<string, string>).secretary = "presiding";
    }).toThrow();
    expect(() => {
      (PROTECTED_LEADERSHIP_AUTHORITY.standing_continuity.management as string[]).push(
        "it_officer",
      );
    }).toThrow();
    expect([...PROTECTED_LEADERSHIP_AUTHORITY.standing_continuity.management]).toEqual([]);
  });
});

describe("LAN-129 — the ten fixed coaching seats", () => {
  it("is the catalogue's Coaching Staff group, exactly", () => {
    expect([...FIXED_COACHING_ROLE_CODES].sort()).toEqual([...FIXED_COACHES].sort());
  });

  it("is also the audience catalogue, by Brian's decision and not by accident", () => {
    // These two constants answer different questions and gave different answers
    // for one round: LAN-129 widened the capability grant to ten and left the
    // audience at three, because widening the audience changes who the club
    // *contacts*. Brian answered it on 19 August 2026 — "Every coach needs to
    // be invited to coaching sessions ... which includes all the coaches" — so
    // the audience group is the coaching staff.
    //
    // Asserted as an exact set on both sides rather than as an identity, so
    // that it still means something if a later decision splits them back into
    // two literal lists.
    expect([...COACH_ROLE_CODES].sort()).toEqual([...FIXED_COACHES].sort());
    expect([...FIXED_COACHING_ROLE_CODES].sort()).toEqual([...FIXED_COACHES].sort());
    expect(COACH_ROLE_CODES).toHaveLength(10);
  });

  it("invites the seven seats the catalogue added, which were uninvitable before", () => {
    // The whole content of Brian's answer, seat by seat. Before it, a
    // Quarterbacks Coach could take a register at a session they were never
    // invited to.
    for (const code of COACHES_ADDED_BY_THE_CATALOGUE) {
      expect(COACH_ROLE_CODES, code).toContain(code);
    }
  });

  it("still offers no season-scoped seat that is not a coaching one", () => {
    // The fail-closed property the audience group has always had, and which
    // widening must not have cost: capacity is never inferred from a role's
    // scope. A team manager or a season-scoped physio is uninvitable rather
    // than silently invited as a coach. Proved against a real row in
    // src/lib/services/event-approval.test.ts; asserted here as the rule.
    for (const code of ["lan120_team_manager", "team_manager", "physio"]) {
      expect(COACH_ROLE_CODES, code).not.toContain(code);
    }
    expect(COACH_ROLE_CODES.every((code) => CATALOGUE.includes(code))).toBe(true);
  });

  it("holds the narrow attendance pair and nothing else, in any capability", () => {
    for (const code of FIXED_COACHING_ROLE_CODES) {
      for (const key of CAPABILITY_KEYS) {
        const expected = key === "attendance_recorder" || key === "attendance_recording";
        expect(roleCodesPermit([code], key), `${code} / ${key}`).toBe(expected);
      }
    }
  });

  it("refuses every coaching seat role management, held singly or all at once", () => {
    // The boundary REQ-coach-operator-onboarding draws, against the capability
    // this package widened. A coach never administers.
    for (const code of FIXED_COACHING_ROLE_CODES) {
      expect(roleCodesPermit([code], "role_management"), code).toBe(false);
    }
    expect(roleCodesPermit([...FIXED_COACHING_ROLE_CODES], "role_management")).toBe(false);
  });

  it("refuses every coaching seat the roster, delivery and report surfaces", () => {
    // slice-ux.md § 3 names these among what a coaching seat never receives,
    // and LAN-129 added seven seats to the coaching side of the boundary.
    for (const code of FIXED_COACHING_ROLE_CODES) {
      for (const key of [
        "membership_activation",
        "event_calendar_management",
        "event_approval",
        "delivery_administration",
        "leadership_report",
      ] as CapabilityKey[]) {
        expect(roleCodesPermit([code], key), `${code} / ${key}`).toBe(false);
      }
    }
  });

  it("classifies all ten as narrow recorders, singly and together", () => {
    for (const code of FIXED_COACHING_ROLE_CODES) {
      expect(isNarrowAttendanceRecorder([code]), code).toBe(true);
    }
    expect(isNarrowAttendanceRecorder([...FIXED_COACHING_ROLE_CODES])).toBe(true);
  });

  it("does not narrow one of the seven who also holds an officer seat", () => {
    // The rule LAN-110 wrote for the original three, checked against the seven:
    // § 3 describes what a coach receives, and is not a rule for stripping
    // authority a recorded decision granted to somebody who also coaches.
    for (const code of COACHES_ADDED_BY_THE_CATALOGUE) {
      expect(isNarrowAttendanceRecorder([code, "secretary"]), code).toBe(false);
    }
  });

  it("refuses a mutation at runtime", () => {
    expect(() => (FIXED_COACHING_ROLE_CODES as string[]).push("assistant_coach")).toThrow();
    expect(FIXED_COACHING_ROLE_CODES).toHaveLength(10);
  });
});
