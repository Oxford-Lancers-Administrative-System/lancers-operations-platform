// @vitest-environment node
/**
 * `resolvePersonFactDisputeAction`'s own authorization boundary —
 * `WP-operator-record`, LAN-217, `W7`. The pattern is
 * `../../roster/[membershipId]/record-actions.test.ts`'s own: every call
 * goes straight to the action, no page renders, and the actor is injected
 * exactly where a real request produces it — `resolveOperatorAccess()` — so a
 * refusal proved here is a refusal a real POST gets, not a UI affordance.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/person-fact-dispute", () => ({
  resolvePersonFactDispute: vi.fn(),
}));

import { isServiceError } from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import { resolvePersonFactDispute } from "@/lib/services/person-fact-dispute";
import { resolvePersonFactDisputeAction } from "./dispute-actions";

const OPERATOR_PERSON_ID = "22222222-2222-4222-8222-222222222222";
const PERSON_ID = "33333333-3333-4333-8333-333333333333";
const DISPUTE_ID = "44444444-4444-4444-8444-444444444444";

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

describe("resolvePersonFactDisputeAction", () => {
  const RESOLUTIONS = ["keep_club", "take_player"] as const;

  for (const role of FOUR_ROLE) {
    for (const resolution of RESOLUTIONS) {
      it(`lets the ${role} resolve a dispute by ${resolution}`, async () => {
        givenAccess({ state: "active", operator: actor([role]) });

        const state = await resolvePersonFactDisputeAction({
          personId: PERSON_ID,
          disputeId: DISPUTE_ID,
          resolution,
        });

        expect(state).toEqual({ error: null });
        expect(resolvePersonFactDispute).toHaveBeenCalledWith({
          disputeId: DISPUTE_ID,
          resolverPersonId: OPERATOR_PERSON_ID,
          resolution,
        });
      });
    }
  }

  for (const role of OTHER_ROLES) {
    it(`refuses the ${role}, and never reaches the service`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const failure = await resolvePersonFactDisputeAction({
        personId: PERSON_ID,
        disputeId: DISPUTE_ID,
        resolution: "keep_club",
      }).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(resolvePersonFactDispute).not.toHaveBeenCalled();
    });
  }

  it("refuses an operator holding no seat at all", async () => {
    givenAccess({ state: "active", operator: actor([]) });

    const failure = await resolvePersonFactDisputeAction({
      personId: PERSON_ID,
      disputeId: DISPUTE_ID,
      resolution: "keep_club",
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
    expect(resolvePersonFactDispute).not.toHaveBeenCalled();
  });

  for (const state of ["unlinked", "inactive", "no_session"] as const) {
    it(`is refused to a ${state} caller`, async () => {
      givenAccess({ state } as OperatorAccess);

      const failure = await resolvePersonFactDisputeAction({
        personId: PERSON_ID,
        disputeId: DISPUTE_ID,
        resolution: "keep_club",
      }).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(resolvePersonFactDispute).not.toHaveBeenCalled();
    });
  }
});
