import "server-only";

import { NotFound, withTransaction, type Tx } from "@/lib/db";

import {
  grantSeasonMessagingConsentByOperatorIn,
  readSeasonMessagingConsentIn,
  withdrawSeasonMessagingConsentByOperatorIn,
  type ConsentWithdrawalReason,
  type OperatorConsentResult,
  type SeasonMessagingConsent,
  type SeasonMessagingConsentState,
} from "../messaging-consent";
import { readCurrentSeasonIn } from "../seasons";

/**
 * The operator's two consent actions, addressed by recruit rather than by
 * person and season — LAN-371.
 *
 * `messaging-consent.ts` owns what the two actions do; this resolves which
 * person and which season one recruit's record means, and refuses a recruit
 * that no longer exists. The person record's own controls call the same two
 * functions with the person and season they already hold.
 */

async function subjectOf(
  tx: Tx,
  prospectId: string,
): Promise<{ personId: string; seasonId: string }> {
  const found = await tx.query<{ person_id: string; season_id: string }>(
    `select person_id, season_id from public.recruitment_prospects where id = $1::uuid`,
    [prospectId],
  );
  const row = found.rows[0];
  if (!row) {
    throw new NotFound("That recruit could not be found.", {
      rule: "recruitment_prospect_not_found",
    });
  }
  return { personId: row.person_id, seasonId: row.season_id };
}

export async function stopRecruitMessagesIn(
  tx: Tx,
  operatorPersonId: string,
  prospectId: string,
  reason: { listedReason?: ConsentWithdrawalReason | null; note?: string | null },
): Promise<OperatorConsentResult> {
  const subject = await subjectOf(tx, prospectId);
  return withdrawSeasonMessagingConsentByOperatorIn(tx, {
    ...subject,
    operatorPersonId,
    listedReason: reason.listedReason ?? null,
    note: reason.note ?? null,
  });
}

export async function stopRecruitMessages(
  operatorPersonId: string,
  prospectId: string,
  reason: { listedReason?: ConsentWithdrawalReason | null; note?: string | null },
): Promise<OperatorConsentResult> {
  return withTransaction((tx) => stopRecruitMessagesIn(tx, operatorPersonId, prospectId, reason));
}

export async function recordRecruitConsentIn(
  tx: Tx,
  operatorPersonId: string,
  prospectId: string,
  note: string | null,
): Promise<SeasonMessagingConsent> {
  const subject = await subjectOf(tx, prospectId);
  return grantSeasonMessagingConsentByOperatorIn(tx, { ...subject, operatorPersonId, note });
}

export async function recordRecruitConsent(
  operatorPersonId: string,
  prospectId: string,
  note: string | null,
): Promise<SeasonMessagingConsent> {
  return withTransaction((tx) => recordRecruitConsentIn(tx, operatorPersonId, prospectId, note));
}

/**
 * This person's recruit consent for the current season — LAN-371, the person
 * record's half.
 *
 * `null` when they are not a recruit this season, which is what keeps the
 * control off a roster player's record: LAN-372 settled that consent and Stop
 * are recruit concepts and that a player asking the club to stop messaging
 * them is a membership conversation, not an opt-out.
 */
export interface RecruitConsentSummary {
  readonly prospectId: string;
  readonly seasonId: string;
  readonly seasonLabel: string;
  readonly state: SeasonMessagingConsentState;
  readonly changedAt: string | null;
  readonly byOperator: boolean;
}

export async function readRecruitConsentForPersonIn(
  tx: Tx,
  personId: string,
): Promise<RecruitConsentSummary | null> {
  const season = await readCurrentSeasonIn(tx).catch(() => null);
  if (season === null) return null;

  const prospect = await tx.query<{ id: string }>(
    `select id from public.recruitment_prospects
      where person_id = $1::uuid and season_id = $2::uuid`,
    [personId, season.id],
  );
  const prospectId = prospect.rows[0]?.id;
  if (!prospectId) return null;

  // A converted recruit is a player from that moment, and a player is exempt
  // (LAN-372): the prospect row stays for the history, the control does not.
  const membership = await tx.query(
    `select 1 from public.season_memberships
      where person_id = $1::uuid and season_id = $2::uuid`,
    [personId, season.id],
  );
  if (membership.rows.length > 0) return null;

  const consent = await readSeasonMessagingConsentIn(tx, personId, season.id);
  return {
    prospectId,
    seasonId: season.id,
    seasonLabel: season.label,
    state: consent?.state ?? "never_asked",
    changedAt: consent?.changedAt ?? null,
    byOperator: consent?.recordedByPersonId != null,
  };
}

export async function readRecruitConsentForPerson(
  personId: string,
): Promise<RecruitConsentSummary | null> {
  return withTransaction((tx) => readRecruitConsentForPersonIn(tx, personId));
}
