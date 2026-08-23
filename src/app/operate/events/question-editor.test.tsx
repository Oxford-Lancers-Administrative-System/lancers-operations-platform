/**
 * Writing an event's questions — LAN-154, amendment W4-A1.
 *
 * ## Every control is driven, and the mechanism is what is asserted
 *
 * A LAN-153 finding is the reason this file is written the way it is: a control
 * that updated the URL and moved nothing looked live in the address bar and
 * passed a screenshot. So nothing below asserts that a prop was passed or that a
 * button exists. Each test presses the real control and then reads **what the
 * form would post** — the hidden inputs — because that is the only thing that
 * reaches the service.
 *
 * The component is controlled by its parent, so these tests wrap it in the
 * smallest honest stand-in for `EventForm`: something that holds the list.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";

vi.mock("server-only", () => ({}));

import type { RawEventQuestion } from "@/lib/services/event-questions-input";
import QuestionEditor from "./question-editor";

function question(overrides: Partial<RawEventQuestion> = {}): RawEventQuestion {
  return {
    prompt: "Can you get yourself to the ground?",
    answerType: "boolean",
    required: "optional",
    choices: "",
    fromTemplate: "false",
    ...overrides,
  };
}

/** Holds the list, exactly as the event form and the template editor do. */
function Harness({ initial = [] as RawEventQuestion[] }) {
  const [questions, setQuestions] = useState<RawEventQuestion[]>(initial);
  return (
    <form data-testid="harness">
      <QuestionEditor
        questions={questions}
        onChange={setQuestions}
        eventTypeLabel="Practice"
        issues={[]}
      />
    </form>
  );
}

/** What the form would actually post, in order. */
function posted(name: string): string[] {
  return [
    ...document.querySelectorAll<HTMLInputElement>(`input[type="hidden"][name="${name}"]`),
  ].map((input) => input.value);
}

function cards(): HTMLElement[] {
  return screen.queryAllByTestId("question-card");
}

describe("adding a question", () => {
  it("adds a card, and a payload row with it", () => {
    render(<Harness />);
    expect(cards()).toHaveLength(0);

    fireEvent.click(screen.getByTestId("add-question"));

    expect(cards()).toHaveLength(1);
    expect(posted("questionPrompt")).toEqual([""]);
  });

  it("posts what was typed into it", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("add-question"));

    fireEvent.change(screen.getByRole("textbox", { name: /Question/ }), {
      target: { value: "Need a lift?" },
    });

    expect(posted("questionPrompt")).toEqual(["Need a lift?"]);
  });

  it("says what an event with no questions is, rather than showing an empty list", () => {
    render(<Harness />);

    expect(screen.getByTestId("no-questions")).toBeVisible();
  });
});

describe("removing a question", () => {
  it("takes the card and its payload row away together", () => {
    render(
      <Harness initial={[question({ prompt: "Keep me" }), question({ prompt: "Drop me" })]} />,
    );

    fireEvent.click(within(cards()[1]).getByTestId("remove-question"));

    expect(posted("questionPrompt")).toEqual(["Keep me"]);
  });

  it("removes a template-supplied question, which is what D42 requires", () => {
    // "Templates carry default questions ... and may be removed per event."
    render(<Harness initial={[question({ prompt: "From the type", fromTemplate: "true" })]} />);

    fireEvent.click(within(cards()[0]).getByTestId("remove-question"));

    expect(posted("questionPrompt")).toEqual([]);
    // And the section still posts its marker, so the service is told the event
    // now asks nothing rather than being left to keep what it had.
    expect(posted("questionsPresent")).toEqual(["1"]);
  });
});

describe("the order is the order a player is asked", () => {
  it("really moves a question up, in the payload and not only on screen", () => {
    render(
      <Harness
        initial={[
          question({ prompt: "First" }),
          question({ prompt: "Second" }),
          question({ prompt: "Third" }),
        ]}
      />,
    );

    fireEvent.click(within(cards()[2]).getByTestId("move-question-up"));

    expect(posted("questionPrompt")).toEqual(["First", "Third", "Second"]);
  });

  it("really moves one down", () => {
    render(<Harness initial={[question({ prompt: "First" }), question({ prompt: "Second" })]} />);

    fireEvent.click(within(cards()[0]).getByTestId("move-question-down"));

    expect(posted("questionPrompt")).toEqual(["Second", "First"]);
  });

  it("carries each question's own answer type and flag with it when it moves", () => {
    // The five fields are parallel arrays. A reorder that moved the prompts and
    // not the rest would silently give one question another's answer type.
    render(
      <Harness
        initial={[
          question({ prompt: "First", answerType: "text", required: "required" }),
          question({ prompt: "Second", answerType: "boolean", required: "optional" }),
        ]}
      />,
    );

    fireEvent.click(within(cards()[0]).getByTestId("move-question-down"));

    expect(posted("questionPrompt")).toEqual(["Second", "First"]);
    expect(posted("questionAnswerType")).toEqual(["boolean", "text"]);
    expect(posted("questionRequired")).toEqual(["optional", "required"]);
  });

  it("cannot move the first one up or the last one down", () => {
    render(<Harness initial={[question({ prompt: "First" }), question({ prompt: "Second" })]} />);

    expect(within(cards()[0]).getByTestId("move-question-up")).toBeDisabled();
    expect(within(cards()[1]).getByTestId("move-question-down")).toBeDisabled();
  });

  it("names each arrow for the question it moves, so a screen reader can use it", () => {
    render(<Harness initial={[question({ prompt: "First" }), question({ prompt: "Second" })]} />);

    expect(
      within(cards()[1]).getByRole("button", { name: "Move question 2 earlier" }),
    ).toBeEnabled();
  });
});

describe("the three answer types (D66)", () => {
  it("offers options only for a pick-from-a-list question", () => {
    render(<Harness initial={[question({ answerType: "boolean" })]} />);

    expect(screen.queryByRole("textbox", { name: /Options/ })).toBeNull();
  });

  it("asks for the options as soon as the type becomes a list", () => {
    render(<Harness initial={[question({ answerType: "boolean" })]} />);

    // Driven through the combobox an operator actually uses, not through the
    // hidden input MUI posts. Writing to that input sets a DOM value without
    // going through React at all, so a test that then read it back would be
    // reading its own keystroke — which is exactly the class of false pass the
    // LAN-153 finding was about. This version fails if the control is inert.
    fireEvent.mouseDown(within(cards()[0]).getByRole("combobox", { name: "Answer" }));
    fireEvent.click(screen.getByRole("option", { name: "Pick from a list" }));

    expect(screen.getByRole("textbox", { name: /Options/ })).toBeVisible();
    expect(posted("questionAnswerType")).toEqual(["choice"]);
  });

  it("stops asking for options when the type stops being a list", () => {
    render(<Harness initial={[question({ answerType: "choice", choices: "S, M" })]} />);

    fireEvent.mouseDown(within(cards()[0]).getByRole("combobox", { name: "Answer" }));
    fireEvent.click(screen.getByRole("option", { name: "Yes / no" }));

    expect(screen.queryByRole("textbox", { name: /Options/ })).toBeNull();
    expect(posted("questionAnswerType")).toEqual(["boolean"]);
  });

  it("really changes whether a question must be answered (D67)", () => {
    render(<Harness initial={[question({ required: "optional" })]} />);

    fireEvent.mouseDown(within(cards()[0]).getByRole("combobox", { name: "Answering it" }));
    fireEvent.click(screen.getByRole("option", { name: "Required" }));

    expect(posted("questionRequired")).toEqual(["required"]);
  });

  it("posts the options exactly as they were written", () => {
    render(<Harness initial={[question({ answerType: "choice", choices: "S, M, L" })]} />);

    expect(posted("questionChoices")).toEqual(["S, M, L"]);
  });
});

describe("a question that came with the type is marked (D42)", () => {
  it("says which template supplied it", () => {
    render(<Harness initial={[question({ fromTemplate: "true" })]} />);

    expect(screen.getByTestId("from-template-chip").textContent).toBe("From the Practice template");
  });

  it("marks nothing on a question the operator wrote", () => {
    render(<Harness initial={[question({ fromTemplate: "false" })]} />);

    expect(screen.queryByTestId("from-template-chip")).toBeNull();
  });

  it("carries the mark into the payload, because it decides what a template may overwrite", () => {
    render(
      <Harness
        initial={[
          question({ prompt: "Theirs", fromTemplate: "true" }),
          question({ prompt: "Mine", fromTemplate: "false" }),
        ]}
      />,
    );

    expect(posted("questionFromTemplate")).toEqual(["true", "false"]);
  });
});

describe("the questions section is always declared", () => {
  it("posts its marker even with no questions at all", () => {
    // Without it, an event that asks nothing is indistinguishable from a
    // submission that was not about the questions — and removing the last
    // question would silently do nothing.
    render(<Harness />);

    expect(posted("questionsPresent")).toEqual(["1"]);
  });
});
