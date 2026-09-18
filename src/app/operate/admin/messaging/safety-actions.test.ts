/**
 * The two messaging safety controls, as Server Actions — LAN-394.
 *
 * What is proved here is the action's own boundary: which capability it
 * requires, what it will accept from a browser, and what it does with a
 * refusal. The behaviour behind it — the lock order, the accounting, the
 * latches — is proved against the real database in
 * `src/lib/services/messaging-safety.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireCapability: vi.fn() }));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, withTransaction: vi.fn() };
});
vi.mock("@/lib/services/messaging-safety", () => ({
  pauseMessagingIn: vi.fn(),
  resumeMessagingIn: vi.fn(),
}));

import { requireCapability } from "@/lib/auth/guards";
import { NotPermitted, withTransaction } from "@/lib/db";
import { pauseMessagingIn, resumeMessagingIn } from "@/lib/services/messaging-safety";
import { EMPTY_ADMIN_ACTION_STATE } from "../action-state";
import { pauseMessagingAction, resumeMessagingAction } from "./safety-actions";
import { REASON_REQUIRED, SAFETY_ACTION_FAILED } from "./safety-presentation";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const SCOPE = { scopeId: "11111111-1111-4111-8111-111111111111", version: "4" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCapability).mockResolvedValue({
    authUserId: "22222222-2222-4222-8222-222222222222",
    personId: "33333333-3333-4333-8333-333333333333",
    displayName: "Rowan Ashfield",
    roleCodes: ["president"],
    isActive: true,
  });
  vi.mocked(withTransaction).mockImplementation(async (fn) => fn({ query: vi.fn() } as never));
});

describe("the messaging safety controls", () => {
  it("require the narrow capability, not the one that opens the page", async () => {
    await pauseMessagingAction(EMPTY_ADMIN_ACTION_STATE, form({ ...SCOPE, reason: "Wrong list" }));
    await resumeMessagingAction(EMPTY_ADMIN_ACTION_STATE, form({ ...SCOPE, reason: "Fixed" }));

    for (const call of vi.mocked(requireCapability).mock.calls) {
      expect(call[0]).toBe("messaging_safety_authority");
    }
    expect(vi.mocked(requireCapability)).toHaveBeenCalledTimes(2);
  });

  it("refuse without a reason, and nothing is attempted", async () => {
    const state = await pauseMessagingAction(
      EMPTY_ADMIN_ACTION_STATE,
      form({ ...SCOPE, reason: "   " }),
    );

    expect(state.error).toBe(REASON_REQUIRED);
    expect(vi.mocked(pauseMessagingIn)).not.toHaveBeenCalled();
  });

  // Brian, 18 September 2026: on the screen somebody opens because the club is
  // firing messages at everybody, a one-tap preset is a complete reason.
  it("accept a preset on its own as the reason", async () => {
    const state = await pauseMessagingAction(
      EMPTY_ADMIN_ACTION_STATE,
      form({ ...SCOPE, reasonPreset: "Runaway sends", reason: "" }),
    );

    expect(state.error).toBeNull();
    expect(vi.mocked(pauseMessagingIn)).toHaveBeenCalledWith(
      expect.anything(),
      { scopeId: SCOPE.scopeId, version: 4 },
      "Runaway sends",
    );
  });

  it("record the preset and the note together when both are given", async () => {
    await resumeMessagingAction(
      EMPTY_ADMIN_ACTION_STATE,
      form({ ...SCOPE, reasonPreset: "Testing", reason: "Checked the audit reads both" }),
    );

    expect(vi.mocked(resumeMessagingIn)).toHaveBeenCalledWith(
      expect.anything(),
      { scopeId: SCOPE.scopeId, version: 4 },
      "Testing — Checked the audit reads both",
    );
  });

  it("refuse when neither a preset nor a note was given", async () => {
    const state = await resumeMessagingAction(
      EMPTY_ADMIN_ACTION_STATE,
      form({ ...SCOPE, reasonPreset: "  ", reason: "  " }),
    );

    expect(state.error).toBe(REASON_REQUIRED);
    expect(vi.mocked(resumeMessagingIn)).not.toHaveBeenCalled();
  });

  it("refuse a submission that does not say which scope or which version", async () => {
    const state = await resumeMessagingAction(
      EMPTY_ADMIN_ACTION_STATE,
      form({ scopeId: "", version: "not-a-number", reason: "Fixed" }),
    );

    expect(state.error).toBe(SAFETY_ACTION_FAILED);
    expect(vi.mocked(resumeMessagingIn)).not.toHaveBeenCalled();
  });

  it("take nothing from the browser but the scope, its version and the reason", async () => {
    await pauseMessagingAction(
      EMPTY_ADMIN_ACTION_STATE,
      // Everything a hostile form could add: an actor, a threshold, a scope
      // kind it was never shown. None of it is read.
      form({
        ...SCOPE,
        reason: "Wrong list",
        actorPersonId: "99999999-9999-4999-8999-999999999999",
        limit: "999999",
        scopeKind: "global",
      }),
    );

    expect(vi.mocked(pauseMessagingIn)).toHaveBeenCalledWith(
      expect.anything(),
      { scopeId: SCOPE.scopeId, version: 4 },
      "Wrong list",
    );
  });

  it("report a refusal as a refusal rather than as an error", async () => {
    vi.mocked(pauseMessagingIn).mockRejectedValueOnce(
      new NotPermitted(
        "This action requires the President, Vice-President, Secretary or General Manager.",
      ),
    );

    const state = await pauseMessagingAction(
      EMPTY_ADMIN_ACTION_STATE,
      form({ ...SCOPE, reason: "Wrong list" }),
    );

    expect(state.refusal).toContain("President");
    expect(state.error).toBeNull();
  });
});
