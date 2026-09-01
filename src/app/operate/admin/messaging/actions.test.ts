// @vitest-environment node
/**
 * `updateOneMessagingScheduleAction` exercised unmocked — SEC-171-01 (round 1
 * correction), carried forward to the per-row action OWNER-LAN171-04 replaced
 * it with.
 *
 * This file exists because independent review once deleted the action's
 * `requireCapability("delivery_administration")` call outright — the entire
 * authorization check for the endpoint that decides what the club sends every
 * member — and reran this feature's whole suite: `screens.test.tsx` renders
 * the page with `./actions` mocked out, and `validation.test.ts` /
 * `presentation.test.ts` only exercise pure helpers. All three stayed green.
 * No file imported the real action and let it run.
 *
 * `src/app/operate/admin/actions.test.ts` exists for the identical reason —
 * `not_permitted` handling in a sibling server action once regressed under a
 * fully green suite — and this file follows its pattern: the action itself is
 * imported unmocked, `resolveOperatorAccess` is the one seam that stands in
 * for the verified session, and the transaction/service calls underneath are
 * mocked at the boundary the action itself calls, so `requireCapability`'s
 * real logic — resolve the session, check the role map, throw or return —
 * runs for real on every case below.
 *
 * What is proved: a caller without `delivery_administration` is refused
 * before the transaction opens and the write function is never called; a
 * caller who holds it writes only when the row actually changed, attributed
 * to the resolved operator's own `personId`; and a genuine write failure
 * names the row and the values rather than offering a retry (OWNER-LAN171-02).
 * The write's SQL and its audit row are proved against the real database
 * elsewhere (`messaging-schedule.test.ts`).
 *
 * One thing this file deliberately does *not* change: `requireCapability` is
 * called before the `try` block, exactly as every action in the sibling
 * `admin/actions.ts` calls its own floor check — so a caller who reaches this
 * action without the capability at all gets `NotPermitted` as a rejection,
 * not a graceful `state.refusal`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    // The real `withTransaction` opens a pooled Postgres connection, which
    // this file has no lease for and does not need — nothing under test
    // touches SQL. It joins no in-flight transaction here, so without this
    // seam every "authorized" case below would hang on a connection attempt.
    // The fake `tx` is never read: `readMessagingScheduleIn` and
    // `updateMessagingScheduleIn` are mocked below and ignore it.
    withTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
});

vi.mock("@/lib/services/messaging-schedule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/messaging-schedule")>();
  return {
    ...actual,
    readMessagingScheduleIn: vi.fn(),
    updateMessagingScheduleIn: vi.fn(),
  };
});

vi.mock("@/lib/services/recruitment-cycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/recruitment-cycle")>();
  return {
    ...actual,
    listRecruitmentCycleStepsIn: vi.fn(),
    updateRecruitmentCycleStepIn: vi.fn(),
  };
});

import { revalidatePath } from "next/cache";
import { ConstraintViolated, isServiceError } from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import {
  readMessagingScheduleIn,
  updateMessagingScheduleIn,
  type MessagingSchedule,
  type MessagingScheduleChange,
} from "@/lib/services/messaging-schedule";
import {
  listRecruitmentCycleStepsIn,
  updateRecruitmentCycleStepIn,
  type RecruitmentCycleStep,
} from "@/lib/services/recruitment-cycle";
import { updateOneMessagingScheduleAction, updateRecruitmentCycleStepsAction } from "./actions";
import { EMPTY_ADMIN_ACTION_STATE } from "../action-state";
import {
  NO_SCHEDULE_CHANGES_NOTICE,
  cycleStepSavedNotice,
  scheduleSavedNotice,
} from "./presentation";
import { SCHEDULE_FIELDS } from "./validation";

const CHALK = "chalk";

/** One value per field, legal against every bound and against each other. */
const BASE_CHANGE: MessagingScheduleChange = {
  rsvpByDays: 2,
  invitationLeadDays: 5,
  reminderCadenceHours: 24,
  whatsappReminderCount: 2,
  emailReminderCount: 1,
  escalationHours: 24,
};

function actor(roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Rowan Ashfield",
    roleCodes,
    isActive: true,
  };
}

function givenSession(access: OperatorAccess) {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

function scheduleRow(eventType: string, change: MessagingScheduleChange): MessagingSchedule {
  return {
    eventType,
    ...change,
    recruitInvitationLeadDays: change.recruitInvitationLeadDays ?? null,
    recruitFollowUpCadenceHours: change.recruitFollowUpCadenceHours ?? null,
    updatedAt: new Date("2026-08-01T00:00:00Z"),
  };
}

/** One row's own form: `eventType` plus its six fields. */
function rowForm(eventType: string, change: Partial<MessagingScheduleChange> = {}): FormData {
  const data = new FormData();
  data.set("eventType", eventType);
  const values = { ...BASE_CHANGE, ...change };
  for (const bound of SCHEDULE_FIELDS) {
    data.set(bound.key, String(values[bound.field]));
  }
  return data;
}

function cycleStep(
  step: RecruitmentCycleStep["step"],
  overrides: Partial<RecruitmentCycleStep> = {},
): RecruitmentCycleStep {
  return {
    step,
    enabled: true,
    offsetHours: 0,
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

const CYCLE_STEPS: RecruitmentCycleStep[] = [
  cycleStep("welcome", { offsetHours: 0 }),
  cycleStep("details_reminder", { offsetHours: 96 }),
  cycleStep("interest_ask", { offsetHours: 72 }),
  cycleStep("interest_reminder", { enabled: false, offsetHours: 144 }),
];

/** One cycle row's own form: a hidden `steps` field plus each named step's two fields. */
function cycleForm(
  steps: readonly RecruitmentCycleStep["step"][],
  overrides: Partial<Record<string, { enabled?: boolean; offsetHours?: number }>> = {},
): FormData {
  const data = new FormData();
  data.set("steps", steps.join(","));
  for (const step of steps) {
    const current = CYCLE_STEPS.find((row) => row.step === step)!;
    const change = {
      enabled: current.enabled,
      offsetHours: current.offsetHours,
      ...overrides[step],
    };
    if (change.enabled) data.set(`step_${step}_enabled`, "on");
    data.set(`step_${step}_offsetHours`, String(change.offsetHours));
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readMessagingScheduleIn).mockResolvedValue(scheduleRow(CHALK, BASE_CHANGE));
  vi.mocked(updateMessagingScheduleIn).mockImplementation(
    async (_tx, _actorId, eventType, change) => scheduleRow(eventType, change),
  );
  vi.mocked(listRecruitmentCycleStepsIn).mockResolvedValue(CYCLE_STEPS);
  vi.mocked(updateRecruitmentCycleStepIn).mockImplementation(async (_tx, _actorId, step, change) =>
    cycleStep(step, change),
  );
});

describe("without delivery_administration", () => {
  it("is refused before the write, and writes nothing", async () => {
    // Treasurer: a real committee seat, not on delivery_administration's list
    // (president, vice_president, secretary, general_manager, it_officer).
    givenSession({ state: "active", operator: actor(["treasurer"]) });

    let thrown: unknown;
    try {
      await updateOneMessagingScheduleAction(
        EMPTY_ADMIN_ACTION_STATE,
        rowForm(CHALK, { escalationHours: 48 }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(isServiceError(thrown)).toBe(true);
    expect((thrown as { kind: string }).kind).toBe("not_permitted");
    expect(readMessagingScheduleIn).not.toHaveBeenCalled();
    expect(updateMessagingScheduleIn).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller the same way — a server action is a reachable POST", async () => {
    givenSession({ state: "no_session" });

    await expect(
      updateOneMessagingScheduleAction(EMPTY_ADMIN_ACTION_STATE, rowForm(CHALK)),
    ).rejects.toMatchObject({ kind: "not_permitted" });
    expect(updateMessagingScheduleIn).not.toHaveBeenCalled();
  });
});

describe("holding delivery_administration", () => {
  it("writes the row that changed, attributed to the resolved operator", async () => {
    const operator = actor(["secretary"]);
    givenSession({ state: "active", operator });
    vi.mocked(readMessagingScheduleIn).mockResolvedValue(scheduleRow(CHALK, BASE_CHANGE));

    const state = await updateOneMessagingScheduleAction(
      EMPTY_ADMIN_ACTION_STATE,
      rowForm(CHALK, { escalationHours: 6 }),
    );

    expect(state.refusal).toBeNull();
    expect(state.error).toBeNull();
    expect(state.notice).toBe(scheduleSavedNotice("Chalk"));

    expect(updateMessagingScheduleIn).toHaveBeenCalledTimes(1);
    expect(updateMessagingScheduleIn).toHaveBeenCalledWith(
      expect.anything(),
      operator.personId,
      CHALK,
      expect.objectContaining({ escalationHours: 6 }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/operate/admin/messaging");
  });

  it("reports no change and writes nothing when the row already matches", async () => {
    givenSession({ state: "active", operator: actor(["president"]) });

    const state = await updateOneMessagingScheduleAction(EMPTY_ADMIN_ACTION_STATE, rowForm(CHALK));

    expect(state.notice).toBe(NO_SCHEDULE_CHANGES_NOTICE);
    expect(updateMessagingScheduleIn).not.toHaveBeenCalled();
  });

  it("refuses a malformed field before it reaches the database, naming the row", async () => {
    givenSession({ state: "active", operator: actor(["president"]) });

    const state = await updateOneMessagingScheduleAction(
      EMPTY_ADMIN_ACTION_STATE,
      rowForm(CHALK, { whatsappReminderCount: 99 }),
    );

    expect(state.error).toMatch(/Chalk/);
    expect(state.error).toMatch(/between/i);
    expect(updateMessagingScheduleIn).not.toHaveBeenCalled();
  });

  it("names the row and the submitted values when a write genuinely fails, and offers no retry", async () => {
    givenSession({ state: "active", operator: actor(["president"]) });
    vi.mocked(updateMessagingScheduleIn).mockRejectedValue(
      new ConstraintViolated("a database rule refused this", { rule: "some_rule" }),
    );

    const state = await updateOneMessagingScheduleAction(
      EMPTY_ADMIN_ACTION_STATE,
      rowForm(CHALK, { escalationHours: 6 }),
    );

    // OWNER-LAN171-02: names the row…
    expect(state.error).toMatch(/Chalk/);
    // …and the values it tried to save…
    expect(state.error).toMatch(/RSVP by 2 days/);
    expect(state.error).toMatch(/President 6 h/);
    // …and never suggests a retry that cannot work.
    expect(state.error).not.toMatch(/try again/i);
  });
});

// ---------------------------------------------------------------------------
// `updateRecruitmentCycleStepsAction` — LAN-203. Same reasoning as above:
// exercised unmocked, so a missing `requireCapability` call regresses here
// rather than staying invisible behind `screens.test.tsx`'s mocked action.
// ---------------------------------------------------------------------------

describe("updateRecruitmentCycleStepsAction, without delivery_administration", () => {
  it("is refused before the write, and writes nothing", async () => {
    givenSession({ state: "active", operator: actor(["treasurer"]) });

    let thrown: unknown;
    try {
      await updateRecruitmentCycleStepsAction(EMPTY_ADMIN_ACTION_STATE, cycleForm(["welcome"]));
    } catch (error) {
      thrown = error;
    }

    expect(isServiceError(thrown)).toBe(true);
    expect((thrown as { kind: string }).kind).toBe("not_permitted");
    expect(listRecruitmentCycleStepsIn).not.toHaveBeenCalled();
    expect(updateRecruitmentCycleStepIn).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller the same way", async () => {
    givenSession({ state: "no_session" });

    await expect(
      updateRecruitmentCycleStepsAction(EMPTY_ADMIN_ACTION_STATE, cycleForm(["welcome"])),
    ).rejects.toMatchObject({ kind: "not_permitted" });
    expect(updateRecruitmentCycleStepIn).not.toHaveBeenCalled();
  });
});

describe("updateRecruitmentCycleStepsAction, holding delivery_administration", () => {
  it("writes a single-step row, attributed to the resolved operator", async () => {
    const operator = actor(["secretary"]);
    givenSession({ state: "active", operator });

    const state = await updateRecruitmentCycleStepsAction(
      EMPTY_ADMIN_ACTION_STATE,
      cycleForm(["welcome"], { welcome: { enabled: true, offsetHours: 1 } }),
    );

    expect(state.refusal).toBeNull();
    expect(state.error).toBeNull();
    expect(state.notice).toBe(cycleStepSavedNotice("Welcome"));
    expect(updateRecruitmentCycleStepIn).toHaveBeenCalledTimes(1);
    expect(updateRecruitmentCycleStepIn).toHaveBeenCalledWith(
      expect.anything(),
      operator.personId,
      "welcome",
      { enabled: true, offsetHours: 1 },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/operate/admin/messaging");
  });

  it("writes both steps of the Recruitment questionnaire row in one submission, atomically", async () => {
    givenSession({ state: "active", operator: actor(["president"]) });

    const state = await updateRecruitmentCycleStepsAction(
      EMPTY_ADMIN_ACTION_STATE,
      cycleForm(["interest_ask", "interest_reminder"], {
        interest_reminder: { enabled: true, offsetHours: 150 },
      }),
    );

    expect(state.error).toBeNull();
    expect(updateRecruitmentCycleStepIn).toHaveBeenCalledTimes(1);
    expect(updateRecruitmentCycleStepIn).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "interest_reminder",
      { enabled: true, offsetHours: 150 },
    );
    // `interest_ask` is unchanged from its current stored value, so it is
    // never written — the same "only the row that actually changed" rule
    // `updateOneMessagingScheduleAction` already keeps.
    expect(updateRecruitmentCycleStepIn).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "interest_ask",
      expect.anything(),
    );
  });

  it("reports no change and writes nothing when the row already matches", async () => {
    givenSession({ state: "active", operator: actor(["president"]) });

    const state = await updateRecruitmentCycleStepsAction(
      EMPTY_ADMIN_ACTION_STATE,
      cycleForm(["welcome"]),
    );

    expect(state.notice).toBe(NO_SCHEDULE_CHANGES_NOTICE);
    expect(updateRecruitmentCycleStepIn).not.toHaveBeenCalled();
  });

  it("reads an unchecked switch as disabled — the checkbox is absent from the form, not false", async () => {
    givenSession({ state: "active", operator: actor(["president"]) });

    const form = cycleForm(["interest_ask"]);
    form.delete("step_interest_ask_enabled");

    const state = await updateRecruitmentCycleStepsAction(EMPTY_ADMIN_ACTION_STATE, form);

    expect(state.error).toBeNull();
    expect(updateRecruitmentCycleStepIn).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "interest_ask",
      expect.objectContaining({ enabled: false }),
    );
  });

  it("refuses a malformed timing field before it reaches the database, naming the step", async () => {
    givenSession({ state: "active", operator: actor(["president"]) });

    const form = cycleForm(["welcome"]);
    form.set("step_welcome_offsetHours", "9999");

    const state = await updateRecruitmentCycleStepsAction(EMPTY_ADMIN_ACTION_STATE, form);

    expect(state.error).toMatch(/Welcome/);
    expect(state.error).toMatch(/between/i);
    expect(updateRecruitmentCycleStepIn).not.toHaveBeenCalled();
  });

  it("refuses a submission that does not say which steps it covers", async () => {
    givenSession({ state: "active", operator: actor(["president"]) });

    const state = await updateRecruitmentCycleStepsAction(EMPTY_ADMIN_ACTION_STATE, new FormData());

    expect(state.error).toMatch(/which recruitment cycle steps/i);
    expect(updateRecruitmentCycleStepIn).not.toHaveBeenCalled();
  });
});
