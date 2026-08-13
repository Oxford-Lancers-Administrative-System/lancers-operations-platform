// @vitest-environment node
/**
 * The membership workflow's server actions — LAN-75, matrix row 6.
 *
 * This file exists for one acceptance criterion: "activation is refused for an
 * operator without an Exec/GM role, **in the server action and not only in the
 * UI**". Every call here goes straight to the action. No page renders, no
 * layout runs, nothing decided what the caller was allowed to click — which is
 * exactly the position an attacker is in, because a server action is a POST
 * endpoint anybody with a session can call whether or not a screen ever offered
 * it. If the enforcement lived in the page, every assertion below would fail.
 *
 * The actor is injected exactly where a real request produces it — at
 * `resolveOperatorAccess()`, the verified-session resolution — and nowhere
 * else. None of these actions takes an actor argument, and the test that sends
 * one in the form body is what holds them to that.
 *
 * The service layer is mocked. What is under test is the guard, the actor it
 * passes on, and how a failure is presented; the writes themselves are proved
 * against the real database in `src/lib/services/membership.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/membership", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/membership")>();
  return {
    ...actual,
    activateMembership: vi.fn(),
    setMembershipInactive: vi.fn(),
    reactivateMembership: vi.fn(),
    resolveOnboardingItem: vi.fn(),
  };
});

import { ConstraintViolated, InvalidTransition, isServiceError } from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import {
  ACTIVATION_NEEDS_OVERRIDE_RULE,
  activateMembership,
  reactivateMembership,
  resolveOnboardingItem,
  setMembershipInactive,
} from "@/lib/services/membership";
import {
  activateMembershipAction,
  reactivateMembershipAction,
  resolveOnboardingItemAction,
  setMembershipInactiveAction,
} from "./actions";
import { EMPTY_MEMBERSHIP_ACTION_STATE } from "./action-state";

const OPERATOR_PERSON_ID = "22222222-2222-4222-8222-222222222222";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";
const ITEM_ID = "55555555-5555-4555-8555-555555555555";

/**
 * "Exec/GM" as `capabilities.ts` resolves it: the four constitutional offices
 * plus the General Manager, whom `slice-ux.md` § 8 names for this transition.
 */
const ACTIVATION_ROLES = [
  "president",
  "vice_president",
  "secretary",
  "treasurer",
  "general_manager",
];

/** Every other seat in the catalogue. None of them may activate anybody. */
const OTHER_ROLES = [
  "social_secretary",
  "gameday_secretary",
  "kit_manager",
  "media_secretary",
  "it_officer",
  "head_coach",
  "offence_coach",
  "defence_coach",
];

function actor(roleCodes: string[] = ["president"]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: OPERATOR_PERSON_ID,
    displayName: "Rowan Ashdown",
    roleCodes,
    isActive: true,
  };
}

function givenAccess(access: OperatorAccess) {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** The four actions, each with a form that would succeed if it were permitted. */
const PRIVILEGED_ACTIONS = [
  {
    name: "activate",
    call: () =>
      activateMembershipAction(
        EMPTY_MEMBERSHIP_ACTION_STATE,
        form({ membershipId: MEMBERSHIP_ID, overrideReason: "" }),
      ),
    service: () => activateMembership,
  },
  {
    name: "mark inactive",
    call: () =>
      setMembershipInactiveAction(
        EMPTY_MEMBERSHIP_ACTION_STATE,
        form({ membershipId: MEMBERSHIP_ID, reason: "Stepped away" }),
      ),
    service: () => setMembershipInactive,
  },
  {
    name: "mark active again",
    call: () =>
      reactivateMembershipAction(
        EMPTY_MEMBERSHIP_ACTION_STATE,
        form({ membershipId: MEMBERSHIP_ID, reason: "Back" }),
      ),
    service: () => reactivateMembership,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  givenAccess({ state: "active", operator: actor() });
});

// ---------------------------------------------------------------------------

describe("the activation boundary", () => {
  for (const role of ACTIVATION_ROLES) {
    it(`lets the ${role} activate a membership`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const state = await activateMembershipAction(
        EMPTY_MEMBERSHIP_ACTION_STATE,
        form({ membershipId: MEMBERSHIP_ID, overrideReason: "" }),
      );

      expect(state).toEqual({ error: null, needsOverride: false });
      expect(activateMembership).toHaveBeenCalledWith({
        actorPersonId: OPERATOR_PERSON_ID,
        membershipId: MEMBERSHIP_ID,
        overrideReason: "",
      });
    });
  }

  for (const role of OTHER_ROLES) {
    it(`refuses the ${role}, and never reaches the service`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const failure = await activateMembershipAction(
        EMPTY_MEMBERSHIP_ACTION_STATE,
        form({ membershipId: MEMBERSHIP_ID, overrideReason: "" }),
      ).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(activateMembership).not.toHaveBeenCalled();
    });
  }

  it("refuses an operator holding no seat at all", async () => {
    givenAccess({ state: "active", operator: actor([]) });

    const failure = await activateMembershipAction(
      EMPTY_MEMBERSHIP_ACTION_STATE,
      form({ membershipId: MEMBERSHIP_ID }),
    ).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
    expect(activateMembership).not.toHaveBeenCalled();
  });

  for (const state of ["unlinked", "inactive", "no_session"] as const) {
    it(`refuses a ${state} caller`, async () => {
      givenAccess({ state } as OperatorAccess);

      const failure = await activateMembershipAction(
        EMPTY_MEMBERSHIP_ACTION_STATE,
        form({ membershipId: MEMBERSHIP_ID }),
      ).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(activateMembership).not.toHaveBeenCalled();
    });
  }

  /**
   * The whole reason none of these takes an actor argument. A POST body is
   * whatever the caller chose to send it.
   */
  it("ignores an actor smuggled in through the form body", async () => {
    givenAccess({ state: "active", operator: actor(["president"]) });

    await activateMembershipAction(
      EMPTY_MEMBERSHIP_ACTION_STATE,
      form({
        membershipId: MEMBERSHIP_ID,
        actorPersonId: "99999999-9999-4999-8999-999999999999",
        personId: "99999999-9999-4999-8999-999999999999",
      }),
    );

    expect(activateMembership).toHaveBeenCalledWith(
      expect.objectContaining({ actorPersonId: OPERATOR_PERSON_ID }),
    );
  });
});

describe("every privileged membership action, not only activation", () => {
  for (const action of PRIVILEGED_ACTIONS) {
    it(`refuses "${action.name}" to a coach`, async () => {
      givenAccess({ state: "active", operator: actor(["head_coach"]) });

      const failure = await action.call().catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(action.service()).not.toHaveBeenCalled();
    });

    it(`allows "${action.name}" to the General Manager`, async () => {
      givenAccess({ state: "active", operator: actor(["general_manager"]) });

      await expect(action.call()).resolves.toEqual({ error: null, needsOverride: false });
      expect(action.service()).toHaveBeenCalledOnce();
    });
  }
});

// ---------------------------------------------------------------------------

describe("resolving an onboarding item", () => {
  /**
   * Deliberately *not* Exec/GM. UX-21's audience is "Authorized roster
   * operator" and only UX-22's is "Exec or GM" — marking the kit sorted is
   * roster work.
   */
  it("is open to a linked operator holding no seat at all", async () => {
    givenAccess({ state: "active", operator: actor([]) });

    const state = await resolveOnboardingItemAction(
      EMPTY_MEMBERSHIP_ACTION_STATE,
      form({ membershipId: MEMBERSHIP_ID, itemId: ITEM_ID, status: "complete", reason: "" }),
    );

    expect(state).toEqual({ error: null, needsOverride: false });
    expect(resolveOnboardingItem).toHaveBeenCalledWith({
      actorPersonId: OPERATOR_PERSON_ID,
      membershipId: MEMBERSHIP_ID,
      itemId: ITEM_ID,
      status: "complete",
      reason: "",
    });
  });

  for (const state of ["unlinked", "inactive", "no_session"] as const) {
    it(`is still refused to a ${state} caller`, async () => {
      givenAccess({ state } as OperatorAccess);

      const failure = await resolveOnboardingItemAction(
        EMPTY_MEMBERSHIP_ACTION_STATE,
        form({ membershipId: MEMBERSHIP_ID, itemId: ITEM_ID, status: "complete" }),
      ).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(resolveOnboardingItem).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------

describe("how a failure comes back", () => {
  it("turns the override refusal into UX-22's question, keyed on the rule", async () => {
    vi.mocked(activateMembership).mockRejectedValue(
      new ConstraintViolated("Two required onboarding items are still outstanding: Kit, BUCS.", {
        rule: ACTIVATION_NEEDS_OVERRIDE_RULE,
      }),
    );

    const state = await activateMembershipAction(
      EMPTY_MEMBERSHIP_ACTION_STATE,
      form({ membershipId: MEMBERSHIP_ID }),
    );

    expect(state.needsOverride).toBe(true);
    expect(state.error).toContain("still outstanding");
  });

  it("does not claim an override is needed for an unrelated constraint failure", async () => {
    vi.mocked(activateMembership).mockRejectedValue(
      new ConstraintViolated("Something else entirely.", { rule: "some_other_rule" }),
    );

    const state = await activateMembershipAction(
      EMPTY_MEMBERSHIP_ACTION_STATE,
      form({ membershipId: MEMBERSHIP_ID }),
    );

    expect(state.needsOverride).toBe(false);
    expect(state.error).toBe("Something else entirely.");
  });

  it("returns an illegal transition as a readable sentence, not a throw", async () => {
    vi.mocked(activateMembership).mockRejectedValue(
      new InvalidTransition("This membership is departed. Only a confirmed membership…", {
        rule: "membership_activation_illegal_from_state",
      }),
    );

    const state = await activateMembershipAction(
      EMPTY_MEMBERSHIP_ACTION_STATE,
      form({ membershipId: MEMBERSHIP_ID }),
    );

    expect(state.error).toContain("This membership is departed.");
    expect(state.needsOverride).toBe(false);
  });

  /**
   * A refusal rendered as red text beside a button reads as "try again", which
   * is the wrong instruction and hides an authorization event inside a
   * validation failure. It is rethrown so the error boundary sees it.
   */
  it("never flattens a refusal into form state", async () => {
    givenAccess({ state: "active", operator: actor(["kit_manager"]) });

    await expect(
      activateMembershipAction(
        EMPTY_MEMBERSHIP_ACTION_STATE,
        form({ membershipId: MEMBERSHIP_ID }),
      ),
    ).rejects.toMatchObject({ kind: "not_permitted" });
  });

  it("lets a fault through as itself rather than as a form message", async () => {
    vi.mocked(activateMembership).mockRejectedValue(new TypeError("a genuine bug"));

    await expect(
      activateMembershipAction(
        EMPTY_MEMBERSHIP_ACTION_STATE,
        form({ membershipId: MEMBERSHIP_ID }),
      ),
    ).rejects.toThrow("a genuine bug");
  });
});
