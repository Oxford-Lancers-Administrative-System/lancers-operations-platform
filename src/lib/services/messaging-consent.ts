import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";

import { recordAudit } from "./audit";
// LAN-371: the reason vocabulary lives in the client-safe module, because the
// dialog that offers the short list is a client component and this file is
// `server-only`.
import { CONSENT_WITHDRAWAL_REASONS, type ConsentWithdrawalReason } from "./recruitment-vocabulary";

export type { ConsentWithdrawalReason };

// The season-scoped messaging consent gate — LAN-202, packet amendment 1. One row per
// (person, season); a message may go out only while state is 'granted'. Only ever writes source
// 'qr_self_entry' (see relocations.md).

export type SeasonMessagingConsentState =
  "never_asked" | "asked" | "granted" | "refused" | "withdrawn";

export type SeasonMessagingConsentSource =
  "qr_self_entry" | "walk_up_read_back" | "operator_recorded";

const SELF_SERVICE_SOURCE: SeasonMessagingConsentSource = "qr_self_entry";

export interface SeasonMessagingConsent {
  readonly personId: string;
  readonly seasonId: string;
  readonly state: SeasonMessagingConsentState;
  readonly source: SeasonMessagingConsentSource | null;
  readonly changedAt: string;
  /**
   * LAN-371. Who last changed it: an operator's `people.id`, or `null` where
   * the person did it themselves through the sign-up form, the questionnaire
   * or their own Stop link. This is what tells "Revoked (by operator)" from
   * "Revoked (by the person)" on the record and the board.
   */
  readonly recordedByPersonId: string | null;
  /** LAN-371. Why, in the operator's own words. Null for a change the person made themselves. */
  readonly reason: string | null;
}

interface ConsentRow {
  person_id: string;
  season_id: string;
  state: SeasonMessagingConsentState;
  source: SeasonMessagingConsentSource | null;
  changed_at: Date;
  recorded_by_person_id: string | null;
  reason: string | null;
}

function toConsent(row: ConsentRow): SeasonMessagingConsent {
  return {
    personId: row.person_id,
    seasonId: row.season_id,
    state: row.state,
    source: row.source,
    changedAt: row.changed_at.toISOString(),
    recordedByPersonId: row.recorded_by_person_id,
    reason: row.reason,
  };
}

// null when nothing has ever been recorded.
export async function readSeasonMessagingConsentIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<SeasonMessagingConsent | null> {
  const result = await tx.query<ConsentRow>(
    `select person_id, season_id, state::text as state, source::text as source, changed_at,
            recorded_by_person_id, reason
       from public.season_messaging_consents
      where person_id = $1::uuid and season_id = $2::uuid`,
    [personId, seasonId],
  );
  const row = result.rows[0];
  return row ? toConsent(row as unknown as ConsentRow) : null;
}

export async function hasGrantedSeasonMessagingConsentIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<boolean> {
  const consent = await readSeasonMessagingConsentIn(tx, personId, seasonId);
  return consent?.state === "granted";
}

export const SEASON_MESSAGING_CONSENT_REQUIRED_RULE = "season_messaging_consent_required";

// The gate every send calls (LAN-202). Refuses unless state is exactly 'granted'. Writes nothing.
export async function requireGrantedSeasonMessagingConsentIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<void> {
  const granted = await hasGrantedSeasonMessagingConsentIn(tx, personId, seasonId);
  if (!granted) {
    throw new InvalidTransition(
      "This person has not granted messaging consent for this season, so no message may be sent.",
      { rule: SEASON_MESSAGING_CONSENT_REQUIRED_RULE },
    );
  }
}

export async function requireGrantedSeasonMessagingConsent(
  personId: string,
  seasonId: string,
): Promise<void> {
  return withTransaction((tx) => requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId));
}

// The one, narrow exception — LAN-204's consent deadlock (see relocations.md).
export async function mayReceiveWelcomeContactIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<boolean> {
  const consent = await readSeasonMessagingConsentIn(tx, personId, seasonId);
  const state = consent?.state ?? "never_asked";
  return state !== "refused" && state !== "withdrawn";
}

// Q-read-back-authorises-how-much: a walk_up_read_back grant authorises only the welcome track (see relocations.md).
export async function hasGrantedViaSignupFormIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<boolean> {
  const consent = await readSeasonMessagingConsentIn(tx, personId, seasonId);
  return consent?.state === "granted" && consent.source === SELF_SERVICE_SOURCE;
}

// Upserts: re-granting moves an existing row to granted, dated now.
export async function grantSeasonMessagingConsentIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<SeasonMessagingConsent> {
  const result = await tx.query<ConsentRow>(
    `insert into public.season_messaging_consents (person_id, season_id, state, source, changed_at)
     values ($1::uuid, $2::uuid, 'granted', $3::public.messaging_consent_source, now())
     on conflict (person_id, season_id) do update
       set state = 'granted', source = excluded.source, changed_at = now(),
           -- LAN-371: this change is the person's own, so it clears whatever
           -- an operator last recorded. Otherwise the record would keep
           -- reading "by operator" long after the person acted for themselves.
           recorded_by_person_id = null, reason = null
     returning person_id, season_id, state::text as state, source::text as source, changed_at,
               recorded_by_person_id, reason`,
    [personId, seasonId, SELF_SERVICE_SOURCE],
  );
  return toConsent(result.rows[0] as unknown as ConsentRow);
}

// Honoured immediately, every channel. Upserts, so a person with no prior row still ends up withdrawn.
export async function withdrawSeasonMessagingConsentIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<SeasonMessagingConsent> {
  const result = await tx.query<ConsentRow>(
    `insert into public.season_messaging_consents (person_id, season_id, state, source, changed_at)
     values ($1::uuid, $2::uuid, 'withdrawn', $3::public.messaging_consent_source, now())
     on conflict (person_id, season_id) do update
       set state = 'withdrawn', source = excluded.source, changed_at = now(),
           -- LAN-371: the person's own Stop link, so no operator and no reason.
           recorded_by_person_id = null, reason = null
     returning person_id, season_id, state::text as state, source::text as source, changed_at,
               recorded_by_person_id, reason`,
    [personId, seasonId, SELF_SERVICE_SOURCE],
  );
  return toConsent(result.rows[0] as unknown as ConsentRow);
}

/**
 * Whether this person is on the roster for this season — LAN-372.
 *
 * Brian, 2026-09-16: "A roster player who wants the club to stop messaging
 * them is asking to leave the team; that is a membership conversation, not an
 * opt-out. Consent and Stop are recruit concepts only."
 *
 * A `season_memberships` row is what "on the roster" means: a recruit has a
 * `recruitment_prospects` row and no membership until they convert, and a
 * converted recruit is a player from that moment, which is the right answer
 * here. The stop surface reads this to decide whether it is offering an
 * opt-out at all.
 */
export async function isSeasonRosterMemberIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<boolean> {
  const result = await tx.query<{ present: boolean }>(
    `select true as present from public.season_memberships
      where person_id = $1::uuid and season_id = $2::uuid
      limit 1`,
    [personId, seasonId],
  );
  return result.rows.length > 0;
}

// ---------------------------------------------------------------------------
// The operator's own two actions — LAN-371
// ---------------------------------------------------------------------------

export const CONSENT_REASON_REQUIRED_RULE = "season_messaging_consent_change_requires_a_reason";

/** The operator's typed sentence, or the short list's own words where they typed nothing beside it. */
function operatorReason(reason: string | null | undefined, fallback: string | null): string {
  const typed = (reason ?? "").trim();
  if (typed !== "") return typed;
  const listed = (fallback ?? "").trim();
  if (listed !== "") return listed;
  throw new ConstraintViolated("Say why this is changing, so the decision can be reviewed later.", {
    rule: CONSENT_REASON_REQUIRED_RULE,
  });
}

const OPERATOR_SOURCE: SeasonMessagingConsentSource = "operator_recorded";

interface OperatorConsentChange {
  readonly personId: string;
  readonly seasonId: string;
  readonly operatorPersonId: string;
  /** One of the short list, or null where the operator only typed. */
  readonly listedReason?: ConsentWithdrawalReason | null;
  /** The operator's own words. Required when no listed reason is chosen. */
  readonly note?: string | null;
}

async function writeOperatorConsentIn(
  tx: Tx,
  state: "granted" | "withdrawn",
  change: OperatorConsentChange,
): Promise<SeasonMessagingConsent> {
  const listed = change.listedReason ? CONSENT_WITHDRAWAL_REASONS[change.listedReason] : null;
  const reason = operatorReason(change.note, listed);
  const note = (change.note ?? "").trim();
  // The listed reason and the typed sentence are one string on the row, so a
  // reader sees both without a second column and without either being lost.
  const recorded = listed !== null && note !== "" ? `${listed} — ${note}` : reason;

  const result = await tx.query<ConsentRow>(
    `insert into public.season_messaging_consents
       (person_id, season_id, state, source, changed_at, recorded_by_person_id, reason)
     values ($1::uuid, $2::uuid, $3::public.messaging_consent_state,
             $4::public.messaging_consent_source, now(), $5::uuid, $6)
     on conflict (person_id, season_id) do update
       set state = excluded.state,
           source = excluded.source,
           changed_at = now(),
           recorded_by_person_id = excluded.recorded_by_person_id,
           reason = excluded.reason
     returning person_id, season_id, state::text as state, source::text as source, changed_at,
               recorded_by_person_id, reason`,
    [change.personId, change.seasonId, state, OPERATOR_SOURCE, change.operatorPersonId, recorded],
  );
  const consent = toConsent(result.rows[0] as unknown as ConsentRow);

  // The recruit's own contact details are deliberately absent: the audit row
  // names the operator, the season and the reason, and nothing else.
  await recordAudit(tx, {
    actorPersonId: change.operatorPersonId,
    action:
      state === "withdrawn"
        ? "messaging_consent.withdrawn_by_operator"
        : "messaging_consent.recorded_by_operator",
    entityTable: "season_messaging_consents",
    entityId: change.personId,
    toState: state,
    reason: recorded,
    context: { seasonId: change.seasonId },
  });

  return consent;
}

/**
 * Cancels everything still queued for one person in one season — LAN-371's
 * "every pending job for that person is cancelled at withdrawal, not just
 * refused at send time".
 *
 * Both shapes of job: the recruit ladder's, which hangs off `person_id`, and
 * an event invitation or reminder, which hangs off an invitation that resolves
 * to the person. A job already `processing`, `sent` or `delivered` is left
 * alone — it has happened.
 */
async function cancelQueuedMessagesForPersonIn(
  tx: Tx,
  personId: string,
  seasonId: string,
  reason: string,
): Promise<number> {
  const cancelled = await tx.query(
    `update public.notification_jobs j
        set status = 'cancelled', cancelled_reason = $3, updated_at = now()
      where j.status in ('pending', 'ready')
        and (
          j.person_id = $1::uuid
          or j.invitation_id in (
            select i.id
              from public.invitations i
              left join public.season_memberships m on m.id = i.season_membership_id
             where coalesce(i.person_id, m.person_id) = $1::uuid
               and i.season_id = $2::uuid
          )
        )`,
    [personId, seasonId, reason],
  );
  return cancelled.rowCount ?? 0;
}

export const CONSENT_WITHDRAWN_JOB_REASON =
  "Messaging consent was withdrawn, so nothing further is sent this season.";

export interface OperatorConsentResult {
  readonly consent: SeasonMessagingConsent;
  readonly cancelledJobs: number;
}

/** "Stop messages" — the operator's own withdrawal, with its reason and its cancellations. */
export async function withdrawSeasonMessagingConsentByOperatorIn(
  tx: Tx,
  change: OperatorConsentChange,
): Promise<OperatorConsentResult> {
  const consent = await writeOperatorConsentIn(tx, "withdrawn", change);
  const cancelledJobs = await cancelQueuedMessagesForPersonIn(
    tx,
    change.personId,
    change.seasonId,
    CONSENT_WITHDRAWN_JOB_REASON,
  );
  return { consent, cancelledJobs };
}

/**
 * "Record consent" — the reverse, with a note of how consent was given.
 *
 * Nothing already sent is replayed: the ladder resumes from the next declared
 * step, because the steps it has already sent are recorded as sent and the
 * scheduler declares from that record, not from this row.
 */
export async function grantSeasonMessagingConsentByOperatorIn(
  tx: Tx,
  change: OperatorConsentChange,
): Promise<SeasonMessagingConsent> {
  return writeOperatorConsentIn(tx, "granted", change);
}
