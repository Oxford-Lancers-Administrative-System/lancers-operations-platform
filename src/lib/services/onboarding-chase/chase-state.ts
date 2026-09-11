import "server-only";

import { type Tx } from "@/lib/db";
import { selectMobileNumber } from "@/lib/delivery/phone";
import { MAX_ATTEMPTS } from "../delivery";
import { hasGrantedSeasonMessagingConsentIn } from "../messaging-consent";
import { readCompiledOutstandingAskIn } from "../onboarding-ask";
import { DEFAULT_CALLING_CODE } from "../person-validation";
import { readOnboardingChaseSettingsIn, type OnboardingChaseSettings } from "./settings";

// The chase's own state — LAN-218, `W8`/`W9`. No migration: every fact below is derived from
// `notification_jobs` and its idempotency-key shape.

/** The whole state machine, as an idempotency-key shape rather than a column: `onboarding-chase:<membershipId>:<ordinal>` for an automated attempt (deduped via `on conflict do nothing`), `onboarding-nudge:<membershipId>:<nonce>` for a nudge, unlimited and outside the cap (`T11-nudge-outside-cap`). `messaging-scheduler.ts` imports these prefixes from here rather than duplicating them. */
export const ONBOARDING_CHASE_KEY_PREFIX = "onboarding-chase:";
export const ONBOARDING_NUDGE_KEY_PREFIX = "onboarding-nudge:";
const ONBOARDING_CHASE_EXHAUSTED_MARKER_PREFIX = "onboarding-chase-exhausted:";
export const ONBOARDING_CHASE_ESCALATION_KEY_PREFIX = "onboarding-chase-escalation:";

/** One automated attempt's key. `ordinal` is 1-based — the first chase is `:1`. */
export function onboardingChaseIdempotencyKey(membershipId: string, ordinal: number): string {
  return `${ONBOARDING_CHASE_KEY_PREFIX}${membershipId}:${ordinal}`;
}

/** One operator nudge's key. `nonce` only has to be unique per press — a fresh random id. */
export function onboardingNudgeIdempotencyKey(membershipId: string, nonce: string): string {
  return `${ONBOARDING_NUDGE_KEY_PREFIX}${membershipId}:${nonce}`;
}

/** The exhaustion marker — one row per membership, ever, once its chase reaches `chaseCount` delivered attempts; carries no message, exists only so a second sweep tick cannot re-tell the office. */
export function onboardingChaseExhaustedMarkerKey(membershipId: string): string {
  return `${ONBOARDING_CHASE_EXHAUSTED_MARKER_PREFIX}${membershipId}`;
}

/** Under 18, from the derived standing view (`REQ-restricted-fields`: date of birth never reaches this module). `null` reads as `false`, deliberately — only a recorded, positive flag blocks a send. */
export async function isPersonUnder18In(tx: Tx, personId: string): Promise<boolean> {
  const result = await tx.query<{ is_under_18: boolean | null }>(
    `select is_under_18 from public.person_standing where person_id = $1::uuid`,
    [personId],
  );
  return result.rows[0]?.is_under_18 === true;
}

export interface OnboardingChaseProgress {
  /** Asks actually delivered, automated and manual alike — spent only on delivery (`T11-cap-delivered`), never a failed/rejected outcome. Manual asks joined the count for LAN-266. */
  readonly deliveredCount: number;
  /** The most recent delivered ask of either kind — the base the next automated chase is spaced from. */
  readonly lastDeliveredAt: Date | null;
  /** The next undelivered ordinal reached `MAX_ATTEMPTS` and is `failed`, nothing further scheduled (`T11-terminal-failure`, `W8-03`) — distinct from `exhausted`: the cap has not run out, delivery has. */
  readonly currentAttemptTerminallyFailed: boolean;
  /** Same provider-neutral sentence `delivery.ts` shows an operator, read from the failed attempt's own `delivery_results.detail`. `null` unless {@link currentAttemptTerminallyFailed}. */
  readonly terminalFailureReason: string | null;
  /** Highest automated-attempt ordinal for this membership, or `0` — read from the keys that exist, not inferred from {@link deliveredCount} (LAN-266). */
  readonly automatedOrdinal: number;
  /** Whether the highest existing automated attempt has yet to deliver (pending, retrying, or failed); `false` when there is none. */
  readonly automatedAttemptOutstanding: boolean;
}

const NO_PROGRESS: OnboardingChaseProgress = Object.freeze({
  deliveredCount: 0,
  lastDeliveredAt: null,
  currentAttemptTerminallyFailed: false,
  terminalFailureReason: null,
  automatedOrdinal: 0,
  automatedAttemptOutstanding: false,
});

/** Every membership's chase progress, read from `notification_jobs` and `delivery_results` rather than a counter. Two queries deliberately, not one (delivered aggregate over both ask prefixes; latest automated ordinal's own outcome, `onboarding-chase:` only). */
export async function readOnboardingChaseProgressIn(
  tx: Tx,
  membershipIds: readonly string[],
): Promise<ReadonlyMap<string, OnboardingChaseProgress>> {
  const progress = new Map<string, OnboardingChaseProgress>();
  if (membershipIds.length === 0) return progress;

  const membershipIdPattern = `^${ONBOARDING_CHASE_KEY_PREFIX}([0-9a-f-]+):`;
  // One pattern reads the membership out of either ask prefix — LAN-266.
  const askIdPattern = `^onboarding-(?:chase|nudge):([0-9a-f-]+):`;
  const latestAttemptJoin = `
    left join lateral (
      select r.outcome::text as outcome, r.occurred_at, r.detail
        from public.delivery_results r
       where r.notification_job_id = j.id
       order by r.attempt_number desc
       limit 1
    ) latest on true`;

  // Sequential, not `Promise.all` (LAN-301): one transaction client, which `pg`
  // serialises anyway — loudly, since pg@8.
  const delivered = await tx.query<{
    membership_id: string;
    delivered_count: number;
    last_delivered_at: Date | null;
  }>(
    `select
          substring(j.idempotency_key from '${askIdPattern}') as membership_id,
          count(*) filter (where latest.outcome = 'delivered')::int as delivered_count,
          max(latest.occurred_at) filter (where latest.outcome = 'delivered') as last_delivered_at
        from public.notification_jobs j
        ${latestAttemptJoin}
       where (j.idempotency_key like '${ONBOARDING_CHASE_KEY_PREFIX}%'
              or j.idempotency_key like '${ONBOARDING_NUDGE_KEY_PREFIX}%')
         and substring(j.idempotency_key from '${askIdPattern}') = any($1::text[])
       group by 1`,
    [membershipIds],
  );
  const latest = await tx.query<{
    membership_id: string;
    status: string;
    attempt_count: number;
    outcome: string | null;
    detail: string | null;
    ordinal: number;
  }>(
    `select distinct on (membership_id)
          substring(j.idempotency_key from '${membershipIdPattern}') as membership_id,
          j.status::text as status,
          j.attempt_count,
          latest.outcome,
          latest.detail,
          (substring(j.idempotency_key from ':(\\d+)$'))::int as ordinal
        from public.notification_jobs j
        ${latestAttemptJoin}
       where j.idempotency_key like '${ONBOARDING_CHASE_KEY_PREFIX}%'
         and substring(j.idempotency_key from '${membershipIdPattern}') = any($1::text[])
       order by membership_id,
                (substring(j.idempotency_key from ':(\\d+)$'))::int desc`,
    [membershipIds],
  );

  const terminallyFailed = new Set<string>();
  const terminalFailureReasons = new Map<string, string | null>();
  const automatedOrdinals = new Map<string, number>();
  const automatedOutstanding = new Set<string>();
  for (const row of latest.rows) {
    if (!row.membership_id) continue;
    automatedOrdinals.set(row.membership_id, row.ordinal ?? 0);
    if (row.outcome !== "delivered") automatedOutstanding.add(row.membership_id);
    if (
      row.outcome !== "delivered" &&
      row.status === "failed" &&
      row.attempt_count >= MAX_ATTEMPTS
    ) {
      terminallyFailed.add(row.membership_id);
      terminalFailureReasons.set(row.membership_id, row.detail);
    }
  }

  for (const row of delivered.rows) {
    if (!row.membership_id) continue;
    const isTerminallyFailed = terminallyFailed.has(row.membership_id);
    progress.set(row.membership_id, {
      deliveredCount: row.delivered_count,
      lastDeliveredAt: row.last_delivered_at,
      currentAttemptTerminallyFailed: isTerminallyFailed,
      terminalFailureReason: isTerminallyFailed
        ? (terminalFailureReasons.get(row.membership_id) ?? null)
        : null,
      automatedOrdinal: automatedOrdinals.get(row.membership_id) ?? 0,
      automatedAttemptOutstanding: automatedOutstanding.has(row.membership_id),
    });
  }
  // Belt and braces: a membership present only in `latest.rows` is folded in.
  for (const membershipId of automatedOrdinals.keys()) {
    if (!progress.has(membershipId)) {
      progress.set(membershipId, {
        ...NO_PROGRESS,
        currentAttemptTerminallyFailed: terminallyFailed.has(membershipId),
        terminalFailureReason: terminalFailureReasons.get(membershipId) ?? null,
        automatedOrdinal: automatedOrdinals.get(membershipId) ?? 0,
        automatedAttemptOutstanding: automatedOutstanding.has(membershipId),
      });
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
  readonly terminalFailureReason: string | null;
  readonly automatedOrdinal: number;
  readonly automatedAttemptOutstanding: boolean;
  /** From the compiled ask — a missing required field or an unresolved checklist item, either counts. */
  readonly hasOutstanding: boolean;
  readonly hasConsent: boolean;
  /** Whether anything could actually be sent — `selectMobileNumber`'s own question (the send path's own function), not "a mobile field is present", so the queue, the send button and the actual send can never disagree (LAN-249). */
  readonly hasReachableNumber: boolean;
  readonly isUnder18: boolean;
}

/** Every membership currently `onboarding`, with its chase progress and eligibility — the one list the sweep, the escalation raiser and the missing-data queue all read from, so they can never quietly disagree. */
interface MembershipRow {
  id: string;
  person_id: string;
  season_id: string;
  created_at: Date;
}

/** Which of these people a message could actually be sent to — LAN-249. Batched, not one query per row. The decision is `selectMobileNumber`'s; see {@link OnboardingChaseCandidate.hasReachableNumber}. Only current contact points count (`valid_until is null`). */
async function readReachablePersonIdsIn(
  tx: Tx,
  personIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const reachable = new Set<string>();
  if (personIds.length === 0) return reachable;

  const result = await tx.query<{
    person_id: string;
    kind: string;
    raw_value: string;
    normalised_value: string | null;
    is_preferred: boolean;
  }>(
    `select person_id, kind::text as kind, raw_value, normalised_value, is_preferred
       from public.contact_points
      where person_id = any($1::uuid[]) and kind = 'phone' and valid_until is null`,
    [personIds],
  );

  const byPerson = new Map<
    string,
    { kind: string; rawValue: string; normalisedValue: string | null; isPreferred: boolean }[]
  >();
  for (const row of result.rows) {
    const list = byPerson.get(row.person_id) ?? [];
    list.push({
      kind: row.kind,
      rawValue: row.raw_value,
      normalisedValue: row.normalised_value,
      isPreferred: row.is_preferred,
    });
    byPerson.set(row.person_id, list);
  }

  for (const [personId, contacts] of byPerson) {
    if (selectMobileNumber(contacts, DEFAULT_CALLING_CODE) !== null) reachable.add(personId);
  }
  return reachable;
}

/** Shared by both readers below — the one place a candidate's fields are actually assembled. */
async function buildCandidatesIn(
  tx: Tx,
  memberships: readonly MembershipRow[],
): Promise<OnboardingChaseCandidate[]> {
  if (memberships.length === 0) return [];

  // Sequential, not `Promise.all` (LAN-301): one transaction client, which `pg`
  // serialises anyway — loudly, since pg@8.
  const progress = await readOnboardingChaseProgressIn(
    tx,
    memberships.map((row) => row.id),
  );
  const reachable = await readReachablePersonIdsIn(
    tx,
    memberships.map((row) => row.person_id),
  );

  const candidates: OnboardingChaseCandidate[] = [];
  for (const row of memberships) {
    const ask = await readCompiledOutstandingAskIn(tx, row.person_id, row.season_id);
    const hasConsent = await hasGrantedSeasonMessagingConsentIn(tx, row.person_id, row.season_id);
    const isUnder18 = await isPersonUnder18In(tx, row.person_id);
    const hasOutstanding =
      ask !== null && (ask.missingRequiredFields.length > 0 || ask.outstandingItems.length > 0);
    const hasReachableNumber = reachable.has(row.person_id);
    const p = progress.get(row.id) ?? NO_PROGRESS;

    candidates.push({
      membershipId: row.id,
      personId: row.person_id,
      seasonId: row.season_id,
      joinedAt: row.created_at,
      deliveredCount: p.deliveredCount,
      lastDeliveredAt: p.lastDeliveredAt,
      currentAttemptTerminallyFailed: p.currentAttemptTerminallyFailed,
      terminalFailureReason: p.terminalFailureReason,
      automatedOrdinal: p.automatedOrdinal,
      automatedAttemptOutstanding: p.automatedAttemptOutstanding,
      hasOutstanding,
      hasConsent,
      hasReachableNumber,
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

/** The identical candidate, scoped to exactly the memberships named — the missing-data queue's own reader (`W8`). Reuses {@link buildCandidatesIn} so the queue and the sweep can never disagree. */
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

/** What the queue's "Next" column says (`T11-visibility` / `REQ-queue-visibility`). */
export type OnboardingChaseNext =
  | { readonly kind: "scheduled"; readonly at: Date }
  | { readonly kind: "exhausted" }
  | { readonly kind: "unmessageable"; readonly reason: "no_channel" | "under_18" }
  | { readonly kind: "terminal_failure"; readonly reason: string | null }
  | { readonly kind: "no_automated_chase" };

/** The pure derivation behind the queue's "Next" column and the sweep's own due check, reading the identical candidate fields so the two can never disagree. Order is deliberate and load-bearing: `exhausted` (permanent) before messageability; `under_18` before `no_channel`; `no_channel` before `terminal_failure`, since a missing number must never be masked by a generic "ran out of retries" verdict. No `no_consent` state: a team member without consent still receives the welcome/consent form. */
export function describeOnboardingChaseNext(
  candidate: Pick<
    OnboardingChaseCandidate,
    | "deliveredCount"
    | "lastDeliveredAt"
    | "joinedAt"
    | "hasReachableNumber"
    | "isUnder18"
    | "currentAttemptTerminallyFailed"
    | "terminalFailureReason"
  >,
  settings: Pick<
    OnboardingChaseSettings,
    "chaseCount" | "firstChaseAfterHours" | "chaseIntervalDays"
  >,
): OnboardingChaseNext {
  if (settings.chaseCount === 0) return { kind: "no_automated_chase" };
  if (candidate.deliveredCount >= settings.chaseCount) return { kind: "exhausted" };
  if (candidate.isUnder18) return { kind: "unmessageable", reason: "under_18" };
  if (!candidate.hasReachableNumber) return { kind: "unmessageable", reason: "no_channel" };
  if (candidate.currentAttemptTerminallyFailed) {
    return { kind: "terminal_failure", reason: candidate.terminalFailureReason };
  }

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
type OnboardingLastContactKind = "welcome" | "follow_up" | "nudge";

export interface OnboardingLastContact {
  readonly occurredAt: Date;
  readonly kind: OnboardingLastContactKind;
  /** The follow-up's own ordinal — `follow_up` only, one-based. */
  readonly ordinal: number | null;
  /** Who nudged — `nudge` only. `null` when the operator's identity was not recorded. */
  readonly byDisplayName: string | null;
}

const NUDGE_CHANNEL = "operator nudge";

/** The queue's "Last contact" column — `T11-visibility`. Reads `onboarding_activity_log` (`REQ-activity-log`), not `notification_jobs` (a nudge and an automated attempt look identical there). `null` for a membership never yet contacted. */
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
  /** Carried alongside `next` rather than re-derived: `next.kind` alone can't tell the queue "no reachable number" once exhaustion has claimed the row (F-1). `true` when there is no candidate at all. */
  readonly hasReachableNumber: boolean;
}

/** The queue's own composite read, batched over every membership the page renders, settings read once. The one function `/operate/people/missing` calls for its three columns. */
export async function readOnboardingChaseQueueInfoIn(
  tx: Tx,
  membershipIds: readonly string[],
): Promise<ReadonlyMap<string, OnboardingChaseQueueInfo>> {
  const info = new Map<string, OnboardingChaseQueueInfo>();
  if (membershipIds.length === 0) return info;

  const settings = await readOnboardingChaseSettingsIn(tx);
  const candidates = await readOnboardingChaseCandidatesForMembershipsIn(tx, membershipIds);

  for (const membershipId of membershipIds) {
    const candidate = candidates.get(membershipId);
    const lastContact = await readOnboardingLastContactIn(tx, membershipId);
    const next: OnboardingChaseNext = candidate
      ? describeOnboardingChaseNext(candidate, settings)
      : { kind: "no_automated_chase" };
    info.set(membershipId, {
      lastContact,
      next,
      hasReachableNumber: candidate ? candidate.hasReachableNumber : true,
    });
  }

  return info;
}
