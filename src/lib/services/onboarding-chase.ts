import "server-only";

import { ConstraintViolated, type Tx, withTransaction } from "@/lib/db";
import { actorRequirement } from "./actor";
import { deriveEntityIdFromNaturalKey, recordAudit } from "./audit";
import { MAX_ATTEMPTS } from "./delivery";
import { hasGrantedSeasonMessagingConsentIn } from "./messaging-consent";
import { readCompiledOutstandingAskIn } from "./onboarding-ask";

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

// ---------------------------------------------------------------------------
// The chase's own state — LAN-218, `W8`/`W9`. No migration: every fact below
// is derived from `notification_jobs` and its own idempotency-key shape, per
// the packet's own answer (see the module note this file already carries for
// the settings singleton, and the brief this package shipped against).
// ---------------------------------------------------------------------------

/**
 * The whole state machine, as an idempotency-key shape rather than a column.
 *
 * Each automated attempt is one `notification_jobs` row, `job_type = 'other'`,
 * keyed `onboarding-chase:<membershipId>:<ordinal>` — an attempt that exists
 * cannot be queued twice (`on conflict (idempotency_key) do nothing`), so the
 * key alone is what makes "how many times has this membership been chased"
 * answerable without a counter column anywhere. An operator nudge is a
 * different key, `onboarding-nudge:<membershipId>:<nonce>`, because it is
 * unlimited and outside the cap (`T11-nudge-outside-cap`) — counting it
 * against `onboarding-chase:` would burn the automated cap on a human's own
 * action. The exhaustion marker and the escalation it raises are two more
 * shapes again, documented beside {@link onboardingChaseExhaustedMarkerKey}
 * below.
 *
 * `messaging-scheduler.ts` is the only other reader of these four prefixes —
 * imported from here rather than duplicated, because getting one of the four
 * subtly wrong there would silently stop counting, chasing or escalating
 * rather than fail loudly.
 */
export const ONBOARDING_CHASE_KEY_PREFIX = "onboarding-chase:";
export const ONBOARDING_NUDGE_KEY_PREFIX = "onboarding-nudge:";
export const ONBOARDING_CHASE_EXHAUSTED_MARKER_PREFIX = "onboarding-chase-exhausted:";
export const ONBOARDING_CHASE_ESCALATION_KEY_PREFIX = "onboarding-chase-escalation:";

/** One automated attempt's key. `ordinal` is 1-based — the first chase is `:1`. */
export function onboardingChaseIdempotencyKey(membershipId: string, ordinal: number): string {
  return `${ONBOARDING_CHASE_KEY_PREFIX}${membershipId}:${ordinal}`;
}

/** One operator nudge's key. `nonce` only has to be unique per press — a fresh random id. */
export function onboardingNudgeIdempotencyKey(membershipId: string, nonce: string): string {
  return `${ONBOARDING_NUDGE_KEY_PREFIX}${membershipId}:${nonce}`;
}

/**
 * The exhaustion marker — one row per membership, ever, the moment its
 * automated chase first reaches `chaseCount` delivered attempts. It carries
 * no message of its own (`status: 'completed'` from the moment it is
 * written; nothing dispatches it) and exists only so a second sweep tick
 * cannot tell the office about the same exhausted membership twice. Every
 * marker this call inserts in one tick is one exhausted cohort, batched into
 * exactly one escalation job — see `raiseDueOnboardingChaseEscalations` in
 * `messaging-scheduler.ts`.
 */
export function onboardingChaseExhaustedMarkerKey(membershipId: string): string {
  return `${ONBOARDING_CHASE_EXHAUSTED_MARKER_PREFIX}${membershipId}`;
}

/**
 * Under 18, from the derived standing view — `REQ-restricted-fields`: date of
 * birth itself never reaches this module. `null` (no date of birth on file)
 * reads as `false` here, deliberately: a person cannot be chased to *supply*
 * their date of birth if the absence of one already silenced every message,
 * and only a recorded, positive flag ever blocks a send.
 */
export async function isPersonUnder18In(tx: Tx, personId: string): Promise<boolean> {
  const result = await tx.query<{ is_under_18: boolean | null }>(
    `select is_under_18 from public.person_standing where person_id = $1::uuid`,
    [personId],
  );
  return result.rows[0]?.is_under_18 === true;
}

export interface OnboardingChaseProgress {
  /** Spent only on delivery (`T11-cap-delivered`) — a `failed`/`rejected` outcome is never counted here. */
  readonly deliveredCount: number;
  readonly lastDeliveredAt: Date | null;
  /**
   * The membership's own next undelivered ordinal has reached
   * `MAX_ATTEMPTS` and is `failed` with nothing further scheduled —
   * `T11-terminal-failure`, `W8-03`. Distinct from `exhausted`: this
   * membership's cap has *not* run out, delivery to it has.
   */
  readonly currentAttemptTerminallyFailed: boolean;
}

const NO_PROGRESS: OnboardingChaseProgress = Object.freeze({
  deliveredCount: 0,
  lastDeliveredAt: null,
  currentAttemptTerminallyFailed: false,
});

/**
 * Every membership's chase progress, read from `notification_jobs` and
 * `delivery_results` rather than a counter — batched over `membershipIds`
 * rather than one query per row, on `people-directory.ts`'s own "fetch wide"
 * idiom.
 *
 * Two queries, deliberately not one: which attempts delivered (an aggregate,
 * every ordinal) and what the *latest* ordinal's own outcome is (`distinct
 * on`, highest ordinal only) answer different questions, and folding both
 * into one query bought nothing but a harder-to-read one. Both read a job's
 * current truth as its **latest attempt's own `delivery_results` row**, never
 * the job's `status` column — `delivery.ts`'s `DELIVERY_LATEST_RESULT_JOIN`
 * comment's own reasoning, applied here rather than imported, because that
 * constant's SQL text hard-codes the alias `j` for `notification_jobs` and
 * this module's own join needs `occurred_at` alongside `outcome`, which that
 * shared text does not select.
 */
export async function readOnboardingChaseProgressIn(
  tx: Tx,
  membershipIds: readonly string[],
): Promise<ReadonlyMap<string, OnboardingChaseProgress>> {
  const progress = new Map<string, OnboardingChaseProgress>();
  if (membershipIds.length === 0) return progress;

  const membershipIdPattern = `^${ONBOARDING_CHASE_KEY_PREFIX}([0-9a-f-]+):`;
  const latestAttemptJoin = `
    left join lateral (
      select r.outcome::text as outcome, r.occurred_at
        from public.delivery_results r
       where r.notification_job_id = j.id
       order by r.attempt_number desc
       limit 1
    ) latest on true`;

  const [delivered, latest] = await Promise.all([
    tx.query<{ membership_id: string; delivered_count: number; last_delivered_at: Date | null }>(
      `select
          substring(j.idempotency_key from '${membershipIdPattern}') as membership_id,
          count(*) filter (where latest.outcome = 'delivered')::int as delivered_count,
          max(latest.occurred_at) filter (where latest.outcome = 'delivered') as last_delivered_at
        from public.notification_jobs j
        ${latestAttemptJoin}
       where j.idempotency_key like '${ONBOARDING_CHASE_KEY_PREFIX}%'
         and substring(j.idempotency_key from '${membershipIdPattern}') = any($1::text[])
       group by 1`,
      [membershipIds],
    ),
    tx.query<{
      membership_id: string;
      status: string;
      attempt_count: number;
      outcome: string | null;
    }>(
      `select distinct on (membership_id)
          substring(j.idempotency_key from '${membershipIdPattern}') as membership_id,
          j.status::text as status,
          j.attempt_count,
          latest.outcome
        from public.notification_jobs j
        ${latestAttemptJoin}
       where j.idempotency_key like '${ONBOARDING_CHASE_KEY_PREFIX}%'
         and substring(j.idempotency_key from '${membershipIdPattern}') = any($1::text[])
       order by membership_id,
                (substring(j.idempotency_key from ':(\\d+)$'))::int desc`,
      [membershipIds],
    ),
  ]);

  const terminallyFailed = new Set<string>();
  for (const row of latest.rows) {
    if (!row.membership_id) continue;
    if (
      row.outcome !== "delivered" &&
      row.status === "failed" &&
      row.attempt_count >= MAX_ATTEMPTS
    ) {
      terminallyFailed.add(row.membership_id);
    }
  }

  for (const row of delivered.rows) {
    if (!row.membership_id) continue;
    progress.set(row.membership_id, {
      deliveredCount: row.delivered_count,
      lastDeliveredAt: row.last_delivered_at,
      currentAttemptTerminallyFailed: terminallyFailed.has(row.membership_id),
    });
  }
  // A membership with a terminal-failure marker but zero delivered attempts
  // still appears in `latest.rows` but not necessarily in `delivered.rows`'s
  // aggregate (an aggregate over zero matching filtered rows still groups,
  // but belt and braces: a membership present only in `latest` is folded in).
  for (const membershipId of terminallyFailed) {
    if (!progress.has(membershipId)) {
      progress.set(membershipId, { ...NO_PROGRESS, currentAttemptTerminallyFailed: true });
    }
  }

  return progress;
}

/** One onboarding membership, everything the sweep and the queue both need to know about its chase. */
export interface OnboardingChaseCandidate {
  readonly membershipId: string;
  readonly personId: string;
  readonly seasonId: string;
  /** The membership's own `created_at` — "from joining" (`W11`). */
  readonly joinedAt: Date;
  readonly deliveredCount: number;
  readonly lastDeliveredAt: Date | null;
  readonly currentAttemptTerminallyFailed: boolean;
  /** From the compiled ask — a missing required field or an unresolved checklist item, either counts. */
  readonly hasOutstanding: boolean;
  readonly hasConsent: boolean;
  readonly isUnder18: boolean;
}

/**
 * Every membership currently `onboarding`, with its chase progress and
 * eligibility — the one list both `declareDueOnboardingChasesIn` and
 * `raiseDueOnboardingChaseEscalations` (`messaging-scheduler.ts`) and the
 * missing-data queue's own "Next" column read from, so the sweep's idea of
 * "due" and the queue's idea of "what it will say" can never quietly
 * disagree.
 *
 * Fetches every onboarding membership, then reads each one's compiled ask,
 * consent and under-18 flag — `people-directory.ts`'s own "hundreds, not
 * millions" reasoning: this mission's collection loop is players, one season
 * at a time.
 */
interface MembershipRow {
  id: string;
  person_id: string;
  season_id: string;
  created_at: Date;
}

/** Shared by both readers below — the one place a candidate's fields are actually assembled. */
async function buildCandidatesIn(
  tx: Tx,
  memberships: readonly MembershipRow[],
): Promise<OnboardingChaseCandidate[]> {
  if (memberships.length === 0) return [];

  const progress = await readOnboardingChaseProgressIn(
    tx,
    memberships.map((row) => row.id),
  );

  const candidates: OnboardingChaseCandidate[] = [];
  for (const row of memberships) {
    const [ask, hasConsent, isUnder18] = await Promise.all([
      readCompiledOutstandingAskIn(tx, row.person_id, row.season_id),
      hasGrantedSeasonMessagingConsentIn(tx, row.person_id, row.season_id),
      isPersonUnder18In(tx, row.person_id),
    ]);
    const hasOutstanding =
      ask !== null && (ask.missingRequiredFields.length > 0 || ask.outstandingItems.length > 0);
    const p = progress.get(row.id) ?? NO_PROGRESS;

    candidates.push({
      membershipId: row.id,
      personId: row.person_id,
      seasonId: row.season_id,
      joinedAt: row.created_at,
      deliveredCount: p.deliveredCount,
      lastDeliveredAt: p.lastDeliveredAt,
      currentAttemptTerminallyFailed: p.currentAttemptTerminallyFailed,
      hasOutstanding,
      hasConsent,
      isUnder18,
    });
  }
  return candidates;
}

export async function listOnboardingChaseCandidatesIn(
  tx: Tx,
): Promise<readonly OnboardingChaseCandidate[]> {
  const memberships = await tx.query<MembershipRow>(
    `select id, person_id, season_id, created_at
       from public.season_memberships
      where status = 'onboarding'`,
  );
  return buildCandidatesIn(tx, memberships.rows);
}

/**
 * The identical candidate, scoped to exactly the memberships named — the
 * missing-data queue's own reader (`W8`), which never needs every onboarding
 * membership in the club, only the rows a filtered, paged view actually
 * shows. Reuses {@link buildCandidatesIn} so the queue's "Next" column and
 * the sweep's own due check can never quietly disagree about what a
 * membership's chase state is.
 */
export async function readOnboardingChaseCandidatesForMembershipsIn(
  tx: Tx,
  membershipIds: readonly string[],
): Promise<ReadonlyMap<string, OnboardingChaseCandidate>> {
  if (membershipIds.length === 0) return new Map();
  const memberships = await tx.query<MembershipRow>(
    `select id, person_id, season_id, created_at
       from public.season_memberships
      where id = any($1::uuid[])`,
    [membershipIds],
  );
  const candidates = await buildCandidatesIn(tx, memberships.rows);
  return new Map(candidates.map((candidate) => [candidate.membershipId, candidate]));
}

/** What the queue's "Next" column says, per `T11-visibility` / `REQ-queue-visibility`. */
export type OnboardingChaseNext =
  | { readonly kind: "scheduled"; readonly at: Date }
  | { readonly kind: "exhausted" }
  | { readonly kind: "unmessageable"; readonly reason: "no_consent" | "under_18" }
  | { readonly kind: "terminal_failure" }
  | { readonly kind: "no_automated_chase" };

/**
 * The pure derivation behind the queue's "Next" column and the sweep's own
 * due check — `describeOnboardingChaseNext` and `declareDueOnboardingChasesIn`
 * read the identical fields of the identical candidate, so the queue can
 * never say "2 Sep" about a membership the sweep has already decided not to
 * chase.
 *
 * Order matters and is deliberate: a chase that has run its full course
 * (`exhausted`) is reported before a person's messageability is even
 * considered, because `W9`'s exhaustion is permanent and does not become
 * "unmessageable" retroactively if consent is later withdrawn — and an
 * under-18 flag is checked before consent, because a person can hold granted
 * consent and still be unmessageable by the stricter rule.
 */
export function describeOnboardingChaseNext(
  candidate: Pick<
    OnboardingChaseCandidate,
    | "deliveredCount"
    | "lastDeliveredAt"
    | "joinedAt"
    | "hasConsent"
    | "isUnder18"
    | "currentAttemptTerminallyFailed"
  >,
  settings: Pick<
    OnboardingChaseSettings,
    "chaseCount" | "firstChaseAfterHours" | "chaseIntervalDays"
  >,
): OnboardingChaseNext {
  if (settings.chaseCount === 0) return { kind: "no_automated_chase" };
  if (candidate.deliveredCount >= settings.chaseCount) return { kind: "exhausted" };
  if (candidate.isUnder18) return { kind: "unmessageable", reason: "under_18" };
  if (!candidate.hasConsent) return { kind: "unmessageable", reason: "no_consent" };
  if (candidate.currentAttemptTerminallyFailed) return { kind: "terminal_failure" };

  const base =
    candidate.deliveredCount === 0
      ? candidate.joinedAt
      : (candidate.lastDeliveredAt ?? candidate.joinedAt);
  const hours =
    candidate.deliveredCount === 0
      ? settings.firstChaseAfterHours
      : settings.chaseIntervalDays * 24;
  return { kind: "scheduled", at: new Date(base.getTime() + hours * 3_600_000) };
}

/** `T11-visibility`'s "when, and what kind" — the welcome, an automated follow-up, or a human nudge. */
export type OnboardingLastContactKind = "welcome" | "follow_up" | "nudge";

export interface OnboardingLastContact {
  readonly occurredAt: Date;
  readonly kind: OnboardingLastContactKind;
  /** The follow-up's own ordinal — `follow_up` only, one-based. */
  readonly ordinal: number | null;
  /** Who nudged — `nudge` only. `null` when the operator's identity was not recorded. */
  readonly byDisplayName: string | null;
}

const NUDGE_CHANNEL = "operator nudge";

/**
 * The queue's "Last contact" column — `T11-visibility`. Reads
 * `onboarding_activity_log` (`REQ-activity-log`) rather than
 * `notification_jobs`, because a nudge and an automated attempt look
 * identical on the job table (`onboarding-chase:`/`onboarding-nudge:` differ
 * only in the id neither the queue nor an operator ever sees) and the log is
 * the one place "asked automatically" and "asked by an operator" were
 * written apart, at the moment each ask happened
 * ({@link recordOnboardingActivityIn}'s own callers in `messaging-scheduler.ts`).
 *
 * `null` for a membership never yet contacted — a real, unremarkable answer
 * for someone the welcome has not reached, or whose chase count is zero.
 */
export async function readOnboardingLastContactIn(
  tx: Tx,
  membershipId: string,
): Promise<OnboardingLastContact | null> {
  const result = await tx.query<{
    occurred_at: Date;
    section: string;
    channel: string;
    actor_person_id: string | null;
  }>(
    `select occurred_at, section, channel, actor_person_id
       from public.onboarding_activity_log
      where season_membership_id = $1::uuid and kind = 'ask'
      order by occurred_at desc
      limit 1`,
    [membershipId],
  );
  const row = result.rows[0];
  if (!row) return null;

  if (row.section === "welcome") {
    return { occurredAt: row.occurred_at, kind: "welcome", ordinal: null, byDisplayName: null };
  }

  if (row.channel === NUDGE_CHANNEL) {
    const person = row.actor_person_id
      ? await tx.query<{ given_name: string }>(
          `select given_name from public.people where id = $1::uuid`,
          [row.actor_person_id],
        )
      : null;
    return {
      occurredAt: row.occurred_at,
      kind: "nudge",
      ordinal: null,
      byDisplayName: person?.rows[0]?.given_name ?? null,
    };
  }

  const ordinal = await tx.query<{ count: number }>(
    `select count(*)::int as count
       from public.onboarding_activity_log
      where season_membership_id = $1::uuid and kind = 'ask' and section = 'chase'
        and channel <> $2 and occurred_at <= $3`,
    [membershipId, NUDGE_CHANNEL, row.occurred_at],
  );

  return {
    occurredAt: row.occurred_at,
    kind: "follow_up",
    ordinal: ordinal.rows[0]?.count ?? null,
    byDisplayName: null,
  };
}

/** One row's worth of what the missing-data queue's own columns need — `W8-01` through `W8-03`. */
export interface OnboardingChaseQueueInfo {
  readonly lastContact: OnboardingLastContact | null;
  readonly next: OnboardingChaseNext;
}

/**
 * The queue's own composite read — `readOnboardingLastContactIn` and
 * `describeOnboardingChaseNext`, batched over every membership the page is
 * about to render, with the chase settings read once rather than once per
 * row. The one function `/operate/people/missing` calls for everything this
 * package's three columns need.
 */
export async function readOnboardingChaseQueueInfoIn(
  tx: Tx,
  membershipIds: readonly string[],
): Promise<ReadonlyMap<string, OnboardingChaseQueueInfo>> {
  const info = new Map<string, OnboardingChaseQueueInfo>();
  if (membershipIds.length === 0) return info;

  const [settings, candidates] = await Promise.all([
    readOnboardingChaseSettingsIn(tx),
    readOnboardingChaseCandidatesForMembershipsIn(tx, membershipIds),
  ]);

  for (const membershipId of membershipIds) {
    const candidate = candidates.get(membershipId);
    const lastContact = await readOnboardingLastContactIn(tx, membershipId);
    const next: OnboardingChaseNext = candidate
      ? describeOnboardingChaseNext(candidate, settings)
      : { kind: "no_automated_chase" };
    info.set(membershipId, { lastContact, next });
  }

  return info;
}
