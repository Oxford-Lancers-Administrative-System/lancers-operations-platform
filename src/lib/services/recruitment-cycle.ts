import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import { deriveEntityIdFromNaturalKey, recordAudit } from "./audit";
import { hasGrantedSeasonMessagingConsentIn } from "./messaging-consent";

/**
 * The recruitment cycle's own four rows. LAN-203, `REQ-recruitment-cycle`.
 *
 * ## What this module owns
 *
 * `recruitment_cycle_steps` — read and write, on the exact idiom
 * `messaging-schedule.ts` already uses for `messaging_schedules`: complete
 * over a closed enum, no default arm, seeded once by the migration and never
 * created or deleted here, only updated.
 *
 * ## The per-step toggle — superseded, Brian, 2026-09-01
 *
 * `REQ-recruitment-cycle`'s "each of which can be turned off, per cycle" is
 * superseded: "the toggles were completely invented. That has never been
 * part of this… Remove the toggles." The `enabled` column stays in the
 * database, untouched — this is a presentation-layer change, not a
 * migration — but the application no longer reads or writes it, so every
 * row's stored value is inert from here on and every step sends on its own
 * offset alone. `RecruitmentCycleStep`/`RecruitmentCycleStepChange` below
 * carry no `enabled` field for exactly that reason.
 *
 * ## The declaration — Brian, 2026-09-01
 *
 * {@link declareRecruitmentCycleJobsIn} turns "recruit X was captured" into
 * the `notification_jobs` rows the two steps describe, honouring consent,
 * the recruit's own status, and completion (below). It still has **no
 * caller**: the capture event itself belongs to LAN-205 (walk-up) and
 * LAN-206 (operator-add and Questionnaire B's own form), neither of which
 * has landed. "The cycle can be built and cannot run" now means exactly
 * that one thing — the capture-time trigger — not the declaration or the
 * dispatch, both of which are real and tested here and in
 * `messaging-scheduler.ts`.
 *
 * ## Completion — `REQ-recruitment-cycle` amended, Brian, 2026-09-01
 *
 * "If they fill out the whole thing… then it doesn't send out again." The
 * completing set is first name, last name and mobile for the Welcome step
 * (W1's own mandatory set at every door this package builds, so a recruit
 * captured through the QR or tokenised door already carries it — this
 * matters for a recruit captured elsewhere, walk-up or operator-add, whose
 * doors this package does not build) and Questionnaire B's B1–B5 for the
 * questionnaire step — never B6, and never college, matriculation,
 * graduation or degree, which stay optional at recruit stage
 * (`REQ-recruit-stage-optional`, finding 7, Mission 7's own enforcement,
 * record-only here). {@link readRecruitmentCycleCompletionIn} is the read;
 * `declareRecruitmentCycleJobsIn` is the only caller that turns it into a
 * refusal to create a job.
 *
 * Questionnaire B's own collecting form does not exist yet — LAN-206 — so
 * nothing can honestly answer B1–B5 today outside a test that inserts rows
 * directly. The completion check is built against
 * `recruitment_questionnaire_responses` as the real, permanent source
 * regardless — never a stub, never gated on a form this package cannot
 * reach — proved by tests that insert B1–B5 rows directly and observe the
 * check flip. The two-ask cap (`the ask and one reminder, then silence,
 * never a third`) is structural, not counted: the schema offers exactly one
 * `ask_offset`-shaped slot and one reminder-shaped slot per step (still
 * `recruitment_cycle_steps.offset_hours`, one column, two rows —
 * `interest_ask`/`interest_reminder` — per the presentation-layer note
 * above), so there is no third slot to ever schedule from.
 */

/** The four surviving steps, in the order the migration seeds them and the admin page renders them. */
export type RecruitmentCycleStepName =
  "welcome" | "details_reminder" | "interest_ask" | "interest_reminder";

export interface RecruitmentCycleStep {
  readonly step: RecruitmentCycleStepName;
  /** Whole hours after capture. */
  readonly offsetHours: number;
  readonly updatedAt: Date;
}

// `enabled` is deliberately not selected — Brian, 2026-09-01. The column
// still exists (no migration; see the module note above); the application
// simply stops reading it.
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

/**
 * All four rows, in the enum's own declared order — `welcome`,
 * `details_reminder`, `interest_ask`, `interest_reminder` — which is also
 * the order the admin page's three rows read (the last two share one row,
 * exactly as `messaging_schedules`' six fields share one row per event type).
 *
 * Ordered by the un-cast enum column, deliberately, and not by the aliased
 * text `STEP_COLUMNS` produces — the same reason `listMessagingSchedulesIn`
 * qualifies its own `order by`: PostgreSQL resolves a bare `ORDER BY` name
 * against an output alias of the same name before it considers the source
 * column, and the alphabetical order that produces
 * ("details_reminder, interest_ask, interest_reminder, welcome") is not the
 * cycle's own sequence.
 */
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

/**
 * Changes one step's policy, attributed — the Recruitment cycle section's
 * own save, on the same one-row-one-save law the rest of the page keeps.
 *
 * `insert` is deliberately absent, on the same reasoning
 * `updateMessagingScheduleIn` documents: all four rows exist from the
 * migration, and a step name with no row is a refusal a widened enum would
 * force rather than an invitation to create one.
 *
 * `enabled` is not part of `change` and this update never touches it — the
 * column keeps whatever value the migration seeded, exactly as every row
 * already carried before this save (Brian, 2026-09-01: the toggle is gone,
 * not migrated away).
 */
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
    // `audit_events.entity_id` is `uuid not null` and this table is keyed by
    // a plain enum label — the same reason `messaging_schedules`' own audit
    // derives one rather than casting the label. See
    // `deriveEntityIdFromNaturalKey`'s own comment.
    entityId: deriveEntityIdFromNaturalKey("recruitment_cycle_steps", step),
    context: { before: before.rows[0] ? toStep(before.rows[0]) : null, after: change },
  });

  return toStep(updated.rows[0]);
}

/** Every step's policy, for the messaging schedule page's Recruitment section. */
export async function listRecruitmentCycleSteps(): Promise<readonly RecruitmentCycleStep[]> {
  return withTransaction((tx) => listRecruitmentCycleStepsIn(tx));
}

// ---------------------------------------------------------------------------
// The capture-time declaration — Brian, 2026-09-01. No caller yet; see the
// module note above.
// ---------------------------------------------------------------------------

/** Questionnaire B's own five completing questions. B6 ("anything else") never counts. */
export const QUESTIONNAIRE_B_COMPLETING_CODES: readonly string[] = Object.freeze([
  "B1",
  "B2",
  "B3",
  "B4",
  "B5",
]);

/**
 * The prospect statuses a job may still be declared or dispatched for — the
 * same "still open" filter `event-audience.ts` already applies to the
 * recruit audience candidate list. `declined`, `disengaged` and `void` are
 * excluded: "nothing for a declined recruit" (Brian, 2026-09-01), and
 * `joined` is excluded because a joined prospect is a player now, not a
 * recruit the cycle chases.
 */
const CYCLE_ELIGIBLE_STATUSES: readonly string[] = Object.freeze([
  "identified",
  "engaged",
  "committed",
]);

export interface RecruitmentCycleCompletion {
  /** First name, last name and a current mobile number all on file. */
  readonly welcomeStepComplete: boolean;
  /** Every one of B1–B5 answered (superseded rows do not count; B6 never counts). */
  readonly questionnaireBComplete: boolean;
}

/**
 * Reads whether a recruit has already supplied the completing set for each
 * cycle track — the read half of "completion stops the cycle" (Brian,
 * 2026-09-01). Never throws for a person with no prospect row or no
 * questionnaire answers at all; both read as incomplete, which is correct
 * for a recruit nobody has captured through this check yet.
 */
export async function readRecruitmentCycleCompletionIn(
  tx: Tx,
  personId: string,
  prospectId: string | null,
): Promise<RecruitmentCycleCompletion> {
  const person = await tx.query<{ given_name: string | null; family_name: string | null }>(
    `select given_name, family_name from public.people where id = $1::uuid`,
    [personId],
  );
  const mobile = await tx.query(
    `select 1 from public.contact_points
      where person_id = $1::uuid and kind = 'phone'
        and valid_from <= current_date and valid_until is null
      limit 1`,
    [personId],
  );
  const row = person.rows[0];
  const welcomeStepComplete = Boolean(
    row?.given_name?.trim() && row?.family_name?.trim() && mobile.rows[0],
  );

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
  /** The step names actually inserted this call — empty is a legitimate, silent outcome. */
  readonly created: readonly RecruitmentCycleStepName[];
  /** Why nothing at all was created, when `created` is empty and it is worth naming. */
  readonly reason: "not_consented" | "not_eligible" | "already_complete" | null;
}

/**
 * Turns one recruit's capture into the cycle's `notification_jobs` rows —
 * the declaration W10 always described, built now on Brian's 2026-09-01
 * ruling. Idempotent: reruns never duplicate a job, on the same
 * `idempotency_key` uniqueness every other job creator in this codebase
 * already relies on (`on conflict do nothing`).
 *
 * Ordering, all checked before anything is written:
 *
 * 1. **Eligibility.** `recruitment_prospects.status` for `(personId,
 *    seasonId)` must be `identified`, `engaged` or `committed` — anything
 *    else (no row at all, `declined`, `disengaged`, `void`, `joined`)
 *    creates nothing.
 * 2. **Consent.** `hasGrantedSeasonMessagingConsentIn` must be `true`.
 *    Ungranted, unasked, refused or withdrawn all create nothing — the same
 *    totality LAN-202's gate already holds for a send, applied here at
 *    declaration time so a job is never created for a recruit who could not
 *    lawfully receive it.
 * 3. **Completion**, per track, independently:
 *    - Welcome track (`welcome` + `details_reminder`): skipped entirely
 *      once `welcomeStepComplete` — both or neither, matching the
 *      presentation layer's "one card, two offsets, one save" (finding 5).
 *    - Questionnaire track (`interest_ask` + `interest_reminder`): skipped
 *      entirely once `questionnaireBComplete`.
 *
 * `job_type` is `'other'` for every row this function creates — the one
 * `notification_job_type` value nothing in this codebase writes today (a
 * grep confirms it), so adopting it here collides with no live behaviour.
 * `messageKindFor` in `delivery.ts` is untouched; these jobs are never
 * claimed through `claimJobIn` at all — see `dispatchRecruitmentCycleJob` in
 * `messaging-scheduler.ts`, built the same deliberately-separate way
 * `dispatchEscalationJob` already is, for the same reason: every assumption
 * `claimJobIn` is built on (an invitation) is false here too.
 *
 * The four messages are told apart without a new column: `idempotency_key`
 * is `'recruit-cycle:' || step || ':' || personId || ':' || seasonId` —
 * already the established idiom (`'event:' || eventId || ':escalation'` and
 * its siblings elsewhere in this file's sibling modules), parsed back by the
 * dispatcher, never by `template_variables`, which stays exactly what its
 * own comment says it is.
 */
export async function declareRecruitmentCycleJobsIn(
  tx: Tx,
  personId: string,
  seasonId: string,
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

  const consented = await hasGrantedSeasonMessagingConsentIn(tx, personId, seasonId);
  if (!consented) {
    return { created: [], reason: "not_consented" };
  }

  const completion = await readRecruitmentCycleCompletionIn(tx, personId, prospectRow.id);
  const steps = await listRecruitmentCycleStepsIn(tx);
  const offsetFor = (step: RecruitmentCycleStepName) =>
    steps.find((s) => s.step === step)?.offsetHours ?? 0;

  const wanted: RecruitmentCycleStepName[] = [];
  if (!completion.welcomeStepComplete) {
    wanted.push("welcome", "details_reminder");
  }
  if (!completion.questionnaireBComplete) {
    wanted.push("interest_ask", "interest_reminder");
  }

  if (wanted.length === 0) {
    return { created: [], reason: "already_complete" };
  }

  const created: RecruitmentCycleStepName[] = [];
  for (const step of wanted) {
    const scheduledFor = new Date(
      prospectRow.created_at.getTime() + offsetFor(step) * 60 * 60 * 1000,
    );
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
  }

  return { created, reason: created.length === 0 ? "already_complete" : null };
}
