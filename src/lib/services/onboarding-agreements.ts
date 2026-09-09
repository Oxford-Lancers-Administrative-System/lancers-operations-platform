import "server-only";

import { ConstraintViolated, type Tx, withTransaction } from "@/lib/db";

/**
 * The versioned-agreement mechanism — LAN-214. Version, moment and person:
 * the Code of Conduct and the photo release are each "read on their own
 * page, then confirmed, dated, against the exact version shown"
 * (`REQ-policy-at-collection`). No object storage — the application has
 * none, and none is needed: an agreement is "I read version N and agreed",
 * never a signature image.
 *
 * `nonblocking_unknowns`: the wording is a labelled placeholder in this real
 * versioned slot until LAN-213 lands Clint's actual text — never invented
 * club policy in the meantime. Swapping the placeholder for real wording is
 * inserting a new `onboarding_agreement_versions` row; nothing about the
 * mechanism changes.
 */

export type OnboardingAgreementType = "code_of_conduct" | "photo_release";

export interface OnboardingAgreementVersion {
  id: string;
  agreementType: OnboardingAgreementType;
  versionLabel: string;
  body: string;
  effectiveFrom: Date;
}

export interface OnboardingAgreement {
  id: string;
  personId: string;
  seasonId: string;
  agreementType: OnboardingAgreementType;
  agreementVersionId: string;
  agreedAt: Date;
}

interface VersionRow {
  id: string;
  agreement_type: OnboardingAgreementType;
  version_label: string;
  body: string;
  effective_from: Date;
}

function toVersion(row: VersionRow): OnboardingAgreementVersion {
  return {
    id: row.id,
    agreementType: row.agreement_type,
    versionLabel: row.version_label,
    body: row.body,
    effectiveFrom: row.effective_from,
  };
}

/** The version a player should be shown right now — the most recently effective row for this document. */
export async function readCurrentOnboardingAgreementVersionIn(
  tx: Tx,
  agreementType: OnboardingAgreementType,
): Promise<OnboardingAgreementVersion> {
  const result = await tx.query<VersionRow>(
    `select id, agreement_type::text as agreement_type, version_label, body, effective_from
       from public.onboarding_agreement_versions
      where agreement_type = $1::public.onboarding_agreement_type
      order by effective_from desc
      limit 1`,
    [agreementType],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ConstraintViolated(
      `No version of ${agreementType.replace(/_/g, " ")} is on record.`,
      { rule: "onboarding_agreement_versions_missing" },
    );
  }
  return toVersion(row);
}

interface AgreementRow {
  id: string;
  person_id: string;
  season_id: string;
  agreement_type: OnboardingAgreementType;
  agreement_version_id: string;
  agreed_at: Date;
}

function toAgreement(row: AgreementRow): OnboardingAgreement {
  return {
    id: row.id,
    personId: row.person_id,
    seasonId: row.season_id,
    agreementType: row.agreement_type,
    agreementVersionId: row.agreement_version_id,
    agreedAt: row.agreed_at,
  };
}

/**
 * Records that a person read and agreed to the current version of one
 * document, for one season. Seasonal — item-and-ask-inventory.md's item 11
 * ("asked of everyone every season") — so this writes once per (person,
 * season, type); a second call for the same three is refused by the
 * schema's own `onboarding_agreements_one_per_person_season_type` rather
 * than silently updating a moment that already happened.
 */
export async function recordOnboardingAgreementIn(
  tx: Tx,
  params: { personId: string; seasonId: string; agreementType: OnboardingAgreementType },
): Promise<OnboardingAgreement> {
  const version = await readCurrentOnboardingAgreementVersionIn(tx, params.agreementType);

  const existing = await tx.query(
    `select 1 from public.onboarding_agreements
      where person_id = $1::uuid and season_id = $2::uuid
        and agreement_type = $3::public.onboarding_agreement_type`,
    [params.personId, params.seasonId, params.agreementType],
  );
  if (existing.rows.length > 0) {
    throw new ConstraintViolated(
      `This person already agreed to ${params.agreementType.replace(/_/g, " ")} this season.`,
      { rule: "onboarding_agreements_one_per_person_season_type" },
    );
  }

  const inserted = await tx.query<AgreementRow>(
    `insert into public.onboarding_agreements
       (person_id, season_id, agreement_type, agreement_version_id)
     values ($1::uuid, $2::uuid, $3::public.onboarding_agreement_type, $4::uuid)
     returning id, person_id, season_id, agreement_type::text as agreement_type,
               agreement_version_id, agreed_at`,
    [params.personId, params.seasonId, params.agreementType, version.id],
  );
  return toAgreement(inserted.rows[0] as unknown as AgreementRow);
}

/** Every agreement this person has on file for one season — at most two, one per document type. */
export async function readOnboardingAgreementsIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<OnboardingAgreement[]> {
  const result = await tx.query<AgreementRow>(
    `select id, person_id, season_id, agreement_type::text as agreement_type,
            agreement_version_id, agreed_at
       from public.onboarding_agreements
      where person_id = $1::uuid and season_id = $2::uuid
      order by agreement_type`,
    [personId, seasonId],
  );
  return result.rows.map((row) => toAgreement(row as unknown as AgreementRow));
}

/**
 * Removes one season's agreement row so the document can be agreed again —
 * LAN-240 (walker M7, finding M7-01), the blocker that broke the M7 journey
 * at its last step.
 *
 * There is no reopen verb (D-002): an operator reopens the photo release or
 * the Code of Conduct by setting that item's own state back to "No" on the
 * record. That flipped `onboarding_items.status` and nothing else, so the
 * `onboarding_agreements` row — unique per (person, season, type), and by
 * this module's own design never updated — survived. The player's link then
 * said two contradictory things at once: the navigator read "PHOTO RELEASE —
 * Outstanding" above a panel reading "Already agreed", and a bare load of the
 * link resumed at "There is nothing left to fill in". The player could never
 * see or act on the reopened item, and `recordOnboardingAgreementIn` would
 * have refused a second agreement anyway.
 *
 * Deleted rather than superseded, on the Lead's recorded migration review
 * (2026-09-09): this package is schema-free, and nothing is lost by the
 * delete. `onboarding_item_history` already holds the transition that agreed
 * the item and the one that reopened it, with the actor and the moment of
 * each, and `audit_events` holds the operator's own reopen. What the row
 * uniquely carried — *which version* was agreed — is carried alongside it in
 * the item history's own audit trail, and a reopened document is one the club
 * has decided is no longer agreed, so the version that was agreed is history
 * rather than standing record.
 *
 * Returns the number of rows removed: zero is a legitimate, expected outcome
 * (an item set back to "No" that the player had never agreed through the
 * link at all), and is recorded as one by the caller rather than treated as
 * a failure.
 */
export async function deleteOnboardingAgreementIn(
  tx: Tx,
  params: { personId: string; seasonId: string; agreementType: OnboardingAgreementType },
): Promise<number> {
  const result = await tx.query(
    `delete from public.onboarding_agreements
      where person_id = $1::uuid and season_id = $2::uuid
        and agreement_type = $3::public.onboarding_agreement_type`,
    [params.personId, params.seasonId, params.agreementType],
  );
  return result.rowCount ?? 0;
}

/** Convenience wrapper for a caller with no open transaction. */
export async function readOnboardingAgreements(
  personId: string,
  seasonId: string,
): Promise<OnboardingAgreement[]> {
  return withTransaction((tx) => readOnboardingAgreementsIn(tx, personId, seasonId));
}
