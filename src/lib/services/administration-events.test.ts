// @vitest-environment node
/**
 * The administration event vocabulary and its rules — LAN-130, matrix rows 1,
 * 2, 3, 7 and 8.
 *
 * Pure, and deliberately so. Every rule `REQ-append-only-audit-evidence` places
 * on a canonical event is decided by `prepareAdministrationEvent` before a
 * database is involved, which means each one can be shown to fire — and shown
 * to fire *before* anything is written — without a transaction to unwind.
 *
 * The database-backed half, including the property this package exists for
 * (one event, two projections, no duplicate records), is in
 * `./administration-audit.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { CAPABILITY_KEYS } from "@/lib/auth/capabilities";
import { isServiceError } from "@/lib/db/errors";
import {
  ADMINISTRATION_ACTIONS,
  ADMINISTRATION_ENVELOPE_VERSION,
  ADMINISTRATION_EVENT_FAMILIES,
  ADMINISTRATION_EVENTS,
  administrationEvent,
  isAdministrationAction,
  NO_CHANGE_RULE,
  prepareAdministrationEvent,
  ROLE_RELATED_ADMINISTRATION_ACTIONS,
  type AdministrationEventRecord,
} from "./administration-events";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";
const ACCOUNT = "33333333-3333-4333-8333-333333333333";
const ROLE = "44444444-4444-4444-8444-444444444444";
const ASSIGNMENT = "55555555-5555-4555-8555-555555555555";
const YEAR = "66666666-6666-4666-8666-666666666666";

const OPERATING_YEAR = { scope: "committee_year", id: YEAR, label: "2026-27" } as const;
const AUTHORITY = {
  kind: "capability",
  capability: "role_management",
  roleCodes: ["president"],
} as const;

/** A well-formed account-state event, for tests that vary one thing. */
function deactivation(
  overrides: Partial<AdministrationEventRecord> = {},
): AdministrationEventRecord {
  return {
    action: "administration.operator.deactivated",
    actorPersonId: ACTOR,
    authority: AUTHORITY,
    target: { personId: TARGET, operatorAccountId: ACCOUNT },
    operatingYear: OPERATING_YEAR,
    fromState: "active",
    toState: "deactivated",
    reason: "Left the club mid-season.",
    ...overrides,
  };
}

/** A well-formed role-assignment event, for the same purpose. */
function assignment(overrides: Partial<AdministrationEventRecord> = {}): AdministrationEventRecord {
  return {
    action: "administration.role.assigned",
    actorPersonId: ACTOR,
    authority: AUTHORITY,
    target: { personId: TARGET, operatorAccountId: ACCOUNT },
    role: { id: ROLE, code: "kit_manager", assignmentId: ASSIGNMENT },
    operatingYear: OPERATING_YEAR,
    toState: "assigned",
    ...overrides,
  };
}

/** The refusal, or a failure saying the call was wrongly accepted. */
function refusalOf(record: AdministrationEventRecord): { kind: string; rule?: string } {
  try {
    prepareAdministrationEvent(record);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return { kind: error.kind, rule: error.rule };
  }
  throw new Error("The record was accepted, and should not have been.");
}

describe("row 1 — the vocabulary is a closed set", () => {
  it("declares every action exactly once, and every one is administration-prefixed", () => {
    expect(new Set(ADMINISTRATION_ACTIONS).size).toBe(ADMINISTRATION_ACTIONS.length);
    for (const action of ADMINISTRATION_ACTIONS) {
      expect(action.startsWith("administration.")).toBe(true);
      expect(ADMINISTRATION_EVENTS[action].action).toBe(action);
    }
  });

  it("covers all four families the requirement names, and no fifth", () => {
    const families = new Set(ADMINISTRATION_ACTIONS.map((a) => ADMINISTRATION_EVENTS[a].family));
    expect([...families].sort()).toEqual([...ADMINISTRATION_EVENT_FAMILIES].sort());
  });

  it("keys the map by exactly the declared actions", () => {
    expect(Object.keys(ADMINISTRATION_EVENTS).sort()).toEqual([...ADMINISTRATION_ACTIONS].sort());
  });

  it("refuses an action that is not in the set, and refuses it before anything is written", () => {
    const refusal = refusalOf({
      ...deactivation(),
      action: "administration.operator.exported" as never,
    });
    expect(refusal).toEqual({
      kind: "constraint_violated",
      rule: "administration_action_unknown",
    });
  });

  it("narrows a string to an action only when it really is one", () => {
    expect(isAdministrationAction("administration.role.assigned")).toBe(true);
    expect(isAdministrationAction("administration.role.replaced")).toBe(false);
    expect(isAdministrationAction(42)).toBe(false);
    expect(administrationEvent("administration.role.replaced")).toBeUndefined();
  });

  it("is frozen, so no later module can add a term at runtime", () => {
    expect(Object.isFrozen(ADMINISTRATION_EVENTS)).toBe(true);
    expect(Object.isFrozen(ADMINISTRATION_ACTIONS)).toBe(true);
    expect(Object.isFrozen(ADMINISTRATION_EVENTS["administration.role.ended"])).toBe(true);
  });
});

describe("row 7 — ordinary page views are excluded", () => {
  it("has no term for looking at something", () => {
    for (const action of ADMINISTRATION_ACTIONS) {
      expect(action).not.toMatch(/view|read|opened|browsed|searched|exported/i);
    }
  });

  it("refuses a page-view action rather than storing it", () => {
    expect(
      refusalOf({ ...deactivation(), action: "administration.operator.viewed" as never }).rule,
    ).toBe("administration_action_unknown");
  });
});

describe("row 12 — the Stage-4 general audit browser stays out of scope", () => {
  it("has no term that implies cross-system search, filter or export", () => {
    const surface = Object.keys(ADMINISTRATION_EVENTS).join(" ");
    expect(surface).not.toMatch(/search|filter|export|report|browse/i);
  });
});

describe("row 2 — every event names what the requirement requires", () => {
  it("accepts a complete record and carries every named field into the envelope", () => {
    const prepared = prepareAdministrationEvent(
      assignment({ correlationId: YEAR, detail: { effectiveFrom: "2026-09-01" } }),
    );

    expect(prepared.action).toBe("administration.role.assigned");
    expect(prepared.actorPersonId).toBe(ACTOR);
    expect(prepared.entityTable).toBe("public.role_assignments");
    expect(prepared.entityId).toBe(ASSIGNMENT);
    expect(prepared.envelope).toEqual({
      version: ADMINISTRATION_ENVELOPE_VERSION,
      targetPersonId: TARGET,
      targetOperatorAccountId: ACCOUNT,
      roleId: ROLE,
      roleCode: "kit_manager",
      roleAssignmentId: ASSIGNMENT,
      operatingYear: { scope: "committee_year", id: YEAR, label: "2026-27" },
      authority: { kind: "capability", capability: "role_management", roleCodes: ["president"] },
      correlationId: YEAR,
      backdated: false,
      detail: { effectiveFrom: "2026-09-01" },
    });
  });

  it("points the entity pointer at the operator account for a non-role event", () => {
    const prepared = prepareAdministrationEvent(deactivation());
    expect(prepared.entityTable).toBe("public.operator_accounts");
    expect(prepared.entityId).toBe(ACCOUNT);
  });

  it.each([
    ["no actor", { actorPersonId: "" as string }, "administration_actor_required"],
    ["a non-uuid actor", { actorPersonId: "somebody" }, "administration_actor_required"],
    [
      "no target Person",
      { target: { personId: "", operatorAccountId: ACCOUNT } },
      "administration_target_required",
    ],
    [
      "no operator account for an account-state event",
      { target: { personId: TARGET } },
      "administration_entity_required",
    ],
  ])("refuses a record with %s", (_label, overrides, rule) => {
    expect(refusalOf(deactivation(overrides as Partial<AdministrationEventRecord>)).rule).toBe(
      rule,
    );
  });

  it("refuses a record with no operating year, and one with an unlabelled year", () => {
    expect(refusalOf(deactivation({ operatingYear: undefined as never })).rule).toBe(
      "administration_operating_year_required",
    );
    expect(
      refusalOf(deactivation({ operatingYear: { scope: "season", id: YEAR, label: "  " } })).rule,
    ).toBe("administration_operating_year_required");
  });

  it("accepts a season-scoped operating year, because coaching seats hang off a season", () => {
    const prepared = prepareAdministrationEvent(
      assignment({
        role: { id: ROLE, code: "head_coach", assignmentId: ASSIGNMENT },
        operatingYear: { scope: "season", id: YEAR, label: "2026-27" },
      }),
    );
    expect(prepared.envelope.operatingYear.scope).toBe("season");
  });
});

describe("row 2 — authority at the time", () => {
  it("refuses an administrative event with no authority recorded", () => {
    expect(refusalOf(deactivation({ authority: undefined as never })).rule).toBe(
      "administration_authority_required",
    );
  });

  it("refuses a capability the application does not define", () => {
    expect(
      refusalOf(
        deactivation({
          authority: { kind: "capability", capability: "everything" as never, roleCodes: ["x"] },
        }),
      ).rule,
    ).toBe("administration_authority_capability_unknown");
  });

  it("only accepts capabilities the capability map actually declares", () => {
    for (const key of CAPABILITY_KEYS) {
      expect(() =>
        prepareAdministrationEvent(
          deactivation({
            authority: { kind: "capability", capability: key, roleCodes: ["president"] },
          }),
        ),
      ).not.toThrow();
    }
  });

  it("refuses an administrative event whose actor held no role at all", () => {
    expect(
      refusalOf(
        deactivation({
          authority: { kind: "capability", capability: "role_management", roleCodes: [] },
        }),
      ).rule,
    ).toBe("administration_authority_roles_required");
  });

  it("copies the roles held rather than leaving them to be re-derived later", () => {
    const heldThen = ["president", "it_officer"];
    const prepared = prepareAdministrationEvent(
      deactivation({
        authority: { kind: "capability", capability: "role_management", roleCodes: heldThen },
      }),
    );
    heldThen.push("general_manager");
    expect(prepared.envelope.authority.roleCodes).toEqual(["president", "it_officer"]);
  });

  it("allows self-service authority only where the account holder acts on their own account", () => {
    const activation = prepareAdministrationEvent({
      action: "administration.operator.activated",
      actorPersonId: TARGET,
      authority: { kind: "self", roleCodes: [] },
      target: { personId: TARGET, operatorAccountId: ACCOUNT },
      operatingYear: OPERATING_YEAR,
      fromState: "invitation_pending",
      toState: "active",
    });
    expect(activation.envelope.authority).toEqual({
      kind: "self",
      capability: null,
      roleCodes: [],
    });

    expect(refusalOf(deactivation({ authority: { kind: "self", roleCodes: [] } })).rule).toBe(
      "administration_authority_required",
    );
  });

  it("refuses a self-service record whose actor is not the account holder", () => {
    expect(
      refusalOf({
        action: "administration.operator.activated",
        actorPersonId: ACTOR,
        authority: { kind: "self", roleCodes: [] },
        target: { personId: TARGET, operatorAccountId: ACCOUNT },
        operatingYear: OPERATING_YEAR,
        fromState: "invitation_pending",
        toState: "active",
      }).rule,
    ).toBe("administration_self_authority_mismatch");
  });
});

describe("row 2 — the affected role, where there is one", () => {
  it("requires a role on a role-assignment event", () => {
    expect(refusalOf(assignment({ role: null })).rule).toBe("administration_role_required");
    expect(
      refusalOf(assignment({ role: { id: ROLE, code: "  ", assignmentId: ASSIGNMENT } })).rule,
    ).toBe("administration_role_required");
  });

  it("refuses a role on an event that does not concern one", () => {
    // A role here would put an account-state event into Holder history, where
    // `REQ-deactivate-and-reinstate` says it does not belong.
    expect(
      refusalOf(deactivation({ role: { id: ROLE, code: "kit_manager", assignmentId: ASSIGNMENT } }))
        .rule,
    ).toBe("administration_role_not_permitted");
  });

  it("marks exactly the role-assignment family as role-related", () => {
    for (const action of ADMINISTRATION_ACTIONS) {
      const definition = ADMINISTRATION_EVENTS[action];
      expect(definition.roleRelated).toBe(definition.family === "role_assignment");
    }
    expect([...ROLE_RELATED_ADMINISTRATION_ACTIONS]).toEqual([
      "administration.role.assigned",
      "administration.role.ended",
    ]);
  });
});

describe("row 8 — refused no-change actions are excluded", () => {
  it("refuses a transition whose before and after are the same", () => {
    const refusal = refusalOf(deactivation({ fromState: "deactivated", toState: "deactivated" }));
    expect(refusal).toEqual({ kind: "invalid_transition", rule: NO_CHANGE_RULE });
  });

  it("treats whitespace-only difference as no difference", () => {
    expect(refusalOf(deactivation({ fromState: " active ", toState: "active" })).rule).toBe(
      NO_CHANGE_RULE,
    );
  });

  it("requires both states on a transition", () => {
    expect(refusalOf(deactivation({ fromState: null })).rule).toBe("administration_state_required");
    expect(refusalOf(deactivation({ toState: null })).rule).toBe("administration_state_required");
  });

  it("refuses a prior state on a creation, which by definition had none", () => {
    expect(refusalOf(assignment({ fromState: "vacant" })).rule).toBe(
      "administration_creation_has_no_prior_state",
    );
  });

  it("requires the state a creation produced", () => {
    expect(refusalOf(assignment({ toState: null })).rule).toBe("administration_state_required");
  });

  it("does not compare states on an attempt, where no change is the normal outcome", () => {
    const resend = prepareAdministrationEvent({
      action: "administration.operator.invitation_resent",
      actorPersonId: ACTOR,
      authority: AUTHORITY,
      target: { personId: TARGET, operatorAccountId: ACCOUNT },
      operatingYear: OPERATING_YEAR,
      fromState: "invitation_pending",
      toState: "invitation_pending",
    });
    expect(resend.fromState).toBe("invitation_pending");
    expect(resend.toState).toBe("invitation_pending");
  });
});

describe("row 3 — a reason where the requirement requires one", () => {
  it.each([
    "administration.operator.deactivated",
    "administration.operator.email_rehome_started",
    "administration.role.ended",
  ] as const)("requires a reason on %s", (action) => {
    expect(ADMINISTRATION_EVENTS[action].reasonRequired).toBe(true);
  });

  it("refuses a deactivation with no reason, and one with only whitespace", () => {
    expect(refusalOf(deactivation({ reason: null })).rule).toBe("administration_reason_required");
    expect(refusalOf(deactivation({ reason: "   " })).rule).toBe("administration_reason_required");
  });

  it("refuses ending a role assignment with no reason", () => {
    expect(
      refusalOf({
        action: "administration.role.ended",
        actorPersonId: ACTOR,
        authority: AUTHORITY,
        target: { personId: TARGET, operatorAccountId: ACCOUNT },
        role: { id: ROLE, code: "kit_manager", assignmentId: ASSIGNMENT },
        operatingYear: OPERATING_YEAR,
        fromState: "held",
        toState: "ended",
      }).rule,
    ).toBe("administration_reason_required");
  });

  it("requires a reason for a backdated assignment, because backdating is audited", () => {
    expect(refusalOf(assignment({ backdated: true })).rule).toBe(
      "administration_backdating_reason_required",
    );
    expect(
      prepareAdministrationEvent(
        assignment({ backdated: true, reason: "Agreed at the June AGM, recorded late." }),
      ).envelope.backdated,
    ).toBe(true);
  });

  it("trims a reason rather than storing the operator's stray whitespace", () => {
    expect(prepareAdministrationEvent(deactivation({ reason: "  Moved away.  " })).reason).toBe(
      "Moved away.",
    );
  });
});

describe("REQ-final-admin-protection — the self-action refusals, as a second line", () => {
  it.each([
    ["deactivating themselves", "administration.operator.deactivated"],
    ["recovering their own email access", "administration.operator.email_rehome_started"],
  ] as const)("refuses an operator %s", (_label, action) => {
    const refusal = refusalOf(
      deactivation({ action, actorPersonId: TARGET, reason: "Because I said so." }),
    );
    expect(refusal).toEqual({
      kind: "not_permitted",
      rule: "administration_self_action_forbidden",
    });
  });

  it("refuses an operator ending their own role assignment", () => {
    expect(
      refusalOf({
        action: "administration.role.ended",
        actorPersonId: TARGET,
        authority: AUTHORITY,
        target: { personId: TARGET, operatorAccountId: ACCOUNT },
        role: { id: ROLE, code: "kit_manager", assignmentId: ASSIGNMENT },
        operatingYear: OPERATING_YEAR,
        fromState: "held",
        toState: "ended",
        reason: "Standing down.",
      }).rule,
    ).toBe("administration_self_action_forbidden");
  });

  it("still permits self-assignment, which the capability decision already allows", () => {
    // Whoever holds `role_management` can assign themselves a seat. Brian
    // recorded that consequence when he took the decision, and refusing it here
    // would be theatre rather than a boundary.
    expect(() => prepareAdministrationEvent(assignment({ actorPersonId: TARGET }))).not.toThrow();
  });
});

describe("the envelope's own shape", () => {
  it("refuses a detail that is not a JSON object", () => {
    expect(refusalOf(assignment({ detail: ["a", "b"] as never })).rule).toBe(
      "administration_detail_is_object",
    );
  });

  it("copies detail rather than holding the caller's object", () => {
    const detail: Record<string, unknown> = { emailAfter: "new@example.test" };
    const prepared = prepareAdministrationEvent(assignment({ detail }));
    detail.emailAfter = "changed@example.test";
    expect(prepared.envelope.detail).toEqual({ emailAfter: "new@example.test" });
  });

  it("refuses a correlation identifier that is not a uuid", () => {
    expect(refusalOf(assignment({ correlationId: "replacement-1" })).rule).toBe(
      "administration_correlation_id_invalid",
    );
  });

  it("stamps the envelope version on every event", () => {
    for (const action of ROLE_RELATED_ADMINISTRATION_ACTIONS) {
      const prepared = prepareAdministrationEvent(
        assignment(
          action === "administration.role.ended"
            ? { action, fromState: "held", toState: "ended", reason: "Season over." }
            : { action },
        ),
      );
      expect(prepared.envelope.version).toBe(ADMINISTRATION_ENVELOPE_VERSION);
    }
  });
});
