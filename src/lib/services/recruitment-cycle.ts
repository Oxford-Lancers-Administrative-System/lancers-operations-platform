import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import { deriveEntityIdFromNaturalKey, recordAudit } from "./audit";
import {
  hasGrantedViaSignupFormIn,
  mayReceiveWelcomeContactIn,
  readSeasonMessagingConsentIn,
} from "./messaging-consent";

/**
 * The recruitment cycle's own four rows — LAN-203. Owns
 * `recruitment_cycle_steps`, seeded once by the migration, never created or
 * deleted here. {@link declareRecruitmentCycleJobsIn} has no caller yet.
 */

export type RecruitmentCycleStepName =
  "welcome" | "details_reminder" | "interest_ask" | "interest_reminder";

export interface RecruitmentCycleStep {
  readonly step: RecruitmentCycleStepName;
  /** Whole hours after capture. */
  readonly offsetHours: number;
  readonly updatedAt: Date;
}

const STEP_COLUMNS = `step::text as step, offset_hours, updated_at`;

interface StepRow {
  step: string;
  offset_hours: number;
  updated_at: Date;
}

function toStep(row: StepRow): RecruitmentCycleStep {
  return {
    step: row.step as RecruitmentCycleStepName,
    offsetHours: row.offset_hours,
    updatedAt: row.updated_at,
  };
}

/** All four rows in the enum's declared order — ordered by the un-cast column, not the `STEP_COLUMNS` alias Postgres would otherwise resolve first. */
export async function listRecruitmentCycleStepsIn(
  tx: Tx,
): Promise<readonly RecruitmentCycleStep[]> {
  const result = await tx.query<StepRow>(
    `select ${STEP_COLUMNS} from public.recruitment_cycle_steps t order by t.step`,
  );
  return result.rows.map(toStep);
}

export interface RecruitmentCycleStepChange {
  readonly offsetHours: number;
}

/** Changes one step's policy, attributed. No `insert`: all four rows exist from the migration. `enabled` is never touched. */
export async function updateRecruitmentCycleStepIn(
  tx: Tx,
  actorPersonId: string,
  step: RecruitmentCycleStepName,
  change: RecruitmentCycleStepChange,
): Promise<RecruitmentCycleStep> {
  const before = await tx.query<StepRow>(
    `select ${STEP_COLUMNS} from public.recruitment_cycle_steps where step = $1`,
    [step],
  );

  const updated = await tx.query<StepRow>(
    `update public.recruitment_cycle_steps
        set offset_hours = $2,
            updated_at = now()
      where step = $1
     returning ${STEP_COLUMNS}`,
    [step, change.offsetHours],
  );

  await recordAudit(tx, {
    actorPersonId,
    action: "recruitment_cycle_step.changed",
    entityTable: "recruitment_cycle_steps",
    entityId: deriveEntityIdFromNaturalKey("recruitment_cycle_steps", step),
    context: { before: before.rows[0] ? toStep(before.rows[0]) : null, after: change },
  });

  return toStep(updated.rows[0]);
}

export async function listRecruitmentCycleSteps(): Promise<readonly RecruitmentCycleStep[]> {
  return withTransaction((tx) => listRecruitmentCycleStepsIn(tx));
}

/** Questionnaire B's own five completing questions. B6 ("anything else") never counts. */
export const QUESTIONNAIRE_B_COMPLETING_CODES: readonly string[] = Object.freeze([
  "B1",
  "B2",
  "B3",
  "B4",
  "B5",
]);

const CYCLE_ELIGIBLE_STATUSES: readonly string[] = Object.freeze([
  "identified",
  "engaged",
  "committed",
]);

export interface RecruitmentCycleCompletion {
  /** `season_messaging_consents.source = 'qr_self_entry'` for this (person, season). LAN-205. */
  readonly welcomeStepComplete: boolean;
  /** Every one of B1–B5 answered (superseded rows do not count; B6 never counts). */
  readonly questionnaireBComplete: boolean;
}

/** Whether a recruit has already supplied the completing set for each cycle track. No consent/prospect/answer rows reads as incomplete, never throws. */
export async function readRecruitmentCycleCompletionIn(
  tx: Tx,
  personId: string,
  seasonId: string,
  prospectId: string | null,
): Promise<RecruitmentCycleCompletion> {
  const consent = await readSeasonMessagingConsentIn(tx, personId, seasonId);
  const welcomeStepComplete = consent?.source === "qr_self_entry";

  let questionnaireBComplete = false;
  if (prospectId) {
    const answered = await tx.query<{ question_code: string }>(
      `select question_code from public.recruitment_questionnaire_responses
        where prospect_id = $1::uuid and questionnaire = 'football_background'
          and superseded_at is null
          and question_code = any($2::text[])`,
      [prospectId, QUESTIONNAIRE_B_COMPLETING_CODES],
    );
    questionnaireBComplete =
      new Set(answered.rows.map((r) => r.question_code)).size ===
      QUESTIONNAIRE_B_COMPLETING_CODES.length;
  }

  return { welcomeStepComplete, questionnaireBComplete };
}

export interface DeclaredCycleJobs {
  readonly created: readonly RecruitmentCycleStepName[];
  /** Why nothing at all was created, when `created` is empty and it is worth naming. */
  readonly reason: "not_consented" | "not_eligible" | "already_complete" | null;
}

/** Turns one recruit's capture into the cycle's `notification_jobs` rows, idempotently. */
export async function declareRecruitmentCycleJobsIn(
  tx: Tx,
  personId: string,
  seasonId: string,
  operatorRequest?: { step: "welcome" | "interest_ask"; at: Date },
): Promise<DeclaredCycleJobs> {
  const prospect = await tx.query<{ id: string; status: string; created_at: Date }>(
    `select id, status::text as status, created_at
       from public.recruitment_prospects
      where person_id = $1::uuid and season_id = $2::uuid`,
    [personId, seasonId],
  );
  const prospectRow = prospect.rows[0];
  if (!prospectRow || !CYCLE_ELIGIBLE_STATUSES.includes(prospectRow.status)) {
    return { created: [], reason: "not_eligible" };
  }

  const completion = await readRecruitmentCycleCompletionIn(tx, personId, seasonId, prospectRow.id);
  const steps = await listRecruitmentCycleStepsIn(tx);
  const offsetFor = (step: RecruitmentCycleStepName) =>
    steps.find((s) => s.step === step)?.offsetHours ?? 0;

  const mayWelcome = completion.welcomeStepComplete
    ? false
    : await mayReceiveWelcomeContactIn(tx, personId, seasonId);
  const mayInterest = completion.questionnaireBComplete
    ? false
    : await hasGrantedViaSignupFormIn(tx, personId, seasonId);

  const wanted: RecruitmentCycleStepName[] = [];
  if (!completion.welcomeStepComplete && mayWelcome && operatorRequest?.step !== "interest_ask") {
    wanted.push("welcome", "details_reminder");
  }
  if (!completion.questionnaireBComplete && mayInterest && operatorRequest?.step !== "welcome") {
    wanted.push("interest_ask", "interest_reminder");
  }

  if (wanted.length === 0) {
    const complete = operatorRequest
      ? operatorRequest.step === "welcome"
        ? completion.welcomeStepComplete
        : completion.questionnaireBComplete
      : completion.welcomeStepComplete && completion.questionnaireBComplete;
    return { created: [], reason: complete ? "already_complete" : "not_consented" };
  }

  const created: RecruitmentCycleStepName[] = [];
  for (const step of wanted) {
    // LAN-237: the operator's ask is due now; its reminder keeps the configured interval.
    const scheduledFor = operatorRequest
      ? new Date(
          operatorRequest.at.getTime() +
            Math.max(0, offsetFor(step) - offsetFor(operatorRequest.step)) * 60 * 60 * 1000,
        )
      : new Date(prospectRow.created_at.getTime() + offsetFor(step) * 60 * 60 * 1000);
    const idempotencyKey = `recruit-cycle:${step}:${personId}:${seasonId}`;
    const inserted = await tx.query(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, person_id, channel, scheduled_for,
          template_variables)
       values ($1, 'other', 'pending', $2::uuid, 'whatsapp', $3::timestamptz, '{}'::jsonb)
       on conflict (idempotency_key) do nothing
       returning id`,
      [idempotencyKey, personId, scheduledFor],
    );
    if (inserted.rows[0]) created.push(step);
    if (operatorRequest && step !== operatorRequest.step) {
      // Keep an unsent reminder at least one configured interval behind this manual ask.
      await tx.query(
        `update public.notification_jobs nj
            set scheduled_for = greatest(scheduled_for, $2),
                next_attempt_at = case when next_attempt_at is not null
                  then greatest(next_attempt_at, $2) else null end,
                updated_at = now()
          where idempotency_key = $1 and status in ('pending', 'ready', 'failed')
            and not exists (
              select 1 from public.delivery_attempts da
               where da.notification_job_id = nj.id and da.accepted_at is not null
            )`,
        [idempotencyKey, scheduledFor],
      );
    }
  }

  return { created, reason: created.length === 0 ? "already_complete" : null };
}
