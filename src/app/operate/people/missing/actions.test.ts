// @vitest-environment node
/**
 * The queue's nudge refusal — LAN-423 fix round 4, J1. A seat whose
 * Onboarding access was lowered to View while the queue was open gets the
 * refusal back as the notice's error, and nobody is nudged — never a throw
 * that rendered "This page couldn't load".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/messaging-scheduler", () => ({ sendOnboardingNudges: vi.fn() }));

import { resolveOperatorAccess } from "@/lib/auth/operator";
import { seededGrantsFor } from "@/lib/auth/capabilities";
import { NotPermitted } from "@/lib/db";
import { sendOnboardingNudges } from "@/lib/services/messaging-scheduler";
import { nudgeSelectedAction } from "./actions";

const MEMBERSHIP_ID = "55555555-5555-4555-8555-555555555555";

function president(onboarding: "view" | "edit") {
  const grants = seededGrantsFor(["president"]);
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Rowan Ashdown",
    roleCodes: ["president"],
    grants: { ...grants, roster: { ...grants.roster, onboarding } },
    isActive: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("nudgeSelectedAction", () => {
  it("returns the refusal to a seat holding Onboarding at view, and nudges nobody", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: president("view"),
    });

    const result = await nudgeSelectedAction([MEMBERSHIP_ID]);

    expect(result).toEqual({
      error: "You do not have access to this action. This needs access your seat does not hold.",
      notice: null,
    });
    expect(sendOnboardingNudges).not.toHaveBeenCalled();
  });

  it("returns a refusal the service raises, too", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: president("edit"),
    });
    vi.mocked(sendOnboardingNudges).mockRejectedValue(new NotPermitted("You may not do that."));

    const result = await nudgeSelectedAction([MEMBERSHIP_ID]);

    expect(result).toEqual({ error: "You may not do that.", notice: null });
  });
});
