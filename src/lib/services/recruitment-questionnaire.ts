import "server-only";

import { NotFound, type Tx } from "@/lib/db";
import { QUESTIONNAIRE_B_CODE, joinMultiAnswer } from "./recruitment-vocabulary";

/**
 * Questionnaire B's one write — LAN-206, `/a/[token]`'s form; the only
 * writer of `recruitment_questionnaire_responses`. Every write closes the
 * current row and inserts a fresh one, never an `update` in place. A blank
 * field is left untouched, never superseding a real answer.
 * Decision history: LAN-206, missions/intake/M-RECRUITMENT
 */

export interface QuestionnaireBSubmission {
  readonly playedBefore?: "yes" | "no" | null;
  readonly watchedBefore?: "yes" | "no" | null;
  /** `W4`'s multi-select over `POSITION_GROUPS`, joined into the one `answer_choice` column. */
  readonly positionInterest?: readonly string[] | null;
  readonly gearOwned?: readonly string[] | null;
  readonly howTheyHeard?: string | null;
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

/** `identified → engaged` where not already there (W4: "Answering is an interaction"). No-op past `identified`. Attributed to the mechanism, no operator. */
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
  if (submission.positionInterest && submission.positionInterest.length > 0) {
    await supersedeAndInsertIn(tx, prospectId, QUESTIONNAIRE_B_CODE.positionInterest, {
      choice: joinMultiAnswer(submission.positionInterest),
    });
    answeredSomething = true;
  }
  if (submission.gearOwned && submission.gearOwned.length > 0) {
    await supersedeAndInsertIn(tx, prospectId, QUESTIONNAIRE_B_CODE.gearOwned, {
      choice: joinMultiAnswer(submission.gearOwned),
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
