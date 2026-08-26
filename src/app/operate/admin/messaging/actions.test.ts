// @vitest-environment node
/**
 * `updateMessagingSchedulesAction` exercised unmocked — SEC-171-01, round 1
 * correction.
 *
 * This file exists because independent review deleted the action's
 * `requireCapability("delivery_administration")` call outright — the entire
 * authorization check for the endpoint that decides what the club sends every
 * member — and reran this feature's whole suite: `screens.test.tsx` renders
 * the page with `./actions` mocked out, and `validation.test.ts` /
 * `presentation.test.ts` only exercise pure helpers. All three stayed green,
 * 35/35. No file imported the real action and let it run.
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
 * before the transaction opens and the write functions are never called; a
 * caller who holds it reaches the write loop, and only a row that actually
 * changed is written, attributed to the resolved operator's own `personId`.
 * The write loop's SQL is proved against the real database elsewhere
 * (`messaging-schedule.test.ts`); what was missing, and what was invisible to
 * a deleted capability check, is here.
 *
 * One thing this file deliberately does *not* change: `requireCapability`
 * is called before the `try` block, exactly as every action in the sibling
 * `admin/actions.ts` calls its own floor check — so a caller who reaches this
 * action without the capability at all gets `NotPermitted` as a rejection,
 * not a graceful `state.refusal`. That is this codebase's established shape
 * for the floor check (the `refusal` field is for a *target-aware* refusal
 * raised from inside the service, during the write); reshaping it is
 * authorization redesign, which this correction is explicitly told not to do.
 * What matters for SEC-171-01 either way: the caller is stopped, and nothing
 * is written.
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
    // The fake `tx` is never read: `listMessagingSchedulesIn` and
    // `updateMessagingScheduleIn` are mocked below and ignore it.
    withTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
});

vi.mock("@/lib/services/messaging-schedule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/messaging-schedule")>();
  return {
    ...actual,
    listMessagingSchedulesIn: vi.fn(),
    updateMessagingScheduleIn: vi.fn(),
  };
});

import { revalidatePath } from "next/cache";
import { isServiceError } from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import {
  listMessagingSchedulesIn,
  updateMessagingScheduleIn,
  type MessagingSchedule,
  type MessagingScheduleChange,
} from "@/lib/services/messaging-schedule";
import { updateMessagingSchedulesAction } from "./actions";
import { EMPTY_ADMIN_ACTION_STATE } from "../action-state";
import { NO_SCHEDULE_CHANGES_NOTICE, scheduleChangesSavedNotice } from "./presentation";
import { SCHEDULE_EVENT_TYPES, SCHEDULE_FIELDS, scheduleFieldName } from "./validation";

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
  return { eventType, ...change, updatedAt: new Date("2026-08-01T00:00:00Z") };
}

/** Every event type currently holding `BASE_CHANGE`, except one override. */
function currentSchedules(
  overrides: Record<string, MessagingScheduleChange> = {},
): readonly MessagingSchedule[] {
  return SCHEDULE_EVENT_TYPES.map((eventType) =>
    scheduleRow(eventType, overrides[eventType] ?? BASE_CHANGE),
  );
}

/** A submission proposing `BASE_CHANGE` for every event type, except one override. */
function submittedForm(overrides: Record<string, Partial<MessagingScheduleChange>> = {}): FormData {
  const data = new FormData();
  for (const eventType of SCHEDULE_EVENT_TYPES) {
    const change = { ...BASE_CHANGE, ...overrides[eventType] };
    for (const bound of SCHEDULE_FIELDS) {
      data.set(scheduleFieldName(eventType, bound.key), String(change[bound.field]));
    }
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listMessagingSchedulesIn).mockResolvedValue(currentSchedules());
  vi.mocked(updateMessagingScheduleIn).mockImplementation(
    async (_tx, _actorId, eventType, change) => scheduleRow(eventType, change),
  );
});

describe("without delivery_administration", () => {
  it("is refused before the write loop, and writes nothing", async () => {
    // Treasurer: a real committee seat, not on delivery_administration's list
    // (president, vice_president, secretary, general_manager, it_officer).
    givenSession({ state: "active", operator: actor(["treasurer"]) });

    let thrown: unknown;
    try {
      await updateMessagingSchedulesAction(
        EMPTY_ADMIN_ACTION_STATE,
        submittedForm({ [CHALK]: { escalationHours: 48 } }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(isServiceError(thrown)).toBe(true);
    expect((thrown as { kind: string }).kind).toBe("not_permitted");
    expect(listMessagingSchedulesIn).not.toHaveBeenCalled();
    expect(updateMessagingScheduleIn).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller the same way — a server action is a reachable POST", async () => {
    givenSession({ state: "no_session" });

    await expect(
      updateMessagingSchedulesAction(EMPTY_ADMIN_ACTION_STATE, submittedForm()),
    ).rejects.toMatchObject({ kind: "not_permitted" });
    expect(updateMessagingScheduleIn).not.toHaveBeenCalled();
  });
});

describe("holding delivery_administration", () => {
  it("writes only the row that changed, attributed to the resolved operator", async () => {
    const operator = actor(["secretary"]);
    givenSession({ state: "active", operator });
    vi.mocked(listMessagingSchedulesIn).mockResolvedValue(
      currentSchedules({ [CHALK]: { ...BASE_CHANGE, escalationHours: 48 } }),
    );

    const state = await updateMessagingSchedulesAction(
      EMPTY_ADMIN_ACTION_STATE,
      submittedForm({ [CHALK]: { escalationHours: 24 } }),
    );

    expect(state.refusal).toBeNull();
    expect(state.error).toBeNull();
    expect(state.notice).toBe(scheduleChangesSavedNotice(1));

    expect(updateMessagingScheduleIn).toHaveBeenCalledTimes(1);
    expect(updateMessagingScheduleIn).toHaveBeenCalledWith(
      expect.anything(),
      operator.personId,
      CHALK,
      expect.objectContaining({ escalationHours: 24 }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/operate/admin/messaging");
  });

  it("reports no changes and writes nothing when every row already matches", async () => {
    givenSession({ state: "active", operator: actor(["president"]) });

    const state = await updateMessagingSchedulesAction(EMPTY_ADMIN_ACTION_STATE, submittedForm());

    expect(state.notice).toBe(NO_SCHEDULE_CHANGES_NOTICE);
    expect(updateMessagingScheduleIn).not.toHaveBeenCalled();
  });
});
