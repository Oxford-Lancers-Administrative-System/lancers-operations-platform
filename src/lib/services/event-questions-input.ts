/**
 * What a question on an event *is*, and the rules one submitted question has to
 * satisfy. LAN-154, amendment W4-A1.
 *
 * Pure, for the same structural reason `event-input.ts` is pure and is
 * documented as such: the create-and-edit form is a Client Component, and the
 * module that reaches the database drags `pg` into the browser bundle. So the
 * vocabulary and the rules live here and `event-questions.ts` re-exports them.
 *
 * ## Questions have no screen of their own, and that is a decision
 *
 * Brian, 2026-08-21: "This is part of the create event workflow. It's not a
 * separate screen that needs its own thing ... it's ingrained in the process."
 * Writing an event and deciding what to ask the people invited to it are one
 * act. Everything here therefore serves the event form, the approval review and
 * the template — three surfaces, one vocabulary.
 *
 * ## Three answer types, and each question decides for itself
 *
 * D66 fixes the three: free text, yes/no, pick from a list. D67 gives each
 * question its own required flag, so "are you coming" being required says
 * nothing about "which shirt size do you need".
 */

import { optional, trimmed } from "./event-input";

/**
 * `public.question_answer_type`, in full.
 *
 * The stored values are the database's (`text`, `boolean`, `choice`); the words
 * the club uses for them are `QUESTION_ANSWER_TYPE_LABELS`. Nothing outside
 * this module writes either list.
 */
export type QuestionAnswerType = "text" | "boolean" | "choice";

export const QUESTION_ANSWER_TYPES: readonly QuestionAnswerType[] = Object.freeze([
  "text",
  "boolean",
  "choice",
]);

/** D66, in the club's words rather than the schema's. */
export const QUESTION_ANSWER_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  text: "Free text",
  boolean: "Yes / no",
  choice: "Pick from a list",
});

/**
 * The most options a single question may offer.
 *
 * A bound rather than a product rule: a list nobody can read on a phone is a
 * question nobody answers, and an unbounded array is an unbounded row. Twenty
 * is far above anything the club has ever asked and far below a paste accident.
 */
export const MAX_QUESTION_CHOICES = 20;

/** The longest a prompt may be. Same reasoning: a bound, not a rule. */
export const MAX_QUESTION_PROMPT_LENGTH = 200;

/** One question as the form posted it — every field a string. */
export interface RawEventQuestion {
  prompt?: string | null;
  answerType?: string | null;
  /** `"required"` or anything else, which is optional. */
  required?: string | null;
  /** Comma-separated, for `choice` only. */
  choices?: string | null;
  /** `"true"` when this question arrived from the type's template (D42). */
  fromTemplate?: string | null;
}

/** The same question, checked, in the shape a row needs. */
export interface EventQuestionInput {
  prompt: string;
  answerType: QuestionAnswerType;
  isRequired: boolean;
  /** Non-null for `choice`, null for everything else — the schema requires it. */
  choices: string[] | null;
  /** D42. Marked on screen, and removable per event regardless. */
  fromTemplate: boolean;
}

/** One question's correction, addressed to the question rather than to a field. */
export interface QuestionIssue {
  /** The question's position in the submitted list, so the form can point at it. */
  index: number;
  message: string;
}

export type EventQuestionsValidation =
  { ok: true; value: EventQuestionInput[] } | { ok: false; issues: QuestionIssue[] };

/**
 * Splits a written list of options into the array `choices` stores.
 *
 * Commas, because that is how somebody writes "S, M, L, XL" without being
 * taught a syntax. Blank entries are dropped rather than refused: a trailing
 * comma is a typing artefact, not an intention to offer an empty answer.
 */
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

/**
 * Validates the whole submitted list at once.
 *
 * The whole list rather than one question, because two of the three rules are
 * about the list: a duplicate prompt is a property of the pair, and the order is
 * the order a player is asked. Collecting every issue rather than stopping at
 * the first is the shared state contract's requirement, applied to a repeating
 * group.
 *
 * `event_questions_unique_per_event` says the same thing about duplicates in the
 * database. Saying it here is what turns an integrity error into a sentence
 * beside the question that repeats.
 */
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

/**
 * How a question reads to the person being asked it — the approval review's
 * second line, and the template list's summary.
 *
 * One function rather than two so that `docs/ux/standards.md` rule 7 holds: the
 * approval review and the template screen answer "what does this question
 * offer?" identically, because they call this.
 */
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

/** Re-exported so a caller working with questions has one import. */
export { optional, trimmed };
