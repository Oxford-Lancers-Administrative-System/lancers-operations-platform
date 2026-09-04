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
  commitCoachGroup: vi.fn(),
  commitEligibility: vi.fn(),
  commitEntry: vi.fn(),
  commitFormalwearItem: vi.fn(),
  commitJerseyNumbers: vi.fn(),
  commitPosition: vi.fn(),
}));

import { isServiceError } from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import { commitBps } from "@/lib/services/roster-board";
import { commitBpsAction } from "./board-actions";

const OPERATOR_PERSON_ID = "22222222-2222-4222-8222-222222222222";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";
const SEASON_ID = "55555555-5555-4555-8555-555555555555";

/** `person_record_authority`'s role list — see `../people/[personId]/dispute-actions.test.ts`'s own comment. */
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
