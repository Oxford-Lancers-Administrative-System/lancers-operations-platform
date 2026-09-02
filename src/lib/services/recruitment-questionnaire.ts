import "server-only";

import { NotFound, withTransaction, type Tx } from "@/lib/db";
import { QUESTIONNAIRE_B_CODE } from "./recruitment-vocabulary";

/**
 * Questionnaire B's one write — LAN-206, `/a/[token]`'s own recruit-facing
 * form. `recruitment-prospect.ts`'s `readRecruitmentProspectIn` already reads
 * the current answers (the `answers` field on `RecruitmentProspectRecord`);
 * this module is the write half, and it is the only writer of
 * `recruitment_questionnaire_responses` — no operator surface edits these
 * cells directly (`board-columns.ts` marks every recruitment-answer column
 * `edit: "none"`).
 *
 * ## Superseding, never overwriting
 *
 * `recruitment_questionnaire_responses_one_current_per_question`'s own
 * partial-unique shape is "the current answer is the one row with
 * `superseded_at is null`" — W4's own exception, "the recruit answers twice,
 * the later answer supersedes, the earlier is kept." Every write here closes
 * whatever was current for that question code and inserts a fresh row, never
 * an `update` in place, so the whole history survives.
 *
 * ## Blank never erases
 *
 * A field submitted blank is left untouched rather than superseding a real
 * answer with nothing — `REQ-missing-never-blocks`'s own "missing
 * information never blocks a capture" reads naturally as "a recruit who
 * leaves a question blank this time has not unanswered it", not as a
 * deletion. A recruit who wants to withdraw an answer types over it with
 * something else; this form gives them no way to blank a field that already
 * has an answer showing.
 */

export interface QuestionnaireBSubmission {
  readonly playedBefore?: "yes" | "no" | null;
  readonly watchedBefore?: "yes" | "no" | null;
  readonly positionInterest?: string | null;
  readonly gearOwned?: string | null;
  readonly howTheyHeard?: string | null;
  /** Free text, 500 chars — `question-field.tsx`'s own text control's limit. */
  readonly anythingElse?: string | null;
}

async function supersedeAndInsertIn(
  tx: Tx,
  prospectId: string,
  code: string,
  value: { text?: string | null; boolean?: boolean | null; choice?: string | null },
): Promise<void> {
  await tx.query(
    `update public.recruitment_questionnaire_responses
        set superseded_at = now()
      where prospect_id = $1::uuid and questionnaire = 'football_background'
        and question_code = $2 and superseded_at is null`,
    [prospectId, code],
  );
  await tx.query(
    `insert into public.recruitment_questionnaire_responses
       (prospect_id, questionnaire, question_code, answer_text, answer_boolean, answer_choice)
     values ($1::uuid, 'football_background', $2, $3, $4, $5)`,
    [prospectId, code, value.text ?? null, value.boolean ?? null, value.choice ?? null],
  );
}

/**
 * `identified → engaged` where the recruit is not already there — W4's own
 * state transition, "Answering is an interaction." No-op for a recruit
 * already past `identified` (`engaged`, `committed`, `joined`, or one of the
 * three exits, none of which this unauthenticated form may move). Attributed
 * to the mechanism rather than to an operator who was never there — the same
 * posture `recruitment-signup.ts`'s own module note takes for every write on
 * this unauthenticated, credential-is-the-authorization path.
 */
async function engageOnAnswerIn(tx: Tx, prospectId: string): Promise<void> {
  const updated = await tx.query<{ id: string }>(
    `update public.recruitment_prospects set status = 'engaged', updated_at = now()
      where id = $1::uuid and status = 'identified'
      returning id`,
    [prospectId],
  );
  if (updated.rows.length === 0) return;

  await tx.query(
    `insert into public.recruitment_prospect_status_events
       (prospect_id, from_status, to_status, actor_label)
     values ($1::uuid, 'identified', 'engaged', 'recruit: Questionnaire B answer link')`,
    [prospectId],
  );
}

export async function submitQuestionnaireBAnswersIn(
  tx: Tx,
  prospectId: string,
  submission: QuestionnaireBSubmission,
): Promise<void> {
  const exists = await tx.query(`select 1 from public.recruitment_prospects where id = $1::uuid`, [
    prospectId,
  ]);
  if (!exists.rows[0]) {
    throw new NotFound("That recruit could not be found.", {
      rule: "recruitment_prospect_not_found",
    });
  }

  let answeredSomething = false;

  if (submission.playedBefore === "yes" || submission.playedBefore === "no") {
    await supersedeAndInsertIn(tx, prospectId, QUESTIONNAIRE_B_CODE.playedBefore, {
      boolean: submission.playedBefore === "yes",
    });
    answeredSomething = true;
  }
  if (submission.watchedBefore === "yes" || submission.watchedBefore === "no") {
    await supersedeAndInsertIn(tx, prospectId, QUESTIONNAIRE_B_CODE.watchedBefore, {
      boolean: submission.watchedBefore === "yes",
    });
    answeredSomething = true;
  }
  if (submission.positionInterest?.trim()) {
    await supersedeAndInsertIn(tx, prospectId, QUESTIONNAIRE_B_CODE.positionInterest, {
      choice: submission.positionInterest.trim(),
    });
    answeredSomething = true;
  }
  if (submission.gearOwned?.trim()) {
    await supersedeAndInsertIn(tx, prospectId, QUESTIONNAIRE_B_CODE.gearOwned, {
      choice: submission.gearOwned.trim(),
    });
    answeredSomething = true;
  }
  if (submission.howTheyHeard?.trim()) {
    await supersedeAndInsertIn(tx, prospectId, QUESTIONNAIRE_B_CODE.howTheyHeard, {
      choice: submission.howTheyHeard.trim(),
    });
    answeredSomething = true;
  }
  if (submission.anythingElse?.trim()) {
    await supersedeAndInsertIn(tx, prospectId, QUESTIONNAIRE_B_CODE.anythingElse, {
      text: submission.anythingElse.trim().slice(0, 500),
    });
    answeredSomething = true;
  }

  if (answeredSomething) await engageOnAnswerIn(tx, prospectId);
}

export async function submitQuestionnaireBAnswers(
  prospectId: string,
  submission: QuestionnaireBSubmission,
): Promise<void> {
  return withTransaction((tx) => submitQuestionnaireBAnswersIn(tx, prospectId, submission));
}
