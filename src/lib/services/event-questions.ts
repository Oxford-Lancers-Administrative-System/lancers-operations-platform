import "server-only";

import type { Tx } from "@/lib/db";
import { type EventQuestionInput, type QuestionAnswerType } from "./event-questions-input";

// The questions an event asks the people invited to it — LAN-154, W4-A1. Vocabulary/rules live in
// ./event-questions-input (pure); this is the database half. Editable while draft, frozen at
// approval (D41), changed after only through W5's amendment path. See relocations.md.

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
    prompt: row.prompt,
    answerType: row.answer_type,
    isRequired: row.is_required,
    choices: row.answer_type === "choice" ? (row.choices ?? []) : null,
    fromTemplate: true,
  }));
}
