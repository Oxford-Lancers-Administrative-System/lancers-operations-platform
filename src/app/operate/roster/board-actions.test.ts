// @vitest-environment node
/**
 * `commitBpsAction`'s own authorization boundary — `WP-operator-record`,
 * LAN-217 correction round 1, batched advisory. The reviewer confirmed the
 * server-side gate is correct and mirrors every sibling board action in this
 * file (`commitPositionAction`, `commitBluesAction`, `commitEligibilityAction`,
 * …), so this is not a defect — but none of them had a dedicated test of
 * their own for it, so this is added as the head moves regardless.
 *
 * The pattern is `[membershipId]/record-actions.test.ts`'s own: every call
 * goes straight to the action, no page renders, and the actor is injected
 * exactly where a real request produces it — `resolveOperatorAccess()` — so a
 * refusal proved here is a refusal a real POST to this action gets, not a UI
 * affordance.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/roster-board", () => ({
  commitAvailability: vi.fn(),
  commitBlues: vi.fn(),
  commitBps: vi.fn(),
  commitCoachingGroups: vi.fn(),
  commitEligibility: vi.fn(),
  commitEntry: vi.fn(),
  commitFormalwearItems: vi.fn(),
  commitJerseyNumbers: vi.fn(),
  commitKitItemValues: vi.fn(),
  commitPosition: vi.fn(),
  commitPositionGroups: vi.fn(),
  commitSpecialTeamsAssignment: vi.fn(),
  commitWarmupSmallGroup: vi.fn(),
}));
vi.mock("@/lib/services/membership", () => ({ resolveOnboardingItem: vi.fn() }));

import { isServiceError } from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import {
  commitAvailability,
  commitBlues,
  commitBps,
  commitCoachingGroups,
  commitEligibility,
  commitEntry,
  commitFormalwearItems,
  commitJerseyNumbers,
  commitKitItemValues,
  commitPosition,
  commitPositionGroups,
  commitSpecialTeamsAssignment,
  commitWarmupSmallGroup,
} from "@/lib/services/roster-board";
import { resolveOnboardingItem } from "@/lib/services/membership";
import {
  commitAvailabilityAction,
  commitBluesAction,
  commitBpsAction,
  commitCoachingGroupsAction,
  commitEligibilityAction,
  commitEntryAction,
  commitFormalwearItemsAction,
  commitJerseyNumbersAction,
  commitKitItemAction,
  commitOnboardingItemAction,
  commitPositionAction,
  commitPositionGroupsAction,
  commitSpecialTeamsAssignmentAction,
  commitWarmupSmallGroupAction,
} from "./board-actions";
import { seededGrantsFor } from "@/lib/auth/capabilities";

const OPERATOR_PERSON_ID = "22222222-2222-4222-8222-222222222222";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";
const SEASON_ID = "55555555-5555-4555-8555-555555555555";

/** the old person-record capability's role list — see `[membershipId]/record-actions.test.ts`'s own comment. */
const FOUR_ROLE = ["president", "vice_president", "secretary", "general_manager"];

const OTHER_ROLES = [
  "treasurer",
  "social_secretary",
  "gameday_secretary",
  "kit_manager",
  "media_secretary",
  "head_coach",
];

function actor(roleCodes: string[] = ["president"]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: OPERATOR_PERSON_ID,
    displayName: "Rowan Ashdown",
    roleCodes,
    grants: seededGrantsFor(roleCodes),
    isActive: true,
  };
}

function givenAccess(access: OperatorAccess) {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

beforeEach(() => {
  vi.clearAllMocks();
  givenAccess({ state: "active", operator: actor() });
});

describe("commitBpsAction", () => {
  const VALUES = ["Yes", "No"] as const;

  for (const role of FOUR_ROLE) {
    for (const value of VALUES) {
      it(`lets the ${role} set BPS to ${value}`, async () => {
        givenAccess({ state: "active", operator: actor([role]) });

        const state = await commitBpsAction({
          membershipId: MEMBERSHIP_ID,
          seasonId: SEASON_ID,
          value,
        });

        expect(state).toEqual({ error: null });
        expect(commitBps).toHaveBeenCalledWith({
          actorPersonId: OPERATOR_PERSON_ID,
          membershipId: MEMBERSHIP_ID,
          seasonId: SEASON_ID,
          value,
        });
      });
    }
  }

  for (const role of OTHER_ROLES) {
    it(`refuses the ${role}, and never reaches the service`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const failure = await commitBpsAction({
        membershipId: MEMBERSHIP_ID,
        seasonId: SEASON_ID,
        value: "Yes",
      }).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(commitBps).not.toHaveBeenCalled();
    });
  }

  it("refuses an operator holding no seat at all", async () => {
    givenAccess({ state: "active", operator: actor([]) });

    const failure = await commitBpsAction({
      membershipId: MEMBERSHIP_ID,
      seasonId: SEASON_ID,
      value: "Yes",
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
    expect(commitBps).not.toHaveBeenCalled();
  });

  for (const state of ["unlinked", "inactive", "no_session"] as const) {
    it(`is refused to a ${state} caller`, async () => {
      givenAccess({ state } as OperatorAccess);

      const failure = await commitBpsAction({
        membershipId: MEMBERSHIP_ID,
        seasonId: SEASON_ID,
        value: "Yes",
      }).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(commitBps).not.toHaveBeenCalled();
    });
  }
});

// Correction round 2, item 5 (`WP-operator-record`, LAN-217): the board's
// own onboarding-item columns. Same authorization boundary as every column
// above; the one thing this action adds is that it never writes item state
// itself — it calls straight through to `resolveOnboardingItem` in
// `membership.ts`, the same call the record page's own row makes, so
// history and the activity log keep recording exactly as they do there.
describe("commitOnboardingItemAction", () => {
  const ITEM_ID = "66666666-6666-4666-8666-666666666666";

  for (const role of FOUR_ROLE) {
    it(`lets the ${role} resolve an onboarding item from the board`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const state = await commitOnboardingItemAction({
        membershipId: MEMBERSHIP_ID,
        itemId: ITEM_ID,
        status: "complete",
      });

      expect(state).toEqual({ error: null });
      expect(resolveOnboardingItem).toHaveBeenCalledWith({
        actorPersonId: OPERATOR_PERSON_ID,
        membershipId: MEMBERSHIP_ID,
        itemId: ITEM_ID,
        status: "complete",
      });
    });
  }

  for (const role of OTHER_ROLES) {
    it(`refuses the ${role}, and never reaches the service`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const failure = await commitOnboardingItemAction({
        membershipId: MEMBERSHIP_ID,
        itemId: ITEM_ID,
        status: "complete",
      }).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(resolveOnboardingItem).not.toHaveBeenCalled();
    });
  }

  for (const state of ["unlinked", "inactive", "no_session"] as const) {
    it(`is refused to a ${state} caller`, async () => {
      givenAccess({ state } as OperatorAccess);

      const failure = await commitOnboardingItemAction({
        membershipId: MEMBERSHIP_ID,
        itemId: ITEM_ID,
        status: "complete",
      }).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(resolveOnboardingItem).not.toHaveBeenCalled();
    });
  }
});

/**
 * Every other cell action's own the old person-record capability gate — advisory F2,
 * PR 204 correction round. `commitBpsAction` and `commitOnboardingItemAction`
 * above already carried this proof; deleting `requireCapability(...)` from
 * `commitWarmupSmallGroupAction` left all of this file's (and its siblings')
 * tests green, so nothing here was actually proving the gate exists for the
 * rest of the board's cells. Table-driven, one case per remaining exported
 * action, same shape as the two describes above: refused roles never reach
 * the mocked service, held roles do, and the four unresolved-access states
 * refuse identically to a role a caller does not hold.
 */
type GateCase = {
  label: string;
  call: () => Promise<{ error: string | null }>;
  service: (...args: never[]) => unknown;
  expected: Record<string, unknown>;
};

const GATE_CASES: GateCase[] = [
  {
    label: "commitPositionAction",
    call: () =>
      commitPositionAction({
        membershipId: MEMBERSHIP_ID,
        seasonId: SEASON_ID,
        column: "offence",
        code: "QB",
      }),
    service: commitPosition,
    expected: {
      actorPersonId: OPERATOR_PERSON_ID,
      membershipId: MEMBERSHIP_ID,
      seasonId: SEASON_ID,
      column: "offence",
      code: "QB",
    },
  },
  {
    label: "commitJerseyNumbersAction",
    call: () =>
      commitJerseyNumbersAction({
        membershipId: MEMBERSHIP_ID,
        seasonId: SEASON_ID,
        kit: "blue",
        numbers: ["12", "34"],
      }),
    service: commitJerseyNumbers,
    expected: {
      actorPersonId: OPERATOR_PERSON_ID,
      membershipId: MEMBERSHIP_ID,
      seasonId: SEASON_ID,
      kit: "blue",
      numbers: ["12", "34"],
    },
  },
  {
    label: "commitCoachingGroupsAction",
    call: () =>
      commitCoachingGroupsAction({
        membershipId: MEMBERSHIP_ID,
        seasonId: SEASON_ID,
        groups: ["Offensive Line"],
      }),
    service: commitCoachingGroups,
    expected: {
      actorPersonId: OPERATOR_PERSON_ID,
      membershipId: MEMBERSHIP_ID,
      seasonId: SEASON_ID,
      groups: ["Offensive Line"],
    },
  },
  {
    label: "commitPositionGroupsAction",
    call: () =>
      commitPositionGroupsAction({
        membershipId: MEMBERSHIP_ID,
        seasonId: SEASON_ID,
        side: "offence",
        groups: ["Offensive Line"],
      }),
    service: commitPositionGroups,
    expected: {
      actorPersonId: OPERATOR_PERSON_ID,
      membershipId: MEMBERSHIP_ID,
      seasonId: SEASON_ID,
      side: "offence",
      groups: ["Offensive Line"],
    },
  },
  {
    label: "commitSpecialTeamsAssignmentAction",
    call: () =>
      commitSpecialTeamsAssignmentAction({
        membershipId: MEMBERSHIP_ID,
        seasonId: SEASON_ID,
        squad: "kickoff",
        slot: "starting",
        positionName: "Kicker",
      }),
    service: commitSpecialTeamsAssignment,
    expected: {
      actorPersonId: OPERATOR_PERSON_ID,
      membershipId: MEMBERSHIP_ID,
      seasonId: SEASON_ID,
      squad: "kickoff",
      slot: "starting",
      positionName: "Kicker",
    },
  },
  {
    label: "commitKitItemAction",
    call: () =>
      commitKitItemAction({
        membershipId: MEMBERSHIP_ID,
        seasonId: SEASON_ID,
        item: "helmet",
        value: "Large",
      }),
    service: commitKitItemValues,
    // LAN-409: one writer takes the whole set, and a single pick is a set of
    // one on its way through.
    expected: {
      actorPersonId: OPERATOR_PERSON_ID,
      membershipId: MEMBERSHIP_ID,
      seasonId: SEASON_ID,
      item: "helmet",
      values: ["Large"],
    },
  },
  {
    label: "commitWarmupSmallGroupAction",
    call: () =>
      commitWarmupSmallGroupAction({
        membershipId: MEMBERSHIP_ID,
        seasonId: SEASON_ID,
        smallGroup: "Kings",
      }),
    service: commitWarmupSmallGroup,
    expected: {
      actorPersonId: OPERATOR_PERSON_ID,
      membershipId: MEMBERSHIP_ID,
      seasonId: SEASON_ID,
      smallGroup: "Kings",
    },
  },
  {
    label: "commitFormalwearItemsAction",
    call: () =>
      commitFormalwearItemsAction({
        membershipId: MEMBERSHIP_ID,
        seasonId: SEASON_ID,
        items: ["tie"],
      }),
    service: commitFormalwearItems,
    expected: {
      actorPersonId: OPERATOR_PERSON_ID,
      membershipId: MEMBERSHIP_ID,
      seasonId: SEASON_ID,
      items: ["tie"],
    },
  },
  {
    label: "commitBluesAction",
    call: () =>
      commitBluesAction({ membershipId: MEMBERSHIP_ID, seasonId: SEASON_ID, value: "Full" }),
    service: commitBlues,
    expected: {
      actorPersonId: OPERATOR_PERSON_ID,
      membershipId: MEMBERSHIP_ID,
      seasonId: SEASON_ID,
      value: "Full",
    },
  },
  {
    label: "commitEligibilityAction",
    call: () =>
      commitEligibilityAction({
        membershipId: MEMBERSHIP_ID,
        seasonId: SEASON_ID,
        status: "eligible",
      }),
    service: commitEligibility,
    expected: {
      actorPersonId: OPERATOR_PERSON_ID,
      membershipId: MEMBERSHIP_ID,
      seasonId: SEASON_ID,
      status: "eligible",
    },
  },
  {
    label: "commitAvailabilityAction",
    call: () => commitAvailabilityAction({ membershipId: MEMBERSHIP_ID, level: "green" }),
    service: commitAvailability,
    expected: { actorPersonId: OPERATOR_PERSON_ID, membershipId: MEMBERSHIP_ID, level: "green" },
  },
  {
    label: "commitEntryAction",
    call: () => commitEntryAction({ membershipId: MEMBERSHIP_ID, entry: "new" }),
    service: commitEntry,
    expected: { actorPersonId: OPERATOR_PERSON_ID, membershipId: MEMBERSHIP_ID, entry: "new" },
  },
];

describe("every other roster-cell action's authorization gate", () => {
  for (const { label, call, service, expected } of GATE_CASES) {
    describe(label, () => {
      for (const role of FOUR_ROLE) {
        it(`lets the ${role} reach the service`, async () => {
          givenAccess({ state: "active", operator: actor([role]) });

          const state = await call();

          expect(state.error).toBeNull();
          expect(service).toHaveBeenCalledWith(expected);
        });
      }

      for (const role of OTHER_ROLES) {
        it(`refuses the ${role}, and never reaches the service`, async () => {
          givenAccess({ state: "active", operator: actor([role]) });

          const failure = await call().catch((error: unknown) => error);

          expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
          expect(service).not.toHaveBeenCalled();
        });
      }

      it("refuses an operator holding no seat at all", async () => {
        givenAccess({ state: "active", operator: actor([]) });

        const failure = await call().catch((error: unknown) => error);

        expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
        expect(service).not.toHaveBeenCalled();
      });

      for (const state of ["unlinked", "inactive", "no_session"] as const) {
        it(`is refused to a ${state} caller`, async () => {
          givenAccess({ state } as OperatorAccess);

          const failure = await call().catch((error: unknown) => error);

          expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
          expect(service).not.toHaveBeenCalled();
        });
      }
    });
  }
});
