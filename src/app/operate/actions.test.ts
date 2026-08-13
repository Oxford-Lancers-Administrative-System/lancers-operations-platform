// @vitest-environment node
/**
 * The privileged server actions — LAN-73, test-matrix rows 7 and 10.
 *
 * Every call here goes **straight to the action**. No page renders, no layout
 * runs, no navigation exists, and nothing decided what the caller was allowed
 * to click. That is the whole point of the acceptance criterion: a server
 * action is a POST endpoint, and anybody with a session can call it whether or
 * not a screen ever offered it. If the enforcement lived in the page, every
 * assertion in this file would fail.
 *
 * The actor is injected exactly where a real request would produce it — at
 * `resolveOperatorAccess()`, the verified-session resolution — and nowhere
 * else. None of these actions takes an actor argument, and none may: an action
 * that accepted "who am I" would accept whatever the browser sent it.
 *
 * Two outcomes are distinguished throughout:
 *
 *   * `NotPermitted` — the guard refused. What an under-privileged caller gets.
 *   * `ActionNotImplemented` — the guard *passed* and the body is not built
 *     yet. What a permitted caller gets today, and the proof that the guard ran
 *     and let them through rather than being absent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));

import { isServiceError, type ServiceError } from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import type { CapabilityKey } from "@/lib/auth/capabilities";
import {
  activateMembership,
  administerDelivery,
  approveEvent,
  manageRoles,
  readLeadershipReport,
  recordAttendance,
} from "./actions";
import { ActionNotImplemented } from "./not-implemented";

type PrivilegedAction = () => Promise<never>;

/** Every privileged action in the slice, and the capability it is gated on. */
const ACTIONS: ReadonlyArray<{
  name: string;
  action: PrivilegedAction;
  capability: CapabilityKey;
  permitted: readonly string[];
}> = [
  {
    name: "activateMembership",
    action: activateMembership,
    capability: "membership_activation",
    permitted: ["president", "vice_president", "secretary", "treasurer", "general_manager"],
  },
  {
    name: "approveEvent",
    action: approveEvent,
    capability: "event_approval",
    permitted: ["president", "vice_president", "secretary", "general_manager"],
  },
  {
    name: "recordAttendance",
    action: recordAttendance,
    capability: "attendance_recorder",
    permitted: ["head_coach", "offence_coach", "defence_coach"],
  },
  { name: "manageRoles", action: manageRoles, capability: "role_management", permitted: [] },
  {
    name: "administerDelivery",
    action: administerDelivery,
    capability: "delivery_administration",
    permitted: [],
  },
  {
    name: "readLeadershipReport",
    action: readLeadershipReport,
    capability: "leadership_report",
    permitted: [],
  },
];

function actor(roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Rowan Ashdown",
    roleCodes,
    isActive: true,
  };
}

function givenCaller(access: OperatorAccess) {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

async function refusalFrom(action: PrivilegedAction): Promise<ServiceError> {
  let thrown: unknown;
  try {
    await action();
  } catch (error) {
    thrown = error;
  }

  if (thrown === undefined) throw new Error("The action was not refused, and it should have been.");
  if (thrown instanceof ActionNotImplemented) {
    throw new Error(
      "The action got past its guard. An under-privileged caller reached the action body.",
    );
  }
  if (!isServiceError(thrown)) throw new Error(`Expected a ServiceError, got ${String(thrown)}`);
  return thrown;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("row 7 — enforcement lives in the action, not in the page", () => {
  it.each(ACTIONS)(
    "$name refuses an operator holding an unrelated role, called directly",
    async ({ action, capability }) => {
      givenCaller({ state: "active", operator: actor(["it_officer"]) });

      const refusal = await refusalFrom(action);

      expect(refusal.kind).toBe("not_permitted");
      expect(refusal.rule).toBe(`capability:${capability}`);
    },
  );

  it.each(ACTIONS)("$name refuses an operator with no role at all", async ({ action }) => {
    givenCaller({ state: "active", operator: actor([]) });

    expect((await refusalFrom(action)).kind).toBe("not_permitted");
  });

  it.each(ACTIONS)("$name refuses an unlinked account", async ({ action }) => {
    givenCaller({ state: "unlinked" });

    expect((await refusalFrom(action)).rule).toBe("operator_required");
  });

  it.each(ACTIONS)("$name refuses a deactivated account", async ({ action }) => {
    givenCaller({ state: "inactive" });

    expect((await refusalFrom(action)).rule).toBe("operator_required");
  });

  it.each(ACTIONS)("$name refuses a caller with no session at all", async ({ action }) => {
    givenCaller({ state: "no_session" });

    expect((await refusalFrom(action)).rule).toBe("operator_required");
  });

  it.each(ACTIONS)("$name resolves the actor itself and takes no actor argument", ({ action }) => {
    // A zero-argument action cannot be told who is calling it. This is what
    // keeps the session, rather than the request body, the source of identity.
    expect(action.length).toBe(0);
  });

  it("refuses on every attempt, not only the first", async () => {
    // The Treasurer, not the Secretary: LAN-77's owner clarification made the
    // Secretary an approver, so they no longer demonstrate a refusal at all.
    givenCaller({ state: "active", operator: actor(["treasurer"]) });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await refusalFrom(approveEvent)).kind).toBe("not_permitted");
    }
    expect(vi.mocked(resolveOperatorAccess)).toHaveBeenCalledTimes(3);
  });
});

describe("a permitted caller gets past the guard — which is how we know it ran", () => {
  const grantable = ACTIONS.filter((entry) => entry.permitted.length > 0);

  for (const { name, action, permitted } of grantable) {
    it.each(permitted)(`${name} admits %s`, async (code) => {
      givenCaller({ state: "active", operator: actor([code]) });

      await expect(action()).rejects.toBeInstanceOf(ActionNotImplemented);
    });
  }

  it("does nothing whatever past the guard — no read, no write, no audit", async () => {
    givenCaller({ state: "active", operator: actor(["president"]) });

    await expect(approveEvent()).rejects.toThrow(/not built yet/i);
  });
});

describe("row 10 — an attendance recorder is refused every other action", () => {
  const coaches = ["head_coach", "offence_coach", "defence_coach"];
  const others = ACTIONS.filter((entry) => entry.capability !== "attendance_recorder");

  for (const coach of coaches) {
    it.each(others)(`a ${coach} is refused $name`, async ({ action, capability }) => {
      givenCaller({ state: "active", operator: actor([coach]) });

      const refusal = await refusalFrom(action);
      expect(refusal.rule).toBe(`capability:${capability}`);
    });
  }

  it.each(coaches)("%s reaches attendance recording and nothing else", async (coach) => {
    givenCaller({ state: "active", operator: actor([coach]) });

    await expect(recordAttendance()).rejects.toBeInstanceOf(ActionNotImplemented);

    for (const { action } of others) {
      expect((await refusalFrom(action)).kind).toBe("not_permitted");
    }
  });

  it("refuses a coach the membership activation the Exec holds", async () => {
    givenCaller({ state: "active", operator: actor(["head_coach"]) });

    const refusal = await refusalFrom(activateMembership);

    // And says what it needs without naming the coach's own seat.
    expect(refusal.message).toContain("President");
    expect(refusal.message).not.toContain("Head Coach");
  });
});

describe("row 6 — an action's refusal names the requirement, never the caller", () => {
  /**
   * The same rule as `guards.test.ts`, asserted at the surface a browser can
   * actually reach. The guard is where the message is built and where that
   * suite proves the property; this is here because a server action is the
   * thing an attacker calls, and an action that one day catches a refusal and
   * re-throws it "with a bit more detail for the operator" would defeat the
   * rule without touching the guard at all.
   */
  const HELD = ["it_officer", "social_secretary", "kit_manager"];
  const LABELS = ["IT Officer", "Social Secretary", "Kit Manager"];

  it.each(ACTIONS)("$name tells the caller nothing about their own roles", async ({ action }) => {
    givenCaller({ state: "active", operator: actor(HELD) });

    const refusal = await refusalFrom(action);
    // Own enumerable properties too, for the same reason as `guards.test.ts`:
    // an action that attaches the actor to the error it re-throws leaks just as
    // far as one that writes the codes into the message. `message` is listed
    // explicitly because `Error` defines it as own but non-enumerable.
    const disclosed = [
      refusal.message,
      refusal.rule ?? "",
      JSON.stringify(refusal.context ?? {}),
      ...Object.entries(refusal).map(([key, value]) => `${key}=${JSON.stringify(value)}`),
    ]
      .join(" | ")
      .toLowerCase();

    for (const code of [...HELD, ...LABELS]) {
      expect(disclosed, `the refusal names "${code}"`).not.toContain(code.toLowerCase());
    }
    // Non-vacuous: it is a real refusal that really does say what is needed.
    expect(refusal.message).toContain("You do not have access to this action.");
  });
});
