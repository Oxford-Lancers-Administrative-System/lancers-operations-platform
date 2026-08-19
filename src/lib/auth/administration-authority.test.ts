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
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The one stub, and it is the same one `guards.test.ts` uses: the request-bound
// wrapper resolves its actor from the verified session and from nowhere else,
// so the session is the only thing a test may pose.
vi.mock("./operator", () => ({ resolveOperatorAccess: vi.fn() }));

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
  MISSING_ROLE_CODE_RULE,
  requireAdministrationTarget,
  UNKNOWN_ACTION_RULE,
  UNKNOWN_ROLE_CODE_RULE,
  usableAdministrationPaths,
  type AdministrationPath,
  type AdministrationTargetAction,
  type AdministrationTargetRequest,
} from "./administration-authority";
import { CAPABILITY_KEYS, capabilityRoleCodes } from "./capabilities";
import { capabilityRule, OPERATOR_REQUIRED_MESSAGE, OPERATOR_REQUIRED_RULE } from "./guards";
import { resolveOperatorAccess, type OperatorAccess, type ResolvedOperator } from "./operator";

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

/**
 * The seat a role-scoped decision names when a case is not about which seat.
 *
 * Deliberately an ordinary one. Every assertion below that is *about* the
 * conferred seat names it explicitly, so this default can never be what makes
 * one of them pass — and if it silently became a protected seat, the cases that
 * expect permission would fail rather than the cases that expect refusal.
 */
const ORDINARY_SEAT = "kit_manager";

function request(
  action: AdministrationTargetAction,
  targetPersonId: string,
  targetRoles: string[],
  roleCode: string,
): AdministrationTargetRequest {
  const subject = target(targetPersonId, targetRoles);
  return ADMINISTRATION_TARGET_RULES[action].roleScoped
    ? ({ action, target: subject, roleCode } as AdministrationTargetRequest)
    : ({ action, target: subject } as AdministrationTargetRequest);
}

function permits(
  actorRoles: string[],
  action: AdministrationTargetAction,
  targetRoles: string[],
  options: { sameperson?: boolean; roleCode?: string } = {},
): boolean {
  const personId = options.sameperson ? "same" : "actor";
  return canAdministerTarget(
    actor(personId, actorRoles),
    request(
      action,
      options.sameperson ? "same" : "target",
      targetRoles,
      options.roleCode ?? ORDINARY_SEAT,
    ),
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
      assertAdministrationTarget(null, {
        action: "assign_role",
        target: target("someone"),
        roleCode: ORDINARY_SEAT,
      }),
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
      assertAdministrationTarget(actor("me", [GM]), {
        action: "deactivate_account",
        target: target("me"),
      }),
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
      assertAdministrationTarget(actor("gm", [GM]), {
        action: "end_role",
        target: target("gm", [GM]),
        roleCode: GM,
      }),
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
      assertAdministrationTarget(actor("p", [PRESIDENT]), {
        action: "end_role",
        target: target("gm", [GM]),
        roleCode: GM,
      }),
    );
    expect(refusal.rule).toBe(LEADERSHIP_TARGET_RULE);
    expect(refusal.message).toMatch(/This action affects the General Manager/);
    expect(refusal.message).toMatch(/No club role may/);
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
      assertAdministrationTarget(actor("it", [IT]), {
        action: "deactivate_account",
        target: target("p", [PRESIDENT]),
      }),
    );
    expect(refusal.rule).toBe(LEADERSHIP_TARGET_RULE);
    expect(refusal.message).toMatch(/This action affects the President/);
    expect(refusal.message).toMatch(/Only the General Manager role/);
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
      assertAdministrationTarget(actor("it", [IT]), {
        action: "promote_to_president" as AdministrationTargetAction,
        target: target("someone"),
      } as AdministrationTargetRequest),
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

/**
 * LAN129-B1 — a protected seat is protected when it is **empty**.
 *
 * The finding, in one sentence: the first version of this module derived
 * protection entirely from what the target already held, so `assign_role` could
 * not name the seat being conferred and the guard was vacuous at exactly the
 * moment a seat can be installed. `REQ-final-admin-protection` names four verbs
 * and *assign* is the first.
 *
 * The escalation the reviewer executed at f44be1c, written out as the test it
 * should always have been: an IT Officer assigns `general_manager` to
 * themselves, and thereby becomes unremovable by every seat in the catalogue.
 * Every step of it is asserted, including the steps that still succeed, because
 * a regression test for a chain has to show where the chain now breaks.
 */
describe("LAN129-B1 — installing a protected seat is a protected action", () => {
  it("refuses every seat in the catalogue the installation of general_manager", () => {
    // The empty management list now bites on the way *in* as well as on the way
    // out. Walked over the whole catalogue, over an empty target and over a
    // target that already holds ordinary seats, and over the whole catalogue
    // held at once — the strongest actor there could be.
    for (const code of CATALOGUE) {
      expect(permits([code], "assign_role", [], { roleCode: GM }), code).toBe(false);
      expect(
        permits([code], "assign_role", ["kit_manager", "head_coach"], { roleCode: GM }),
        code,
      ).toBe(false);
    }
    expect(permits(CATALOGUE, "assign_role", [], { roleCode: GM })).toBe(false);
  });

  it("refuses an IT Officer installing general_manager on themselves", () => {
    // The exact escalation. Self-assignment is still permitted in general —
    // Brian recorded that consequence — and it is permitted for ordinary seats
    // below, so this refusal comes from the leadership rule and not from a
    // blanket prohibition nobody decided.
    expect(permits([IT], "assign_role", [], { sameperson: true, roleCode: GM })).toBe(false);
    expect(permits([IT], "assign_role", [], { sameperson: true, roleCode: ORDINARY_SEAT })).toBe(
      true,
    );
  });

  it("refuses everyone but the General Manager the installation of president", () => {
    // REQ-final-admin-protection: "General Manager may assign, replace, end or
    // deactivate President." The seat being vacant changes nothing.
    expect(permits([GM], "assign_role", [], { roleCode: PRESIDENT })).toBe(true);
    for (const code of CATALOGUE.filter((candidate) => candidate !== GM)) {
      expect(permits([code], "assign_role", [], { roleCode: PRESIDENT }), code).toBe(false);
    }
  });

  it("refuses a President installing president on a second person", () => {
    // The other half of "a second President administering the first", now from
    // the installation side: no source gives a President authority over the
    // President seat, and absence of a decision is never permission.
    expect(permits([PRESIDENT], "assign_role", [], { roleCode: PRESIDENT })).toBe(false);
    expect(permits([PRESIDENT], "assign_role", [], { sameperson: true, roleCode: PRESIDENT })).toBe(
      false,
    );
  });

  it("still permits every administrator to assign an ordinary seat", () => {
    // The correction must narrow and nothing else. Every ordinary seat in the
    // catalogue, conferred by each of the three administrators.
    const ordinary = CATALOGUE.filter((code) => code !== GM && code !== PRESIDENT);

    for (const actorCode of ADMINISTRATORS) {
      for (const conferred of ordinary) {
        expect(
          permits([actorCode], "assign_role", [], { roleCode: conferred }),
          `${actorCode} → ${conferred}`,
        ).toBe(true);
      }
    }
  });

  it("protects replacement of a protected seat whose holder has already gone", () => {
    // Replacing the holder of a seat is installing somebody into it, so the
    // conferred seat has to count even when the outgoing holder's assignment is
    // already over and the target's role codes are empty.
    expect(permits([GM], "replace_role_holder", [], { roleCode: GM })).toBe(false);
    expect(permits([IT], "replace_role_holder", [], { roleCode: GM })).toBe(false);
    expect(permits([GM], "replace_role_holder", [], { roleCode: PRESIDENT })).toBe(true);
    expect(permits([IT], "replace_role_holder", [], { roleCode: PRESIDENT })).toBe(false);
  });

  it("hardens end_role against a stale or empty target snapshot", () => {
    // The module's one genuine input weakness is a caller passing role codes
    // that no longer describe the target. Naming the role being ended
    // separately means the leadership rule still fires when the snapshot is
    // wrong — the seat is named on its own, and considered on its own.
    expect(permits([IT], "end_role", [], { roleCode: PRESIDENT })).toBe(false);
    expect(permits([GM], "end_role", [], { roleCode: PRESIDENT })).toBe(true);
    expect(permits([GM], "end_role", [], { roleCode: GM })).toBe(false);
  });

  it("takes the strongest tier across the target's seats and the named one", () => {
    // A President being given the General Manager seat is a General Manager
    // decision, not a President one — the union, not either half.
    expect(protectedTierOf([PRESIDENT])).toBe("presiding");
    expect(permits([GM], "assign_role", [PRESIDENT], { roleCode: ORDINARY_SEAT })).toBe(true);
    expect(permits([GM], "assign_role", [PRESIDENT], { roleCode: GM })).toBe(false);
    expect(permits([GM], "assign_role", [], { roleCode: GM })).toBe(false);
  });

  it("refuses a role-scoped decision that does not name its role", () => {
    // Unreachable from typed code — the union makes `roleCode` mandatory for
    // these three — and checked at runtime anyway, because a missing seat must
    // never be read as "no seat is involved". That reading is the whole of the
    // finding.
    for (const action of ["assign_role", "replace_role_holder", "end_role"] as const) {
      for (const bad of [undefined, "", "   "]) {
        const refusal = refusalOf(() =>
          assertAdministrationTarget(actor("it", [IT]), {
            action,
            target: target("someone"),
            roleCode: bad,
          } as unknown as AdministrationTargetRequest),
        );
        expect(refusal.rule, `${action} / ${JSON.stringify(bad)}`).toBe(MISSING_ROLE_CODE_RULE);
      }
    }
  });

  it("checks the missing role code before the capability, so it cannot be probed", () => {
    // A caller with no authority at all gets the same refusal shape either way,
    // but the ordering is asserted so that the runtime check is never quietly
    // moved below layer 1 and made unreachable for the actors who matter.
    const refusal = refusalOf(() =>
      assertAdministrationTarget(actor("s", ["secretary"]), {
        action: "assign_role",
        target: target("someone"),
      } as unknown as AdministrationTargetRequest),
    );
    expect(refusal.rule).toBe(MISSING_ROLE_CODE_RULE);
  });

  it("marks exactly the three role-scoped actions as role-scoped", () => {
    const scoped = ADMINISTRATION_TARGET_ACTIONS.filter(
      (action) => ADMINISTRATION_TARGET_RULES[action].roleScoped,
    );
    expect([...scoped].sort()).toEqual(["assign_role", "end_role", "replace_role_holder"]);
  });
});

/**
 * LAN129-A3 — the deactivated holder of a protected seat.
 *
 * Asked as: can somebody be deactivated, then given a protected seat, and
 * thereby become unrestorable? B1's fix is most of the answer, and the rest is
 * a deliberate boundary rather than an oversight. Both halves are pinned here
 * so that neither can move silently.
 */
describe("LAN129-A3 — restoring the holder of a protected seat", () => {
  it("cannot be reached for general_manager, because nobody may install it", () => {
    // The order the finding describes — deactivate, then assign — no longer
    // exists in the application for this seat. That is what makes the empty
    // restore list safe rather than a trap.
    for (const code of CATALOGUE) {
      expect(permits([code], "assign_role", [], { roleCode: GM }), code).toBe(false);
    }
    // And the state, if some out-of-band route produced it, is still closed to
    // everybody — asserted rather than assumed, because it is the residual risk.
    for (const code of CATALOGUE) {
      expect(permits([code], "restore_account", [GM]), code).toBe(false);
    }
  });

  it("is not a trap for president: whoever may assign the seat may also restore it", () => {
    // One tier, one authority, both directions. The General Manager may put a
    // deactivated person into the President seat, and may restore them.
    expect(permits([GM], "assign_role", [], { roleCode: PRESIDENT })).toBe(true);
    expect(permits([GM], "restore_account", [PRESIDENT])).toBe(true);
    expect(permits([IT], "restore_account", [PRESIDENT])).toBe(false);
  });

  it("keeps restoration symmetric with deactivation for every seat", () => {
    // The property the symmetry argument rests on, stated once over the whole
    // catalogue rather than by example: nobody may restore an operator they
    // could not have deactivated. Losing it is how the IT Officer would come to
    // reinstate a President the General Manager stood down.
    for (const actorCode of CATALOGUE) {
      for (const targetCode of CATALOGUE) {
        const canDeactivate = permits([actorCode], "deactivate_account", [targetCode]);
        const canRestore = permits([actorCode], "restore_account", [targetCode]);
        expect(canRestore, `${actorCode} → ${targetCode}`).toBe(canDeactivate);
      }
    }
  });
});

/**
 * LAN129-A1 — replacement is projected here, not decomposed by the caller.
 *
 * The mistake this exists to prevent: counting the successor as a surviving
 * administration path while their invitation is still pending.
 */
describe("LAN129-A1 — projecting a replacement onto the administration paths", () => {
  const outgoing: AdministrationPath = { personId: "out", roleCodes: [PRESIDENT], usable: true };
  const other: AdministrationPath = { personId: "gm", roleCodes: [GM], usable: true };

  it("moves the seat from the outgoing holder to the successor", () => {
    const after = remainingAdministrationPaths([outgoing, other], {
      kind: "replace_role_holder",
      personId: "out",
      roleCode: PRESIDENT,
      successor: { personId: "in", roleCodes: [PRESIDENT], usable: true },
    });

    expect(after.find((path) => path.personId === "out")?.roleCodes).toEqual([]);
    expect(after.find((path) => path.personId === "in")?.roleCodes).toEqual([PRESIDENT]);
    expect(
      usableAdministrationPaths(after)
        .map((path) => path.personId)
        .sort(),
    ).toEqual(["gm", "in"]);
  });

  it("does not count a successor whose invitation is still pending", () => {
    // REQ-invitation-states: Invitation pending and Delivery failed are not
    // Active. A name in the seat is not an administrator.
    const after = remainingAdministrationPaths([outgoing], {
      kind: "replace_role_holder",
      personId: "out",
      roleCode: PRESIDENT,
      successor: { personId: "in", roleCodes: [PRESIDENT], usable: false },
    });

    expect(usableAdministrationPaths(after)).toEqual([]);
    expect(() => assertAdministrationPathSurvives(after)).toThrow(NotPermitted);
  });

  it("refuses the replacement that hands the club's last seat to a pending operator", () => {
    // The whole finding, end to end: every earlier layer permits this — the
    // General Manager may replace the President — and the final-path rule is
    // what stops it.
    const lastAdministrator: AdministrationPath = {
      personId: "only",
      roleCodes: [PRESIDENT],
      usable: true,
    };
    expect(permits([GM], "replace_role_holder", [PRESIDENT], { roleCode: PRESIDENT })).toBe(true);

    const after = remainingAdministrationPaths([lastAdministrator], {
      kind: "replace_role_holder",
      personId: "only",
      roleCode: PRESIDENT,
      successor: { personId: "successor", roleCodes: [PRESIDENT], usable: false },
    });
    const refusal = refusalOf(() => assertAdministrationPathSurvives(after));
    expect(refusal.rule).toBe(FINAL_ADMINISTRATION_PATH_RULE);
  });

  it("appends a successor who had no path at all", () => {
    // The ordinary case for an invitation: the successor is a Person created by
    // the same action and is not in the snapshot.
    const after = remainingAdministrationPaths([outgoing], {
      kind: "replace_role_holder",
      personId: "out",
      roleCode: PRESIDENT,
      successor: { personId: "brand-new", roleCodes: [PRESIDENT], usable: true },
    });

    expect(after).toHaveLength(2);
    expect(after.map((path) => path.personId)).toContain("brand-new");
  });

  it("unions the seats when the successor already has a path", () => {
    const existing: AdministrationPath = {
      personId: "in",
      roleCodes: ["kit_manager"],
      usable: true,
    };
    const after = remainingAdministrationPaths([outgoing, existing], {
      kind: "replace_role_holder",
      personId: "out",
      roleCode: PRESIDENT,
      successor: { personId: "in", roleCodes: [PRESIDENT], usable: true },
    });

    expect([...(after.find((path) => path.personId === "in")?.roleCodes ?? [])].sort()).toEqual(
      ["kit_manager", PRESIDENT].sort(),
    );
  });

  it("never makes a deactivated successor usable — the conjunction is fail-closed", () => {
    // A replacement hands somebody a role. It does not restore an account, and
    // a caller passing an optimistic `usable` must not be able to make it one.
    const deactivated: AdministrationPath = { personId: "in", roleCodes: [], usable: false };
    const after = remainingAdministrationPaths([outgoing, deactivated], {
      kind: "replace_role_holder",
      personId: "out",
      roleCode: PRESIDENT,
      successor: { personId: "in", roleCodes: [PRESIDENT], usable: true },
    });

    expect(after.find((path) => path.personId === "in")?.usable).toBe(false);
    expect(usableAdministrationPaths(after)).toEqual([]);
  });

  it("leaves everybody else's path untouched, and mutates no input", () => {
    const after = remainingAdministrationPaths([outgoing, other], {
      kind: "replace_role_holder",
      personId: "out",
      roleCode: PRESIDENT,
      successor: { personId: "in", roleCodes: [PRESIDENT], usable: true },
    });

    expect(after.find((path) => path.personId === "gm")).toEqual(other);
    expect(outgoing.roleCodes).toEqual([PRESIDENT]);
    expect(other.roleCodes).toEqual([GM]);
  });

  it("models every path-affecting action, so no caller has to decompose one", () => {
    // The property the finding is really about: `end_role`, `deactivate_account`
    // and `replace_role_holder` are the three decisions that change the set,
    // and all three are expressible. Asserted against the rule table so that a
    // fourth added later shows up here.
    const pathAffecting: AdministrationTargetAction[] = [
      "assign_role",
      "end_role",
      "deactivate_account",
      "restore_account",
      "replace_role_holder",
    ];
    for (const action of pathAffecting) {
      expect(ADMINISTRATION_TARGET_ACTIONS, action).toContain(action);
    }
    // `assign_role` and `restore_account` only ever *add* a path, so no
    // projection is needed to prove the club keeps one.
    expect(
      (["deactivate_account", "end_role", "replace_role_holder"] as const).every((kind) =>
        ADMINISTRATION_TARGET_ACTIONS.includes(kind),
      ),
    ).toBe(true);
  });
});

/**
 * LAN129-A2 — the request-bound wrapper.
 *
 * Everything above exercises the pure assertion with an actor supplied
 * directly. `requireAdministrationTarget` is the function that takes the actor
 * from the **verified session** and nowhere else, and it was uncovered. The
 * shape of these tests deliberately mirrors `guards.test.ts`: one stub, at
 * `resolveOperatorAccess`, so that no test can prove a guard by supplying an
 * actor the way a browser never could.
 */
describe("LAN129-A2 — requireAdministrationTarget takes the actor from the session", () => {
  beforeEach(() => {
    vi.mocked(resolveOperatorAccess).mockReset();
  });

  function givenSession(access: OperatorAccess) {
    vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
  }

  async function refusalFromAsync(call: () => Promise<unknown>): Promise<NotPermitted> {
    try {
      await call();
    } catch (error) {
      if (error instanceof NotPermitted) return error;
      throw error;
    }
    throw new Error("expected a NotPermitted refusal, and the guard permitted the action");
  }

  it.each([
    ["no_session", { state: "no_session" } as OperatorAccess],
    ["unlinked", { state: "unlinked" } as OperatorAccess],
    ["inactive", { state: "inactive" } as OperatorAccess],
  ])("refuses a %s request, with the operator-required rule", async (_name, access) => {
    // The three unresolved causes collapse into one refusal, exactly as
    // `requireCapability` does — a privileged path never tells the caller which.
    givenSession(access);

    const refusal = await refusalFromAsync(() =>
      requireAdministrationTarget({
        action: "assign_role",
        target: target("someone"),
        roleCode: ORDINARY_SEAT,
      }),
    );

    expect(refusal.rule).toBe(OPERATOR_REQUIRED_RULE);
    expect(refusal.message).toBe(OPERATOR_REQUIRED_MESSAGE);
  });

  it("returns the session's operator when every rule permits", async () => {
    const operator = actor("gm", [GM]);
    givenSession({ state: "active", operator });

    await expect(
      requireAdministrationTarget({
        action: "end_role",
        target: target("p", [PRESIDENT]),
        roleCode: PRESIDENT,
      }),
    ).resolves.toBe(operator);
  });

  it("applies the capability floor to the session's operator", async () => {
    givenSession({ state: "active", operator: actor("s", ["secretary"]) });

    const refusal = await refusalFromAsync(() =>
      requireAdministrationTarget({
        action: "assign_role",
        target: target("someone"),
        roleCode: ORDINARY_SEAT,
      }),
    );

    expect(refusal.rule).toBe(capabilityRule("role_management"));
  });

  it("applies the self rule to the session's operator, not to a supplied one", async () => {
    // The property that makes the wrapper worth having: "who am I" is never an
    // argument, so a browser cannot claim to be somebody else in order to act
    // on this target.
    const operator = actor("me", [GM]);
    givenSession({ state: "active", operator });

    const refusal = await refusalFromAsync(() =>
      requireAdministrationTarget({
        action: "deactivate_account",
        target: target("me"),
      }),
    );

    expect(refusal.rule).toBe(SELF_ACTION_RULE);
  });

  it("applies the leadership rule to the session's operator", async () => {
    givenSession({ state: "active", operator: actor("it", [IT]) });

    const refusal = await refusalFromAsync(() =>
      requireAdministrationTarget({
        action: "deactivate_account",
        target: target("p", [PRESIDENT]),
      }),
    );

    expect(refusal.rule).toBe(LEADERSHIP_TARGET_RULE);
  });

  it("refuses the B1 escalation through the request-bound path too", async () => {
    // The finding's own scenario, driven through the function a server action
    // actually calls rather than through the pure assertion.
    const operator = actor("it", [IT]);
    givenSession({ state: "active", operator });

    const refusal = await refusalFromAsync(() =>
      requireAdministrationTarget({
        action: "assign_role",
        target: { personId: "it", roleCodes: [] },
        roleCode: GM,
      }),
    );

    expect(refusal.rule).toBe(LEADERSHIP_TARGET_RULE);
    expect(refusal.message).toMatch(/This action affects the General Manager/);
  });

  it("takes no actor argument at all", () => {
    // Asserted on the function itself: one parameter, the request. A guard that
    // accepted an actor would accept whatever the browser sent.
    expect(requireAdministrationTarget).toHaveLength(1);
  });
});

/**
 * LAN129-R2-A6 and A7 — the role code a decision names is validated, and no
 * string can crash the guard.
 *
 * A6 is LAN129-B1 wearing a different hat. B1 made the decision carry its role;
 * this makes the module insist that the role is real. `protectedTierOf` treats
 * an unrecognised code as *unprotected*, which is right for the seats a target
 * **holds** and exactly backwards for the code the decision itself names — so
 * a caller who resolved the seat by name, by alias, by id, or who trimmed after
 * guarding, would have installed a General Manager past the check B1 added.
 *
 * The strings below are the ones independent review executed at 3311d2a. Every
 * one of them was PERMITTED then.
 */
describe("LAN129-R2-A6 — a named role must be one the catalogue really has", () => {
  const NEAR_MISSES = [
    " general_manager ",
    "general_manager ",
    " general_manager",
    "GENERAL_MANAGER",
    "General Manager",
    "general-manager",
    "general manager",
    "general_manager​",
    "​general_manager",
    "general_manager\n",
    "president ",
    "PRESIDENT",
    "President",
  ];

  it.each(NEAR_MISSES)("refuses the role-scoped decision naming %j", (code) => {
    // Refused for all three role-scoped actions, and refused for the strongest
    // actor there is — so the refusal is the validation and not a leadership
    // rule that happened to catch it.
    for (const action of ["assign_role", "replace_role_holder", "end_role"] as const) {
      const refusal = refusalOf(() =>
        assertAdministrationTarget(actor("it", CATALOGUE), {
          action,
          target: target("someone"),
          roleCode: code,
        }),
      );
      expect(refusal.rule, `${action} / ${JSON.stringify(code)}`).toBe(UNKNOWN_ROLE_CODE_RULE);
    }
  });

  it("does not normalise a near miss into the seat it resembles", () => {
    // The point of refusing rather than trimming: this module never guesses
    // what a caller meant about the most dangerous seat in the club.
    expect(permits([IT], "assign_role", [], { roleCode: " general_manager " })).toBe(false);
    expect(permits([GM], "assign_role", [], { roleCode: " president " })).toBe(false);
    // And the exact codes still behave exactly as LAN129-B1 decided.
    expect(permits([IT], "assign_role", [], { roleCode: GM })).toBe(false);
    expect(permits([GM], "assign_role", [], { roleCode: PRESIDENT })).toBe(true);
  });

  it("accepts every code the catalogue has, and only those", () => {
    // The validation must not have narrowed anything legitimate: each of the
    // twenty seats is nameable by an administrator.
    for (const code of CATALOGUE) {
      let rule: string | undefined;
      try {
        assertAdministrationTarget(actor("gm", [GM]), {
          action: "assign_role",
          target: target("someone"),
          roleCode: code,
        });
      } catch (error) {
        rule = (error as NotPermitted).rule;
      }
      expect(rule, code).not.toBe(UNKNOWN_ROLE_CODE_RULE);
    }
  });

  it("refuses an invented seat, which is the ordinary case this also covers", () => {
    for (const code of ["chairman", "founder", "assistant_coach", "president_elect"]) {
      const refusal = refusalOf(() =>
        assertAdministrationTarget(actor("gm", [GM]), {
          action: "assign_role",
          target: target("someone"),
          roleCode: code,
        }),
      );
      expect(refusal.rule, code).toBe(UNKNOWN_ROLE_CODE_RULE);
    }
  });

  it("still refuses a missing role with the missing rule, not the unknown one", () => {
    // Two different faults, two different rules, so a caller can tell "you did
    // not say which seat" from "that seat does not exist".
    const refusal = refusalOf(() =>
      assertAdministrationTarget(actor("gm", [GM]), {
        action: "assign_role",
        target: target("someone"),
        roleCode: "",
      }),
    );
    expect(refusal.rule).toBe(MISSING_ROLE_CODE_RULE);
  });

  it("leaves the target's own unknown seats unprotected, which is the other direction", () => {
    // The asymmetry, asserted so nobody "fixes" it into symmetry. A code the
    // catalogue does not have must not confer protection on a target, or
    // anyone could shield a person by inventing a string.
    expect(protectedTierOf(["chairman", "GENERAL_MANAGER", " general_manager "])).toBeNull();
    expect(permits([IT], "deactivate_account", ["GENERAL_MANAGER"])).toBe(true);
    expect(permits([IT], "deactivate_account", [GM])).toBe(false);
  });

  it("echoes nothing the caller sent, and names no seat", () => {
    const refusal = refusalOf(() =>
      assertAdministrationTarget(actor("gm", [GM]), {
        action: "assign_role",
        target: target("someone"),
        roleCode: "GENERAL_MANAGER",
      }),
    );
    expect(refusal.message).not.toMatch(/GENERAL_MANAGER|General Manager|general_manager/);
    expect(refusal.message).toMatch(/does not exist/);
  });
});

/**
 * LAN129-R2-A7 — a prototype-chain key is a refusal, never a `TypeError`.
 *
 * Every object inherits `constructor`, `toString` and the rest, so
 * `LEADERSHIP_TIERS["constructor"]` was the `Object` function rather than
 * `undefined`. It passed the protected-tier test, and the authority lookup
 * keyed on it threw. Fail-closed — nothing was permitted — but it breaks this
 * module's contract of "returns the operator or throws `NotPermitted`", and
 * once a role code arrives from a form it is a 500 rather than a refusal.
 */
describe("LAN129-R2-A7 — inherited keys do not reach the authority lookup", () => {
  const INHERITED = [
    "constructor",
    "toString",
    "__proto__",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
  ];

  it.each(INHERITED)("resolves %s to no tier at all", (key) => {
    expect(protectedTierOf([key])).toBeNull();
  });

  it.each(INHERITED)("refuses %s as a named role, as a NotPermitted", (key) => {
    // The contract: a refusal, with a rule, and not an exception of some other
    // class that a caller would render as "something went wrong".
    const refusal = refusalOf(() =>
      assertAdministrationTarget(actor("gm", [GM]), {
        action: "assign_role",
        target: target("someone"),
        roleCode: key,
      }),
    );
    expect(refusal).toBeInstanceOf(NotPermitted);
    expect(refusal.kind).toBe("not_permitted");
    expect(refusal.rule).toBe(UNKNOWN_ROLE_CODE_RULE);
  });

  it.each(INHERITED)("does not throw when %s is among the target's own seats", (key) => {
    // The half that validating the named code does not reach: the target's
    // held seats are never validated, by design, so `protectedTierOf` itself
    // has to be safe on any string.
    for (const action of ADMINISTRATION_TARGET_ACTIONS) {
      const run = () =>
        canAdministerTarget(
          actor("gm", [GM]),
          request(action, "someone", [key, "kit_manager"], ORDINARY_SEAT),
        );
      expect(run, `${action} / ${key}`).not.toThrow();
      expect(typeof run()).toBe("boolean");
    }
  });

  it("does not throw when an inherited key is the actor's own seat", () => {
    // The third place a role code is compared. `permitted.includes(code)` is
    // an array scan and is safe, but it is asserted rather than assumed.
    expect(() =>
      canAdministerTarget(actor("odd", ["constructor", "__proto__"]), {
        action: "deactivate_account",
        target: target("p", [PRESIDENT]),
      }),
    ).not.toThrow();
    expect(
      canAdministerTarget(actor("odd", ["constructor"]), {
        action: "deactivate_account",
        target: target("p", [PRESIDENT]),
      }),
    ).toBe(false);
  });

  it("keeps every real seat resolving to its tier", () => {
    // `Object.hasOwn` must not have narrowed the map's own keys.
    expect(protectedTierOf([GM])).toBe("standing_continuity");
    expect(protectedTierOf([PRESIDENT])).toBe("presiding");
    expect(protectedTierOf([IT])).toBeNull();
  });
});
