/**
 * The question vocabulary and its rules — LAN-154, amendment W4-A1.
 *
 * Pure, so this file needs no database and runs in the `unit` project. What the
 * rules do to real rows is proved in `event-questions.test.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  describeQuestionAnswer,
  describeQuestionCount,
  joinQuestionChoices,
  MAX_QUESTION_CHOICES,
  MAX_QUESTION_PROMPT_LENGTH,
  QUESTION_ANSWER_TYPES,
  splitQuestionChoices,
  validateEventQuestions,
  type RawEventQuestion,
} from "./event-questions-input";

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

describe("the three answer types, and no others (D66)", () => {
  it("offers exactly free text, yes/no and pick from a list", () => {
    expect([...QUESTION_ANSWER_TYPES]).toEqual(["text", "boolean", "choice"]);
  });

  it("refuses an answer type outside the three", () => {
    const outcome = validateEventQuestions([question({ answerType: "ranking" })]);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.issues[0]).toEqual({
      index: 0,
      message: "Choose how this question is answered.",
    });
  });
});

describe("each question is independently required or optional (D67)", () => {
  it("carries a required flag per question rather than per event", () => {
    const outcome = validateEventQuestions([
      question({ prompt: "Are you fit?", required: "required" }),
      question({ prompt: "Anything else?", answerType: "text", required: "optional" }),
    ]);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.map((entry) => entry.isRequired)).toEqual([true, false]);
  });

  it("treats anything that is not the word 'required' as optional", () => {
    const outcome = validateEventQuestions([question({ required: "" })]);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value[0].isRequired).toBe(false);
  });
});

describe("a pick-from-a-list question has to offer a list", () => {
  it("refuses fewer than two options, because one option is not a choice", () => {
    const outcome = validateEventQuestions([question({ answerType: "choice", choices: "Medium" })]);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.issues[0].message).toContain("at least two options");
  });

  it("accepts a comma-separated list and stores it in order", () => {
    const outcome = validateEventQuestions([
      question({ prompt: "Which shirt size?", answerType: "choice", choices: "S, M, L, XL" }),
    ]);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value[0].choices).toEqual(["S", "M", "L", "XL"]);
  });

  it("keeps choices null for every other answer type, as the schema requires", () => {
    // `event_questions_choices_match_type` refuses a non-choice question that
    // carries options, so a stray value in the field must not travel.
    const outcome = validateEventQuestions([question({ answerType: "text", choices: "S, M, L" })]);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value[0].choices).toBeNull();
  });

  it("refuses more options than anybody can read on a phone", () => {
    const tooMany = Array.from({ length: MAX_QUESTION_CHOICES + 1 }, (_, i) => `Option ${i}`);
    const outcome = validateEventQuestions([
      question({ answerType: "choice", choices: tooMany.join(", ") }),
    ]);

    expect(outcome.ok).toBe(false);
  });

  it("drops a trailing comma rather than offering an empty answer", () => {
    expect(splitQuestionChoices("S, M, L,")).toEqual(["S", "M", "L"]);
  });

  it("drops a repeated option rather than offering it twice", () => {
    expect(splitQuestionChoices("S, M, S")).toEqual(["S", "M"]);
  });

  it("round-trips through the form's single line", () => {
    expect(splitQuestionChoices(joinQuestionChoices(["S", "M", "L"]))).toEqual(["S", "M", "L"]);
  });
});

describe("the list as a whole", () => {
  it("refuses a blank question rather than saving an unanswerable one", () => {
    const outcome = validateEventQuestions([question({ prompt: "   " })]);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.issues[0].message).toContain("Write the question");
  });

  it("refuses the same question twice, as the database would", () => {
    // `event_questions_unique_per_event` says the same thing. Saying it here is
    // what turns an integrity error into a sentence beside the second card.
    const outcome = validateEventQuestions([
      question({ prompt: "Are you coming?" }),
      question({ prompt: "are you COMING?" }),
    ]);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.issues).toEqual([
      { index: 1, message: "This question is already being asked." },
    ]);
  });

  it("collects every issue rather than stopping at the first", () => {
    const outcome = validateEventQuestions([
      question({ prompt: "" }),
      question({ prompt: "Fine", answerType: "nonsense" }),
    ]);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.issues.map((issue) => issue.index)).toEqual([0, 1]);
  });

  it("refuses a prompt longer than the bound", () => {
    const outcome = validateEventQuestions([
      question({ prompt: "a".repeat(MAX_QUESTION_PROMPT_LENGTH + 1) }),
    ]);

    expect(outcome.ok).toBe(false);
  });

  it("carries the template mark through, because it decides what may be overwritten", () => {
    const outcome = validateEventQuestions([
      question({ fromTemplate: "true" }),
      question({ prompt: "Mine", fromTemplate: "false" }),
    ]);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.map((entry) => entry.fromTemplate)).toEqual([true, false]);
  });

  it("accepts an event that asks nothing extra", () => {
    const outcome = validateEventQuestions([]);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value).toEqual([]);
  });
});

describe("how a question reads to the person being asked it", () => {
  it("shows a choice question's own options rather than its type", () => {
    expect(describeQuestionAnswer({ answerType: "choice", choices: ["S", "M"] })).toBe("S · M");
  });

  it("names the type for the other two", () => {
    expect(describeQuestionAnswer({ answerType: "boolean", choices: null })).toBe("Yes / No");
    expect(describeQuestionAnswer({ answerType: "text", choices: null })).toBe("Free text");
  });

  it("counts questions in the club's words, and says None for none", () => {
    expect(describeQuestionCount(0)).toBe("None");
    expect(describeQuestionCount(1)).toBe("1 question");
    expect(describeQuestionCount(3)).toBe("3 questions");
  });
});
