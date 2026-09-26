// @vitest-environment node
/**
 * The sign-up code's refusal — LAN-423 fix round 4, J1. A seat whose May add
 * recruits switch was turned off while the QR page was open gets the refusal
 * back as the page's state, and no code is minted — never a throw that
 * rendered "This page couldn't load".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, withTransaction: vi.fn() };
});

import { resolveOperatorAccess } from "@/lib/auth/operator";
import { seededGrantsFor } from "@/lib/auth/capabilities";
import { withTransaction } from "@/lib/db";
import { mintRecruitmentSignupCodeAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mintRecruitmentSignupCodeAction for a seat without the switch", () => {
  it("returns the refusal and mints nothing", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: {
        authUserId: "11111111-1111-4111-8111-111111111111",
        personId: "22222222-2222-4222-8222-222222222222",
        displayName: "Rowan Ashdown",
        roleCodes: ["head_coach"],
        grants: seededGrantsFor(["head_coach"]),
        isActive: true,
      },
    });

    const state = await mintRecruitmentSignupCodeAction();

    expect(state.error).toMatch(/^You do not have access to this action\./);
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it("returns the unresolved session's refusal too", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "no_session" });

    const state = await mintRecruitmentSignupCodeAction();

    expect(state.error).toMatch(/^This action needs an active Lancers operator profile\./);
    expect(withTransaction).not.toHaveBeenCalled();
  });
});
