// @vitest-environment node
/**
 * The attendance server actions — LAN-80, matrix rows 5, 6, 8 and 13.
 *
 * Every call goes **straight to the action**. No page renders, no layout runs,
 * nothing decided what the caller was allowed to click. A server action is a
 * POST endpoint that anybody with a session can call whether or not a screen
 * ever offered it — which is exactly the case this file exists to cover, and
 * the one a render test cannot reach.
 *
 * The actor is injected where a real request produces it: at
 * `resolveOperatorAccess()`, the verified-session resolution, and nowhere else.
 * None of these actions takes an actor argument, and the test that forges one in
 * the form body is what holds them to it.
 *
 * The service layer is mocked. What is under test is the guard, the actor it
 * passes on, and how a failure is presented; the writes are proved against the
 * real database in `src/lib/services/attendance.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/services/attendance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/attendance")>();
  return {
    ...actual,
    recordAttendance: vi.fn(),
    recordWalkUpAttendance: vi.fn(),
    removeAttendance: vi.fn(),
  };
});

import {
  ConstraintViolated,
  InvalidTransition,
  NotFound,
  NotPermitted,
  isServiceError,
  type ServiceError,
} from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import {
  recordAttendance,
  recordWalkUpAttendance,
  removeAttendance,
} from "@/lib/services/attendance";
import { recordAttendanceAction, recordWalkUpAction, removeAttendanceAction } from "./actions";
import { EMPTY_SAVE_STATE, EMPTY_WALK_UP_STATE } from "./action-state";

const OPERATOR_PERSON_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const PARTICIPANT_KEY = "player:55555555-5555-4555-8555-555555555555";

function actor(roleCodes: string[] = []): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: OPERATOR_PERSON_ID,
    displayName: "Morgan Pike",
    roleCodes,
    isActive: true,
  };
}

function givenAccess(access: OperatorAccess) {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

function saveForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("eventId", EVENT_ID);
  form.set("participantKey", PARTICIPANT_KEY);
  form.set("presence", "present");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

function walkUpForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const fields: Record<string, string> = {
    eventId: EVENT_ID,
    name: "Devon Skye",
    contact: "+44 7700 900105",
    presence: "present",
    membershipId: "",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

async function refusalFrom(attempt: () => Promise<unknown>): Promise<ServiceError> {
  try {
    await attempt();
  } catch (error) {
    if (isServiceError(error)) return error;
    throw error;
  }
  throw new Error("Expected the action to refuse this, but it returned.");
}

const committed = {
  key: PARTICIPANT_KEY,
  displayName: "Avery Fielding",
  presence: "present" as const,
  recordedAt: "2026-10-14T19:07:00.000Z",
  recordedByName: "Morgan Pike",
  previousPresence: null,
};

beforeEach(() => {
  vi.mocked(recordAttendance).mockReset().mockResolvedValue(committed);
  vi.mocked(recordWalkUpAttendance).mockReset().mockResolvedValue(committed);
  vi.mocked(removeAttendance)
    .mockReset()
    .mockResolvedValue({ key: PARTICIPANT_KEY, removedPresence: "present" });
});

// ---------------------------------------------------------------------------
// Who may record
// ---------------------------------------------------------------------------

describe("who may record attendance", () => {
  /**
   * The four calendar roles, because the board is the Exec's screen.
   *
   * `slice-ux.md` § 8's "General attendance — authorized operator" is what this
   * is reading, and the reason it is not the *narrow* coaching grant: gating it
   * there would lock the Secretary out of the attendance screen.
   */
  it("admits each of the four calendar roles", async () => {
    for (const role of ["president", "vice_president", "secretary", "general_manager"]) {
      vi.mocked(recordAttendance).mockClear();
      givenAccess({ state: "active", operator: actor([role]) });

      const state = await recordAttendanceAction(EMPTY_SAVE_STATE, saveForm());

      expect(state.error, `${role} should be able to record`).toBeNull();
      expect(recordAttendance).toHaveBeenCalled();
    }
  });

  it("admits the three coaching seats Brian put on this workflow", async () => {
    for (const role of ["head_coach", "offence_coach", "defence_coach"]) {
      vi.mocked(recordAttendance).mockClear();
      givenAccess({ state: "active", operator: actor([role]) });

      const state = await recordAttendanceAction(EMPTY_SAVE_STATE, saveForm());

      expect(state.error, `${role} should be able to record`).toBeNull();
      expect(recordAttendance).toHaveBeenCalled();
    }
  });

  /**
   * The criterion the first implementation failed, and the reason this file
   * changed.
   *
   * Brian's 12 August 2026 coach decision: "An unauthorized coach and ordinary
   * player are refused at the service boundary, **including direct action
   * calls**." The first implementation guarded on `requireOperator()`, so an
   * ordinary player who holds an operator account was admitted — and a test
   * here asserted that as if it were the intent. Independent review caught it.
   *
   * "Ordinary player" is modelled as an operator holding **no** club role,
   * because that is what a player who can sign in looks like in this schema;
   * "unauthorized coach" is modelled by a catalogue seat that is not one of the
   * three, since no assistant-coach role exists to hold.
   */
  it("refuses an ordinary player and every seat that is not on this workflow", async () => {
    for (const roleCodes of [
      [],
      ["treasurer"],
      ["social_secretary"],
      ["gameday_secretary"],
      ["kit_manager"],
      ["media_secretary"],
      ["it_officer"],
    ]) {
      vi.mocked(recordAttendance).mockClear();
      givenAccess({ state: "active", operator: actor(roleCodes) });

      const error = await refusalFrom(() => recordAttendanceAction(EMPTY_SAVE_STATE, saveForm()));

      expect(error, `${roleCodes.join(",") || "no role"} must be refused`).toBeInstanceOf(
        NotPermitted,
      );
      expect(recordAttendance).not.toHaveBeenCalled();
    }
  });

  it("refuses them on the walk-up and the removal too, not only on the save", async () => {
    // The walk-up mints a `people` row and the removal destroys an observation.
    // Neither may be reachable by somebody the save refuses.
    givenAccess({ state: "active", operator: actor(["treasurer"]) });

    expect(
      await refusalFrom(() => recordWalkUpAction(EMPTY_WALK_UP_STATE, walkUpForm())),
    ).toBeInstanceOf(NotPermitted);
    expect(
      await refusalFrom(() => removeAttendanceAction(EMPTY_SAVE_STATE, saveForm())),
    ).toBeInstanceOf(NotPermitted);

    expect(recordWalkUpAttendance).not.toHaveBeenCalled();
    expect(removeAttendance).not.toHaveBeenCalled();
  });

  it("refuses a signed-in account with no operator profile", async () => {
    givenAccess({ state: "unlinked" });

    const error = await refusalFrom(() => recordAttendanceAction(EMPTY_SAVE_STATE, saveForm()));

    expect(error).toBeInstanceOf(NotPermitted);
    expect(recordAttendance).not.toHaveBeenCalled();
  });

  it("refuses an inactive operator, and says nothing about which cause it was", async () => {
    givenAccess({ state: "inactive" });

    const error = await refusalFrom(() => recordAttendanceAction(EMPTY_SAVE_STATE, saveForm()));

    expect(error).toBeInstanceOf(NotPermitted);
    expect(error.message).not.toContain("inactive");
    expect(recordAttendance).not.toHaveBeenCalled();
  });

  it("refuses a caller with no session", async () => {
    givenAccess({ state: "no_session" });

    const error = await refusalFrom(() => recordAttendanceAction(EMPTY_SAVE_STATE, saveForm()));

    expect(error).toBeInstanceOf(NotPermitted);
    expect(recordAttendance).not.toHaveBeenCalled();
  });

  it("takes the actor from the session, whatever the form body claims", async () => {
    givenAccess({ state: "active", operator: actor(["secretary"]) });
    const forged = saveForm({
      actorPersonId: "99999999-9999-4999-8999-999999999999",
      recordedByPersonId: "99999999-9999-4999-8999-999999999999",
    });

    await recordAttendanceAction(EMPTY_SAVE_STATE, forged);

    expect(recordAttendance).toHaveBeenCalledWith(
      OPERATOR_PERSON_ID,
      EVENT_ID,
      PARTICIPANT_KEY,
      "present",
    );
  });
});

// ---------------------------------------------------------------------------
// What a save reports back
// ---------------------------------------------------------------------------

describe("recordAttendanceAction", () => {
  beforeEach(() => {
    givenAccess({ state: "active", operator: actor(["secretary"]) });
  });

  it("reports the value the server committed, with its actor and time", async () => {
    const state = await recordAttendanceAction(EMPTY_SAVE_STATE, saveForm());

    expect(state).toMatchObject({
      key: PARTICIPANT_KEY,
      presence: "present",
      recordedAt: "2026-10-14T19:07:00.000Z",
      recordedByName: "Morgan Pike",
      attempted: null,
      error: null,
    });
  });

  it("does not redirect, so the row can show its own saved state", async () => {
    // § 9 wants Saving, then the committed value, or a failure that keeps the
    // unsaved selection visible. None of that survives a navigation.
    await expect(recordAttendanceAction(EMPTY_SAVE_STATE, saveForm())).resolves.toBeTruthy();
  });

  it("refuses a state the club has no word for, before the service is called", async () => {
    const state = await recordAttendanceAction(EMPTY_SAVE_STATE, saveForm({ presence: "showed" }));

    expect(state.error).toBe("Choose Present, Late, Excused or Absent.");
    expect(recordAttendance).not.toHaveBeenCalled();
  });

  it("keeps the attempted value visible when the save fails", async () => {
    vi.mocked(recordAttendance).mockRejectedValue(
      new InvalidTransition("Attendance can only be recorded against an event that has happened.", {
        rule: "attendance_records_require_an_occurred_event",
      }),
    );

    const state = await recordAttendanceAction(EMPTY_SAVE_STATE, saveForm({ presence: "late" }));

    expect(state.error).toContain("event that has happened");
    expect(state.attempted).toBe("late");
    // And it reports no committed value, because it did not commit one.
    expect(state.presence).toBeNull();
    expect(state.key).toBe(PARTICIPANT_KEY);
  });

  it("presents an unknown participant as a sentence rather than a crash", async () => {
    vi.mocked(recordAttendance).mockRejectedValue(
      new NotFound("That person is not on this event's list.", {
        rule: "attendance_participant_unknown",
      }),
    );

    const state = await recordAttendanceAction(EMPTY_SAVE_STATE, saveForm());

    expect(state.error).toContain("not on this event's list");
  });

  it("rethrows a refusal rather than rendering it beside the buttons", async () => {
    vi.mocked(recordAttendance).mockRejectedValue(
      new NotPermitted("You do not have access to this action.", { rule: "capability:x" }),
    );

    const error = await refusalFrom(() => recordAttendanceAction(EMPTY_SAVE_STATE, saveForm()));
    expect(error).toBeInstanceOf(NotPermitted);
  });
});

// ---------------------------------------------------------------------------
// The walk-up
// ---------------------------------------------------------------------------

describe("recordWalkUpAction", () => {
  beforeEach(() => {
    givenAccess({ state: "active", operator: actor(["secretary"]) });
  });

  it("passes the minimum identity, and an empty match as no match", async () => {
    await expect(recordWalkUpAction(EMPTY_WALK_UP_STATE, walkUpForm())).rejects.toThrow(
      `REDIRECT:/operate/events/${EVENT_ID}/attendance?added=walk-up`,
    );

    expect(recordWalkUpAttendance).toHaveBeenCalledWith(OPERATOR_PERSON_ID, EVENT_ID, {
      name: "Devon Skye",
      contact: "+44 7700 900105",
      presence: "present",
      membershipId: null,
    });
  });

  it("passes a chosen roster match through", async () => {
    await expect(
      recordWalkUpAction(EMPTY_WALK_UP_STATE, walkUpForm({ membershipId: "abc" })),
    ).rejects.toThrow("REDIRECT:");

    expect(recordWalkUpAttendance).toHaveBeenCalledWith(
      OPERATOR_PERSON_ID,
      EVENT_ID,
      expect.objectContaining({ membershipId: "abc" }),
    );
  });

  it("treats a blank contact as no contact rather than as an empty one", async () => {
    await expect(
      recordWalkUpAction(EMPTY_WALK_UP_STATE, walkUpForm({ contact: "" })),
    ).rejects.toThrow("REDIRECT:");

    expect(recordWalkUpAttendance).toHaveBeenCalledWith(
      OPERATOR_PERSON_ID,
      EVENT_ID,
      expect.objectContaining({ contact: null }),
    );
  });

  it("keeps everything typed when it is refused", async () => {
    vi.mocked(recordWalkUpAttendance).mockRejectedValue(
      new ConstraintViolated("This does not look like an email address or a phone number.", {
        rule: "walk_up_contact_shape",
      }),
    );

    const state = await recordWalkUpAction(
      EMPTY_WALK_UP_STATE,
      walkUpForm({ contact: "ask Sam", presence: "late" }),
    );

    expect(state.error).toContain("email address or a phone number");
    expect(state.values).toEqual({
      name: "Devon Skye",
      contact: "ask Sam",
      presence: "late",
      membershipId: "",
    });
  });

  it("refuses a state the club has no word for, before the service is called", async () => {
    const state = await recordWalkUpAction(
      EMPTY_WALK_UP_STATE,
      walkUpForm({ presence: "turned up" }),
    );

    expect(state.error).toBe("Choose Present, Late, Excused or Absent.");
    expect(recordWalkUpAttendance).not.toHaveBeenCalled();
  });
});

describe("removeAttendanceAction", () => {
  beforeEach(() => {
    givenAccess({ state: "active", operator: actor(["secretary"]) });
  });

  it("removes the record and returns to the board", async () => {
    await expect(removeAttendanceAction(EMPTY_SAVE_STATE, saveForm())).rejects.toThrow(
      `REDIRECT:/operate/events/${EVENT_ID}/attendance`,
    );

    expect(removeAttendance).toHaveBeenCalledWith(OPERATOR_PERSON_ID, EVENT_ID, PARTICIPANT_KEY);
  });

  it("presents a refusal as a sentence", async () => {
    vi.mocked(removeAttendance).mockRejectedValue(
      new NotFound("There is no attendance recorded for that person at this event.", {
        rule: "attendance_record_not_found",
      }),
    );

    const state = await removeAttendanceAction(EMPTY_SAVE_STATE, saveForm());

    expect(state.error).toContain("no attendance recorded");
  });
});
