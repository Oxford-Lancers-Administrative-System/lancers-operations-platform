// @vitest-environment node
/**
 * The roster form's one write — LAN-267, corrected in LAN-275's review round 1
 * (F3).
 *
 * Every call here goes **straight to the action**. No page renders, so nothing
 * decided what the caller was allowed to click: a Server Action is a POST
 * endpoint, and anybody holding a session can call it whether or not a screen
 * ever offered it. Hiding the Generate button is a courtesy; this is the test
 * that holds the boundary — the same posture `../delivery/actions.test.ts`
 * takes, and for the same reason.
 *
 * The actor is injected where a real request produces it, at
 * `resolveOperatorAccess()`, and the role codes are real, so re-gating the
 * action to a different capability changes who gets through and fails here.
 *
 * The service layer is mocked. What is under test is the guard and the actor it
 * passes on; the audit row itself is proved against the real database in
 * `src/lib/services/roster-form.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/roster-form", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/roster-form")>();
  return { ...actual, recordRosterFormGenerated: vi.fn() };
});

import { InvalidTransition, isServiceError } from "@/lib/db";
import { capabilityRoleCodes } from "@/lib/auth/capabilities";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { recordRosterFormGenerated } from "@/lib/services/roster-form";
import { generateRosterFormAction } from "./actions";
import { ROSTER_FORM_GENERATE_FAILED } from "./action-state";

const EVENT = "00780078-0078-4078-8078-000000000050";

/** The gate this action declares, read from the one place a role code decides anything. */
const PERMITTED = capabilityRoleCodes("event_calendar_management");

/** Linked, active operators who are still not this action's audience. */
const REFUSED = ["treasurer", "media_secretary", "head_coach", "offence_coach", "defence_coach"];

function signedInAs(roleCodes: string[]): ResolvedOperator {
  const operator: ResolvedOperator = {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Rowan Ashdown",
    roleCodes,
    isActive: true,
  };
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator });
  return operator;
}

async function refusalFrom(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (isServiceError(error)) return error;
    throw error;
  }
  throw new Error("Expected a refusal, and the action returned normally.");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordRosterFormGenerated).mockResolvedValue(undefined);
});

describe("generateRosterFormAction — event_calendar_management, and nothing looser", () => {
  it.each(PERMITTED)(
    "lets the %s record a generation, and names them as the actor",
    async (code) => {
      const operator = signedInAs([code]);

      const state = await generateRosterFormAction(EVENT, "blue", 22, 3);

      expect(state.error).toBeNull();
      expect(state.generatedAt).not.toBeNull();
      expect(recordRosterFormGenerated).toHaveBeenCalledWith({
        actorPersonId: operator.personId,
        eventId: EVENT,
        kit: "blue",
        playerCount: 22,
        coachCount: 3,
      });
    },
  );

  it.each(REFUSED)("refuses the %s, and writes nothing at all", async (code) => {
    signedInAs([code]);

    const refusal = await refusalFrom(() => generateRosterFormAction(EVENT, "blue", 22, 3));

    expect(refusal.kind).toBe("not_permitted");
    expect(refusal.rule).toBe("capability:event_calendar_management");
    expect(recordRosterFormGenerated).not.toHaveBeenCalled();
  });

  it("refuses an operator holding no role at all", async () => {
    signedInAs([]);

    const refusal = await refusalFrom(() => generateRosterFormAction(EVENT, "blue", 22, 3));

    expect(refusal.kind).toBe("not_permitted");
    expect(recordRosterFormGenerated).not.toHaveBeenCalled();
  });

  it.each(["unlinked", "inactive", "no_session"] as const)(
    "refuses a %s account, and writes nothing at all",
    async (state) => {
      vi.mocked(resolveOperatorAccess).mockResolvedValue({ state });

      const refusal = await refusalFrom(() => generateRosterFormAction(EVENT, "blue", 22, 3));

      expect(refusal.kind).toBe("not_permitted");
      expect(recordRosterFormGenerated).not.toHaveBeenCalled();
    },
  );
});

describe("generateRosterFormAction reports what actually happened", () => {
  it("says so as state, rather than throwing, when the write fails", async () => {
    signedInAs(["secretary"]);
    vi.mocked(recordRosterFormGenerated).mockRejectedValue(
      new InvalidTransition("A roster form is only for a game. This event is not one."),
    );

    const state = await generateRosterFormAction(EVENT, "blue", 22, 3);

    expect(state.generatedAt).toBeNull();
    expect(state.error).toContain("only for a game");
  });

  it("falls back to its own sentence for a failure that is not a service refusal", async () => {
    signedInAs(["secretary"]);
    vi.mocked(recordRosterFormGenerated).mockRejectedValue(new Error("boom"));

    const state = await generateRosterFormAction(EVENT, "blue", 22, 3);

    expect(state.generatedAt).toBeNull();
    expect(state.error).toBe(ROSTER_FORM_GENERATE_FAILED);
  });

  it("takes the kit it is given, and records that one", async () => {
    signedInAs(["secretary"]);

    await generateRosterFormAction(EVENT, "white", 18, 2);

    expect(recordRosterFormGenerated).toHaveBeenCalledWith(
      expect.objectContaining({ kit: "white" }),
    );
  });
});
