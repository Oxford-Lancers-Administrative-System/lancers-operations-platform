// @vitest-environment node
/**
 * `recordResolveOnboardingItemAction`'s own authorization boundary — LAN-214
 * correction round 2, `F-NEW-001`. Nothing here existed before this
 * correction, which is exactly how the defect this file proves the fix for
 * survived: the record page's own read gate (`page.tsx`) was already
 * four-role, and its write action was not, and nothing caught the gap.
 *
 * The pattern is `../actions.test.ts`'s own: every call goes straight to the
 * action, no page renders, and the actor is injected exactly where a real
 * request produces it — `resolveOperatorAccess()` — so a refusal proved here
 * is a refusal a real POST to this action gets, not a UI affordance.
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
vi.mock("@/lib/services/roster-board", () => ({
  commitAvailability: vi.fn(),
  commitBlues: vi.fn(),
  commitBps: vi.fn(),
  commitCoachingGroups: vi.fn(),
  commitEligibility: vi.fn(),
  commitEntry: vi.fn(),
  commitFormalwearItems: vi.fn(),
  commitJerseyNumbers: vi.fn(),
  commitKitItem: vi.fn(),
  commitPosition: vi.fn(),
  commitPositionGroups: vi.fn(),
  commitSpecialTeamsAssignment: vi.fn(),
  commitWarmupSmallGroup: vi.fn(),
}));
vi.mock("@/lib/services/messaging-scheduler", () => ({ sendOnboardingNudges: vi.fn() }));

import { isServiceError } from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import { resolveOnboardingItem, setMembershipStatus } from "@/lib/services/membership";
import { sendOnboardingNudges } from "@/lib/services/messaging-scheduler";
import {
  commitAvailability,
  commitBlues,
  commitBps,
  commitCoachingGroups,
  commitEligibility,
  commitEntry,
  commitFormalwearItems,
  commitJerseyNumbers,
  commitKitItem,
  commitPosition,
  commitPositionGroups,
  commitSpecialTeamsAssignment,
  commitWarmupSmallGroup,
} from "@/lib/services/roster-board";
import {
  recordCommitAvailabilityAction,
  recordCommitBluesAction,
  recordCommitBpsAction,
  recordCommitCoachingGroupsAction,
  recordCommitEligibilityAction,
  recordCommitEntryAction,
  recordCommitFormalwearItemsAction,
  recordCommitJerseyNumbersAction,
  recordCommitKitItemAction,
  recordCommitPositionAction,
  recordCommitPositionGroupsAction,
  recordCommitSpecialTeamsAssignmentAction,
  recordCommitWarmupSmallGroupAction,
  recordResolveOnboardingItemAction,
  recordSendOnboardingQuestionnaireAction,
  recordSetStatusAction,
} from "./record-actions";

const OPERATOR_PERSON_ID = "22222222-2222-4222-8222-222222222222";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";
const ITEM_ID = "55555555-5555-4555-8555-555555555555";

/** `person_record_authority`'s role list — see `../actions.test.ts`'s own comment for the Treasurer/it_officer exclusions. */
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

describe("recordResolveOnboardingItemAction", () => {
  // D-002 (correction round 6): an operator now names the item's own target
  // state directly — there is no separate resolution vocabulary and no
  // `reopen`. This gate is about *who* may call the action at all, not which
  // item allows which state (that is `resolveOnboardingItem`'s own job,
  // proved in `membership.test.ts`), so any real states exercise it.
  const STATES = ["complete", "pending", "invited", "claimed"] as const;

  for (const role of FOUR_ROLE) {
    for (const status of STATES) {
      it(`lets the ${role} resolve an item to ${status}`, async () => {
        givenAccess({ state: "active", operator: actor([role]) });

        const state = await recordResolveOnboardingItemAction({
          membershipId: MEMBERSHIP_ID,
          itemId: ITEM_ID,
          status,
        });

        expect(state).toEqual({ error: null });
        expect(resolveOnboardingItem).toHaveBeenCalledWith({
          actorPersonId: OPERATOR_PERSON_ID,
          membershipId: MEMBERSHIP_ID,
          itemId: ITEM_ID,
          status,
          reason: undefined,
        });
      });
    }
  }

  for (const status of STATES) {
    it(`refuses the kit_manager resolving an item to ${status}, and never reaches the service`, async () => {
      givenAccess({ state: "active", operator: actor(["kit_manager"]) });

      const failure = await recordResolveOnboardingItemAction({
        membershipId: MEMBERSHIP_ID,
        itemId: ITEM_ID,
        status,
      }).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(resolveOnboardingItem).not.toHaveBeenCalled();
    });

    it(`refuses an operator holding no seat at all resolving an item to ${status}`, async () => {
      givenAccess({ state: "active", operator: actor([]) });

      const failure = await recordResolveOnboardingItemAction({
        membershipId: MEMBERSHIP_ID,
        itemId: ITEM_ID,
        status,
      }).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(resolveOnboardingItem).not.toHaveBeenCalled();
    });
  }

  for (const role of OTHER_ROLES) {
    it(`refuses the ${role}, and never reaches the service`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const failure = await recordResolveOnboardingItemAction({
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

      const failure = await recordResolveOnboardingItemAction({
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
 * Every other record-page action's own `person_record_authority` gate —
 * advisory F2, PR 204 correction round. `recordResolveOnboardingItemAction`
 * above already carried this proof; deleting `requireCapability(...)` from
 * `recordCommitWarmupSmallGroupAction` left this file's (and the board's own
 * `board-actions.test.ts`) tests green, so nothing here was actually proving
 * the gate exists for the rest of the record's cells. Table-driven, one case
 * per remaining exported action.
 */
const SEASON_ID = "33333333-3333-4333-8333-333333333333";

type GateCase = {
  label: string;
  call: () => Promise<{ error: string | null }>;
  service: (...args: never[]) => unknown;
  expected: Record<string, unknown>;
};

const GATE_CASES: GateCase[] = [
  {
    label: "recordSetStatusAction",
    call: () => recordSetStatusAction({ membershipId: MEMBERSHIP_ID, status: "active" }),
    service: setMembershipStatus,
    expected: { actorPersonId: OPERATOR_PERSON_ID, membershipId: MEMBERSHIP_ID, status: "active" },
  },
  {
    label: "recordCommitEntryAction",
    call: () => recordCommitEntryAction({ membershipId: MEMBERSHIP_ID, entry: "new" }),
    service: commitEntry,
    expected: { actorPersonId: OPERATOR_PERSON_ID, membershipId: MEMBERSHIP_ID, entry: "new" },
  },
  {
    label: "recordCommitPositionAction",
    call: () =>
      recordCommitPositionAction({
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
    label: "recordCommitJerseyNumbersAction",
    call: () =>
      recordCommitJerseyNumbersAction({
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
    label: "recordCommitCoachingGroupsAction",
    call: () =>
      recordCommitCoachingGroupsAction({
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
    label: "recordCommitPositionGroupsAction",
    call: () =>
      recordCommitPositionGroupsAction({
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
    label: "recordCommitSpecialTeamsAssignmentAction",
    call: () =>
      recordCommitSpecialTeamsAssignmentAction({
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
    label: "recordCommitKitItemAction",
    call: () =>
      recordCommitKitItemAction({
        membershipId: MEMBERSHIP_ID,
        seasonId: SEASON_ID,
        item: "helmet",
        value: "Large",
      }),
    service: commitKitItem,
    expected: {
      actorPersonId: OPERATOR_PERSON_ID,
      membershipId: MEMBERSHIP_ID,
      seasonId: SEASON_ID,
      item: "helmet",
      value: "Large",
    },
  },
  {
    label: "recordCommitWarmupSmallGroupAction",
    call: () =>
      recordCommitWarmupSmallGroupAction({
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
    label: "recordCommitFormalwearItemsAction",
    call: () =>
      recordCommitFormalwearItemsAction({
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
    label: "recordCommitBpsAction",
    call: () =>
      recordCommitBpsAction({ membershipId: MEMBERSHIP_ID, seasonId: SEASON_ID, value: "Yes" }),
    service: commitBps,
    expected: {
      actorPersonId: OPERATOR_PERSON_ID,
      membershipId: MEMBERSHIP_ID,
      seasonId: SEASON_ID,
      value: "Yes",
    },
  },
  {
    label: "recordCommitBluesAction",
    call: () =>
      recordCommitBluesAction({ membershipId: MEMBERSHIP_ID, seasonId: SEASON_ID, value: "Full" }),
    service: commitBlues,
    expected: {
      actorPersonId: OPERATOR_PERSON_ID,
      membershipId: MEMBERSHIP_ID,
      seasonId: SEASON_ID,
      value: "Full",
    },
  },
  {
    label: "recordCommitEligibilityAction",
    call: () =>
      recordCommitEligibilityAction({
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
    label: "recordCommitAvailabilityAction",
    call: () => recordCommitAvailabilityAction({ membershipId: MEMBERSHIP_ID, level: "green" }),
    service: commitAvailability,
    expected: { actorPersonId: OPERATOR_PERSON_ID, membershipId: MEMBERSHIP_ID, level: "green" },
  },
  {
    label: "recordSendOnboardingQuestionnaireAction",
    call: () => recordSendOnboardingQuestionnaireAction({ membershipId: MEMBERSHIP_ID }),
    service: sendOnboardingNudges,
    expected: {},
  },
];

describe("every other record action's authorization gate", () => {
  for (const { label, call, service, expected } of GATE_CASES) {
    describe(label, () => {
      for (const role of FOUR_ROLE) {
        it(`lets the ${role} reach the service`, async () => {
          givenAccess({ state: "active", operator: actor([role]) });
          if (label === "recordSendOnboardingQuestionnaireAction") {
            vi.mocked(sendOnboardingNudges).mockResolvedValue([
              { personId: "p", membershipId: MEMBERSHIP_ID, outcome: "accepted" },
            ]);
          }

          const state = await call();

          expect(state.error).toBeNull();
          if (label === "recordSendOnboardingQuestionnaireAction") {
            expect(service).toHaveBeenCalledWith(OPERATOR_PERSON_ID, [MEMBERSHIP_ID]);
          } else {
            expect(service).toHaveBeenCalledWith(expected);
          }
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
