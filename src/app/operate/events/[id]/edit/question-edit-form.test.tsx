// @vitest-environment jsdom
/**
 * The questions editor's confirmation — LAN-367, Brian 2026-09-16.
 *
 * A save that changes a question voids the answers it collected and asks the
 * people who gave them again, so the operator is told what the save will do
 * before it does it, and is offered D3's "This is a correction, keep answers"
 * tick for a wording fix that is genuinely a fix. A save that changes no
 * question shows no confirm at all.
 *
 * Driven through the real `useActionState`, by submitting the form and letting
 * the mocked action return what the server would: the confirmation is a state
 * the first submit produces, not a prop, and mocking the hook would prove
 * nothing about that.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../actions", () => ({ updateEventQuestionsAction: vi.fn() }));

import QuestionEditForm from "./question-edit-form";
import { EMPTY_FORM_STATE, type EventFormState } from "../../form-state";
import { updateEventQuestionsAction } from "../../actions";

const QUESTIONS = [
  { id: "q1", prompt: "Are you fit?", answerType: "text", isRequired: false, choices: "" },
];

function renderForm() {
  return render(
    <QuestionEditForm
      eventId="e1"
      eventTypeLabel="Practice"
      eventType="practice"
      initialQuestions={QUESTIONS}
      cancelHref="/operate/events/e1"
    />,
  );
}

async function submitReturning(state: EventFormState): Promise<void> {
  vi.mocked(updateEventQuestionsAction).mockResolvedValue(state);
  await act(async () => {
    fireEvent.submit(screen.getByTestId("event-questions-form"));
  });
}

describe("the confirmation", () => {
  it("is absent until a save has something to warn about", () => {
    renderForm();

    expect(screen.queryByTestId("event-questions-confirm")).toBeNull();
    expect(screen.queryByTestId("event-questions-correction")).toBeNull();
    expect(screen.getByTestId("event-questions-save").textContent).toBe("Save questions");
  });

  it("counts what the save will do, and offers the correction tick", async () => {
    const { container } = renderForm();

    await submitReturning({
      ...EMPTY_FORM_STATE,
      questionChange: {
        changedPrompts: ["Do you need a lift there and back?", "Shirt size?"],
        addedCount: 0,
        peopleToAsk: 14,
      },
    });

    expect(screen.getByTestId("event-questions-confirm").textContent).toBe(
      "2 questions changed, 14 people will be asked again.",
    );
    expect(screen.getByTestId("event-questions-save").textContent).toBe("Save and ask again");
    expect(container.textContent).toContain("This is a correction, keep answers");
    // The next submit carries the confirmation, so the save no longer stops.
    expect(container.querySelector('input[name="confirm"]')).not.toBeNull();
    expect(container.querySelector('input[name="correction"]')?.getAttribute("value")).toBe("0");
  });

  it("counts an added question too, in the club's own arithmetic", async () => {
    renderForm();

    await submitReturning({
      ...EMPTY_FORM_STATE,
      questionChange: { changedPrompts: [], addedCount: 1, peopleToAsk: 1 },
    });

    expect(screen.getByTestId("event-questions-confirm").textContent).toBe(
      "1 question added, 1 person will be asked again.",
    );
  });
});
