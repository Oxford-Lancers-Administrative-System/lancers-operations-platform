// @vitest-environment node
/**
 * The recruit board's own server actions — LAN-204, and LAN-505.
 *
 * `flipRecruitmentProspectAction` is gated on May move recruits to Joined
 * (LAN-505, Brian, 16 October 2026), which replaced the fixed four-office rule
 * (`W14`). The switch works on its own — whatever the seat's Recruit details
 * level — and the server refuses anybody without it, **in the server action
 * and not only in the UI**. Every call here goes straight to the action; no
 * page renders, so nothing decided what the caller was allowed to click,
 * exactly the position a POST from a seat without the switch is in.
 *
 * The seeded switch (the migrations' defaults) is on for the four offices,
 * so they can still move a recruit to Joined with no setting changed, and for
 * the IT Officer, who holds everything the General Manager holds (Brian,
 * 19 October 2026).
 *
 * The service layer is mocked. What is under test is the guard, the actor it
 * passes on, and how a refusal is presented; the flip's own transaction
 * mechanics are proved against the real database in
 * `src/lib/services/recruitment-prospect.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/recruitment-prospect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/recruitment-prospect")>();
  return {
    ...actual,
    flipRecruitmentProspectToJoined: vi.fn(),
    updateRecruitmentProspectStatus: vi.fn(),
  };
});

import type { RecruitmentActionState } from "./action-state";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import {
  flipRecruitmentProspectToJoined,
  updateRecruitmentProspectStatus,
} from "@/lib/services/recruitment-prospect";
import { flipRecruitmentProspectAction, setRecruitmentStatusAction } from "./board-actions";
import { seededGrantsFor } from "@/lib/auth/capabilities";

const OPERATOR_PERSON_ID = "22222222-2222-4222-8222-222222222222";
const PROSPECT_ID = "44444444-4444-4444-8444-444444444444";

/**
 * The seats the migrations switch May move recruits to Joined on for: the four
 * offices (LAN-505) and the IT Officer (Brian, 19 October 2026).
 */
const FLIP_ROLES = ["president", "vice_president", "secretary", "general_manager", "it_officer"];

/** Every other seat: seeded off. */
const OTHER_ROLES = [
  "treasurer",
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

/**
 * LAN-423 fix round 4, J1: a refused flip comes back as the card's own state —
 * the refusal beside the stored status — never a throw that crashed the board.
 */
function expectFlipRefused(state: RecruitmentActionState): void {
  expect(state.error).toMatch(
    /^(You do not have access to this action\.|This action needs an active Lancers operator profile\.)/,
  );
}

/** A seat's seeded grants with May move recruits to Joined set, and Recruit details at `details`. */
function withSwitch(
  roleCodes: string[],
  level: "yes" | "none",
  details: "none" | "view" | "edit",
): ResolvedOperator {
  const base = actor(roleCodes);
  return {
    ...base,
    grants: {
      ...base.grants,
      recruiting: { ...base.grants.recruiting, recruit_details: details },
      switches: { ...base.grants.switches, move_recruits_to_joined: level },
    },
  };
}

describe("flipRecruitmentProspectAction — May move recruits to Joined (LAN-505)", () => {
  it("lets a Kit Manager given the switch move a recruit to Joined, with Recruit details at view", async () => {
    givenAccess({ state: "active", operator: withSwitch(["kit_manager"], "yes", "view") });

    const state = await flipRecruitmentProspectAction({ prospectId: PROSPECT_ID });

    expect(state).toEqual({ error: null });
    expect(flipRecruitmentProspectToJoined).toHaveBeenCalledWith(OPERATOR_PERSON_ID, PROSPECT_ID);
  });

  it("lets the switch alone move a recruit to Joined, Recruit details at none", async () => {
    givenAccess({ state: "active", operator: withSwitch(["kit_manager"], "yes", "none") });

    expect(await flipRecruitmentProspectAction({ prospectId: PROSPECT_ID })).toEqual({
      error: null,
    });
    expect(flipRecruitmentProspectToJoined).toHaveBeenCalled();
  });

  it("refuses a seat with Recruit details at edit but without the switch", async () => {
    givenAccess({ state: "active", operator: withSwitch(["kit_manager"], "none", "edit") });

    const failure = await flipRecruitmentProspectAction({ prospectId: PROSPECT_ID });

    expectFlipRefused(failure);
    expect(flipRecruitmentProspectToJoined).not.toHaveBeenCalled();
  });

  it("refuses one of the four offices whose switch has been turned off", async () => {
    givenAccess({ state: "active", operator: withSwitch(["secretary"], "none", "edit") });

    expectFlipRefused(await flipRecruitmentProspectAction({ prospectId: PROSPECT_ID }));
    expect(flipRecruitmentProspectToJoined).not.toHaveBeenCalled();
  });

  for (const role of FLIP_ROLES) {
    it(`lets the ${role} flip a recruit to joined on the seeded switch`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const state = await flipRecruitmentProspectAction({ prospectId: PROSPECT_ID });

      expect(state).toEqual({ error: null });
      expect(flipRecruitmentProspectToJoined).toHaveBeenCalledWith(OPERATOR_PERSON_ID, PROSPECT_ID);
    });
  }

  for (const role of OTHER_ROLES) {
    it(`refuses the ${role} on the seeded switch, and never reaches the service`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const failure = await flipRecruitmentProspectAction({ prospectId: PROSPECT_ID });

      expectFlipRefused(failure);
      expect(flipRecruitmentProspectToJoined).not.toHaveBeenCalled();
    });
  }

  /**
   * Brian, 19 October 2026: the IT Officer holds everything the General
   * Manager holds, this switch included, like every other line of that seat.
   */
  it("lets an IT Officer-only operator flip a recruit to joined on the seeded switch", async () => {
    givenAccess({ state: "active", operator: actor(["it_officer"]) });

    const state = await flipRecruitmentProspectAction({ prospectId: PROSPECT_ID });

    expect(state).toEqual({ error: null });
    expect(flipRecruitmentProspectToJoined).toHaveBeenCalledWith(OPERATOR_PERSON_ID, PROSPECT_ID);
  });

  it("refuses an operator holding no seat at all", async () => {
    givenAccess({ state: "active", operator: actor([]) });

    const failure = await flipRecruitmentProspectAction({ prospectId: PROSPECT_ID });

    expectFlipRefused(failure);
    expect(flipRecruitmentProspectToJoined).not.toHaveBeenCalled();
  });

  for (const state of ["unlinked", "inactive", "no_session"] as const) {
    it(`refuses a ${state} caller`, async () => {
      givenAccess({ state } as OperatorAccess);

      const failure = await flipRecruitmentProspectAction({ prospectId: PROSPECT_ID });

      expectFlipRefused(failure);
      expect(flipRecruitmentProspectToJoined).not.toHaveBeenCalled();
    });
  }
});

describe("setRecruitmentStatusAction — the Recruit details gate (LAN-432; the old person-record capability before it)", () => {
  it("lets an IT Officer change a status — the administrative seat is correct here (LAN-124)", async () => {
    givenAccess({ state: "active", operator: actor(["it_officer"]) });

    const state = await setRecruitmentStatusAction({
      prospectId: PROSPECT_ID,
      toStatus: "engaged",
    });

    expect(state).toEqual({ error: null });
    expect(updateRecruitmentProspectStatus).toHaveBeenCalledWith(
      OPERATOR_PERSON_ID,
      PROSPECT_ID,
      "engaged",
      { reason: undefined },
    );
  });

  it("refuses a coaching seat, returning the refusal as the cell's state", async () => {
    givenAccess({ state: "active", operator: actor(["head_coach"]) });

    const state = await setRecruitmentStatusAction({
      prospectId: PROSPECT_ID,
      toStatus: "declined",
    });

    expect(state).toEqual({
      error: "You do not have access to this action. This needs access your seat does not hold.",
    });
    expect(updateRecruitmentProspectStatus).not.toHaveBeenCalled();
  });

  // LAN-423 fix round 3, H4: the walk's case — Recruit details lowered to
  // View under a live board. The refusal comes back, it does not throw.
  it("refuses a seat holding Recruit details at view without throwing", async () => {
    const officer = actor(["it_officer"]);
    givenAccess({
      state: "active",
      operator: {
        ...officer,
        grants: {
          ...officer.grants,
          recruiting: { ...officer.grants.recruiting, recruit_details: "view" },
        },
      },
    });

    const state = await setRecruitmentStatusAction({
      prospectId: PROSPECT_ID,
      toStatus: "engaged",
    });

    expect(state).toEqual({
      error: "You do not have access to this action. This needs access your seat does not hold.",
    });
    expect(updateRecruitmentProspectStatus).not.toHaveBeenCalled();
  });

  for (const state of ["unlinked", "inactive", "no_session"] as const) {
    it(`returns the refusal to a ${state} caller`, async () => {
      givenAccess({ state } as OperatorAccess);

      const result = await setRecruitmentStatusAction({
        prospectId: PROSPECT_ID,
        toStatus: "engaged",
      });

      expect(result.error).toMatch(/^This action needs an active Lancers operator profile\./);
      expect(updateRecruitmentProspectStatus).not.toHaveBeenCalled();
    });
  }
});
