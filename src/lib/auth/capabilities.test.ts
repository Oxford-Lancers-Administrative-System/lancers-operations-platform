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
  describeRoleRequirement,
  describeRoles,
  isNarrowAttendanceRecorder,
  NARROW_RECORDER_CAPABILITIES,
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
  ],
  // LAN-80. The two capabilities that issue settled, listed here so the
  // whole-catalogue check above covers them: a grant that leaves a code
  // unasserted fails, and widening either one fails twice.
  event_occurrence_assertion: [
    "treasurer",
    "social_secretary",
    "gameday_secretary",
    "kit_manager",
    "media_secretary",
    "head_coach",
    "offence_coach",
    "defence_coach",
  ],
  attendance_recording: [
    "treasurer",
    "social_secretary",
    "gameday_secretary",
    "kit_manager",
    "media_secretary",
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
    expect(permittedSet("attendance_recorder")).toEqual([...COACHES, ADMIN].sort());
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

describe("LAN-80 — occurrence assertion is the four calendar roles, and no coach", () => {
  it("permits exactly those four", () => {
    expect(permittedSet("event_occurrence_assertion")).toEqual(CALENDAR_WITH_ADMIN);
  });

  it.each(MUST_REFUSE.event_occurrence_assertion)("refuses %s", (code) => {
    expect(roleCodesPermit([code], "event_occurrence_assertion")).toBe(false);
  });

  it("refuses all three coaching seats — slice-ux.md § 8 and LAN-110's boundary", () => {
    // "not implied by attendance-recorder capability", stated as an exact-set
    // assertion rather than trusted to the array above staying as it is.
    for (const code of COACHES) {
      expect(roleCodesPermit([code], "event_occurrence_assertion")).toBe(false);
    }
  });
});

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
  it("permits exactly the seven", () => {
    expect(permittedSet("attendance_recording")).toEqual([...CALENDAR, ...COACHES, ADMIN].sort());
  });

  it.each([...CALENDAR, ...COACHES])("permits %s on its own", (code) => {
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
    // three seats, because LAN-110 uses it to decide who gets the constrained
    // screen — a Secretary records attendance and must not get that one.
    expect(permittedSet("attendance_recorder")).toEqual([...COACHES, ADMIN].sort());
    for (const code of CALENDAR) {
      expect(roleCodesPermit([code], "attendance_recorder")).toBe(false);
      expect(roleCodesPermit([code], "attendance_recording")).toBe(true);
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

  it("holds role management, and is the only seat that does", () => {
    expect(capabilityRoleCodes("role_management")).toEqual(["it_officer"]);
    for (const code of CATALOGUE) {
      if (code === "it_officer") continue;
      expect(roleCodesPermit([code], "role_management"), code).toBe(false);
    }
    // Including the President, and including the whole rest of the catalogue
    // held at once — the seat is narrow on purpose.
    const others = CATALOGUE.filter((code) => code !== "it_officer");
    expect(roleCodesPermit(others, "role_management")).toBe(false);
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
        "event_occurrence_assertion",
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
    // Through a real capability again: LAN-124 gave `role_management` to the
    // IT Officer alone, so the singular branch is reachable from the map for
    // the first time since LAN-77 widened event approval past President-only.
    expect(capabilityRequirement("role_management")).toBe(
      "This action requires the IT Officer role.",
    );
    expect(describeRoleRequirement(["president"])).toBe("This action requires the President role.");
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
      "This action requires one of these roles: Head Coach, Offence Coach, Defence Coach " +
        "or IT Officer.",
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
      "Offence Coach or Defence Coach",
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
    expect(caption).toBe("Defence Coach");
    expect(caption).not.toContain("Head Coach");
    expect(caption).not.toContain("Offence Coach");
  });
});
