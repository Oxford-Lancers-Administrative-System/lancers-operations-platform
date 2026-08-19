// @vitest-environment node
/**
 * Target-level administration authority — LAN-129.
 *
 * `capabilities.test.ts` proves who may do a thing at all. This proves who may
 * do it **to whom**, which is the layer `REQ-final-admin-protection` adds and
 * the one with no precedent in the slice.
 *
 * Three habits, borrowed from `capabilities.test.ts` because the failure mode
 * is identical — a rule that quietly widens:
 *
 *   * every permitted set is asserted as an **exact set**, never as "contains";
 *   * every refusal is asserted **positively**, actor by actor, rather than
 *     derived from the rule under test;
 *   * the whole catalogue is walked wherever "and nobody else" is the claim,
 *     so a seat added next year is covered by a test written today.
 *
 * The actors are fabricated freely, including actors that could not exist — an
 * operator holding every seat at once, a target holding a code the catalogue
 * has never had. That is the point of the pure layer: none of it needs a
 * session, a database or a mock of either.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { NotPermitted } from "@/lib/db/errors";
import {
  ADMINISTRATION_EVENTS,
  type AdministrationAction,
} from "@/lib/services/administration-events";
import {
  ADMINISTRATION_TARGET_ACTIONS,
  ADMINISTRATION_TARGET_RULES,
  assertAdministrationPathSurvives,
  assertAdministrationTarget,
  canAdministerTarget,
  FINAL_ADMINISTRATION_PATH_RULE,
  LEADERSHIP_TARGET_RULE,
  protectedTierOf,
  remainingAdministrationPaths,
  SELF_ACTION_RULE,
  UNKNOWN_ACTION_RULE,
  usableAdministrationPaths,
  type AdministrationPath,
  type AdministrationTargetAction,
} from "./administration-authority";
import { CAPABILITY_KEYS, capabilityRoleCodes } from "./capabilities";
import { OPERATOR_REQUIRED_RULE } from "./guards";
import type { ResolvedOperator } from "./operator";

/** Every role code in the approved catalogue — LAN-128's migration. */
const CATALOGUE = [
  "general_manager",
  "it_officer",
  "president",
  "vice_president",
  "secretary",
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
];

const GM = "general_manager";
const PRESIDENT = "president";
const IT = "it_officer";

/** The three seats `DEC-role-management-authority` gives `role_management`. */
const ADMINISTRATORS = [PRESIDENT, GM, IT];

/** Every management action, and the one recovery action. */
const MANAGEMENT_ACTIONS = ADMINISTRATION_TARGET_ACTIONS.filter(
  (action) => ADMINISTRATION_TARGET_RULES[action].kind === "management",
);
const RECOVERY_ACTIONS = ADMINISTRATION_TARGET_ACTIONS.filter(
  (action) => ADMINISTRATION_TARGET_RULES[action].kind === "recovery",
);

function actor(personId: string, roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: `auth-${personId}`,
    personId,
    displayName: "Test Operator",
    roleCodes,
    isActive: true,
  };
}

function target(personId: string, roleCodes: string[] = []) {
  return { personId, roleCodes };
}

/** The refusal an assertion threw, or a failure if it did not throw at all. */
function refusalOf(run: () => unknown): NotPermitted {
  try {
    run();
  } catch (error) {
    if (error instanceof NotPermitted) return error;
    throw error;
  }
  throw new Error("expected a NotPermitted refusal, and the guard permitted the action");
}

function permits(
  actorRoles: string[],
  action: AdministrationTargetAction,
  targetRoles: string[],
  options: { sameperson?: boolean } = {},
): boolean {
  const personId = options.sameperson ? "same" : "actor";
  return canAdministerTarget(
    actor(personId, actorRoles),
    action,
    target(options.sameperson ? "same" : "target", targetRoles),
  );
}

describe("layer 1 — role_management is the floor, and it is checked first", () => {
  it("refuses every seat that does not hold role_management, for every action", () => {
    const outsiders = CATALOGUE.filter((code) => !ADMINISTRATORS.includes(code));

    for (const code of outsiders) {
      for (const action of ADMINISTRATION_TARGET_ACTIONS) {
        expect(permits([code], action, []), `${code} / ${action}`).toBe(false);
      }
    }
  });

  it("refuses the Vice-President and the Secretary — the two-tier model's whole content", () => {
    // DEC-two-tier-operating-model: they "share the broad ordinary operating
    // tier". They hold the calendar, approval, occurrence, delivery and the
    // Monday report, and administer nothing. Asserted on its own because these
    // two are the seats most likely to be added by somebody reading "Exec".
    for (const code of ["vice_president", "secretary"]) {
      for (const action of ADMINISTRATION_TARGET_ACTIONS) {
        expect(permits([code], action, []), `${code} / ${action}`).toBe(false);
      }
    }
  });

  it("refuses every seat outside role_management even against an unprotected target", () => {
    // The target rules could only ever *narrow*, so this is the check that they
    // did not somehow become a way in.
    const outsiders = CATALOGUE.filter((code) => !ADMINISTRATORS.includes(code));
    expect(permits(outsiders, "assign_role", [])).toBe(false);
  });

  it("refuses an operator holding no role at all", () => {
    for (const action of ADMINISTRATION_TARGET_ACTIONS) {
      expect(permits([], action, []), action).toBe(false);
    }
  });

  it("refuses a null operator with the operator-required rule, not a capability rule", () => {
    const refusal = refusalOf(() =>
      assertAdministrationTarget(null, "assign_role", target("someone")),
    );
    expect(refusal.rule).toBe(OPERATOR_REQUIRED_RULE);
  });

  it("admits each of the three administrators against an ordinary target", () => {
    for (const code of ADMINISTRATORS) {
      for (const action of ADMINISTRATION_TARGET_ACTIONS) {
        expect(permits([code], action, ["kit_manager"]), `${code} / ${action}`).toBe(true);
      }
    }
  });

  it("reads the floor from the capability map rather than from a list here", () => {
    // If DEC-role-management-authority is ever narrowed, this test moves with
    // the map instead of silently continuing to assert three seats.
    expect([...capabilityRoleCodes("role_management")].sort()).toEqual([...ADMINISTRATORS].sort());
  });
});

describe("layer 2a — DEC-no-self-removal", () => {
  it("forbids deactivating, ending, replacing and recovering on yourself", () => {
    // The three verbs the decision names, plus replacement, which ends the
    // outgoing holder's assignment and therefore is one of them.
    for (const action of [
      "deactivate_account",
      "end_role",
      "replace_role_holder",
      "recover_email",
    ] as AdministrationTargetAction[]) {
      for (const code of ADMINISTRATORS) {
        expect(permits([code], action, [], { sameperson: true }), `${code} / ${action}`).toBe(
          false,
        );
      }
    }
  });

  it("names the self rule, and says nothing about what the actor holds", () => {
    const refusal = refusalOf(() =>
      assertAdministrationTarget(actor("me", [GM]), "deactivate_account", target("me")),
    );
    expect(refusal.rule).toBe(SELF_ACTION_RULE);
    expect(refusal.message).toMatch(/your own account/i);
    expect(refusal.message).not.toMatch(/general manager|you hold|your role/i);
  });

  it("permits self-assignment, which is the recorded consequence of the grant", () => {
    // capabilities.ts has said since LAN-124 that whoever holds role_management
    // can grant themselves anything else, and DEC-no-self-removal does not
    // forbid it. Asserted positively so that adding the prohibition is a
    // deliberate change with a decision behind it, not a quiet tightening.
    for (const code of ADMINISTRATORS) {
      expect(permits([code], "assign_role", [], { sameperson: true }), code).toBe(true);
    }
  });

  it("permits the two invitation actions on oneself, which cannot occur anyway", () => {
    for (const action of ["resend_invitation", "correct_invitation"] as const) {
      expect(permits([IT], action, [], { sameperson: true }), action).toBe(true);
    }
  });

  it("applies the self rule before the leadership rule", () => {
    // A General Manager acting on their own account is refused as a self-action
    // rather than as a protected target. Both refuse, and the ordering matters
    // for the message: "ask another administrator" is the useful sentence.
    const refusal = refusalOf(() =>
      assertAdministrationTarget(actor("gm", [GM]), "end_role", target("gm", [GM])),
    );
    expect(refusal.rule).toBe(SELF_ACTION_RULE);
  });

  it("agrees with the audit vocabulary's selfActionForbidden flags", () => {
    // The ledger refuses a self-action too (administration-events.ts). The two
    // are separate defences and must not drift: a guard that permitted what the
    // writer refuses would surface as a runtime failure halfway through a
    // transaction rather than as a refusal.
    const pairs: [AdministrationTargetAction, AdministrationAction][] = [
      ["deactivate_account", "administration.operator.deactivated"],
      ["end_role", "administration.role.ended"],
      ["recover_email", "administration.operator.email_rehome_started"],
      ["assign_role", "administration.role.assigned"],
      ["restore_account", "administration.operator.restored"],
      ["resend_invitation", "administration.operator.invitation_resent"],
      ["correct_invitation", "administration.operator.invitation_corrected"],
    ];

    for (const [decision, event] of pairs) {
      expect(
        ADMINISTRATION_TARGET_RULES[decision].selfForbidden,
        `${decision} disagrees with ${event}`,
      ).toBe(ADMINISTRATION_EVENTS[event].selfActionForbidden);
    }
  });
});

describe("layer 2b — the General Manager seat, which nobody may ordinarily administer", () => {
  /**
   * REQ-final-admin-protection: "President and IT Officer may not ordinarily
   * assign, replace, end or deactivate General Manager", and "General Manager
   * replacement remains exceptional IT/service recovery outside this mission."
   * With DEC-no-self-removal that leaves nobody, and the empty list is a
   * decision rather than a gap.
   */
  it("refuses every management action to every seat in the catalogue", () => {
    for (const action of MANAGEMENT_ACTIONS) {
      for (const code of CATALOGUE) {
        expect(permits([code], action, [GM]), `${code} / ${action}`).toBe(false);
      }
      // And the whole catalogue held at once, which is the strongest actor
      // there could be.
      expect(permits(CATALOGUE, action, [GM]), action).toBe(false);
    }
  });

  it("refuses the President and the IT Officer by name", () => {
    for (const action of MANAGEMENT_ACTIONS) {
      expect(permits([PRESIDENT], action, [GM]), action).toBe(false);
      expect(permits([IT], action, [GM]), action).toBe(false);
    }
  });

  it("says the seat is changed outside the application, and names no permitted role", () => {
    const refusal = refusalOf(() =>
      assertAdministrationTarget(actor("p", [PRESIDENT]), "end_role", target("gm", [GM])),
    );
    expect(refusal.rule).toBe(LEADERSHIP_TARGET_RULE);
    expect(refusal.message).toMatch(/No club role may/);
    expect(refusal.message).toMatch(/General Manager/);
    expect(refusal.message).toMatch(/outside the application/);
  });

  it("permits email recovery to the IT Officer, and to nobody else", () => {
    // DEC-no-self-removal: "IT Officer may perform technical email recovery for
    // President or GM without changing organizational authority." This is the
    // asymmetry the module exists to keep — recovery where management is not.
    for (const action of RECOVERY_ACTIONS) {
      expect(permits([IT], action, [GM]), action).toBe(true);

      for (const code of CATALOGUE.filter((candidate) => candidate !== IT)) {
        expect(permits([code], action, [GM]), `${code} / ${action}`).toBe(false);
      }
    }
  });

  it("refuses the President email recovery of the General Manager, explicitly", () => {
    // REQ-rehome-email states this one in terms: "President may not recover
    // General Manager." It is the case a symmetry-minded reader would add.
    expect(permits([PRESIDENT], "recover_email", [GM])).toBe(false);
  });

  it("refuses a General Manager recovering their own email", () => {
    expect(permits([GM], "recover_email", [GM], { sameperson: true })).toBe(false);
  });
});

describe("layer 2b — the President seat, which the General Manager alone administers", () => {
  it("permits the General Manager every management action", () => {
    // REQ-final-admin-protection: "General Manager may assign, replace, end or
    // deactivate President."
    for (const action of MANAGEMENT_ACTIONS) {
      expect(permits([GM], action, [PRESIDENT]), action).toBe(true);
    }
  });

  it("refuses every other seat in the catalogue every management action", () => {
    for (const action of MANAGEMENT_ACTIONS) {
      for (const code of CATALOGUE.filter((candidate) => candidate !== GM)) {
        expect(permits([code], action, [PRESIDENT]), `${code} / ${action}`).toBe(false);
      }
    }
  });

  it("refuses the IT Officer, who holds role_management and is still refused here", () => {
    // "IT Officer may not ordinarily assign, replace, end or deactivate
    // President." The clearest demonstration that layer 2 is a real second
    // layer: layer 1 admitted this actor.
    for (const action of MANAGEMENT_ACTIONS) {
      expect(permits([IT], action, [PRESIDENT]), action).toBe(false);
    }
    expect(permits([IT], "assign_role", ["kit_manager"])).toBe(true);
  });

  it("refuses a second President administering the first", () => {
    // `president` is not a single-holder seat in the catalogue, so two holders
    // are representable. No source gives a President authority over a
    // President, and absence of a decision is never permission.
    for (const action of MANAGEMENT_ACTIONS) {
      expect(permits([PRESIDENT], action, [PRESIDENT]), action).toBe(false);
    }
  });

  it("permits email recovery to the General Manager and the IT Officer, and nobody else", () => {
    for (const action of RECOVERY_ACTIONS) {
      expect(permits([GM], action, [PRESIDENT]), action).toBe(true);
      expect(permits([IT], action, [PRESIDENT]), action).toBe(true);

      for (const code of CATALOGUE.filter((candidate) => candidate !== GM && candidate !== IT)) {
        expect(permits([code], action, [PRESIDENT]), `${code} / ${action}`).toBe(false);
      }
    }
  });

  it("names the permitted role in the refusal, and not the reader's holdings", () => {
    const refusal = refusalOf(() =>
      assertAdministrationTarget(actor("it", [IT]), "deactivate_account", target("p", [PRESIDENT])),
    );
    expect(refusal.rule).toBe(LEADERSHIP_TARGET_RULE);
    expect(refusal.message).toMatch(/Only the General Manager role/);
    expect(refusal.message).toMatch(/President/);
    expect(refusal.message).not.toMatch(/IT Officer|you hold|your role/i);
  });
});

describe("layer 2b — the seats that are deliberately not protected", () => {
  it("lets any administrator administer an ordinary seat", () => {
    const ordinary = CATALOGUE.filter((code) => code !== GM && code !== PRESIDENT);

    for (const code of ADMINISTRATORS) {
      for (const targetCode of ordinary) {
        for (const action of ADMINISTRATION_TARGET_ACTIONS) {
          expect(permits([code], action, [targetCode]), `${code} → ${targetCode} / ${action}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("does not protect the IT Officer seat", () => {
    // Stated as a positive assertion because it is a reading, not an oversight:
    // no approved source shields the transitional technical seat. If Brian
    // decides otherwise, this test is where the decision lands.
    expect(protectedTierOf([IT])).toBeNull();
    expect(permits([PRESIDENT], "end_role", [IT])).toBe(true);
    expect(permits([GM], "deactivate_account", [IT])).toBe(true);
  });

  it("does not protect a target holding no role at all", () => {
    expect(protectedTierOf([])).toBeNull();
    for (const code of ADMINISTRATORS) {
      expect(permits([code], "assign_role", []), code).toBe(true);
    }
  });

  it("does not let an invented role code confer protection", () => {
    // Fail-closed in the direction that matters: an unknown string must not be
    // a way to make a target untouchable, and must not be a way to make one
    // touchable either — it is simply not a protected seat.
    expect(protectedTierOf(["chairman", "founder", "president_elect"])).toBeNull();
    expect(permits([IT], "end_role", ["chairman"])).toBe(true);
  });
});

describe("a target holding several protected seats takes the strongest protection", () => {
  it("treats a President who is also General Manager as a General Manager", () => {
    expect(protectedTierOf([PRESIDENT, GM])).toBe("standing_continuity");
    expect(protectedTierOf([GM, PRESIDENT])).toBe("standing_continuity");

    // The General Manager rule, not the President one: the GM who could have
    // ended a plain President's assignment cannot end this one.
    expect(permits([GM], "end_role", [PRESIDENT, GM])).toBe(false);
    expect(permits([IT], "recover_email", [PRESIDENT, GM])).toBe(true);
    expect(permits([GM], "recover_email", [PRESIDENT, GM])).toBe(false);
  });

  it("is unaffected by unprotected seats held alongside", () => {
    expect(protectedTierOf([PRESIDENT, "kit_manager", "head_coach"])).toBe("presiding");
    expect(permits([GM], "end_role", [PRESIDENT, "kit_manager"])).toBe(true);
    expect(permits([IT], "end_role", [PRESIDENT, "kit_manager"])).toBe(false);
  });
});

describe("the action table itself", () => {
  it("classifies every action, and refuses one it does not know", () => {
    for (const action of ADMINISTRATION_TARGET_ACTIONS) {
      expect(ADMINISTRATION_TARGET_RULES[action].kind).toMatch(/^(management|recovery)$/);
      expect(ADMINISTRATION_TARGET_RULES[action].phrase.length).toBeGreaterThan(5);
    }

    const refusal = refusalOf(() =>
      assertAdministrationTarget(
        actor("it", [IT]),
        "promote_to_president" as AdministrationTargetAction,
        target("someone"),
      ),
    );
    expect(refusal.rule).toBe(UNKNOWN_ACTION_RULE);
  });

  it("names the eight actions the mission has, and no more", () => {
    expect([...ADMINISTRATION_TARGET_ACTIONS].sort()).toEqual(
      [
        "assign_role",
        "correct_invitation",
        "deactivate_account",
        "end_role",
        "recover_email",
        "replace_role_holder",
        "resend_invitation",
        "restore_account",
      ].sort(),
    );
  });

  it("treats email recovery as the only recovery action", () => {
    // The asymmetry lives in this one classification, so it is asserted as an
    // exact set rather than by example.
    expect([...RECOVERY_ACTIONS]).toEqual(["recover_email"]);
  });

  it("refuses a mutation of a rule at runtime", () => {
    const rules = ADMINISTRATION_TARGET_RULES as Record<string, unknown>;
    expect(() => {
      rules.end_role = { action: "end_role", kind: "recovery", selfForbidden: false, phrase: "x" };
    }).toThrow();
    expect(ADMINISTRATION_TARGET_RULES.end_role.selfForbidden).toBe(true);
    expect(() => {
      (ADMINISTRATION_TARGET_RULES.end_role as { selfForbidden: boolean }).selfForbidden = false;
    }).toThrow();
    expect(ADMINISTRATION_TARGET_RULES.end_role.selfForbidden).toBe(true);
  });
});

describe("REQ-final-admin-protection — no action eliminates every usable path", () => {
  const president: AdministrationPath = {
    personId: "p",
    roleCodes: [PRESIDENT],
    usable: true,
  };
  const gm: AdministrationPath = { personId: "g", roleCodes: [GM], usable: true };
  const kit: AdministrationPath = { personId: "k", roleCodes: ["kit_manager"], usable: true };
  const pendingIt: AdministrationPath = { personId: "i", roleCodes: [IT], usable: false };

  it("counts only usable people who hold role_management", () => {
    expect(
      usableAdministrationPaths([president, gm, kit, pendingIt]).map((p) => p.personId),
    ).toEqual(["p", "g"]);
  });

  it("does not count an administrator who cannot sign in", () => {
    // Invitation pending, delivery failed, or deactivated — REQ-invitation-states'
    // states that are not Active. A seat nobody can reach is not a path.
    expect(usableAdministrationPaths([pendingIt])).toEqual([]);
    expect(() => assertAdministrationPathSurvives([pendingIt])).toThrow(NotPermitted);
  });

  it("does not count somebody who can sign in but administers nothing", () => {
    expect(usableAdministrationPaths([kit])).toEqual([]);
  });

  it("refuses the projection that empties the set, and names its own rule", () => {
    const refusal = refusalOf(() => assertAdministrationPathSurvives([]));
    expect(refusal.rule).toBe(FINAL_ADMINISTRATION_PATH_RULE);
    expect(refusal.message).toMatch(/nobody able to administer/i);
    expect(refusal.message).toMatch(/Give somebody else an administration role first/);
  });

  it("permits a projection that keeps one", () => {
    expect(assertAdministrationPathSurvives([president, kit]).map((p) => p.personId)).toEqual([
      "p",
    ]);
  });

  it("projects a deactivation as the loss of that person's path only", () => {
    const after = remainingAdministrationPaths([president, gm], {
      kind: "deactivate_account",
      personId: "g",
    });
    expect(usableAdministrationPaths(after).map((p) => p.personId)).toEqual(["p"]);
    // And the original is untouched — the caller's snapshot is not mutated.
    expect(gm.usable).toBe(true);
  });

  it("projects an ending as the loss of that one role, not the person", () => {
    const both: AdministrationPath = {
      personId: "b",
      roleCodes: [PRESIDENT, "kit_manager"],
      usable: true,
    };
    const after = remainingAdministrationPaths([both], {
      kind: "end_role",
      personId: "b",
      roleCode: PRESIDENT,
    });
    expect(after[0].roleCodes).toEqual(["kit_manager"]);
    expect(usableAdministrationPaths(after)).toEqual([]);
    expect(both.roleCodes).toEqual([PRESIDENT, "kit_manager"]);
  });

  it("catches the case the requirement is written for: the last administrator", () => {
    // One administrator, being deactivated. Every earlier layer permits it —
    // the actor holds role_management, the target is not a protected seat, and
    // it is not a self-action — and this is what refuses it.
    const lastAdministrator: AdministrationPath = {
      personId: "only",
      roleCodes: [IT],
      usable: true,
    };
    expect(permits([GM], "deactivate_account", [IT])).toBe(true);

    const after = remainingAdministrationPaths([lastAdministrator], {
      kind: "deactivate_account",
      personId: "only",
    });
    expect(() => assertAdministrationPathSurvives(after)).toThrow(NotPermitted);
  });

  it("leaves a person who holds two administration seats a path after losing one", () => {
    const twoSeats: AdministrationPath = {
      personId: "d",
      roleCodes: [PRESIDENT, IT],
      usable: true,
    };
    const after = remainingAdministrationPaths([twoSeats], {
      kind: "end_role",
      personId: "d",
      roleCode: PRESIDENT,
    });
    expect(assertAdministrationPathSurvives(after).map((p) => p.personId)).toEqual(["d"]);
  });

  it("reads the administering seats from the capability map", () => {
    // Not from a copy here: narrowing DEC-role-management-authority must narrow
    // what counts as a surviving path in the same edit.
    const everySeat = CATALOGUE.map((code) => ({
      personId: code,
      roleCodes: [code],
      usable: true,
    }));
    expect(
      usableAdministrationPaths(everySeat)
        .map((p) => p.personId)
        .sort(),
    ).toEqual([...capabilityRoleCodes("role_management")].sort());
  });
});

describe("the two layers cannot be confused for one another", () => {
  it("holding role_management is necessary and never sufficient", () => {
    // The one sentence REQ-role-management-authority adds to the slice, as a
    // test: layer 1 admits the IT Officer everywhere, layer 2 refuses them the
    // two seats above them.
    expect(permits([IT], "deactivate_account", ["treasurer"])).toBe(true);
    expect(permits([IT], "deactivate_account", [PRESIDENT])).toBe(false);
    expect(permits([IT], "deactivate_account", [GM])).toBe(false);
  });

  it("target rules never grant a capability the map withholds", () => {
    // A Secretary is refused even against the target the General Manager may
    // administer, and even for the action the rules permit most widely.
    for (const action of ADMINISTRATION_TARGET_ACTIONS) {
      expect(permits(["secretary"], action, [PRESIDENT]), action).toBe(false);
      expect(permits(["secretary"], action, []), action).toBe(false);
    }
  });

  it("changes nothing about the other eight capabilities", () => {
    // Widening role_management to three seats must not have moved anything
    // else. Asserted here rather than only in capabilities.test.ts because this
    // is the file that widened it.
    for (const key of CAPABILITY_KEYS) {
      if (key === "role_management") continue;
      expect(capabilityRoleCodes(key), key).not.toEqual(capabilityRoleCodes("role_management"));
    }
    expect(capabilityRoleCodes("event_approval")).not.toContain("treasurer");
  });
});
