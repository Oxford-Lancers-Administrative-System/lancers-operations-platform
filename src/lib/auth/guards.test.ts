// @vitest-environment node
/**
 * The guards — LAN-73, test-matrix rows 5, 6, 9, 10, 11 and 12.
 *
 * The actor is supplied directly in every test here, which is the point: an
 * authorization decision that can only be exercised by rendering a page is an
 * authorization decision nobody can test properly. `assertRole` and
 * `assertCapability` take the actor as an argument; `requireOperator`,
 * `requireRole` and `requireCapability` take it from the verified session,
 * which is stubbed here at exactly one place — `resolveOperatorAccess` — so
 * that no test can accidentally prove a guard by supplying an actor the way a
 * browser never could.
 *
 * What is asserted about a refusal, every time: it is a `NotPermitted`, its
 * `kind` is `not_permitted`, it names what the action requires, and it names
 * nothing about the person refused.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./operator", () => ({ resolveOperatorAccess: vi.fn() }));

import { isServiceError, NotPermitted, ServiceError } from "@/lib/db";
import { CAPABILITY_KEYS, capabilityRoleCodes, type CapabilityKey } from "./capabilities";
import {
  assertCapability,
  assertOperator,
  assertRole,
  capabilityRule,
  OPERATOR_REQUIRED_MESSAGE,
  operatorHasCapability,
  requireCapability,
  requireOperator,
  requireRole,
} from "./guards";
import { resolveOperatorAccess, type OperatorAccess, type ResolvedOperator } from "./operator";

const COACHES = ["head_coach", "offence_coach", "defence_coach"] as const;

function actor(roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Rowan Ashdown",
    roleCodes,
    isActive: true,
  };
}

function givenSession(access: OperatorAccess) {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

/** Runs `call`, requires it to have thrown, and hands back what it threw. */
async function refusalFrom(call: () => unknown | Promise<unknown>): Promise<ServiceError> {
  let thrown: unknown;
  try {
    await call();
  } catch (error) {
    thrown = error;
  }

  if (thrown === undefined) {
    throw new Error("Expected this call to be refused, and it was not.");
  }
  if (!isServiceError(thrown)) {
    throw new Error(`Expected a ServiceError, got ${String(thrown)}`);
  }
  return thrown;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("row 5 — requireOperator()", () => {
  it("returns the resolved operator for a linked, active account", async () => {
    const operator = actor(["secretary"]);
    givenSession({ state: "active", operator });

    await expect(requireOperator()).resolves.toBe(operator);
  });

  it("returns an operator who holds no role at all — the shell is not role-gated", async () => {
    const operator = actor([]);
    givenSession({ state: "active", operator });

    await expect(requireOperator()).resolves.toBe(operator);
  });

  it.each<OperatorAccess["state"]>(["no_session", "unlinked", "inactive"])(
    "refuses a %s request with NotPermitted rather than a falsy value",
    async (state) => {
      givenSession({ state } as OperatorAccess);

      const refusal = await refusalFrom(() => requireOperator());

      expect(refusal).toBeInstanceOf(NotPermitted);
      expect(refusal.kind).toBe("not_permitted");
      expect(refusal.rule).toBe("operator_required");
    },
  );

  it("says the same thing for all three unresolved causes", async () => {
    const messages: string[] = [];
    for (const state of ["no_session", "unlinked", "inactive"] as const) {
      givenSession({ state } as OperatorAccess);
      messages.push((await refusalFrom(() => requireOperator())).message);
    }

    // A privileged path learns "no operator" and never which of the three. The
    // account-state screens make that distinction, to the account's own holder.
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toBe(OPERATOR_REQUIRED_MESSAGE);
  });

  it("is a bare ServiceError refusal, not an unexpected failure", async () => {
    givenSession({ state: "unlinked" });
    const refusal = await refusalFrom(() => requireOperator());

    // `kind` is the contract callers switch on; anything else would be rendered
    // as "something went wrong" instead of as a refusal.
    expect(refusal.kind).not.toBe("unexpected");
    expect(assertOperator).toBeTypeOf("function");
  });
});

describe("row 6 — requireRole(codes)", () => {
  it("returns the operator when a currently-effective assignment matches", async () => {
    const operator = actor(["treasurer", "it_officer"]);
    givenSession({ state: "active", operator });

    await expect(requireRole(["treasurer"])).resolves.toBe(operator);
  });

  it("refuses an operator holding a different role, naming what was needed", async () => {
    givenSession({ state: "active", operator: actor(["it_officer"]) });

    const refusal = await refusalFrom(() => requireRole(["president"]));

    expect(refusal.kind).toBe("not_permitted");
    expect(refusal.message).toContain("President");
  });

  it("does not enumerate the roles the refused operator holds", async () => {
    givenSession({
      state: "active",
      operator: actor(["it_officer", "social_secretary", "kit_manager"]),
    });

    const refusal = await refusalFrom(() => requireRole(["president"]));

    for (const held of ["it_officer", "IT Officer", "social_secretary", "kit_manager"]) {
      expect(refusal.message).not.toContain(held);
    }
    // Nor who does hold the missing seat.
    expect(refusal.message).not.toMatch(/held by|contact the president|ask .* president/i);
  });

  it("refuses an operator holding no currently-effective role", async () => {
    // The seat that ended yesterday and the seat that starts next season both
    // arrive here as an empty list — that rule lives in resolveOperator() and
    // is proved in operator.test.ts. What matters here is that empty refuses.
    givenSession({ state: "active", operator: actor([]) });

    const refusal = await refusalFrom(() => requireRole(["president"]));
    expect(refusal.kind).toBe("not_permitted");
  });

  it("refuses when the required-role list is empty, rather than waving it through", async () => {
    // A guard whose requirement was never decided must not resolve to "anyone".
    givenSession({ state: "active", operator: actor(["president"]) });

    const refusal = await refusalFrom(() => requireRole([]));
    expect(refusal.kind).toBe("not_permitted");
  });

  it("refuses before looking at roles when there is no operator", async () => {
    givenSession({ state: "inactive" });

    const refusal = await refusalFrom(() => requireRole(["president"]));
    expect(refusal.rule).toBe("operator_required");
    expect(refusal.message).toBe(OPERATOR_REQUIRED_MESSAGE);
  });

  it("is callable as a pure assertion with an arbitrary actor", () => {
    expect(assertRole(actor(["president"]), ["president"]).personId).toBeTruthy();
    expect(() => assertRole(actor(["secretary"]), ["president"])).toThrow(NotPermitted);
    expect(() => assertRole(null, ["president"])).toThrow(NotPermitted);
  });
});

describe("rows 9 to 12 — requireCapability() over the map", () => {
  it.each(COACHES)("lets %s record attendance", async (code) => {
    const operator = actor([code]);
    givenSession({ state: "active", operator });

    await expect(requireCapability("attendance_recorder")).resolves.toBe(operator);
  });

  it("lets the President approve an event", async () => {
    const operator = actor(["president"]);
    givenSession({ state: "active", operator });

    await expect(requireCapability("event_approval")).resolves.toBe(operator);
  });

  it("refuses the Treasurer the event approval, naming what it needs", async () => {
    // The Secretary used to be the refused actor here, and is now an approver
    // (LAN-77's owner clarification). The Treasurer replaces them as the case
    // worth testing: a constitutional office, permitted to activate a
    // membership, and deliberately not permitted to approve an event.
    givenSession({ state: "active", operator: actor(["treasurer"]) });

    const refusal = await refusalFrom(() => requireCapability("event_approval"));

    expect(refusal.rule).toBe(capabilityRule("event_approval"));
    expect(refusal.message).toContain("President");
    // The requirement, never the holdings — the refused operator's own role
    // must not appear in what they are shown.
    expect(refusal.message).not.toContain("Treasurer");
  });

  it.each(["president", "vice_president", "secretary", "general_manager"])(
    "lets %s approve an event",
    async (code) => {
      const operator = actor([code]);
      givenSession({ state: "active", operator });

      await expect(requireCapability("event_approval")).resolves.toBe(operator);
    },
  );

  it.each(["president", "vice_president", "secretary", "treasurer", "general_manager"])(
    "lets %s activate a membership",
    async (code) => {
      const operator = actor([code]);
      givenSession({ state: "active", operator });

      await expect(requireCapability("membership_activation")).resolves.toBe(operator);
    },
  );

  it.each(["role_management"] as CapabilityKey[])(
    "refuses %s to the President, because nobody has been granted it",
    async (key) => {
      // `leadership_report` was here until LAN-81 decided its grant. The
      // property is unchanged and is asserted below against a role that is
      // genuinely outside it: an empty grant refuses everybody, and a decided
      // grant refuses everybody it does not name.
      givenSession({ state: "active", operator: actor(["president"]) });

      const refusal = await refusalFrom(() => requireCapability(key));
      expect(refusal.rule).toBe(capabilityRule(key));
      expect(refusal.message).toContain("No club role is currently authorized");
    },
  );

  it("permits the Monday report to the four roles LAN-81 granted it", async () => {
    for (const code of ["president", "vice_president", "secretary", "general_manager"]) {
      const operator = actor([code]);
      givenSession({ state: "active", operator });

      await expect(requireCapability("leadership_report")).resolves.toBe(operator);
    }
  });

  it("refuses the Monday report to a coaching seat and to the Treasurer", async () => {
    for (const code of ["head_coach", "offence_coach", "defence_coach", "treasurer"]) {
      givenSession({ state: "active", operator: actor([code]) });

      const refusal = await refusalFrom(() => requireCapability("leadership_report"));
      expect(refusal.rule).toBe(capabilityRule("leadership_report"));
      // The requirement, and nothing about the reader.
      expect(refusal.message).not.toContain(code);
    }
  });

  it("permits delivery administration to the four roles LAN-78 granted it", async () => {
    // The counterpart of the refusal above: this capability left the undecided
    // set in LAN-78, so it now needs a positive assertion rather than none.
    for (const code of ["president", "vice_president", "secretary", "general_manager"]) {
      const operator = actor([code]);
      givenSession({ state: "active", operator });
      await expect(requireCapability("delivery_administration")).resolves.toBe(operator);
    }
  });

  it("refuses delivery administration to a coaching seat", async () => {
    givenSession({ state: "active", operator: actor(["head_coach"]) });
    const refusal = await refusalFrom(() => requireCapability("delivery_administration"));
    expect(refusal.rule).toBe(capabilityRule("delivery_administration"));
  });

  it.each(CAPABILITY_KEYS)("refuses %s to an unlinked account", async (key) => {
    givenSession({ state: "unlinked" });

    const refusal = await refusalFrom(() => requireCapability(key));
    expect(refusal.rule).toBe("operator_required");
  });

  it.each(CAPABILITY_KEYS)("refuses %s to a deactivated account", async (key) => {
    givenSession({ state: "inactive" });

    const refusal = await refusalFrom(() => requireCapability(key));
    expect(refusal.rule).toBe("operator_required");
  });

  it.each(CAPABILITY_KEYS)(
    "refuses %s to an ordinary player with no operator link",
    async (key) => {
      // A player is not an operator at all: no `operator_accounts` row.
      givenSession({ state: "unlinked" });

      const refusal = await refusalFrom(() => requireCapability(key));
      expect(refusal.kind).toBe("not_permitted");
    },
  );
});

describe("row 10 — an attendance recorder receives nothing else", () => {
  /**
   * "Nothing else" is now two capabilities rather than one, and the second is
   * not a widening.
   *
   * `attendance_recorder` has always been the narrow coaching grant — LAN-110's
   * question, "is the constrained screen yours". LAN-80 added
   * `attendance_recording`, the question "may you record at all", and Brian's
   * 12 August 2026 decision puts the three coaching seats on that workflow
   * explicitly: "an authorized coach may set and correct Present, Absent, Late
   * or Excused". A coach who could not record would contradict it.
   *
   * Everything this block is really guarding is unchanged: no roster editing,
   * no activation, no approval, no occurrence assertion, no role management, no
   * delivery, no report. The list below is exhaustive over the map, so a future
   * capability a coach must not hold fails here the moment it is added.
   */
  const ATTENDANCE = ["attendance_recorder", "attendance_recording"] as const;
  const others = CAPABILITY_KEYS.filter((key) => !(ATTENDANCE as readonly string[]).includes(key));

  for (const code of COACHES) {
    it.each(others)(`refuses %s to a ${code}`, async (key) => {
      givenSession({ state: "active", operator: actor([code]) });

      const refusal = await refusalFrom(() => requireCapability(key));
      expect(refusal.rule).toBe(capabilityRule(key));
    });
  }

  it("refuses every other capability to somebody holding all three coaching seats", async () => {
    givenSession({ state: "active", operator: actor([...COACHES]) });

    for (const key of others) {
      const refusal = await refusalFrom(() => requireCapability(key));
      expect(refusal.kind).toBe("not_permitted");
    }
  });

  it("grants a coach the two attendance capabilities and nothing else", () => {
    const coach = actor(["head_coach"]);
    const granted = CAPABILITY_KEYS.filter((key) => operatorHasCapability(coach, key));

    expect([...granted].sort()).toEqual([...ATTENDANCE].sort());
  });

  it("does not let recording attendance imply asserting that the event happened", () => {
    // The boundary `slice-ux.md` § 8 states in as many words — "Occurrence
    // assertion … not implied by attendance-recorder capability" — and the one
    // LAN-110 restates as a fixed boundary. A coach records who turned up; they
    // do not decide that there was anything to turn up to.
    for (const code of COACHES) {
      expect(operatorHasCapability(actor([code]), "attendance_recording")).toBe(true);
      expect(operatorHasCapability(actor([code]), "event_occurrence_assertion")).toBe(false);
    }
  });

  it("never lets a capability be reached through a role it does not list", () => {
    // Belt and braces over the whole map: for every capability and every code
    // it does not name, the answer is no.
    for (const key of CAPABILITY_KEYS) {
      const permitted = capabilityRoleCodes(key);
      for (const code of ["president", "secretary", "it_officer", ...COACHES]) {
        expect(operatorHasCapability(actor([code]), key)).toBe(permitted.includes(code));
      }
    }
  });

  it("refuses a null actor for every capability", () => {
    for (const key of CAPABILITY_KEYS) {
      expect(operatorHasCapability(null, key)).toBe(false);
      expect(() => assertCapability(null, key)).toThrow(NotPermitted);
    }
  });
});

/**
 * Row 6, the half that is about the reader rather than the action — and the
 * gap a level-3 review found here.
 *
 * The suite already checked this on the `assertRole` path, against one actor,
 * naming three codes and one label. `assertCapability` — which is what every
 * page and every server action actually calls — had no equivalent, and its only
 * two assertions were incidental single-label checks. A reviewer appended a
 * sentence naming `operator.roleCodes` to its refusal, and all 1141 tests in
 * the repository passed: a refused Secretary was told "This action requires the
 * President role. You hold secretary." and nothing objected.
 *
 * So the checks below are generic in all three directions the earlier ones were
 * not: **every** capability, **every** code the actor holds, and **both** the
 * raw code and its display label — because the accidental protection that did
 * exist was blind to the code form, which is the form a careless template
 * interpolation produces.
 *
 * They also read the whole error rather than only its message. Holdings moved
 * into `rule` or `context` would leak exactly as far: `context` is built for
 * logs, and a log line is not a private place.
 */
describe("row 6 — no refusal says anything about what the actor holds", () => {
  /**
   * Codes to hold while being refused. Deliberately several, deliberately
   * including a coaching seat, and filtered per capability so that the actor is
   * always genuinely refused and always genuinely holds something.
   */
  const NOISY_HOLDINGS = [
    "it_officer",
    "social_secretary",
    "kit_manager",
    "head_coach",
    "president",
    "treasurer",
  ];

  /** Display labels, written out here rather than imported from the module. */
  const LABELS: Record<string, string> = {
    it_officer: "IT Officer",
    social_secretary: "Social Secretary",
    kit_manager: "Kit Manager",
    head_coach: "Head Coach",
    president: "President",
    treasurer: "Treasurer",
  };

  /** What the actor holds, minus anything that would let the capability through. */
  function heldWhileRefused(key: CapabilityKey): string[] {
    return NOISY_HOLDINGS.filter((code) => !capabilityRoleCodes(key).includes(code));
  }

  /**
   * Everything a caller could read off the refusal, flattened into one string.
   *
   * The four fields `ServiceError` defines, **and** every own enumerable
   * property. A refusal that carries the actor on an extra property —
   * `Object.assign(refusal, { actor })`, the shape of "attach it so the error
   * boundary can show something useful" — leaks exactly as far as one that puts
   * the codes in the message, and reading only the named fields misses it.
   * `message` stays listed explicitly because `Error` defines it as own but
   * *non-enumerable*, so `Object.entries` does not see it.
   */
  function everythingDisclosed(refusal: ServiceError): string {
    return [
      refusal.message,
      refusal.name,
      refusal.rule ?? "",
      JSON.stringify(refusal.context ?? {}),
      ...Object.entries(refusal).map(([key, value]) => `${key}=${JSON.stringify(value)}`),
    ]
      .join(" | ")
      .toLowerCase();
  }

  /**
   * Does `disclosed` name `term` as a term in its own right?
   *
   * Not a substring test. "vice-president" contains "president", so a plain
   * `toContain` reports a privacy leak the moment someone narrows
   * `membership_activation` — which `capabilities.ts` explicitly invites as
   * "an edit to one array in this file". A false failure here is worse than no
   * failure: the natural way to make it green again is to weaken the assertion,
   * which is the exact defect this suite exists to prevent.
   */
  function discloses(disclosed: string, term: string): boolean {
    const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z-])${escaped}(?![a-z-])`).test(disclosed);
  }

  function expectDisclosesNothing(refusal: ServiceError, held: readonly string[]) {
    const disclosed = everythingDisclosed(refusal);

    expect(held.length, "the actor holds nothing, so this proves nothing").toBeGreaterThan(0);
    for (const code of held) {
      expect(
        discloses(disclosed, code),
        `the refusal names the code "${code}" the actor holds: ${disclosed}`,
      ).toBe(false);
      expect(
        discloses(disclosed, LABELS[code]),
        `the refusal names "${LABELS[code]}", which is what the actor holds: ${disclosed}`,
      ).toBe(false);
    }
  }

  it.each(CAPABILITY_KEYS)(
    "assertCapability(%s) names the requirement and none of the holdings",
    (key) => {
      const held = heldWhileRefused(key);
      let refusal: ServiceError | undefined;

      try {
        assertCapability(actor(held), key);
      } catch (error) {
        refusal = error as ServiceError;
      }

      expect(refusal, "the actor was not refused, so this proves nothing").toBeDefined();
      // Non-vacuous: there really is a message, and it really does say what the
      // action needs. An empty one would satisfy every assertion below.
      expect(refusal!.message).toContain("You do not have access to this action.");
      expectDisclosesNothing(refusal!, held);
    },
  );

  it.each(CAPABILITY_KEYS)("requireCapability(%s) discloses nothing either", async (key) => {
    // The path a server action and a page actually take, in case the two ever
    // diverge.
    const held = heldWhileRefused(key);
    givenSession({ state: "active", operator: actor(held) });

    expectDisclosesNothing(await refusalFrom(() => requireCapability(key)), held);
  });

  it("discloses nothing from requireRole either, for any required role", async () => {
    const held = ["it_officer", "social_secretary", "kit_manager", "head_coach"];

    for (const required of [["president"], ["secretary", "treasurer"], ["general_manager"]]) {
      givenSession({ state: "active", operator: actor(held) });
      expectDisclosesNothing(await refusalFrom(() => requireRole(required)), held);
    }
  });

  it("says nothing about the account when there is no operator at all", async () => {
    // The other direction of the same rule: three unresolved causes, one
    // message, and nothing in it about which cause applies or to whom.
    for (const state of ["no_session", "unlinked", "inactive"] as const) {
      givenSession({ state } as OperatorAccess);
      const disclosed = everythingDisclosed(await refusalFrom(() => requireOperator()));

      expect(disclosed).not.toMatch(/unlink|inactive|deactivat|disabled|no session|expired/);
    }
  });
});
