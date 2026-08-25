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
  };
});
vi.mock("@/lib/services/event-approval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/event-approval")>();
  return {
    ...actual,
    approveEvent: vi.fn(),
    saveEventAudience: vi.fn(),
    readApprovalPreview: vi.fn(),
  };
});
vi.mock("@/lib/services/delivery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/delivery")>();
  return { ...actual, dispatchEventInvitations: vi.fn() };
});

import {
  ConstraintViolated,
  InvalidTransition,
  NotPermitted,
  isServiceError,
  type ServiceError,
} from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import { createEventDraft, updateEventDraft } from "@/lib/services/events";
import { approveEvent, saveEventAudience } from "@/lib/services/event-approval";
import { EMPTY_AUDIENCE_MESSAGE } from "@/lib/services/audience-selection";
import {
  approveEventAction,
  createEventDraftAction,
  saveEventAudienceAction,
  updateEventDraftAction,
} from "./actions";
import { revalidatePath } from "next/cache";
import { dispatchEventInvitations } from "@/lib/services/delivery";
import { EMPTY_FORM_STATE, EMPTY_TRANSITION_STATE } from "./form-state";

const OPERATOR_PERSON_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";

/** The four roles Brian's clarification puts on the club calendar. */
const CALENDAR_ROLES = ["president", "vice_president", "secretary", "general_manager"];

/**
 * Every catalogue seat that is not one of them.
 *
 * `it_officer` is deliberately absent: Brian's LAN-124 decision made it the
 * club's administrative seat, so it holds the calendar capabilities too.
 */
const NON_CALENDAR_ROLES = [
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

/** A complete, valid submission. Individual tests spoil one field at a time. */
function draftForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const fields: Record<string, string> = {
    name: "Wednesday practice",
    eventType: "practice",
    scheduledOn: "2026-10-14",
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    attendance: "mandatory",
    deliveryMode: "in_person",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
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
    name: "approveEventAction",
    call: () => approveEventAction(EMPTY_TRANSITION_STATE, approvalForm()),
    service: approveEvent,
  },
] as const;

/** A confirmed audience, as the builder posts it: repeated `audienceKey` fields. */
function approvalForm(keys: string[] = [PLAYER_KEY, COACH_KEY]): FormData {
  const form = new FormData();
  form.set("eventId", EVENT_ID);
  for (const key of keys) form.append("audienceKey", key);
  return form;
}

const PLAYER_KEY = "player:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const COACH_KEY = "coach:pppppppp-pppp-4ppp-8ppp-ppppppppppp4";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createEventDraft).mockResolvedValue({ id: EVENT_ID } as never);
  vi.mocked(updateEventDraft).mockResolvedValue({ id: EVENT_ID } as never);
  vi.mocked(approveEvent).mockResolvedValue({ event: { id: EVENT_ID } } as never);
  vi.mocked(saveEventAudience).mockResolvedValue([] as never);
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

describe("only the four calendar roles may manage the calendar", () => {
  // Brian's LAN-76 clarification, 12 August 2026: "The club calendar is managed
  // only by these four operator roles." The first implementation let any linked
  // operator do it, on the reading that drafting was ordinary operator work.
  // These are what hold the corrected rule.

  for (const role of CALENDAR_ROLES) {
    it.each(ACTIONS)(
      `$name reaches its service for a ${role}, with the session's actor`,
      async ({ call, service }) => {
        givenAccess({ state: "active", operator: actor([role]) });

        await expect(call()).rejects.toThrow(/^REDIRECT:/);

        expect(service).toHaveBeenCalledTimes(1);
        expect(vi.mocked(service).mock.calls[0][0]).toBe(OPERATOR_PERSON_ID);
      },
    );
  }

  for (const role of NON_CALENDAR_ROLES) {
    it.each(ACTIONS)(`$name refuses a ${role}`, async ({ call, service }) => {
      givenAccess({ state: "active", operator: actor([role]) });

      const error = await refusalFrom(call);

      expect(error.kind).toBe("not_permitted");
      expect(service).not.toHaveBeenCalled();
    });
  }

  it.each(ACTIONS)(
    "$name refuses an operator holding no seat at all",
    async ({ call, service }) => {
      givenAccess({ state: "active", operator: actor([]) });

      const error = await refusalFrom(call);

      expect(error.kind).toBe("not_permitted");
      expect(service).not.toHaveBeenCalled();
    },
  );

  it("names the roles the action needs, and never the ones the caller holds", async () => {
    givenAccess({ state: "active", operator: actor(["treasurer", "media_secretary"]) });

    const error = await refusalFrom(() => createEventDraftAction(EMPTY_FORM_STATE, draftForm()));

    expect(error.message).toContain("President");
    expect(error.message).toContain("General Manager");
    // The seats the caller actually holds. `it_officer` is no longer one of
    // them, and could not be: LAN-124 put it in this grant, so the requirement
    // sentence names it — which is the action's need, not the caller's holding.
    expect(error.message).not.toMatch(/treasurer|media secretary/i);
  });

  it("refuses an attendance-recording coach, who reaches another part of the app", async () => {
    // The clarification's "other roles must not receive these actions merely
    // because they can access another part of the application", made concrete:
    // a Head Coach holds LAN-110's attendance capability and must still be
    // refused the calendar.
    givenAccess({ state: "active", operator: actor(["head_coach"]) });

    const error = await refusalFrom(() =>
      updateEventDraftAction(EMPTY_FORM_STATE, draftForm({ eventId: EVENT_ID })),
    );

    expect(error.kind).toBe("not_permitted");
  });

  it("ignores an actor supplied in the form body", async () => {
    givenAccess({ state: "active", operator: actor(["secretary"]) });

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
    givenAccess({ state: "active", operator: actor(["secretary"]) });
  });

  it("saves an unanswered attendance as optional rather than refusing it", async () => {
    // LAN-154 changed this deliberately. LAN-76 refused a draft whose
    // attendance was unanswered, so that an event never quietly claimed
    // attendance was expected. D15 makes name, type and date the minimum to
    // save, and W8 puts the answer on the type's template — so an unanswered
    // one saves as *optional*, which claims nothing, and the form shows the
    // template's answer selected rather than hiding a default.
    // It succeeds, so it redirects, so it throws — the mocked `redirect` above
    // mirrors the real one. What matters is what reached the service.
    await expect(
      createEventDraftAction(EMPTY_FORM_STATE, draftForm({ attendance: "" })),
    ).rejects.toThrow(/^REDIRECT:/);

    expect(vi.mocked(createEventDraft).mock.calls[0][1].isMandatory).toBe(false);
  });

  it("still refuses an attendance value that is neither word", async () => {
    // The control offers two answers. Anything else means it was tampered with,
    // and guessing what was meant is the wrong recovery.
    const state = await createEventDraftAction(
      EMPTY_FORM_STATE,
      draftForm({ attendance: "whenever" }),
    );

    expect(state.issues.map((issue) => issue.field)).toEqual(["attendance"]);
    expect(createEventDraft).not.toHaveBeenCalled();
  });

  it("hands every submitted value back so nothing is retyped", async () => {
    const state = await createEventDraftAction(
      EMPTY_FORM_STATE,
      draftForm({ name: "Wednesday practice, in the rain", attendance: "whenever" }),
    );

    expect(state.values?.name).toBe("Wednesday practice, in the rain");
    expect(state.values?.venue).toBe("Iffley Road Astro");
    expect(state.values?.deliveryMode).toBe("in_person");
  });
});

describe("a refusal from the service is shown, and an authorization refusal is not", () => {
  beforeEach(() => {
    givenAccess({ state: "active", operator: actor(["secretary"]) });
  });

  it("returns an illegal transition as a sentence the operator can act on", async () => {
    vi.mocked(updateEventDraft).mockRejectedValue(
      new InvalidTransition("Only a draft can be edited. This event is approved."),
    );

    const state = await updateEventDraftAction(EMPTY_FORM_STATE, draftForm({ eventId: EVENT_ID }));

    expect(state.error).toMatch(/Only a draft can be edited/);
  });

  it("keeps a form's entries when the service refuses the write", async () => {
    vi.mocked(createEventDraft).mockRejectedValue(new InvalidTransition("The season is closed."));

    const state = await createEventDraftAction(EMPTY_FORM_STATE, draftForm());

    expect(state.error).toBe("The season is closed.");
    expect(state.values?.name).toBe("Wednesday practice");
  });

  it("never renders a NotPermitted as a form message", async () => {
    vi.mocked(updateEventDraft).mockRejectedValue(new NotPermitted("You may not do that."));

    const error = await refusalFrom(() =>
      updateEventDraftAction(EMPTY_FORM_STATE, draftForm({ eventId: EVENT_ID })),
    );

    expect(error.kind).toBe("not_permitted");
  });

  it("lets an unexpected failure reach the error boundary as itself", async () => {
    const boom = new TypeError("something entirely different broke");
    vi.mocked(updateEventDraft).mockRejectedValue(boom);

    await expect(
      updateEventDraftAction(EMPTY_FORM_STATE, draftForm({ eventId: EVENT_ID })),
    ).rejects.toBe(boom);
  });
});

describe("where each action leaves the operator", () => {
  beforeEach(() => {
    givenAccess({ state: "active", operator: actor(["secretary"]) });
  });

  it("sends a new draft to its own page", async () => {
    await expect(createEventDraftAction(EMPTY_FORM_STATE, draftForm())).rejects.toThrow(
      `REDIRECT:/operate/events/${EVENT_ID}`,
    );
  });

  it("sends an edited draft back to the event", async () => {
    await expect(
      updateEventDraftAction(EMPTY_FORM_STATE, draftForm({ eventId: EVENT_ID })),
    ).rejects.toThrow(`REDIRECT:/operate/events/${EVENT_ID}`);
  });

  it("exports no action that submits an event, or asserts what happened to one", async () => {
    // The step Brian removed, and the three LAN-151 removed. A module-level
    // assertion, so re-adding any of them is a deliberate act rather than
    // something that creeps back with a screen.
    const actions = await import("./actions");
    for (const gone of [
      "submitEventAction",
      "withdrawEventSubmissionAction",
      "assertEventOutcomeAction",
      "correctEventOutcomeAction",
      "abandonEventDraftAction",
    ]) {
      expect(Object.keys(actions), gone).not.toContain(gone);
    }
  });
});

// ---------------------------------------------------------------------------
// Approval — LAN-77
// ---------------------------------------------------------------------------

describe("approveEventAction is the authorization boundary for releasing invitations", () => {
  it.each(CALENDAR_ROLES)("admits %s, whom Brian named as an approver", async (code) => {
    givenAccess({ state: "active", operator: actor([code]) });

    await expect(approveEventAction(EMPTY_TRANSITION_STATE, approvalForm())).rejects.toThrow(
      `REDIRECT:/operate/events/${EVENT_ID}?approved=1`,
    );
    expect(approveEvent).toHaveBeenCalledTimes(1);
  });

  it.each(NON_CALENDAR_ROLES)(
    "refuses %s in the action, not merely on the screen",
    async (code) => {
      givenAccess({ state: "active", operator: actor([code]) });

      const error = await refusalFrom(() =>
        approveEventAction(EMPTY_TRANSITION_STATE, approvalForm()),
      );

      expect(error).toBeInstanceOf(NotPermitted);
      expect(error.rule).toBe("capability:event_approval");
      // Nothing was approved, and nothing was even attempted.
      expect(approveEvent).not.toHaveBeenCalled();
    },
  );

  it("refuses an operator holding no role at all", async () => {
    givenAccess({ state: "active", operator: actor([]) });

    const error = await refusalFrom(() =>
      approveEventAction(EMPTY_TRANSITION_STATE, approvalForm()),
    );

    expect(error).toBeInstanceOf(NotPermitted);
    expect(approveEvent).not.toHaveBeenCalled();
  });

  it("takes the approver from the session and ignores an actor in the body", async () => {
    givenAccess({ state: "active", operator: actor(["president"]) });

    const forged = approvalForm();
    forged.set("actorPersonId", "99999999-9999-4999-8999-999999999999");
    forged.set("personId", "99999999-9999-4999-8999-999999999999");

    await expect(approveEventAction(EMPTY_TRANSITION_STATE, forged)).rejects.toThrow("REDIRECT:");

    // The approver recorded against the invitations is the session's person,
    // never anything the browser sent.
    expect(approveEvent).toHaveBeenCalledWith(OPERATOR_PERSON_ID, EVENT_ID);
  });

  it("sends no audience at all — it is already stored on the draft", async () => {
    givenAccess({ state: "active", operator: actor(["secretary"]) });

    // Even when a client posts a list, approval ignores it. There is therefore
    // no window in which a browser can widen the audience between the
    // confirmation screen and the write.
    await expect(
      approveEventAction(EMPTY_TRANSITION_STATE, approvalForm([PLAYER_KEY, COACH_KEY])),
    ).rejects.toThrow("REDIRECT:");

    expect(approveEvent).toHaveBeenCalledWith(OPERATOR_PERSON_ID, EVENT_ID);
  });

  it("surfaces E1b's refusal when the stored audience is empty", async () => {
    givenAccess({ state: "active", operator: actor(["president"]) });
    vi.mocked(approveEvent).mockRejectedValue(
      new ConstraintViolated(EMPTY_AUDIENCE_MESSAGE, { rule: "event_audience_is_non_empty" }),
    );

    const state = await approveEventAction(EMPTY_TRANSITION_STATE, approvalForm([]));

    // The confirmation screen shows UX-42 first. That is a courtesy, and this
    // proves it is not the boundary: a client that skips the screen reaches the
    // service and is refused by invariant E1b.
    expect(state.error).toBe(EMPTY_AUDIENCE_MESSAGE);
  });
});

/**
 * LAN-78. Approval is what makes distribution automatic — the issue's headline
 * criterion and the whole justification for there being no manual send control
 * anywhere.
 *
 * Independent review found this asserted by nothing: making the dispatch call
 * unreachable left the entire suite green, so the club could silently stop
 * inviting anybody and no test would notice.
 */
describe("approval is what starts distribution", () => {
  beforeEach(() => {
    vi.mocked(dispatchEventInvitations).mockResolvedValue({
      attempted: 3,
      accepted: 3,
      refused: 0,
      skipped: 0,
    });
  });

  it("dispatches the approved event's invitations, and only after approving", async () => {
    givenAccess({ state: "active", operator: actor(["president"]) });

    await expect(approveEventAction(EMPTY_TRANSITION_STATE, approvalForm())).rejects.toThrow(
      "REDIRECT:",
    );

    expect(dispatchEventInvitations).toHaveBeenCalledTimes(1);
    expect(dispatchEventInvitations).toHaveBeenCalledWith(EVENT_ID);
    expect(vi.mocked(approveEvent).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(dispatchEventInvitations).mock.invocationCallOrder[0],
    );
  });

  it("dispatches nothing when the approval itself was refused", async () => {
    givenAccess({ state: "active", operator: actor(["president"]) });
    vi.mocked(approveEvent).mockRejectedValue(
      new ConstraintViolated(EMPTY_AUDIENCE_MESSAGE, { rule: "event_audience_is_non_empty" }),
    );

    await approveEventAction(EMPTY_TRANSITION_STATE, approvalForm([]));

    expect(dispatchEventInvitations).not.toHaveBeenCalled();
  });

  it("dispatches nothing when the caller was refused", async () => {
    givenAccess({ state: "active", operator: actor(["head_coach"]) });

    await refusalFrom(() => approveEventAction(EMPTY_TRANSITION_STATE, approvalForm()));

    expect(dispatchEventInvitations).not.toHaveBeenCalled();
  });

  it("still reports the approval as successful when the provider is unreachable", async () => {
    givenAccess({ state: "active", operator: actor(["president"]) });
    vi.mocked(dispatchEventInvitations).mockRejectedValue(new Error("provider unreachable"));

    // The approval is committed. Turning a delivery failure into an error on
    // this action would tell the operator to try again at something that would
    // then be refused — the event is no longer a draft — while every job's own
    // failure is already durable and visible on the delivery screen.
    await expect(approveEventAction(EMPTY_TRANSITION_STATE, approvalForm())).rejects.toThrow(
      `REDIRECT:/operate/events/${EVENT_ID}?approved=1`,
    );
  });

  it("revalidates the delivery screen, so the new jobs are visible at once", async () => {
    givenAccess({ state: "active", operator: actor(["president"]) });

    await expect(approveEventAction(EMPTY_TRANSITION_STATE, approvalForm())).rejects.toThrow(
      "REDIRECT:",
    );

    expect(revalidatePath).toHaveBeenCalledWith(`/operate/events/${EVENT_ID}/delivery`);
  });
});

describe("saveEventAudienceAction stores the proposal, and guards it the same way", () => {
  it.each(CALENDAR_ROLES)("admits %s", async (code) => {
    givenAccess({ state: "active", operator: actor([code]) });

    await expect(saveEventAudienceAction(EMPTY_TRANSITION_STATE, approvalForm())).rejects.toThrow(
      `REDIRECT:/operate/events/${EVENT_ID}?step=review`,
    );

    expect(saveEventAudience).toHaveBeenCalledWith(OPERATOR_PERSON_ID, EVENT_ID, [
      PLAYER_KEY,
      COACH_KEY,
    ]);
  });

  it.each(NON_CALENDAR_ROLES)("refuses %s in the action", async (code) => {
    givenAccess({ state: "active", operator: actor([code]) });

    const error = await refusalFrom(() =>
      saveEventAudienceAction(EMPTY_TRANSITION_STATE, approvalForm()),
    );

    expect(error).toBeInstanceOf(NotPermitted);
    expect(error.rule).toBe("capability:event_approval");
    expect(saveEventAudience).not.toHaveBeenCalled();
  });

  it("passes the posted selection through unchanged, and resolves nothing itself", async () => {
    givenAccess({ state: "active", operator: actor(["president"]) });

    const keys = [COACH_KEY, PLAYER_KEY, PLAYER_KEY];
    await expect(
      saveEventAudienceAction(EMPTY_TRANSITION_STATE, approvalForm(keys)),
    ).rejects.toThrow("REDIRECT:");

    // Duplicates included: de-duplication is the service's job, done against a
    // catalogue read inside the transaction. An action that filtered here would
    // be a second implementation of the rule.
    expect(saveEventAudience).toHaveBeenCalledWith(OPERATOR_PERSON_ID, EVENT_ID, keys);
  });

  it("saves an empty selection rather than refusing it", async () => {
    givenAccess({ state: "active", operator: actor(["president"]) });

    // Clearing an audience is a thing an operator has to be able to do. E1b
    // bites at approval, not here.
    await expect(saveEventAudienceAction(EMPTY_TRANSITION_STATE, approvalForm([]))).rejects.toThrow(
      "REDIRECT:",
    );

    expect(saveEventAudience).toHaveBeenCalledWith(OPERATOR_PERSON_ID, EVENT_ID, []);
  });

  it("shows a refusal to change an approved event's audience as a sentence", async () => {
    givenAccess({ state: "active", operator: actor(["president"]) });
    vi.mocked(saveEventAudience).mockRejectedValue(
      new InvalidTransition("Only a draft's audience can be changed.", {
        rule: "event_audience_requires_draft",
      }),
    );

    const state = await saveEventAudienceAction(EMPTY_TRANSITION_STATE, approvalForm());

    expect(state.error).toBe("Only a draft's audience can be changed.");
  });

  it("shows a refused double submission as a sentence rather than a crash", async () => {
    givenAccess({ state: "active", operator: actor(["president"]) });
    vi.mocked(approveEvent).mockRejectedValue(
      new InvalidTransition("Only a draft can be approved. This event is already approved.", {
        rule: "event_approval_requires_draft",
      }),
    );

    const state = await approveEventAction(EMPTY_TRANSITION_STATE, approvalForm());

    expect(state.error).toBe("Only a draft can be approved. This event is already approved.");
  });

  it("rethrows a refusal rather than rendering it beside the button", async () => {
    givenAccess({ state: "active", operator: actor(["president"]) });
    vi.mocked(approveEvent).mockRejectedValue(
      new NotPermitted("You do not have access to this action.", { rule: "capability:x" }),
    );

    // A `NotPermitted` from below must not be flattened into form state: red
    // text beside a button reads as "fix your input", which is the wrong
    // instruction and hides an authorization event inside a validation failure.
    const error = await refusalFrom(() =>
      approveEventAction(EMPTY_TRANSITION_STATE, approvalForm()),
    );
    expect(error).toBeInstanceOf(NotPermitted);
  });
});

// ---------------------------------------------------------------------------
// LAN-80 — the occurrence assertion
// ---------------------------------------------------------------------------
// The occurrence assertion, and why nothing here tests it
// ---------------------------------------------------------------------------

/*
 * `assertEventOutcomeAction` and `correctEventOutcomeAction` had a describe
 * block each, and both are gone with the actions themselves.
 *
 * LAN-151 retired the occurrence assertion (D30, REQ-occurrence-retired): an
 * event has occurred when its date has passed and it was not cancelled, and no
 * surface offers *Mark occurred*, *Mark not held*, *Confirm what happened* or
 * *Correct this to not held*. That the module exports none of them is asserted
 * above, in "exports no action that submits an event, or asserts what happened
 * to one" — a module-level check, so their return would be visible in a diff.
 */
