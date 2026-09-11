import "server-only";

import { ConstraintViolated, type Tx, withTransaction } from "@/lib/db";

// The versioned-agreement mechanism — LAN-214. Version, moment and person: an agreement is "I read
// version N and agreed" (REQ-policy-at-collection), never a signature image, no object storage.
// nonblocking_unknowns: the wording is a placeholder until LAN-213 lands the real text — swapping it
// is a new onboarding_agreement_versions row, nothing about the mechanism changes.
// Decision history: missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION

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

// Seasonal (item-and-ask-inventory.md item 11: asked of everyone every season) — writes once per
// (person, season, type); a second call is refused by onboarding_agreements_one_per_person_season_type.
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

// Removes one season's agreement row so the document can be agreed again — LAN-240 (walker M7,
// finding M7-01). No reopen verb (D-002): setting the item back to "No" flipped onboarding_items.status
// only, leaving this row (unique per person/season/type) stranded. Deleted, not superseded — the
// Lead's recorded migration review (2026-09-09): schema-free, nothing lost (onboarding_item_history
// and audit_events already hold the transitions). Zero removed is a legitimate outcome. See relocations.md.
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

export async function readOnboardingAgreements(
  personId: string,
  seasonId: string,
): Promise<OnboardingAgreement[]> {
  return withTransaction((tx) => readOnboardingAgreementsIn(tx, personId, seasonId));
}
