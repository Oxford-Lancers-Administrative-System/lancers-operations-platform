// @vitest-environment node
/**
 * The membership workflow's server actions — LAN-75's activation boundary,
 * carried onto LAN-186's single free-form status action, matrix row 6.
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
 * else. `setMembershipStatusAction` takes no actor argument, and the test that
 * would smuggle one in has nowhere left to put it: LAN-186 removed the form
 * entirely, so there is no longer a form body for it to hide in.
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
    setMembershipStatus: vi.fn(),
    resolveOnboardingItem: vi.fn(),
  };
});

import { ConstraintViolated, isServiceError } from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import { resolveOnboardingItem, setMembershipStatus } from "@/lib/services/membership";
import { resolveOnboardingItemAction, setMembershipStatusAction } from "./actions";
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

/**
 * Every other seat in the catalogue. None of them may change a membership's
 * status.
 *
 * `it_officer` is deliberately absent: Brian's LAN-124 decision made it the
 * club's administrative seat, so it holds this and every other capability.
 */
const OTHER_ROLES = [
  "social_secretary",
  "gameday_secretary",
  "kit_manager",
  "media_secretary",
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

beforeEach(() => {
  vi.clearAllMocks();
  givenAccess({ state: "active", operator: actor() });
});

// ---------------------------------------------------------------------------

describe("the status-change boundary", () => {
  for (const role of ACTIVATION_ROLES) {
    it(`lets the ${role} change a membership's status`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const state = await setMembershipStatusAction({
        membershipId: MEMBERSHIP_ID,
        status: "active",
      });

      expect(state).toEqual({ error: null });
      expect(setMembershipStatus).toHaveBeenCalledWith({
        actorPersonId: OPERATOR_PERSON_ID,
        membershipId: MEMBERSHIP_ID,
        status: "active",
      });
    });
  }

  for (const role of OTHER_ROLES) {
    it(`refuses the ${role}, and never reaches the service`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const failure = await setMembershipStatusAction({
        membershipId: MEMBERSHIP_ID,
        status: "active",
      }).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(setMembershipStatus).not.toHaveBeenCalled();
    });
  }

  it("refuses an operator holding no seat at all", async () => {
    givenAccess({ state: "active", operator: actor([]) });

    const failure = await setMembershipStatusAction({
      membershipId: MEMBERSHIP_ID,
      status: "active",
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
    expect(setMembershipStatus).not.toHaveBeenCalled();
  });

  for (const state of ["unlinked", "inactive", "no_session"] as const) {
    it(`refuses a ${state} caller`, async () => {
      givenAccess({ state } as OperatorAccess);

      const failure = await setMembershipStatusAction({
        membershipId: MEMBERSHIP_ID,
        status: "active",
      }).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(setMembershipStatus).not.toHaveBeenCalled();
    });
  }

  /**
   * The whole reason this takes plain parameters rather than `FormData`: there
   * is no form body left for an actor to be smuggled through. The actor always
   * comes from the verified session.
   */
  it("resolves the actor from the session regardless of what the caller asked to change", async () => {
    givenAccess({ state: "active", operator: actor(["president"]) });

    await setMembershipStatusAction({ membershipId: MEMBERSHIP_ID, status: "departed" });

    expect(setMembershipStatus).toHaveBeenCalledWith(
      expect.objectContaining({ actorPersonId: OPERATOR_PERSON_ID, status: "departed" }),
    );
  });

  /**
   * `Q-12`'s whole point: every status reaches every other. The boundary this
   * file proves is authorization, not legality — there is no legality check
   * left for a role test to observe — so this asserts the same Exec/GM gate
   * holds for a destination a transition table used to forbid outright, e.g.
   * flipping straight to `archived`.
   */
  it("gates a flip straight to `archived` exactly like every other destination", async () => {
    givenAccess({ state: "active", operator: actor(["head_coach"]) });

    const failure = await setMembershipStatusAction({
      membershipId: MEMBERSHIP_ID,
      status: "archived",
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
    expect(setMembershipStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("resolving an onboarding item", () => {
  /**
   * Deliberately *not* Exec/GM. UX-21's audience is "Authorized roster
   * operator": marking the kit sorted is roster work.
   */
  it("is open to a linked operator holding no seat at all", async () => {
    givenAccess({ state: "active", operator: actor([]) });

    const state = await resolveOnboardingItemAction(
      EMPTY_MEMBERSHIP_ACTION_STATE,
      form({ membershipId: MEMBERSHIP_ID, itemId: ITEM_ID, status: "complete", reason: "" }),
    );

    expect(state).toEqual({ error: null });
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
  it("turns a service refusal into a plain sentence, not a throw", async () => {
    vi.mocked(setMembershipStatus).mockRejectedValue(
      new ConstraintViolated("A membership change has to name the operator who made it.", {
        rule: "audit_events_has_an_actor",
      }),
    );

    const state = await setMembershipStatusAction({
      membershipId: MEMBERSHIP_ID,
      status: "active",
    });

    expect(state.error).toBe("A membership change has to name the operator who made it.");
  });

  /**
   * A refusal rendered as red text beside a control reads as "try again",
   * which is the wrong instruction and hides an authorization event inside a
   * validation failure. It is rethrown so the error boundary sees it.
   */
  it("never flattens an authorization refusal into form state", async () => {
    givenAccess({ state: "active", operator: actor(["kit_manager"]) });

    await expect(
      setMembershipStatusAction({ membershipId: MEMBERSHIP_ID, status: "active" }),
    ).rejects.toMatchObject({ kind: "not_permitted" });
  });

  it("lets a fault through as itself rather than as a form message", async () => {
    vi.mocked(setMembershipStatus).mockRejectedValue(new TypeError("a genuine bug"));

    await expect(
      setMembershipStatusAction({ membershipId: MEMBERSHIP_ID, status: "active" }),
    ).rejects.toThrow("a genuine bug");
  });
});
