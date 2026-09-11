import "server-only";

import { type Tx } from "@/lib/db";
import { selectMobileNumber } from "@/lib/delivery/phone";
import { MAX_ATTEMPTS } from "../delivery";
import { hasGrantedSeasonMessagingConsentIn } from "../messaging-consent";
import { readCompiledOutstandingAskIn } from "../onboarding-ask";
import { DEFAULT_CALLING_CODE } from "../person-validation";
import { readOnboardingChaseSettingsIn, type OnboardingChaseSettings } from "./settings";

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
  /**
   * Asks actually delivered to this membership — every automated attempt and
   * every manual one alike. Spent only on delivery (`T11-cap-delivered`): a
   * `failed`/`rejected` outcome is never counted here.
   *
   * Manual asks joined the count for LAN-266, on Brian's own decision that
   * the record's **Send onboarding questionnaire** "counts toward the
   * configured chase count, and re-spaces the next automatic chase from this
   * send". It is one count because it is one thing being counted — the number
   * of times this player has been asked — and the queue's Nudge and the
   * record's button write the identical job, so counting one and not the
   * other would make the same act mean two different things depending on
   * which screen it was pressed from.
   *
   * This does not make a manual ask refusable. Exhaustion still only warns
   * (`chaseNeedsAHuman`); the one absolute refusal stays no channel or under
   * 18 (`isNudgeable`), exactly as LAN-218 correction round 1 left it. What
   * changes is that four delivered asks are four delivered asks however they
   * were sent, so the automated cadence stops asking a fifth time and the
   * office is told a human is needed.
   */
  readonly deliveredCount: number;
  /** The most recent delivered ask of either kind — the base the next automated chase is spaced from. */
  readonly lastDeliveredAt: Date | null;
  /**
   * The membership's own next undelivered ordinal has reached
   * `MAX_ATTEMPTS` and is `failed` with nothing further scheduled —
   * `T11-terminal-failure`, `W8-03`. Distinct from `exhausted`: this
   * membership's cap has *not* run out, delivery to it has.
   */
  readonly currentAttemptTerminallyFailed: boolean;
  /**
   * Correction round 1, C-5 (Brian, 2026-09-03 walkthrough): the same
   * provider-neutral sentence `delivery.ts`'s own event-delivery reader shows
   * an operator (`DeliveryRow.failureReason`, itself `notification_jobs.last_error`)
   * — read here from the identical failed attempt's `delivery_results.detail`
   * rather than reimplemented, so the two surfaces can never describe the same
   * failure two different ways. `null` unless {@link currentAttemptTerminallyFailed}
   * is true.
   */
  readonly terminalFailureReason: string | null;
  /**
   * The highest automated-attempt ordinal that exists for this membership,
   * or `0` when none does — LAN-266.
   *
   * `declareDueOnboardingChasesIn` used to compute its next key as
   * `deliveredCount + 1`, which was exact only while `deliveredCount` counted
   * automated attempts and nothing else. Now that a manual ask counts too
   * (see {@link deliveredCount}), that arithmetic would skip ordinals and, in
   * the narrow case of an attempt still retrying past the interval, could
   * declare a second live job beside it. The ordinal is therefore read from
   * the keys that actually exist rather than inferred from a count that no
   * longer only describes them.
   */
  readonly automatedOrdinal: number;
  /**
   * Whether the highest existing automated attempt has yet to deliver — still
   * pending, retrying, or failed. LAN-266's companion to
   * {@link automatedOrdinal}: with the next key no longer recomputing to the
   * same value, the "an existing ordinal is a no-op" property that used to
   * keep one attempt in flight at a time has to be stated rather than fall
   * out of the arithmetic. `false` when there is no automated attempt at all.
   */
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

/**
 * Every membership's chase progress, read from `notification_jobs` and
 * `delivery_results` rather than a counter — batched over `membershipIds`
 * rather than one query per row, on `people-directory.ts`'s own "fetch wide"
 * idiom.
 *
 * Two queries, deliberately not one: which asks delivered (an aggregate) and
 * what the *latest automated* ordinal's own outcome is (`distinct on`, highest
 * ordinal only) answer different questions, and folding both into one query
 * bought nothing but a harder-to-read one. Both read a job's current truth as
 * its **latest attempt's own `delivery_results` row**, never the job's
 * `status` column — `delivery.ts`'s `DELIVERY_LATEST_RESULT_JOIN` comment's
 * own reasoning, applied here rather than imported, because that constant's
 * SQL text hard-codes the alias `j` for `notification_jobs` and this module's
 * own join needs `occurred_at` alongside `outcome`, which that shared text
 * does not select.
 *
 * The two queries now deliberately scope differently, and that difference is
 * the whole of LAN-266's change here. The aggregate spans **both** ask
 * prefixes — an automated `onboarding-chase:` attempt and an operator's
 * `onboarding-nudge:` ask are both asks, and both count toward the cap and
 * re-space what follows (see {@link OnboardingChaseProgress.deliveredCount}).
 * The `distinct on` query stays `onboarding-chase:` only: it exists to find
 * the highest *ordinal*, and a nudge key carries a nonce where an automated
 * key carries an ordinal, so ordering nudges by it would be meaningless.
 * Terminal delivery failure is likewise a property of the automated attempt
 * the sweep is holding, not of a manual ask an operator can simply repeat.
 */
export async function readOnboardingChaseProgressIn(
  tx: Tx,
  membershipIds: readonly string[],
): Promise<ReadonlyMap<string, OnboardingChaseProgress>> {
  const progress = new Map<string, OnboardingChaseProgress>();
  if (membershipIds.length === 0) return progress;

  const membershipIdPattern = `^${ONBOARDING_CHASE_KEY_PREFIX}([0-9a-f-]+):`;
  // Both ask prefixes share the shape `<prefix><membership id>:<discriminator>`,
  // so one pattern reads the membership out of either — LAN-266.
  const askIdPattern = `^onboarding-(?:chase|nudge):([0-9a-f-]+):`;
  const latestAttemptJoin = `
    left join lateral (
      select r.outcome::text as outcome, r.occurred_at, r.detail
        from public.delivery_results r
       where r.notification_job_id = j.id
       order by r.attempt_number desc
       limit 1
    ) latest on true`;

  const [delivered, latest] = await Promise.all([
    tx.query<{ membership_id: string; delivered_count: number; last_delivered_at: Date | null }>(
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
    ),
    tx.query<{
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
    ),
  ]);

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
  // A membership with an automated attempt but no delivered ask of any kind
  // appears in `latest.rows` and not necessarily in `delivered.rows`'s
  // aggregate (an aggregate over zero matching filtered rows still groups,
  // but belt and braces: a membership present only in `latest` is folded in).
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
  /** {@link OnboardingChaseProgress.terminalFailureReason}, carried through unchanged. */
  readonly terminalFailureReason: string | null;
  /** {@link OnboardingChaseProgress.automatedOrdinal}, carried through unchanged. */
  readonly automatedOrdinal: number;
  /** {@link OnboardingChaseProgress.automatedAttemptOutstanding}, carried through unchanged. */
  readonly automatedAttemptOutstanding: boolean;
  /** From the compiled ask — a missing required field or an unresolved checklist item, either counts. */
  readonly hasOutstanding: boolean;
  readonly hasConsent: boolean;
  /**
   * Whether anything could actually be sent to this person — correction round
   * 1, C-1/C-2 (Brian, 2026-09-03 walkthrough — Jorvik Kirkbride and Kenelm
   * Netherby, an email and no phone, "nudge reported failed"), corrected again
   * for LAN-249.
   *
   * It used to be read off the compiled ask (`!ask.missingRequiredFields
   * .includes("mobile")`) on the reasoning that `mobile` is required at every
   * tier, so its absence there is exactly "no reachable number". That is true
   * of an *absent* number and false of a *recorded but unusable* one: Montague
   * Everleigh's seeded `contact.phone.malformed` ("07700 90039", one digit
   * short) is a recorded mobile, so the compiled ask did not miss it, so the
   * queue offered a live checkbox and Nudge for a person nothing can be sent
   * to — and the nudge created a `notification_jobs` row that could only ever
   * fail (walker M7, finding M7-05).
   *
   * So it is now the send path's own question, asked of the send path's own
   * function: `selectMobileNumber` is what dispatch actually calls to turn
   * this person's contact points into a number for the provider, and a person
   * it returns `null` for is a person no surface should offer a send for.
   * That is deliberately not "`normalised_value` is non-empty" — roster intake
   * leaves `normalised_value` null on purpose (`roster.ts`'s own note), so
   * that test would withhold the nudge from most of the roster while still
   * passing a normalised value that is itself unusable. Asking the dispatcher's
   * own question is the only formulation under which the queue, the record's
   * own send button and the actual send can never disagree.
   *
   * The old formulation's benign "assume reachable when the compiled ask
   * could not be read" default goes with it, and is not replaced by another:
   * there is no unknown left to default. A person with no current phone
   * contact point, or none that converts, is not reachable, and that is the
   * whole answer.
   */
  readonly hasReachableNumber: boolean;
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

/**
 * Which of these people a message could actually be sent to — LAN-249.
 *
 * Batched over every person the caller is about to build a candidate for,
 * rather than one query per row, on the same "fetch wide" idiom
 * `readOnboardingChaseProgressIn` already uses. The decision itself is
 * `selectMobileNumber`'s and not this function's: the same call, on the same
 * contact rows, with the same calling code, that `dispatchOnboardingChaseJob`
 * makes at the moment of sending. See {@link OnboardingChaseCandidate.hasReachableNumber}
 * for why the dispatcher's own question is the only right one to ask here.
 *
 * Only current contact points count — `valid_until` is how the club records
 * that a number stopped being this person's — matching `person-record.ts`'s
 * own reader and `selectMobileNumber`'s own documented expectation.
 */
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

  const [progress, reachable] = await Promise.all([
    readOnboardingChaseProgressIn(
      tx,
      memberships.map((row) => row.id),
    ),
    readReachablePersonIdsIn(
      tx,
      memberships.map((row) => row.person_id),
    ),
  ]);

  const candidates: OnboardingChaseCandidate[] = [];
  for (const row of memberships) {
    const [ask, hasConsent, isUnder18] = await Promise.all([
      readCompiledOutstandingAskIn(tx, row.person_id, row.season_id),
      hasGrantedSeasonMessagingConsentIn(tx, row.person_id, row.season_id),
      isPersonUnder18In(tx, row.person_id),
    ]);
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

/**
 * What the queue's "Next" column says, per `T11-visibility` / `REQ-queue-visibility`.
 *
 * `reason: "no_consent"` is gone as of correction round 1, `C-4` (Q-11,
 * recorded against `LAN-218`) — see the paragraph in
 * {@link describeOnboardingChaseNext}'s own comment below. `reason:
 * "no_channel"` is new, `C-1` of the same round.
 */
export type OnboardingChaseNext =
  | { readonly kind: "scheduled"; readonly at: Date }
  | { readonly kind: "exhausted" }
  | { readonly kind: "unmessageable"; readonly reason: "no_channel" | "under_18" }
  | { readonly kind: "terminal_failure"; readonly reason: string | null }
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
 * "unmessageable" retroactively if a number is later added or consent later
 * withdrawn. `under_18` is checked next and stays exactly where it was — an
 * absolute rule, unaffected by anything below it. `no_channel` — no reachable
 * mobile number — is checked immediately after, and deliberately *before*
 * `terminal_failure`: a missing number is a structural, not-fixable-by-retry
 * defect exactly like `under_18`, so it must never be masked by a generic
 * "ran out of retries" verdict once the automated chase has actually burned
 * through its attempts against it (`C-1`/`C-2`/`C-3`, Brian's 2026-09-03
 * walkthrough — Jorvik Kirkbride and Kenelm Netherby, an email and no phone,
 * "his nudge reported failed").
 *
 * ## `no_consent` — removed, not narrowed (`C-4`, Q-11)
 *
 * This reader's only population is `season_memberships.status = 'onboarding'`
 * — a person already on the team, never a recruit still deciding whether to
 * join one (`onboarding-chase.ts`'s own module note: recruits carry no
 * membership row at all, so they never reach this list). Brian, 2026-09-03:
 * "Only a recruit may decline messaging, and only while a recruit… A team
 * member without consent is not unmessageable — they still receive the
 * onboarding and consent form, which is the first page of onboarding." The
 * approved `W8-01` mockup's wording ("Unmessageable · no consent") was
 * therefore superseded in session ("then amend it") rather than found to be a
 * departure from it: consent not yet granted is this population's ordinary,
 * expected starting state, not a refusal, and this function no longer treats
 * it as a reason to withhold the schedule it would otherwise report. Nothing
 * about `mayReceiveWelcomeContactIn`'s own refuse-without-basis check
 * (`messaging-consent.ts`, `REQ-transport`) changes — the welcome still goes
 * regardless of a basis, and a genuine `refused`/`withdrawn` consent still
 * stops it there — this function simply stops modelling a second, queue-only
 * copy of that state. No departure is triggered here or anywhere this
 * correction round touches; that stays the human matter Brian named it.
 */
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
  /**
   * Correction round 2, F-1: the same fact {@link describeOnboardingChaseNext}
   * already reads to decide `no_channel`, carried alongside `next` rather
   * than re-derived from it. `next.kind` alone cannot tell the queue "no
   * reachable number" once exhaustion has already claimed the row — that
   * collapse is exactly what let an exhausted, unreachable person keep an
   * active Nudge button. `true` when there is no candidate at all (a
   * membership `describeOnboardingChaseNext` never runs), the same benign
   * default `hasReachableNumber` itself documents.
   */
  readonly hasReachableNumber: boolean;
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
    info.set(membershipId, {
      lastContact,
      next,
      hasReachableNumber: candidate ? candidate.hasReachableNumber : true,
    });
  }

  return info;
}
