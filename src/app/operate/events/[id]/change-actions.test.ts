// @vitest-environment node
/**
 * `editApprovedEventAction` — LAN-419's one save for an approved event.
 *
 * Brian, on the 2026-09-22 call: "for some reason when the system made its
 * decision edit event and edit questions were two buttons. Why? No idea why…
 * Edit event and edit question should be in one. That seems better, and if I
 * go to edit an event, it also includes the questions."
 *
 * This file is the questions half of `updateEventQuestionsAction`'s own suite,
 * moved onto the action that replaced it, plus what composition adds: that a
 * questions-only save does not write a schedule change nobody made, that a
 * details-only save does not claim the questions were edited, and that neither
 * half is written until the whole save is confirmed.
 *
 * Every call goes straight to the action. A server action is a POST endpoint,
 * and nothing about what a screen offered is under test here. The service
 * layer is mocked; the writes themselves are proved against the real database
 * in `src/lib/services/events.test.ts` and
 * `src/lib/services/event-amendment.test.ts`.
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
vi.mock("@/lib/services/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/events")>();
  return {
    ...actual,
    readEventQuestions: vi.fn(),
    updateEventQuestions: vi.fn(),
    previewEventQuestionChanges: vi.fn(),
  };
});
vi.mock("@/lib/services/event-amendment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/event-amendment")>();
  return { ...actual, amendApprovedEvent: vi.fn() };
});

import { ConstraintViolated, NotPermitted } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import {
  previewEventQuestionChanges,
  readEventQuestions,
  updateEventQuestions,
} from "@/lib/services/events";
import { amendApprovedEvent, NOTHING_CHANGED_RULE } from "@/lib/services/event-amendment";
import { EMPTY_FORM_STATE } from "../form-state";
import { editApprovedEventAction } from "./change-actions";

const OPERATOR_PERSON_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const TEMPLATE_ID = "55555555-5555-4555-8555-555555555555";
const STORED_QUESTION_ID = "44444444-4444-4444-8444-444444444444";

function actor(roleCodes: string[] = ["president"]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: OPERATOR_PERSON_ID,
    displayName: "Rowan Ashdown",
    roleCodes,
    isActive: true,
  };
}

/** The stored question, in the shape `readEventQuestions` returns it. */
function storedQuestion(overrides: { prompt?: string } = {}) {
  return {
    id: STORED_QUESTION_ID,
    prompt: overrides.prompt ?? "Are you fit to play?",
    answerType: "boolean" as const,
    isRequired: false,
    choices: null,
    fromTemplate: false,
    position: 1,
  };
}

/**
 * What the one form posts — the amendable details and the question cards
 * together, which is the whole point of LAN-419. The details default to the
 * stored ones, so a test that only edits a question posts an amendment with an
 * empty diff, exactly as the screen does.
 */
function editForm(
  overrides: {
    prompt?: string;
    questionId?: string;
    venue?: string;
    confirm?: string;
    correction?: string;
    questions?: boolean;
  } = {},
): FormData {
  const form = new FormData();
  form.set("eventId", EVENT_ID);
  form.set("name", "Tuesday practice");
  form.set("templateId", TEMPLATE_ID);
  form.set("scheduledOn", "2026-10-06");
  form.set("startsAt", "19:00");
  form.set("endsAt", "21:00");
  form.set("deliveryMode", "in_person");
  form.set("venue", overrides.venue ?? "Uni Parks");
  form.set("description", "");
  form.set("requiredEquipment", "");
  form.set("joiningUrl", "");
  form.set("attendance", "optional");
  if (overrides.confirm) form.set("confirm", overrides.confirm);
  if (overrides.correction) form.set("correction", overrides.correction);

  if (overrides.questions !== false) {
    form.set("questionsPresent", "1");
    form.append("questionId", overrides.questionId ?? STORED_QUESTION_ID);
    form.append("questionPrompt", overrides.prompt ?? "Are you fit to play?");
    form.append("questionAnswerType", "boolean");
    form.append("questionRequired", "optional");
    form.append("questionChoices", "");
    form.append("questionFromTemplate", "false");
  }
  return form;
}

/** The amendment refuses an empty diff — what a questions-only save always produces. */
function givenNothingToAmend(): void {
  vi.mocked(amendApprovedEvent).mockRejectedValue(
    new ConstraintViolated("Nothing has changed, so there is nothing to save.", {
      rule: NOTHING_CHANGED_RULE,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: actor() });
  vi.mocked(readEventQuestions).mockResolvedValue([storedQuestion()] as never);
  vi.mocked(amendApprovedEvent).mockResolvedValue({} as never);
  vi.mocked(updateEventQuestions).mockResolvedValue({} as never);
  vi.mocked(previewEventQuestionChanges).mockResolvedValue({
    changedPrompts: [],
    addedCount: 0,
    peopleToAsk: 0,
  });
});

describe("who may save", () => {
  it("refuses a seat that holds neither capability, before either service is called", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: actor(["treasurer"]),
    });

    await expect(editApprovedEventAction(EMPTY_FORM_STATE, editForm())).rejects.toBeInstanceOf(
      NotPermitted,
    );
    expect(amendApprovedEvent).not.toHaveBeenCalled();
    expect(updateEventQuestions).not.toHaveBeenCalled();
  });

  it("admits a seat that holds both, which every calendar role does today", async () => {
    await expect(editApprovedEventAction(EMPTY_FORM_STATE, editForm())).rejects.toThrow(
      /^REDIRECT:/,
    );
  });
});

describe("the details half", () => {
  it("amends against the resolved operator, never anything the form claims", async () => {
    await expect(
      editApprovedEventAction(EMPTY_FORM_STATE, editForm({ venue: "Marston" })),
    ).rejects.toThrow(/^REDIRECT:/);

    expect(vi.mocked(amendApprovedEvent).mock.calls[0][0]).toBe(OPERATOR_PERSON_ID);
    expect(vi.mocked(amendApprovedEvent).mock.calls[0][1]).toBe(EVENT_ID);
    expect(vi.mocked(amendApprovedEvent).mock.calls[0][2].venue).toBe("Marston");
  });

  it("leaves the questions alone when only the details moved", async () => {
    await expect(
      editApprovedEventAction(EMPTY_FORM_STATE, editForm({ venue: "Marston" })),
    ).rejects.toThrow(/^REDIRECT:/);

    // `updateEventQuestions` writes an audit row on every call, and "the
    // operator changed the questions" is not true of a venue change.
    expect(updateEventQuestions).not.toHaveBeenCalled();
  });

  it("shows a refused amendment as a sentence rather than a crash", async () => {
    vi.mocked(amendApprovedEvent).mockRejectedValue(
      new ConstraintViolated("The kind of event cannot change on an amendment.", {
        rule: "event_amendment_cannot_change_type",
      }),
    );

    const state = await editApprovedEventAction(EMPTY_FORM_STATE, editForm({ venue: "Marston" }));

    expect(state.error).toContain("cannot change");
    expect(updateEventQuestions).not.toHaveBeenCalled();
  });
});

/**
 * LAN-318's rule, unchanged: an approved event's questions are updated in
 * place, nothing is sent for a wording change, and none can be removed. These
 * are that suite's assertions, against the action that now carries them.
 */
describe("the questions half", () => {
  it("passes each stored question's id through, so the set is updated and not rewritten", async () => {
    givenNothingToAmend();

    await expect(
      editApprovedEventAction(EMPTY_FORM_STATE, editForm({ prompt: "Are you fit?" })),
    ).rejects.toThrow(/^REDIRECT:/);

    expect(vi.mocked(updateEventQuestions).mock.calls[0][1]).toBe(EVENT_ID);
    expect(vi.mocked(updateEventQuestions).mock.calls[0][2]).toEqual([
      {
        id: STORED_QUESTION_ID,
        prompt: "Are you fit?",
        answerType: "boolean",
        isRequired: false,
        choices: null,
        fromTemplate: false,
      },
    ]);
  });

  it("reads a card with no id as a new question", async () => {
    givenNothingToAmend();

    await expect(
      editApprovedEventAction(EMPTY_FORM_STATE, editForm({ questionId: "" })),
    ).rejects.toThrow(/^REDIRECT:/);

    expect(vi.mocked(updateEventQuestions).mock.calls[0][2][0].id).toBeNull();
  });

  it("shows a refused removal as a sentence rather than a crash", async () => {
    givenNothingToAmend();
    vi.mocked(updateEventQuestions).mockRejectedValue(
      new ConstraintViolated(
        "A question can be reworded or reordered, but not removed, once the event has been approved.",
        { rule: "event_question_removal_after_approval" },
      ),
    );

    const state = await editApprovedEventAction(
      EMPTY_FORM_STATE,
      editForm({ prompt: "Are you fit?" }),
    );

    expect(state.error).toContain("not removed");
  });

  it("says which question is wrong rather than reaching either service", async () => {
    const state = await editApprovedEventAction(EMPTY_FORM_STATE, editForm({ prompt: "  " }));

    expect(state.questionIssues).toEqual([
      { index: 0, message: "Write the question, or remove it." },
    ]);
    expect(updateEventQuestions).not.toHaveBeenCalled();
    expect(amendApprovedEvent).not.toHaveBeenCalled();
  });
});

/**
 * LAN-367, Brian 2026-09-16. A save that changes a question voids the answers
 * it collected and asks the people who gave them again, so the operator
 * confirms it first — and D3's tick is what says "this was a correction",
 * keeping the answers and telling nobody. LAN-419 puts that confirmation
 * ahead of *both* writes, so abandoning it changes neither.
 */
describe("the confirmation", () => {
  beforeEach(() => {
    vi.mocked(previewEventQuestionChanges).mockResolvedValue({
      changedPrompts: ["Are you fit to play?"],
      addedCount: 0,
      peopleToAsk: 14,
    });
  });

  it("asks the operator to confirm before voiding anybody's answers", async () => {
    const state = await editApprovedEventAction(
      EMPTY_FORM_STATE,
      editForm({ prompt: "Are you fit?" }),
    );

    expect(state.questionChange).toEqual({
      changedPrompts: ["Are you fit to play?"],
      addedCount: 0,
      peopleToAsk: 14,
    });
    expect(updateEventQuestions).not.toHaveBeenCalled();
  });

  it("writes neither half until it is answered — the details wait with the questions", async () => {
    await editApprovedEventAction(
      EMPTY_FORM_STATE,
      editForm({ prompt: "Are you fit?", venue: "Marston" }),
    );

    expect(amendApprovedEvent).not.toHaveBeenCalled();
    expect(updateEventQuestions).not.toHaveBeenCalled();
  });

  it("saves as a correction when the operator ticks it, and never asks twice", async () => {
    givenNothingToAmend();

    await expect(
      editApprovedEventAction(
        EMPTY_FORM_STATE,
        editForm({ prompt: "Are you fit?", confirm: "1", correction: "1" }),
      ),
    ).rejects.toThrow(/^REDIRECT:/);

    // The preview is not consulted a second time: the operator has answered.
    expect(previewEventQuestionChanges).not.toHaveBeenCalled();
    expect(vi.mocked(updateEventQuestions).mock.calls[0][3]).toEqual({ correction: true });
  });

  it("never asks at all when the questions were not touched", async () => {
    await expect(
      editApprovedEventAction(EMPTY_FORM_STATE, editForm({ venue: "Marston" })),
    ).rejects.toThrow(/^REDIRECT:/);

    expect(previewEventQuestionChanges).not.toHaveBeenCalled();
  });
});

/**
 * The one thing composing the two halves had to decide. A questions-only save
 * reaches the amendment with an empty diff, and the amendment is right to
 * refuse an empty one — it would record a schedule change nobody made and hold
 * every queued message for it.
 */
describe("a questions-only save", () => {
  it("saves the questions and writes no amendment", async () => {
    givenNothingToAmend();

    await expect(
      editApprovedEventAction(EMPTY_FORM_STATE, editForm({ prompt: "Are you fit?" })),
    ).rejects.toThrow(/^REDIRECT:/);

    expect(updateEventQuestions).toHaveBeenCalledTimes(1);
  });

  it("still refuses when neither half changed — that empty save is empty", async () => {
    givenNothingToAmend();

    const state = await editApprovedEventAction(EMPTY_FORM_STATE, editForm());

    expect(state.error).toContain("Nothing has changed");
    expect(updateEventQuestions).not.toHaveBeenCalled();
  });
});
