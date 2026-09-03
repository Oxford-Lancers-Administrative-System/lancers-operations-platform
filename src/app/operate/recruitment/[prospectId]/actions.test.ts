// @vitest-environment node
/**
 * The recruit record's own server actions — walk correction: `REQ-core-four`
 * is a security requirement, and the mission's final walk could not verify
 * coach-role exclusion here (browser extension interference blocked the
 * seeded `+coach` login). This closes that gap with a test rather than a
 * judgment call: an identity holding only a coaching role is refused
 * `sendRecruitmentQuestionnaireAction` and `addRecruitmentNoteAction`,
 * **in the server action and not only in the UI** — the same standing this
 * package already proves for `board-actions.ts` — and the four offices are
 * admitted. `requireCapability("person_record_authority")` is the actual
 * gate; the service layer is mocked, since what is under test is the guard.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/recruitment-prospect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/recruitment-prospect")>();
  return {
    ...actual,
    sendRecruitmentQuestionnaire: vi.fn(),
    addRecruitmentProspectNote: vi.fn(),
  };
});

import { isServiceError } from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import {
  addRecruitmentProspectNote,
  sendRecruitmentQuestionnaire,
} from "@/lib/services/recruitment-prospect";
import { addRecruitmentNoteAction, sendRecruitmentQuestionnaireAction } from "./actions";

const OPERATOR_PERSON_ID = "22222222-2222-4222-8222-222222222222";
const PROSPECT_ID = "44444444-4444-4444-8444-444444444444";

/** The four offices `REQ-core-four` admits to this record's own actions. */
const CORE_FOUR_ROLES = ["president", "vice_president", "secretary", "general_manager"];

/**
 * Coaching-only seats. Each holds only `attendance_recorder`, so
 * `person_record_authority` refuses all three the same way — proved
 * individually rather than for one seat alone, since the walk's own gap
 * named "a coaching-only identity" generally, not one specific title.
 */
const COACH_ROLES = ["head_coach", "offence_coach", "defence_coach"];

function actor(roleCodes: string[]): ResolvedOperator {
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
  vi.mocked(sendRecruitmentQuestionnaire).mockResolvedValue({
    created: [],
    reason: "not_consented",
  });
  vi.mocked(addRecruitmentProspectNote).mockResolvedValue(undefined);
});

describe("sendRecruitmentQuestionnaireAction — coach-role exclusion (walk gap, REQ-core-four)", () => {
  for (const role of COACH_ROLES) {
    it(`refuses a ${role}-only operator, and never reaches the service`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const failure = await sendRecruitmentQuestionnaireAction({
        prospectId: PROSPECT_ID,
        track: "personal",
      }).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(sendRecruitmentQuestionnaire).not.toHaveBeenCalled();
    });
  }

  for (const role of CORE_FOUR_ROLES) {
    it(`admits the ${role} seat`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const state = await sendRecruitmentQuestionnaireAction({
        prospectId: PROSPECT_ID,
        track: "personal",
      });

      expect(state.error).toBeNull();
      expect(sendRecruitmentQuestionnaire).toHaveBeenCalledWith(
        OPERATOR_PERSON_ID,
        PROSPECT_ID,
        "personal",
      );
    });
  }
});

describe("addRecruitmentNoteAction — coach-role exclusion (walk gap, REQ-core-four)", () => {
  for (const role of COACH_ROLES) {
    it(`refuses a ${role}-only operator, and never reaches the service`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const failure = await addRecruitmentNoteAction({
        prospectId: PROSPECT_ID,
        note: "Met at the freshers' fair.",
      }).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("not_permitted");
      expect(addRecruitmentProspectNote).not.toHaveBeenCalled();
    });
  }

  for (const role of CORE_FOUR_ROLES) {
    it(`admits the ${role} seat`, async () => {
      givenAccess({ state: "active", operator: actor([role]) });

      const state = await addRecruitmentNoteAction({
        prospectId: PROSPECT_ID,
        note: "Met at the freshers' fair.",
      });

      expect(state.error).toBeNull();
      expect(addRecruitmentProspectNote).toHaveBeenCalledWith(
        OPERATOR_PERSON_ID,
        PROSPECT_ID,
        "Met at the freshers' fair.",
      );
    });
  }
});
