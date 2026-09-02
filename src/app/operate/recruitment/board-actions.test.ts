// @vitest-environment node
/**
 * The recruit board's own server actions — LAN-204, correction round 1
 * (F-LAN204-001).
 *
 * This file exists for one acceptance criterion, on the exact model
 * `../roster/actions.test.ts` already proves for the membership status
 * boundary: `flipRecruitmentProspectAction` is refused for anyone who is not
 * the President, Vice President, Secretary or General Manager, **in the
 * server action and not only in the UI** — `W14` (locked): "Four roles
 * only... its authority is the narrowest." Every call here goes straight to
 * the action; no page renders, so nothing decided what the caller was
 * allowed to click, exactly the position a POST from an attacker (or a
 * fifth-role operator who found the button) is in.
 *
 * `person_record_authority` is deliberately the wrong gate for the flip: it
 * admits `it_officer` (LAN-124's standing administrative exception), which
 * is correct for `setRecruitmentStatusAction` and every other surface in
 * this package but not for the mission's one irreversible action —
 * `REQ-core-four` mints no capability for it, so this is a literal
 * `requireRole()` check, proved here independently of the capability map.
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

import { isServiceError } from "@/lib/db";
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

const OPERATOR_PERSON_ID = "22222222-2222-4222-8222-222222222222";
const PROSPECT_ID = "44444444-4444-4444-8444-444444444444";

/** `W14` (locked): exactly these four, and nobody else, ever. */
const FLIP_ROLES = ["president", "vice_president", "secretary", "general_manager"];

/**
 * Every other seat in the catalogue, `it_officer` included — deliberately,
 * unlike `../roster/actions.test.ts`'s own `OTHER_ROLES`. There the
 * administrative seat is the *correct* holder (LAN-124); here it is
 * F-LAN204-001's own regression: an `it_officer`-only operator could reach
 * `flipRecruitmentProspectAction` before this correction, because it opened
 * with `person_record_authority` rather than a core-four-only check.
 */
const OTHER_ROLES = [
  "it_officer",
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

describe("flipRecruitmentProspectAction — the core-four-only gate", () => {
  for (const role of FLIP_ROLES) {
    it(`lets the ${role} flip a recruit to joined`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const state = await flipRecruitmentProspectAction({ prospectId: PROSPECT_ID });

      expect(state).toEqual({ error: null });
      expect(flipRecruitmentProspectToJoined).toHaveBeenCalledWith(OPERATOR_PERSON_ID, PROSPECT_ID);
    });
  }

  for (const role of OTHER_ROLES) {
    it(`refuses the ${role}, and never reaches the service`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const failure = await flipRecruitmentProspectAction({ prospectId: PROSPECT_ID }).catch(
        (error: unknown) => error,
      );

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(flipRecruitmentProspectToJoined).not.toHaveBeenCalled();
    });
  }

  /**
   * F-LAN204-001's own reproduction, kept as a named regression rather than
   * relying on the loop above alone to read as intentional: an operator
   * holding *only* the administrative seat, and no core-four office, is
   * refused the flip specifically — the exact shape a live challenge against
   * the previous code proved succeeded.
   */
  it("refuses an IT Officer-only operator, who holds every other capability in the app but not this one", async () => {
    givenAccess({ state: "active", operator: actor(["it_officer"]) });

    const failure = await flipRecruitmentProspectAction({ prospectId: PROSPECT_ID }).catch(
      (error: unknown) => error,
    );

    expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
    expect(flipRecruitmentProspectToJoined).not.toHaveBeenCalled();
  });

  it("refuses an operator holding no seat at all", async () => {
    givenAccess({ state: "active", operator: actor([]) });

    const failure = await flipRecruitmentProspectAction({ prospectId: PROSPECT_ID }).catch(
      (error: unknown) => error,
    );

    expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
    expect(flipRecruitmentProspectToJoined).not.toHaveBeenCalled();
  });

  for (const state of ["unlinked", "inactive", "no_session"] as const) {
    it(`refuses a ${state} caller`, async () => {
      givenAccess({ state } as OperatorAccess);

      const failure = await flipRecruitmentProspectAction({ prospectId: PROSPECT_ID }).catch(
        (error: unknown) => error,
      );

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(flipRecruitmentProspectToJoined).not.toHaveBeenCalled();
    });
  }
});

describe("setRecruitmentStatusAction — the person_record_authority gate, unchanged by this correction", () => {
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

  it("refuses a coaching seat", async () => {
    givenAccess({ state: "active", operator: actor(["head_coach"]) });

    const failure = await setRecruitmentStatusAction({
      prospectId: PROSPECT_ID,
      toStatus: "declined",
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
    expect(updateRecruitmentProspectStatus).not.toHaveBeenCalled();
  });
});
