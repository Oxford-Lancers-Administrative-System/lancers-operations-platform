import "server-only";

import { ConstraintViolated, type Tx, withTransaction } from "@/lib/db";
import { actorRequirement } from "./actor";
import { deriveEntityIdFromNaturalKey, recordAudit } from "./audit";

/**
 * Onboarding's chase configuration — LAN-214, `W11`. Exactly the three
 * values `OD7-cadence-is-the-config` names: how long after joining the first
 * chase goes, how many times it asks, and how far apart. Nothing else —
 * there is deliberately no "give up after" value (`OD7-cadence-is-the-config`:
 * "'Give up after' is not a good number" — it is `chaseCount × chaseIntervalDays`),
 * no quiet hours, no per-item owner, and no escalation-office column.
 *
 * ## The escalation office is read, never configured
 *
 * `W9`/`W11`'s own locked decision: "The office is read from the club's
 * roles, never configured… `roles` ships the presiding office as a
 * constitutional seat with `role_assignments` naming its holder. Nothing to
 * set." (The seat's own code is `LEADERSHIP_TIER_SEATS.presiding` in
 * `src/lib/auth/capabilities.ts` — the one module that names it, per
 * `tests/capability-map-single-source.test.ts`; it is deliberately not
 * repeated here as a literal.)
 * `messaging-scheduler.ts` already built exactly that read —
 * {@link currentPresidentIn} — for the identical office, by the identical
 * mechanism (`public.roles` / `public.role_assignments`, keyed through
 * `LEADERSHIP_TIER_SEATS` so the role code has one source across the whole
 * codebase). This module re-exports it rather than reimplementing it: a
 * second resolver of the same office is exactly the kind of duplication that
 * could disagree with the first one.
 */

export { currentPresidentIn as currentOnboardingEscalationOfficeIn } from "./messaging-scheduler";

export interface OnboardingChaseSettings {
  /** Hours from a membership joining onboarding to its first automated chase. */
  firstChaseAfterHours: number;
  /** How many automated chases run at most. Zero is legal — no automated chase at all (delegated to the Mission Lead, settled). Spent only on delivery, never a failure. */
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
    // Structurally unreachable — the migration seeds the singleton row and
    // grants the application no delete — but a service function does not
    // assume a database invariant it can check for free.
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

/**
 * Updates the three values in place — `W11`'s own "Save. The chase runs to
 * that from the next message onwards": nobody's count is retrospectively
 * reset and nobody already exhausted is restarted (`W8`'s own exception,
 * unaffected by this write). The schema's own sanity checks
 * (`onboarding_chase_settings_count_is_sane` and its two siblings) are the
 * backstop; this function trusts the caller's form validation and lets a
 * genuinely out-of-range value surface as the database's own refusal.
 */
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
    // The table's own primary key is `id boolean` — a singleton, never a
    // uuid — so `entity_id` is derived from a fixed natural key, the same
    // idiom `messaging-schedule.ts` uses for `messaging_schedules`, whose
    // primary key (`event_type`) is not a uuid either.
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

/** Convenience wrapper for a caller with no open transaction. */
export async function setOnboardingChaseSettings(
  params: Parameters<typeof setOnboardingChaseSettingsIn>[1],
): Promise<OnboardingChaseSettings> {
  return withTransaction((tx) => setOnboardingChaseSettingsIn(tx, params));
}
