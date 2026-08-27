// @vitest-environment node
/**
 * The amend / re-notify / cancel Server Actions — LAN-181 (F-D1).
 *
 * Every call here goes **straight to the action**. No page renders, so nothing
 * decided what the caller was allowed to click. A Server Action is a POST
 * endpoint, and anybody holding a session can call it whether or not a screen
 * ever offered it — `change-screens.test.tsx` mocks this module away entirely,
 * so until this file existed nothing exercised the guard at all.
 *
 * These three actions, in the module's own words, "make a message owing to
 * every invited person" — the highest-consequence authorization boundary in
 * the messaging mission. The actor is injected exactly where a real request
 * produces it, at `resolveOperatorAccess()`, and the role codes are real, so a
 * wrong capability changes who gets through and fails.
 *
 * The service layer is mocked. What is under test is the guard, the actor it
 * passes on, and how a refusal is presented; the writes are proved against the
 * real database in `src/lib/services/event-amendment.test.ts`.
 *
 * `event-amendment.ts` carries no authorization call of its own — confirmed by
 * reading it, and see the corrected comment at the top of `change-actions.ts`.
 * This guard is not a courtesy in front of a service-layer backstop; it is the
 * only gate that exists, which is exactly why deleting it must turn this suite
 * red.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    // The real `redirect` throws to unwind the render. Mirroring it keeps the
    // control flow under test honest rather than letting it fall through.
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/services/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/events")>();
  return { ...actual, validateEventDraft: vi.fn() };
});
vi.mock("@/lib/services/event-amendment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/event-amendment")>();
  return {
    ...actual,
    amendApprovedEvent: vi.fn(),
    renotifyEvent: vi.fn(),
    cancelEvent: vi.fn(),
  };
});

import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import { isServiceError, type ServiceError } from "@/lib/db";
import { validateEventDraft } from "@/lib/services/events";
import { amendApprovedEvent, cancelEvent, renotifyEvent } from "@/lib/services/event-amendment";
import { amendEventAction, cancelEventAction, renotifyEventAction } from "./change-actions";
import { EMPTY_FORM_STATE, type EventTransitionState } from "../form-state";
import { EMPTY_CANCEL_STATE } from "./change-state";

const OPERATOR_PERSON_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";

/** The five seats `event_approval` grants — the same list as `event_calendar_management`. */
const PERMITTED_ROLES = [
  "president",
  "vice_president",
  "secretary",
  "general_manager",
  "it_officer",
];

/** Every catalogue seat that is not one of them. */
const REFUSED_ROLES = [
  "treasurer",
  "social_secretary",
  "gameday_secretary",
  "kit_manager",
  "media_secretary",
  "head_coach",
  "offence_coach",
  "defence_coach",
];

const EMPTY_TRANSITION_STATE: EventTransitionState = { error: null };

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

function signedInAs(roleCodes: string[]): ResolvedOperator {
  const operator = actor(roleCodes);
  givenAccess({ state: "active", operator });
  return operator;
}

/** A submission that reaches the service. `validateEventDraft` is mocked to accept it. */
function amendForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const fields: Record<string, string> = {
    eventId: EVENT_ID,
    name: "Wednesday practice",
    eventType: "practice",
    scheduledOn: "2026-10-14",
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    attendance: "mandatory",
    deliveryMode: "in_person",
    notify: "on",
    silenceConfirmed: "false",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

function transitionForm(): FormData {
  const form = new FormData();
  form.set("eventId", EVENT_ID);
  return form;
}

function cancelForm(reason = "Waterlogged pitch"): FormData {
  const form = new FormData();
  form.set("eventId", EVENT_ID);
  form.set("reason", reason);
  form.set("notify", "on");
  form.set("silenceConfirmed", "false");
  return form;
}

/** Runs `attempt`, and returns the `ServiceError` it was supposed to throw. */
async function refusalFrom(attempt: () => Promise<unknown>): Promise<ServiceError> {
  try {
    await attempt();
  } catch (error) {
    if (isServiceError(error)) return error;
    throw error;
  }
  throw new Error("Expected the action to refuse this, but it returned.");
}

/** Every action in this file, and a valid call to it. */
const ACTIONS = [
  {
    name: "amendEventAction",
    call: () => amendEventAction(EMPTY_FORM_STATE, amendForm()),
    service: amendApprovedEvent,
  },
  {
    name: "renotifyEventAction",
    call: () => renotifyEventAction(EMPTY_TRANSITION_STATE, transitionForm()),
    service: renotifyEvent,
  },
  {
    name: "cancelEventAction",
    call: () => cancelEventAction(EMPTY_CANCEL_STATE, cancelForm()),
    service: cancelEvent,
  },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validateEventDraft).mockReturnValue({
    ok: true,
    value: {
      name: "Wednesday practice",
      eventType: "practice",
      scheduledOn: "2026-10-14",
      startsAt: "20:00",
      endsAt: "22:00",
      deliveryMode: "in_person",
      venue: "Iffley Road Astro",
      description: null,
      requiredEquipment: null,
      joiningUrl: null,
      isMandatory: true,
    },
  });
  vi.mocked(amendApprovedEvent).mockResolvedValue({} as never);
  vi.mocked(renotifyEvent).mockResolvedValue(undefined as never);
  vi.mocked(cancelEvent).mockResolvedValue({} as never);
});

// ---------------------------------------------------------------------------
// The guard — F-D1
// ---------------------------------------------------------------------------

describe("every action refuses a caller with no operator profile", () => {
  const UNRESOLVED: OperatorAccess[] = [
    { state: "no_session" },
    { state: "unlinked" },
    { state: "inactive" },
  ];

  for (const access of UNRESOLVED) {
    describe(`when the session is ${access.state}`, () => {
      it.each(ACTIONS)("$name refuses with NotPermitted", async ({ call }) => {
        givenAccess(access);

        const error = await refusalFrom(call);

        expect(error.kind).toBe("not_permitted");
      });

      it.each(ACTIONS)("$name reaches no service call", async ({ call, service }) => {
        givenAccess(access);

        await refusalFrom(call);

        expect(service).not.toHaveBeenCalled();
      });
    });
  }
});

describe("only the five event_approval seats may amend, re-notify or cancel", () => {
  for (const role of PERMITTED_ROLES) {
    it.each(ACTIONS)(
      `$name reaches its service for a ${role}, with the session's actor`,
      async ({ call, service }) => {
        signedInAs([role]);

        await expect(call()).rejects.toThrow(/^REDIRECT:/);

        expect(service).toHaveBeenCalledTimes(1);
        expect(vi.mocked(service).mock.calls[0][0]).toBe(OPERATOR_PERSON_ID);
      },
    );
  }

  for (const role of REFUSED_ROLES) {
    it.each(ACTIONS)(
      `$name refuses a ${role}, and calls the service not at all`,
      async ({ call, service }) => {
        signedInAs([role]);

        const error = await refusalFrom(call);

        expect(error.kind).toBe("not_permitted");
        expect(error.rule).toBe("capability:event_approval");
        expect(service).not.toHaveBeenCalled();
      },
    );
  }

  it.each(ACTIONS)(
    "$name refuses an operator holding no seat at all",
    async ({ call, service }) => {
      signedInAs([]);

      const error = await refusalFrom(call);

      expect(error.kind).toBe("not_permitted");
      expect(service).not.toHaveBeenCalled();
    },
  );

  it.each(ACTIONS)(
    "$name refuses a head_coach — the narrow attendance-recording seat reaches no other operator surface",
    async ({ call, service }) => {
      signedInAs(["head_coach"]);

      const error = await refusalFrom(call);

      expect(error.kind).toBe("not_permitted");
      expect(service).not.toHaveBeenCalled();
    },
  );

  it("says nothing about what the refused caller does hold", async () => {
    signedInAs(["treasurer", "media_secretary"]);

    const error = await refusalFrom(() => amendEventAction(EMPTY_FORM_STATE, amendForm()));

    expect(error.message).not.toMatch(/treasurer|media secretary/i);
  });

  it("names the roles the action needs", async () => {
    signedInAs(["treasurer"]);

    const error = await refusalFrom(() => cancelEventAction(EMPTY_CANCEL_STATE, cancelForm()));

    expect(error.message).toContain("President");
  });

  it("ignores an actor supplied in the amend form body", async () => {
    signedInAs(["secretary"]);
    const form = amendForm();
    form.set("actorPersonId", "99999999-9999-4999-8999-999999999999");

    await expect(amendEventAction(EMPTY_FORM_STATE, form)).rejects.toThrow(/^REDIRECT:/);

    // The actor comes from the verified session and from nowhere else. A
    // Server Action that trusted the body would accept whatever the browser
    // sent.
    expect(vi.mocked(amendApprovedEvent).mock.calls[0][0]).toBe(OPERATOR_PERSON_ID);
  });
});
