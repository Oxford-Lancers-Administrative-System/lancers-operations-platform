import "server-only";

import type { Tx } from "@/lib/db";
import { type EventQuestionInput, type QuestionAnswerType } from "./event-questions-input";

/**
 * The questions an event asks the people invited to it — LAN-154, amendment
 * W4-A1.
 *
 * The vocabulary and the rules are in `./event-questions-input`, which is pure
 * and is what the form imports; this is the database half and re-exports it so a
 * server caller has one import.
 *
 * ## Questions belong to the event, so they follow the event's rules
 *
 * They are editable while it is a draft, they arrive from the type's template
 * until approval freezes them (D41), and changing them after approval is `W5`'s
 * amendment path like any other change. Nothing in this module writes against a
 * non-draft event; the callers hold that guard, in the same statement that
 * guards the rest of the draft edit.
 *
 * ## Replacement rather than a diff, and why that is safe here
 *
 * `writeEventQuestionsIn` deletes and re-inserts. That is only safe because a
 * draft carries no invitations (invariant P1) and therefore no answers — the
 * composite foreign key from `question_answers` has nothing to point at. On an
 * approved event it would destroy answers, which is exactly why no path here
 * reaches one.
 *
 * The alternative, matching by prompt and patching, buys nothing: the operator's
 * screen holds the complete list and posts the complete list, and the order is
 * part of what they are editing.
 */

export {
  describeQuestionAnswer,
  describeQuestionCount,
  joinQuestionChoices,
  QUESTION_ANSWER_TYPE_LABELS,
  QUESTION_ANSWER_TYPES,
  splitQuestionChoices,
  validateEventQuestions,
  type EventQuestionInput,
  type EventQuestionsValidation,
  type QuestionAnswerType,
  type QuestionIssue,
  type RawEventQuestion,
} from "./event-questions-input";

/** One question as stored, in the order a player will be asked it. */
export interface EventQuestion {
  id: string;
  prompt: string;
  answerType: QuestionAnswerType;
  choices: string[] | null;
  isRequired: boolean;
  sortOrder: number;
  /** D42. True when it arrived from the type's template. */
  fromTemplate: boolean;
}

interface QuestionRow {
  id: string;
  prompt: string;
  answer_type: QuestionAnswerType;
  choices: string[] | null;
  is_required: boolean;
  sort_order: number;
  from_template: boolean;
}

function toQuestion(row: QuestionRow): EventQuestion {
  return {
    id: row.id,
    prompt: row.prompt,
    answerType: row.answer_type,
    choices: row.choices,
    isRequired: row.is_required,
    sortOrder: row.sort_order,
    fromTemplate: row.from_template,
  };
}

/**
 * The questions on one event, in the order they are asked.
 *
 * Ordered by `sort_order` and then by prompt, so two questions that were saved
 * with the same order — which the schema permits, because `sort_order` carries
 * no uniqueness — still come back in a stable sequence rather than in whatever
 * order the heap happened to hold them.
 */
export async function readEventQuestionsIn(tx: Tx, eventId: string): Promise<EventQuestion[]> {
  const result = await tx.query<QuestionRow>(
    `select id, prompt, answer_type::text as answer_type, choices,
            is_required, sort_order, from_template
       from public.event_questions
      where event_id = $1
      order by sort_order, prompt`,
    [eventId],
  );
  return result.rows.map(toQuestion);
}

/**
 * Replaces every question on a draft with the submitted list.
 *
 * `sort_order` is the index in the submitted list, because the order is the
 * order a player is asked and the operator set it by moving the cards around.
 * It is written rather than inferred so the sequence survives a reload.
 *
 * ## One statement per question, deliberately
 *
 * Every other bulk write in this service layer is a single `insert … select from
 * unnest(…)`, and this one is not, because `choices` is an array *per row*.
 * PostgreSQL's `unnest` flattens a multidimensional array completely — three
 * questions offering four options each arrive as twelve rows, not three — so the
 * set-based form silently produces the wrong shape rather than failing.
 *
 * A loop inside the caller's transaction is the honest alternative. The bound is
 * an operator writing questions by hand on one event, so the row count is single
 * digits and the atomicity is the transaction's either way.
 */
export async function writeEventQuestionsIn(
  tx: Tx,
  eventId: string,
  questions: readonly EventQuestionInput[],
): Promise<void> {
  await tx.query("delete from public.event_questions where event_id = $1", [eventId]);

  for (const [index, question] of questions.entries()) {
    await tx.query(
      `insert into public.event_questions
         (event_id, prompt, answer_type, choices, is_required, sort_order, from_template)
       values ($1, $2, $3::public.question_answer_type, $4::text[], $5, $6::smallint, $7)`,
      [
        eventId,
        question.prompt,
        question.answerType,
        question.answerType === "choice" ? question.choices : null,
        question.isRequired,
        index,
        question.fromTemplate,
      ],
    );
  }
}

/**
 * The questions a type's template attaches to every event created from it
 * (D42), in the shape a new event's questions are written from.
 *
 * Marked `fromTemplate` here rather than by the caller, because that is what
 * makes them removable per event without touching the template: the flag is the
 * only record of where a question came from.
 */
export async function readTemplateQuestionsAsEventInputIn(
  tx: Tx,
  eventType: string,
): Promise<EventQuestionInput[]> {
  const result = await tx.query<{
    prompt: string;
    answer_type: QuestionAnswerType;
    choices: string[] | null;
    is_required: boolean;
  }>(
    `select prompt, answer_type::text as answer_type, choices, is_required
       from public.event_template_questions
      where event_type = $1::public.event_type
      order by sort_order, prompt`,
    [eventType],
  );

  return result.rows.map((row) => ({
    prompt: row.prompt,
    answerType: row.answer_type,
    isRequired: row.is_required,
    choices: row.answer_type === "choice" ? (row.choices ?? []) : null,
    fromTemplate: true,
  }));
}
