import "server-only";

import type { Tx } from "@/lib/db";

import type { EventQuestionInput } from "./event-questions-input";
import { readEventQuestionsIn } from "./event-questions";
import { questionAppliesToCapacitySql } from "./question-applicability";

/**
 * What changes to an approved event's questions do to the answers already
 * given, and to the people who gave them — LAN-367.
 *
 * Brian, 2026-09-16: "a question that did not change keeps every answer; a
 * question that did change has its old answers nullified and everyone who
 * answered is told and asked again; a new question is asked of everyone." The
 * classification is the whole of it, and it is deliberately narrow:
 *
 * - **changed** — the wording, the answer type, or a choice question's options
 *   differ from what was asked. Reordering alone is not a change, and neither
 *   is making a question required or optional: neither alters the question the
 *   person answered.
 * - **new** — a question the event did not have.
 * - **unchanged** — everything else, and its answers survive untouched.
 *
 * Removal is absent by design. `updateEventQuestions` refuses to remove a
 * question from an approved event (LAN-318), so "removed" is unreachable
 * today; the superseding below is written so that it needs nothing new if
 * Brian ever allows one.
 */

interface StoredQuestionShape {
  readonly id: string;
  readonly prompt: string;
  readonly answerType: string;
  readonly choices: readonly string[] | null;
}

/** Whether these two are the same question asked the same way. */
function asksTheSameThing(stored: StoredQuestionShape, submitted: EventQuestionInput): boolean {
  if (stored.prompt.trim() !== submitted.prompt.trim()) return false;
  if (stored.answerType !== submitted.answerType) return false;
  const before = (stored.choices ?? []).map((choice) => choice.trim());
  const after = (submitted.answerType === "choice" ? (submitted.choices ?? []) : []).map((choice) =>
    choice.trim(),
  );
  // Order matters: a choice list read out in a different order is a different
  // list on the screen the player answers on.
  return before.length === after.length && before.every((choice, at) => choice === after[at]);
}

export interface QuestionChangePlan {
  /** Questions whose asked content differs from what was sent. */
  readonly changedIds: readonly string[];
  /** Their prompts, as they will now read — what the message names. */
  readonly changedPrompts: readonly string[];
  /** How many questions this save adds. */
  readonly addedCount: number;
  /** Invitations that will be asked again. */
  readonly invitationIds: readonly string[];
}

const NOTHING_TO_RE_ASK: QuestionChangePlan = Object.freeze({
  changedIds: [],
  changedPrompts: [],
  addedCount: 0,
  invitationIds: [],
});

/**
 * Who has to be asked again, and about what — computed before anything is
 * written, so the operator's confirmation and the save itself are the same
 * answer rather than two that nearly agree.
 */
export async function planQuestionChangesIn(
  tx: Tx,
  eventId: string,
  submitted: readonly EventQuestionInput[],
): Promise<QuestionChangePlan> {
  const stored = await readEventQuestionsIn(tx, eventId);
  const storedById = new Map(stored.map((question) => [question.id, question]));

  const changedIds: string[] = [];
  const changedPrompts: string[] = [];
  let addedCount = 0;

  for (const question of submitted) {
    if (question.id === null) {
      addedCount += 1;
      continue;
    }
    const before = storedById.get(question.id);
    if (!before) continue; // `updateEventQuestions` refuses this; nothing to plan for.
    if (asksTheSameThing(before, question)) continue;
    changedIds.push(question.id);
    changedPrompts.push(question.prompt.trim());
  }

  if (changedIds.length === 0 && addedCount === 0) return NOTHING_TO_RE_ASK;

  // Who is told. Two different sets, unioned:
  //
  //   - a changed question: everyone who answered it, because their answer is
  //     about to be voided and they are the only people who lose anything;
  //   - a new question: everyone who has already been through the questions —
  //     they have a standing answer of some kind, so nothing else is going to
  //     go back to them. An invitee who has never answered anything is left to
  //     the ordinary chase, which is the issue's own instruction.
  const affected = await tx.query<{ invitation_id: string }>(
    `select distinct i.id as invitation_id
       from public.invitations i
      where i.event_id = $1
        and i.status <> 'cancelled'
        and (
          exists (
            select 1 from public.question_responses qr
             where qr.invitation_id = i.id
               and qr.superseded_at is null
               and qr.event_question_id = any($2::uuid[])
          )
          or (
            $3::boolean
            and (
              exists (select 1 from public.current_rsvp r where r.invitation_id = i.id)
              or exists (
                select 1 from public.question_responses qr
                 where qr.invitation_id = i.id and qr.superseded_at is null
              )
            )
            and exists (
              select 1 from public.event_questions q
               where q.event_id = i.event_id
                 and ${questionAppliesToCapacitySql("q", "i.capacity")}
            )
          )
        )`,
    [eventId, changedIds, addedCount > 0],
  );

  return {
    changedIds,
    changedPrompts,
    addedCount,
    invitationIds: affected.rows.map((row) => row.invitation_id),
  };
}

const SUPERSEDED_BY_QUESTION_CHANGE =
  "The question changed after this answer was given, so it was asked again.";

/**
 * Voids the answers to the questions that changed, and bumps their version.
 *
 * Nothing is deleted: the row keeps what the person said, which is what the
 * audit is for, and every current read filters on `superseded_at is null`.
 */
export async function supersedeAnswersToChangedQuestionsIn(
  tx: Tx,
  eventId: string,
  changedIds: readonly string[],
): Promise<number> {
  if (changedIds.length === 0) return 0;

  await tx.query(
    `update public.event_questions
        set version = version + 1
      where event_id = $1 and id = any($2::uuid[])`,
    [eventId, changedIds],
  );

  const superseded = await tx.query(
    `update public.question_responses
        set superseded_at = now(), superseded_reason = $3
      where event_id = $1
        and event_question_id = any($2::uuid[])
        and superseded_at is null`,
    [eventId, changedIds, SUPERSEDED_BY_QUESTION_CHANGE],
  );
  return superseded.rowCount ?? 0;
}

/**
 * One `question_change_notice` job per affected person — the same declared-job
 * machinery the schedule change notice uses, dispatched by the scheduler and
 * never sent from this transaction.
 *
 * The prompts travel on the job rather than being read at send time: a later
 * save changes the question again, and the message has to name what it named
 * when it was declared.
 */
export async function declareQuestionReAskIn(
  tx: Tx,
  eventId: string,
  plan: QuestionChangePlan,
  noticeKey: string,
): Promise<number> {
  if (plan.invitationIds.length === 0) return 0;

  const summary =
    plan.changedPrompts.length > 0
      ? plan.changedPrompts.join("; ")
      : "There is a new question for this event.";

  const created = await tx.query<{ id: string }>(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, invitation_id, event_id, person_id, template_variables)
     select 'event:' || i.event_id::text || ':' || $2::text || ':invitation:' || i.id::text,
            'question_change_notice', 'pending', i.id, i.event_id,
            coalesce(i.person_id, m.person_id),
            jsonb_build_object('questionSummary', $4::text)
       from public.invitations i
       left join public.season_memberships m on m.id = i.season_membership_id
      where i.event_id = $1 and i.id = any($3::uuid[])
     on conflict (idempotency_key) do nothing
     returning id`,
    [eventId, noticeKey, plan.invitationIds, summary],
  );
  return created.rowCount ?? 0;
}
