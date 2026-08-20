// @vitest-environment node
/**
 * Administration's server actions — LAN-133, LAN133-F1.
 *
 * This file exists because independent review deleted the whole `not_permitted`
 * branch of `failure()` — which is the entirety of the BRIAN-1 fix — and every
 * admin test still passed. The screens' own tests render an action state that
 * *already* carries a refusal; nothing asserted that a thrown `NotPermitted`
 * **becomes** one. So the crash Brian met, a refusal escaping as a Next.js
 * error page with a stack trace, could have been reintroduced with CI green on
 * a package that merges autonomously.
 *
 * What is under test is the boundary between the service layer and the screen:
 * the three ways an action can end, and which of them are values rather than
 * exceptions. The writes themselves are proved against the real database in
 * `src/lib/services/operator-invitations.test.ts` and
 * `src/lib/services/operator-administration.test.ts`, and the guard is proved
 * there too — these calls go straight to the action with the service mocked,
 * which is exactly the position a POST from outside the UI is in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "localhost:3000" })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/services/operator-invitations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/operator-invitations")>();
  return {
    ...actual,
    resendOperatorInvitation: vi.fn(),
    correctOperatorInvitation: vi.fn(),
    findOperatorCandidates: vi.fn(),
    inviteOperator: vi.fn(),
  };
});
vi.mock("@/lib/services/operator-administration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/operator-administration")>();
  return {
    ...actual,
    deactivateOperatorAccess: vi.fn(),
    restoreOperatorAccess: vi.fn(),
    startOperatorEmailRehome: vi.fn(),
    assignRole: vi.fn(),
    endRoleAssignment: vi.fn(),
    replaceRoleHolder: vi.fn(),
  };
});

import { ConstraintViolated, NotPermitted } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { resendOperatorInvitation } from "@/lib/services/operator-invitations";
import { deactivateOperatorAccess } from "@/lib/services/operator-administration";
import {
  deactivateOperatorAction,
  resendInvitationAction,
  searchCandidatesAction,
} from "./actions";
import { EMPTY_ADMIN_ACTION_STATE } from "./action-state";

const OPERATOR_ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";

/**
 * The guard's own sentence, verbatim. Brian read this one on a stack trace.
 * `REQ-final-admin-protection` is what makes it a fact about the club rather
 * than a message about a click, which is why the test asserts it survives
 * intact rather than asserting that "something" came back.
 */
const REFUSAL =
  "This action affects the President. Only the General Manager role may assign this role for that seat.";

function actor(): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Rowan Ashdown",
    roleCodes: ["it_officer"],
    isActive: true,
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: actor() });
});

describe("how an action ends", () => {
  it("turns a refusal into state, with the guard's sentence intact", async () => {
    vi.mocked(resendOperatorInvitation).mockRejectedValue(
      new NotPermitted(REFUSAL, { rule: "final_admin_protection" }),
    );

    const state = await resendInvitationAction(
      EMPTY_ADMIN_ACTION_STATE,
      form({ operatorAccountId: OPERATOR_ACCOUNT_ID }),
    );

    expect(state.refusal).toBe(REFUSAL);
  });

  /**
   * The half of the original reasoning that was right: a refusal rendered as
   * red text beside a button reads as "try again". It must not arrive as
   * `error`, and it must not arrive as a confirmation.
   */
  it("does not present a refusal as a retryable error or a success", async () => {
    vi.mocked(resendOperatorInvitation).mockRejectedValue(new NotPermitted(REFUSAL));

    const state = await resendInvitationAction(
      EMPTY_ADMIN_ACTION_STATE,
      form({ operatorAccountId: OPERATOR_ACCOUNT_ID }),
    );

    expect(state.error).toBeNull();
    expect(state.notice).toBeNull();
  });

  /** The other half: a refusal must not escape as an exception either. */
  it("does not throw a refusal out of the action", async () => {
    vi.mocked(resendOperatorInvitation).mockRejectedValue(new NotPermitted(REFUSAL));

    await expect(
      resendInvitationAction(
        EMPTY_ADMIN_ACTION_STATE,
        form({ operatorAccountId: OPERATOR_ACCOUNT_ID }),
      ),
    ).resolves.toBeDefined();
  });

  it("still presents an ordinary service failure as an error", async () => {
    vi.mocked(resendOperatorInvitation).mockRejectedValue(
      new ConstraintViolated("That address is already in use as a login."),
    );

    const state = await resendInvitationAction(
      EMPTY_ADMIN_ACTION_STATE,
      form({ operatorAccountId: OPERATOR_ACCOUNT_ID }),
    );

    expect(state.error).toBe("That address is already in use as a login.");
    expect(state.refusal).toBeNull();
  });

  /**
   * An unexpected fault is not something to render beside a button. It must
   * keep escaping, or a genuine bug becomes a polite sentence and is never
   * seen again.
   */
  it("rethrows anything that is not a service error", async () => {
    vi.mocked(resendOperatorInvitation).mockRejectedValue(
      new TypeError("undefined is not a function"),
    );

    await expect(
      resendInvitationAction(
        EMPTY_ADMIN_ACTION_STATE,
        form({ operatorAccountId: OPERATOR_ACCOUNT_ID }),
      ),
    ).rejects.toThrow(TypeError);
  });
});

/**
 * One refusal path per shape of action, because `failure()` is shared but the
 * reviewer's deletion would have been invisible on any single one. These are
 * the two other shapes: an action that writes and refreshes, and the read the
 * assignment flow starts with.
 */
describe("every refusal path, not only the one Brian happened to hit", () => {
  it("carries a refusal back from an account action", async () => {
    vi.mocked(deactivateOperatorAccess).mockRejectedValue(new NotPermitted(REFUSAL));

    const state = await deactivateOperatorAction(
      EMPTY_ADMIN_ACTION_STATE,
      form({ operatorAccountId: OPERATOR_ACCOUNT_ID, reason: "Stepped down." }),
    );

    expect(state.refusal).toBe(REFUSAL);
    expect(state.error).toBeNull();
  });

  it("carries a refusal back from the duplicate check", async () => {
    const { findOperatorCandidates } = await import("@/lib/services/operator-invitations");
    vi.mocked(findOperatorCandidates).mockRejectedValue(new NotPermitted(REFUSAL));

    const state = await searchCandidatesAction(
      EMPTY_ADMIN_ACTION_STATE,
      form({ givenName: "Alwyn", familyName: "Cholmondley", email: "" }),
    );

    expect(state.refusal).toBe(REFUSAL);
    expect(state.candidates).toBeNull();
  });
});
