// @vitest-environment node
/**
 * The event workflow's server actions — LAN-76, matrix row 11.
 *
 * Every call here goes **straight to the action**. No page renders, no layout
 * runs, nothing decided what the caller was allowed to click. A server action
 * is a POST endpoint, and anybody with a session can call it whether or not a
 * screen ever offered it; if the enforcement lived in the page, every
 * assertion below would fail.
 *
 * The actor is injected exactly where a real request produces it — at
 * `resolveOperatorAccess()`, the verified-session resolution — and nowhere
 * else. None of these actions takes an actor argument, and the test that sends
 * one in the form body is what holds them to that.
 *
 * The service layer is mocked here on purpose. What is under test is the guard,
 * the actor it passes on and the way a failure is presented; the writes
 * themselves are proved against the real database in
 * `src/lib/services/events.test.ts`.
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
  return {
    ...actual,
    createEventDraft: vi.fn(),
    updateEventDraft: vi.fn(),
    submitEventForApproval: vi.fn(),
    withdrawEventSubmission: vi.fn(),
    abandonEventDraft: vi.fn(),
  };
});

import { InvalidTransition, NotPermitted, isServiceError, type ServiceError } from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import {
  abandonEventDraft,
  createEventDraft,
  submitEventForApproval,
  updateEventDraft,
  withdrawEventSubmission,
} from "@/lib/services/events";
import {
  abandonEventDraftAction,
  createEventDraftAction,
  submitEventAction,
  updateEventDraftAction,
  withdrawEventSubmissionAction,
} from "./actions";
import { EMPTY_FORM_STATE, EMPTY_TRANSITION_STATE } from "./form-state";

const OPERATOR_PERSON_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";

function actor(roleCodes: string[] = []): ResolvedOperator {
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

/** A complete, valid submission. Individual tests spoil one field at a time. */
function draftForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const fields: Record<string, string> = {
    name: "Wednesday practice",
    eventType: "practice",
    origin: "club_controlled",
    scheduledOn: "2026-10-14",
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    termId: "",
    weekNumber: "2",
    attendance: "mandatory",
    solicitsResponse: "yes",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

function transitionForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("eventId", EVENT_ID);
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
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

/** Every action in this workflow, and a valid call to it. */
const ACTIONS = [
  {
    name: "createEventDraftAction",
    call: () => createEventDraftAction(EMPTY_FORM_STATE, draftForm()),
    service: createEventDraft,
  },
  {
    name: "updateEventDraftAction",
    call: () => updateEventDraftAction(EMPTY_FORM_STATE, draftForm({ eventId: EVENT_ID })),
    service: updateEventDraft,
  },
  {
    name: "submitEventAction",
    call: () => submitEventAction(EMPTY_TRANSITION_STATE, transitionForm()),
    service: submitEventForApproval,
  },
  {
    name: "withdrawEventSubmissionAction",
    call: () => withdrawEventSubmissionAction(EMPTY_TRANSITION_STATE, transitionForm()),
    service: withdrawEventSubmission,
  },
  {
    name: "abandonEventDraftAction",
    call: () =>
      abandonEventDraftAction(EMPTY_TRANSITION_STATE, transitionForm({ reason: "Pitch gone" })),
    service: abandonEventDraft,
  },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createEventDraft).mockResolvedValue({ id: EVENT_ID } as never);
  vi.mocked(updateEventDraft).mockResolvedValue({ id: EVENT_ID } as never);
  vi.mocked(submitEventForApproval).mockResolvedValue({ id: EVENT_ID } as never);
  vi.mocked(withdrawEventSubmission).mockResolvedValue({ id: EVENT_ID } as never);
  vi.mocked(abandonEventDraft).mockResolvedValue({ id: EVENT_ID } as never);
});

// ---------------------------------------------------------------------------
// The guard
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

  it("says nothing about what the refused caller does hold", async () => {
    givenAccess({ state: "unlinked" });

    const error = await refusalFrom(() => createEventDraftAction(EMPTY_FORM_STATE, draftForm()));

    expect(error.message).not.toMatch(/president|secretary|coach|role/i);
  });
});

describe("an active operator may draft, whatever seat they hold", () => {
  it.each(ACTIONS)(
    "$name reaches its service with the session's actor",
    async ({ call, service }) => {
      // No roles at all. Drafting is ordinary operator work — the privileged
      // step is approval, which is LAN-77 and stays President-only.
      givenAccess({ state: "active", operator: actor([]) });

      await expect(call()).rejects.toThrow(/^REDIRECT:/);

      expect(service).toHaveBeenCalledTimes(1);
      expect(vi.mocked(service).mock.calls[0][0]).toBe(OPERATOR_PERSON_ID);
    },
  );

  it("ignores an actor supplied in the form body", async () => {
    givenAccess({ state: "active", operator: actor([]) });

    const form = draftForm();
    form.set("actorPersonId", "99999999-9999-4999-8999-999999999999");
    form.set("ownerPersonId", "99999999-9999-4999-8999-999999999999");

    await expect(createEventDraftAction(EMPTY_FORM_STATE, form)).rejects.toThrow(/^REDIRECT:/);

    expect(vi.mocked(createEventDraft).mock.calls[0][0]).toBe(OPERATOR_PERSON_ID);
  });
});

// ---------------------------------------------------------------------------
// What the operator sees back
// ---------------------------------------------------------------------------

describe("a validation failure comes back as fields, with the entries intact", () => {
  beforeEach(() => {
    givenAccess({ state: "active", operator: actor([]) });
  });

  it("names the unanswered response-solicited choice and writes nothing", async () => {
    const state = await createEventDraftAction(
      EMPTY_FORM_STATE,
      draftForm({ solicitsResponse: "" }),
    );

    expect(state.issues.map((issue) => issue.field)).toEqual(["solicitsResponse"]);
    expect(createEventDraft).not.toHaveBeenCalled();
  });

  it("hands every submitted value back so nothing is retyped", async () => {
    const state = await createEventDraftAction(
      EMPTY_FORM_STATE,
      draftForm({ name: "Wednesday practice, in the rain", solicitsResponse: "" }),
    );

    expect(state.values?.name).toBe("Wednesday practice, in the rain");
    expect(state.values?.venue).toBe("Iffley Road Astro");
    expect(state.values?.attendance).toBe("mandatory");
  });
});

describe("a refusal from the service is shown, and an authorization refusal is not", () => {
  beforeEach(() => {
    givenAccess({ state: "active", operator: actor([]) });
  });

  it("returns an illegal transition as a sentence the operator can act on", async () => {
    vi.mocked(submitEventForApproval).mockRejectedValue(
      new InvalidTransition("Only a draft can be submitted for approval. This event is approved."),
    );

    const state = await submitEventAction(EMPTY_TRANSITION_STATE, transitionForm());

    expect(state.error).toMatch(/Only a draft can be submitted/);
  });

  it("keeps a form's entries when the service refuses the write", async () => {
    vi.mocked(createEventDraft).mockRejectedValue(new InvalidTransition("The season is closed."));

    const state = await createEventDraftAction(EMPTY_FORM_STATE, draftForm());

    expect(state.error).toBe("The season is closed.");
    expect(state.values?.name).toBe("Wednesday practice");
  });

  it("never renders a NotPermitted as a form message", async () => {
    vi.mocked(abandonEventDraft).mockRejectedValue(new NotPermitted("You may not do that."));

    const error = await refusalFrom(() =>
      abandonEventDraftAction(EMPTY_TRANSITION_STATE, transitionForm({ reason: "No" })),
    );

    expect(error.kind).toBe("not_permitted");
  });

  it("lets an unexpected failure reach the error boundary as itself", async () => {
    const boom = new TypeError("something entirely different broke");
    vi.mocked(submitEventForApproval).mockRejectedValue(boom);

    await expect(submitEventAction(EMPTY_TRANSITION_STATE, transitionForm())).rejects.toBe(boom);
  });
});

describe("where each action leaves the operator", () => {
  beforeEach(() => {
    givenAccess({ state: "active", operator: actor([]) });
  });

  it("sends a new draft to its own page", async () => {
    await expect(createEventDraftAction(EMPTY_FORM_STATE, draftForm())).rejects.toThrow(
      `REDIRECT:/operate/events/${EVENT_ID}`,
    );
  });

  it("sends a submitted event to the confirmation state — UX-33", async () => {
    await expect(submitEventAction(EMPTY_TRANSITION_STATE, transitionForm())).rejects.toThrow(
      `REDIRECT:/operate/events/${EVENT_ID}?submitted=1`,
    );
  });

  it("sends a withdrawn submission back to the event, with no confirmation flag", async () => {
    await expect(
      withdrawEventSubmissionAction(EMPTY_TRANSITION_STATE, transitionForm()),
    ).rejects.toThrow(`REDIRECT:/operate/events/${EVENT_ID}`);
  });
});
