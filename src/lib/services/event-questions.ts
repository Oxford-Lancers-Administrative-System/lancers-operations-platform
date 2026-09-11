import "server-only";

import type { Tx } from "@/lib/db";
import { type EventQuestionInput, type QuestionAnswerType } from "./event-questions-input";

// The questions an event asks the people invited to it — LAN-154, W4-A1. Vocabulary/rules live in
// ./event-questions-input (pure); this is the database half.
//
// D41 is amended by LAN-318 (Brian, 2026-09-11): approval no longer freezes the questions. While
// the event is a draft the whole set is rewritten (`writeEventQuestionsIn`); once it is approved
// the set is updated in place (`upsertEventQuestionsIn`) — added to, reworded, retyped, reordered,
// required or not — and nothing goes out when it changes. The one thing approval does take away is
// removal: a stored question stays, because `question_responses.event_question_id` points at it and
// an answer already given must not be orphaned. Whoever answers next sees the questions as they now
// stand; answers already given are left exactly as they were, including a choice answer that is no
// longer offered. See relocations.md.

export {
  describeQuestionAnswer,
  joinQuestionChoices,
  validateEventQuestions,
  type EventQuestionInput,
  type RawEventQuestion,
} from "./event-questions-input";

export interface EventQuestion {
  id: string;
  prompt: string;
  answerType: QuestionAnswerType;
  choices: string[] | null;
  isRequired: boolean;
  sortOrder: number;
  fromTemplate: boolean; // D42: true when it arrived from the type's template
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

// Ordered by sort_order then prompt — two questions saved with the same order still come back stable.
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

// One statement per question, not one insert-from-unnest — choices is per-row and unnest flattens it wrong (see relocations.md).
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
 * The approved event's path — LAN-318. Updates every question that already exists, inserts the ones
 * that do not, and deletes nothing; `updateEventQuestions` is what refuses a removal, since only it
 * knows what the event already asked.
 *
 * Two passes over the existing rows, not one, because `event_questions_unique_per_event` is on
 * `(event_id, prompt)` and is not deferrable: swapping two questions' wording is a legitimate edit
 * whose final state is unique but whose halfway state is not. The first pass parks each row on its
 * own id as a prompt — unique by construction, non-blank, and never visible outside this
 * transaction — so the second can write the real wording in any order.
 */
export async function upsertEventQuestionsIn(
  tx: Tx,
  eventId: string,
  questions: readonly EventQuestionInput[],
): Promise<void> {
  const existing = questions.filter((question) => question.id !== null);

  for (const question of existing) {
    await tx.query(
      "update public.event_questions set prompt = id::text where id = $1 and event_id = $2",
      [question.id, eventId],
    );
  }

  for (const [index, question] of questions.entries()) {
    const choices = question.answerType === "choice" ? question.choices : null;

    if (question.id === null) {
      await tx.query(
        `insert into public.event_questions
           (event_id, prompt, answer_type, choices, is_required, sort_order, from_template)
         values ($1, $2, $3::public.question_answer_type, $4::text[], $5, $6::smallint, $7)`,
        [
          eventId,
          question.prompt,
          question.answerType,
          choices,
          question.isRequired,
          index,
          question.fromTemplate,
        ],
      );
      continue;
    }

    // from_template is deliberately absent: where a question came from is a fact about its origin,
    // and editing its wording afterwards does not change that.
    await tx.query(
      `update public.event_questions
          set prompt = $3,
              answer_type = $4::public.question_answer_type,
              choices = $5::text[],
              is_required = $6,
              sort_order = $7::smallint
        where id = $1 and event_id = $2`,
      [
        question.id,
        eventId,
        question.prompt,
        question.answerType,
        choices,
        question.isRequired,
        index,
      ],
    );
  }
}

// D42: questions a template attaches to every event created from it. fromTemplate is set here, not
// by the caller — the only record of where a question came from. Keyed by template id (LAN-265).
export async function readTemplateQuestionsAsEventInputIn(
  tx: Tx,
  templateId: string,
): Promise<EventQuestionInput[]> {
  const result = await tx.query<{
    prompt: string;
    answer_type: QuestionAnswerType;
    choices: string[] | null;
    is_required: boolean;
  }>(
    `select prompt, answer_type::text as answer_type, choices, is_required
       from public.event_template_questions
      where template_id = $1::uuid
      order by sort_order, prompt`,
    [templateId],
  );

  return result.rows.map((row) => ({
    id: null, // a template's question is not yet the event's; the insert mints the id
    prompt: row.prompt,
    answerType: row.answer_type,
    isRequired: row.is_required,
    choices: row.answer_type === "choice" ? (row.choices ?? []) : null,
    fromTemplate: true,
  }));
}
