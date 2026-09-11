// What a question on an event *is*, and the rules one submitted question has to satisfy — LAN-154,
// W4-A1. Pure, like event-input.ts; re-exported by event-questions.ts. D66/D67: three answer types.
// Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE

import { trimmed } from "./event-input";

export type QuestionAnswerType = "text" | "boolean" | "choice"; // public.question_answer_type, in full

export const QUESTION_ANSWER_TYPES: readonly QuestionAnswerType[] = Object.freeze([
  "text",
  "boolean",
  "choice",
]);

// D66, in the club's words — C5: "Yes"/"No" capitalised the same way as the other two labels.
export const QUESTION_ANSWER_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  text: "Free text",
  boolean: "Yes / No",
  choice: "Pick from a list",
});

export const MAX_QUESTION_CHOICES = 20; // a bound, not a product rule — far above anything asked, far below a paste accident

export const MAX_QUESTION_PROMPT_LENGTH = 200; // same reasoning: a bound, not a rule

export interface RawEventQuestion {
  prompt?: string | null;
  answerType?: string | null;
  required?: string | null; // "required" or anything else, which is optional
  choices?: string | null; // comma-separated, for `choice` only
  fromTemplate?: string | null; // "true" when this question arrived from the type's template (D42)
}

export interface EventQuestionInput {
  prompt: string;
  answerType: QuestionAnswerType;
  isRequired: boolean;
  choices: string[] | null; // non-null for choice, null otherwise — the schema requires it
  fromTemplate: boolean; // D42: marked on screen, removable per event regardless
}

export interface QuestionIssue {
  index: number; // the question's position in the submitted list, so the form can point at it
  message: string;
}

export type EventQuestionsValidation =
  { ok: true; value: EventQuestionInput[] } | { ok: false; issues: QuestionIssue[] };

// Blank entries dropped, not refused — a trailing comma is a typing artefact.
export function splitQuestionChoices(written: string | null | undefined): string[] {
  const seen = new Set<string>();
  const choices: string[] = [];
  for (const part of trimmed(written).split(",")) {
    const choice = part.trim();
    if (choice === "" || seen.has(choice)) continue;
    seen.add(choice);
    choices.push(choice);
  }
  return choices;
}

/** The inverse, for putting a stored question back into the form. */
export function joinQuestionChoices(choices: readonly string[] | null | undefined): string {
  return (choices ?? []).join(", ");
}

// The whole list at once, not one question — a duplicate prompt is a property of the pair, and
// order is the order a player is asked. Collects every issue (shared state contract).
export function validateEventQuestions(raw: readonly RawEventQuestion[]): EventQuestionsValidation {
  const issues: QuestionIssue[] = [];
  const value: EventQuestionInput[] = [];
  const prompts = new Set<string>();

  raw.forEach((question, index) => {
    const prompt = trimmed(question.prompt);
    if (prompt === "") {
      issues.push({ index, message: "Write the question, or remove it." });
      return;
    }
    if (prompt.length > MAX_QUESTION_PROMPT_LENGTH) {
      issues.push({
        index,
        message: `Keep the question under ${MAX_QUESTION_PROMPT_LENGTH} characters.`,
      });
      return;
    }

    const lowered = prompt.toLowerCase();
    if (prompts.has(lowered)) {
      issues.push({ index, message: "This question is already being asked." });
      return;
    }
    prompts.add(lowered);

    const answerTypeRaw = trimmed(question.answerType);
    if (!QUESTION_ANSWER_TYPES.includes(answerTypeRaw as QuestionAnswerType)) {
      issues.push({ index, message: "Choose how this question is answered." });
      return;
    }
    const answerType = answerTypeRaw as QuestionAnswerType;

    let choices: string[] | null = null;
    if (answerType === "choice") {
      choices = splitQuestionChoices(question.choices);
      if (choices.length < 2) {
        issues.push({ index, message: "Give at least two options, separated by commas." });
        return;
      }
      if (choices.length > MAX_QUESTION_CHOICES) {
        issues.push({ index, message: `Offer at most ${MAX_QUESTION_CHOICES} options.` });
        return;
      }
    }

    value.push({
      prompt,
      answerType,
      isRequired: trimmed(question.required) === "required",
      choices,
      fromTemplate: trimmed(question.fromTemplate) === "true",
    });
  });

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value };
}

// One function, not two — docs/ux/standards.md rule 7: the approval review and the template screen
// both answer "what does this question offer?" identically.
export function describeQuestionAnswer(question: {
  answerType: QuestionAnswerType;
  choices: readonly string[] | null;
}): string {
  if (question.answerType === "choice" && question.choices && question.choices.length > 0) {
    return question.choices.join(" · ");
  }
  return QUESTION_ANSWER_TYPE_LABELS[question.answerType] ?? question.answerType;
}

/** "3 questions" · "1 question" · "None" — the template list's column. */
export function describeQuestionCount(count: number): string {
  if (count === 0) return "None";
  return count === 1 ? "1 question" : `${count} questions`;
}
