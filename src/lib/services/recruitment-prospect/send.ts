import "server-only";

import { InvalidTransition, NotFound, withTransaction, type Tx } from "@/lib/db";
import type { Transport } from "@/lib/delivery";
import type { EnvironmentSource } from "@/lib/delivery/config";
import { MAX_ATTEMPTS } from "../delivery";
import { dispatchRecruitmentCycleJob } from "../messaging-scheduler";
import { readWaitingIn } from "../messaging-safety";
import { lightsOutWaitingUntil } from "../messaging-schedule/lights-out";
import { recordAudit } from "../audit";
import {
  declareRecruitmentCycleJobsIn,
  readRecruitmentCycleCompletionIn,
  type RecruitmentCycleStepName,
} from "../recruitment-cycle";
import { SENT_STEP_KEYS } from "./shared";

/**
 * The send machinery — the 2026-09-01 amendment. `W2`'s two SEND buttons,
 * both routed through `declareRecruitmentCycleJobsIn` (LAN-203), never
 * duplicated. See `relocations.md` for what "sent"/"last sent" mean.
 */

export type RecruitmentQuestionnaireTrack = "personal" | "recruitment";

export interface SendRecruitmentQuestionnaireResult {
  readonly created: readonly RecruitmentCycleStepName[];
  /** The selected ask to dispatch after this transaction commits. */
  readonly jobId?: string;
  /** An unanswered request already has its automatic cycle slots. */
  readonly reason: "not_consented" | "not_eligible" | "already_complete" | "outstanding" | null;
}

/** `W2`'s two SEND buttons, routed through `declareRecruitmentCycleJobsIn`, never duplicated. */
export async function sendRecruitmentQuestionnaireIn(
  tx: Tx,
  actorPersonId: string,
  prospectId: string,
  track: RecruitmentQuestionnaireTrack,
): Promise<SendRecruitmentQuestionnaireResult> {
  const prospect = await tx.query<{ person_id: string; season_id: string }>(
    `select person_id, season_id from public.recruitment_prospects where id = $1::uuid`,
    [prospectId],
  );
  const row = prospect.rows[0];
  if (!row)
    throw new NotFound("That recruit could not be found.", {
      rule: "recruitment_prospect_not_found",
    });

  const requested = await tx.query<{ at: Date }>("select clock_timestamp() as at");
  const askStep = track === "personal" ? "welcome" : "interest_ask";
  const result = await declareRecruitmentCycleJobsIn(tx, row.person_id, row.season_id, {
    step: askStep,
    at: requested.rows[0].at,
  });
  const relevantSteps = SENT_STEP_KEYS[track];
  const created = result.created.filter((step) => relevantSteps.includes(step));

  let reason: SendRecruitmentQuestionnaireResult["reason"] =
    created.length > 0 ? null : result.reason;

  // An existing job is not an answered questionnaire — let an unanswered ask be sent again.
  if (created.length === 0 && reason === "already_complete") {
    const completion = await readRecruitmentCycleCompletionIn(
      tx,
      row.person_id,
      row.season_id,
      prospectId,
    );
    const trackComplete =
      track === "personal" ? completion.welcomeStepComplete : completion.questionnaireBComplete;
    if (!trackComplete) reason = "outstanding";
  }

  let jobId: string | undefined;
  if (created.length > 0 || reason === "outstanding") {
    const job = await tx.query<{ id: string }>(
      `update public.notification_jobs nj
          set scheduled_for = $2, next_attempt_at = null, status = 'pending',
              claimed_at = null, claimed_by = null, updated_at = now()
        where idempotency_key = $1 and held_at is null and attempt_count < $3
          and (status in ('pending', 'ready', 'failed', 'completed')
            or (status = 'processing' and exists (
              select 1 from public.delivery_attempts da
               where da.notification_job_id = nj.id
                 and da.attempt_number = nj.attempt_count and da.accepted_at is not null
            )))
        returning id`,
      [
        `recruit-cycle:${askStep}:${row.person_id}:${row.season_id}`,
        requested.rows[0].at,
        MAX_ATTEMPTS,
      ],
    );
    jobId = job.rows[0]?.id;
    if (!jobId) {
      throw new InvalidTransition(
        "This questionnaire cannot be resent while delivery is in progress or its attempt limit has been reached.",
        { rule: "recruitment_questionnaire_not_resendable" },
      );
    }
  }

  await recordAudit(tx, {
    actorPersonId,
    action:
      track === "personal"
        ? "recruitment_prospect.personal_questionnaire_send_requested"
        : "recruitment_prospect.recruitment_questionnaire_send_requested",
    entityTable: "recruitment_prospects",
    entityId: prospectId,
    context: { created, declaredReason: result.reason, reportedReason: reason },
  });

  return { created, reason, ...(jobId ? { jobId } : {}) };
}

export async function sendRecruitmentQuestionnaire(
  actorPersonId: string,
  prospectId: string,
  track: RecruitmentQuestionnaireTrack,
  options: { source?: EnvironmentSource; transport?: Transport } = {},
): Promise<
  Omit<SendRecruitmentQuestionnaireResult, "jobId"> & {
    /**
     * LAN-394 added `deferred`: the ask was declared and its job exists, and
     * the send is waiting on the club's sending allowance. The recruit's
     * existing open request is untouched, because nothing was minted.
     */
    delivery?: "accepted" | "refused" | "skipped" | "deferred";
    /** LAN-394. When the guard expects to let it through, where that is knowable. */
    waitingUntil?: Date | null;
  }
> {
  const { jobId, ...result } = await withTransaction((tx) =>
    sendRecruitmentQuestionnaireIn(tx, actorPersonId, prospectId, track),
  );
  if (!jobId) return result;
  const delivery = await dispatchRecruitmentCycleJob(jobId, options);
  if (delivery !== "deferred") return { ...result, delivery };

  // The recruitment ask has a deterministic person/season/step job key, so the
  // job this returns is the one already waiting rather than a second request.
  const waiting = await withTransaction((tx) => readWaitingIn(tx, jobId));
  return {
    ...result,
    delivery,
    waitingUntil: waiting?.nextEligibleAt ?? lightsOutWaitingUntil(delivery),
  };
}
