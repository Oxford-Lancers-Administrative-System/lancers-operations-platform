import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import { deriveEntityIdFromNaturalKey, recordAudit } from "./audit";

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
 * ## What it deliberately does not own yet
 *
 * A declaration function that turns "recruit X was captured" into the
 * `notification_jobs` rows the four steps describe. W10 draws the line in
 * words — "recruitment declares a cycle and never schedules; Mission 4's
 * scheduler runs whatever this declares" — and this migration's own header
 * explains why that line is not crossed here: no caller in `main` triggers a
 * capture yet (LAN-205/LAN-206), and none of LAN-199's four templates are
 * Meta-approved either way, so there is nothing this function could safely
 * be exercised against. This module is the "built" half of "the cycle can be
 * built and cannot run" (LAN-203 boundary) — the declaration's own storage
 * and administration — not the run.
 */

/** The four surviving steps, in the order the migration seeds them and the admin page renders them. */
export type RecruitmentCycleStepName =
  | "welcome"
  | "details_reminder"
  | "interest_ask"
  | "interest_reminder";

export interface RecruitmentCycleStep {
  readonly step: RecruitmentCycleStepName;
  readonly enabled: boolean;
  /** Whole hours after capture. */
  readonly offsetHours: number;
  readonly updatedAt: Date;
}

const STEP_COLUMNS = `step::text as step, enabled, offset_hours, updated_at`;

interface StepRow {
  step: string;
  enabled: boolean;
  offset_hours: number;
  updated_at: Date;
}

function toStep(row: StepRow): RecruitmentCycleStep {
  return {
    step: row.step as RecruitmentCycleStepName,
    enabled: row.enabled,
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
  readonly enabled: boolean;
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
        set enabled = $2,
            offset_hours = $3,
            updated_at = now()
      where step = $1
     returning ${STEP_COLUMNS}`,
    [step, change.enabled, change.offsetHours],
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
