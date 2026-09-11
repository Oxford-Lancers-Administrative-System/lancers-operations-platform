import "server-only";

import { ConstraintViolated, type Tx, withTransaction } from "@/lib/db";
import { actorRequirement } from "../actor";
import { deriveEntityIdFromNaturalKey, recordAudit } from "../audit";

/** Onboarding's chase configuration singleton — LAN-214, `W11`. The escalation office is read from the club's roles, never configured. Decision history: missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION */

export { currentPresidentIn as currentOnboardingEscalationOfficeIn } from "../messaging-scheduler";

export interface OnboardingChaseSettings {
  firstChaseAfterHours: number;
  /** How many automated chases run at most; zero is legal. Spent only on delivery, never a failure. Decision history: missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION */
  chaseCount: number;
  /** Whole days between one chase and the next. */
  chaseIntervalDays: number;
  updatedAt: Date;
}

interface ChaseSettingsRow {
  first_chase_after_hours: number;
  chase_count: number;
  chase_interval_days: number;
  updated_at: Date;
}

function toSettings(row: ChaseSettingsRow): OnboardingChaseSettings {
  return {
    firstChaseAfterHours: row.first_chase_after_hours,
    chaseCount: row.chase_count,
    chaseIntervalDays: row.chase_interval_days,
    updatedAt: row.updated_at,
  };
}

/** The one row `onboarding_chase_settings` ever holds — seeded by this package's migration, never inserted or deleted by the application. */
export async function readOnboardingChaseSettingsIn(tx: Tx): Promise<OnboardingChaseSettings> {
  const result = await tx.query<ChaseSettingsRow>(
    `select first_chase_after_hours, chase_count, chase_interval_days, updated_at
       from public.onboarding_chase_settings where id`,
  );
  const row = result.rows[0];
  if (!row) {
    // Structurally unreachable (the migration seeds the singleton, no delete is granted), checked anyway.
    throw new ConstraintViolated("Onboarding's chase configuration is missing its one row.", {
      rule: "onboarding_chase_settings_missing",
    });
  }
  return toSettings(row);
}

/** Convenience wrapper for a caller with no open transaction. */
export async function readOnboardingChaseSettings(): Promise<OnboardingChaseSettings> {
  return withTransaction((tx) => readOnboardingChaseSettingsIn(tx));
}

const requireActor = actorRequirement(
  "A change to onboarding's chase configuration has to name the operator who made it.",
);

/** Updates the three values in place — `W11`'s "Save; the chase runs to that from the next message onwards", nobody retrospectively reset. Trusts the caller's form validation; a genuinely out-of-range value surfaces as the schema's own refusal. Decision history: missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION */
export async function setOnboardingChaseSettingsIn(
  tx: Tx,
  params: {
    actorPersonId: string;
    firstChaseAfterHours: number;
    chaseCount: number;
    chaseIntervalDays: number;
  },
): Promise<OnboardingChaseSettings> {
  const { actorPersonId } = params;
  requireActor(actorPersonId);

  const before = await readOnboardingChaseSettingsIn(tx);

  const result = await tx.query<ChaseSettingsRow>(
    `update public.onboarding_chase_settings
        set first_chase_after_hours = $1,
            chase_count = $2,
            chase_interval_days = $3,
            updated_at = now()
      where id
      returning first_chase_after_hours, chase_count, chase_interval_days, updated_at`,
    [params.firstChaseAfterHours, params.chaseCount, params.chaseIntervalDays],
  );

  await recordAudit(tx, {
    actorPersonId,
    action: "onboarding_chase_settings_updated",
    entityTable: "onboarding_chase_settings",
    // Primary key is `id boolean` (a singleton), so entityId is derived from a fixed natural key.
    entityId: deriveEntityIdFromNaturalKey("onboarding_chase_settings", "singleton"),
    fromState: JSON.stringify({
      firstChaseAfterHours: before.firstChaseAfterHours,
      chaseCount: before.chaseCount,
      chaseIntervalDays: before.chaseIntervalDays,
    }),
    toState: JSON.stringify(params),
    context: { issue: "LAN-214" },
  });

  return toSettings(result.rows[0]);
}
