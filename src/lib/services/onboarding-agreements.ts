import "server-only";

import { ConstraintViolated, type Tx, withTransaction } from "@/lib/db";
import { bodyRequiresPrintedName } from "./onboarding-agreement-body";

// The versioned-agreement mechanism — LAN-214. Version, moment and person: an agreement is "I read
// version N and agreed" (REQ-policy-at-collection), never a signature image, no object storage.
// The photo release carries the University of Oxford's own consent form since LAN-347; the Code of
// Conduct is a labelled placeholder until LAN-282 lands Clint's wording. Swapping either is a new
// onboarding_agreement_versions row, and nothing about the mechanism changes.

export type OnboardingAgreementType = "code_of_conduct" | "photo_release";

/** Named once, so the step's refusal and the service's are the same sentence (LAN-347). */
export const PRINTED_NAME_REQUIRED_MESSAGE = "Print name is required.";

/**
 * The consent form exactly as it was submitted — LAN-347 decision 4. Every box
 * the player typed into, stored beside the agreement it belongs to and nowhere
 * else. None of it is a fact about the person: a phone number written here is
 * what they wrote on this form, and the person record is untouched by it.
 */
export interface SubmittedAgreementForm {
  name: string | null;
  address: string | null;
  postcode: string | null;
  tel: string | null;
  email: string | null;
}

const EMPTY_SUBMITTED_FORM: SubmittedAgreementForm = Object.freeze({
  name: null,
  address: null,
  postcode: null,
  tel: null,
  email: null,
});

/** Blank is "not given" and is stored as null — the columns' own check constraints refuse anything else. */
function submitted(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text === "" ? null : text;
}

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
  /** LAN-347: the name as the person typed it under the tick. Never a signature. `null` on rows recorded before the wording asked for one. */
  printedName: string | null;
  /** LAN-347: the rest of the form they submitted, as submitted. Every field `null` on a row recorded before the form asked for them. */
  form: SubmittedAgreementForm;
  /** LAN-240's reopen, LAN-347: set when an operator put this document back to No. A stamped row is no longer an agreement. */
  reopenedAt: Date | null;
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
  printed_name: string | null;
  form_name: string | null;
  form_address: string | null;
  form_postcode: string | null;
  form_tel: string | null;
  form_email: string | null;
  reopened_at: Date | null;
}

/** Every column the two readers below select — named once so they cannot drift apart. */
const AGREEMENT_COLUMNS = `id, person_id, season_id, agreement_type::text as agreement_type,
            agreement_version_id, agreed_at, printed_name,
            form_name, form_address, form_postcode, form_tel, form_email, reopened_at`;

function toAgreement(row: AgreementRow): OnboardingAgreement {
  return {
    id: row.id,
    personId: row.person_id,
    seasonId: row.season_id,
    agreementType: row.agreement_type,
    agreementVersionId: row.agreement_version_id,
    agreedAt: row.agreed_at,
    printedName: row.printed_name,
    form: {
      name: row.form_name,
      address: row.form_address,
      postcode: row.form_postcode,
      tel: row.form_tel,
      email: row.form_email,
    },
    reopenedAt: row.reopened_at,
  };
}

// Seasonal (item-and-ask-inventory.md item 11: asked of everyone every season) — writes once per
// (person, season, type); a second call is refused by onboarding_agreements_one_per_person_season_type.
export async function recordOnboardingAgreementIn(
  tx: Tx,
  params: {
    personId: string;
    seasonId: string;
    agreementType: OnboardingAgreementType;
    /** LAN-347. Required exactly when the version being agreed declares a printed name; stored as typed. */
    printedName?: string | null;
    /** LAN-347. The rest of the submitted form, stored as submitted. The Code of Conduct's bare tick passes none. */
    form?: SubmittedAgreementForm;
  },
): Promise<OnboardingAgreement> {
  const version = await readCurrentOnboardingAgreementVersionIn(tx, params.agreementType);

  // The wording decides what the record must carry. A version whose body has no
  // print-name section — the Code of Conduct's placeholder, until LAN-282 —
  // records none; one that declares it cannot be agreed without it.
  const printedName = params.printedName?.trim() ?? "";
  if (printedName === "" && bodyRequiresPrintedName(version.body)) {
    throw new ConstraintViolated(PRINTED_NAME_REQUIRED_MESSAGE, {
      rule: "onboarding_agreements_printed_name_required",
    });
  }

  // A reopened row is not an agreement, so it is not "already agreed" either —
  // the same rule the partial unique index enforces underneath (LAN-347).
  const existing = await tx.query(
    `select 1 from public.onboarding_agreements
      where person_id = $1::uuid and season_id = $2::uuid
        and agreement_type = $3::public.onboarding_agreement_type
        and reopened_at is null`,
    [params.personId, params.seasonId, params.agreementType],
  );
  if (existing.rows.length > 0) {
    throw new ConstraintViolated(
      `This person already agreed to ${params.agreementType.replace(/_/g, " ")} this season.`,
      { rule: "onboarding_agreements_one_per_person_season_type" },
    );
  }

  const form = params.form ?? EMPTY_SUBMITTED_FORM;
  const inserted = await tx.query<AgreementRow>(
    `insert into public.onboarding_agreements
       (person_id, season_id, agreement_type, agreement_version_id, printed_name,
        form_name, form_address, form_postcode, form_tel, form_email)
     values ($1::uuid, $2::uuid, $3::public.onboarding_agreement_type, $4::uuid, $5,
             $6, $7, $8, $9, $10)
     returning ${AGREEMENT_COLUMNS}`,
    [
      params.personId,
      params.seasonId,
      params.agreementType,
      version.id,
      printedName === "" ? null : printedName,
      submitted(form.name),
      submitted(form.address),
      submitted(form.postcode),
      submitted(form.tel),
      submitted(form.email),
    ],
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
    `select ${AGREEMENT_COLUMNS}
       from public.onboarding_agreements
      where person_id = $1::uuid and season_id = $2::uuid
        and reopened_at is null
      order by agreement_type`,
    [personId, seasonId],
  );
  return result.rows.map((row) => toAgreement(row as unknown as AgreementRow));
}

/**
 * The last form this person submitted for one document in one season, agreed or
 * reopened — LAN-347's prefill source, and the only reader that looks past
 * `reopened_at`.
 *
 * Opening the step again is the case this exists for: after LAN-240's reopen
 * the address and post code the player already wrote start filled, because the
 * club is asking them to confirm the same form, not to retype it. Nothing on
 * `people` holds either value; this row is where the form lives.
 */
export async function readLastSubmittedAgreementFormIn(
  tx: Tx,
  params: { personId: string; seasonId: string; agreementType: OnboardingAgreementType },
): Promise<OnboardingAgreement | null> {
  const result = await tx.query<AgreementRow>(
    `select ${AGREEMENT_COLUMNS}
       from public.onboarding_agreements
      where person_id = $1::uuid and season_id = $2::uuid
        and agreement_type = $3::public.onboarding_agreement_type
      order by agreed_at desc
      limit 1`,
    [params.personId, params.seasonId, params.agreementType],
  );
  const row = result.rows[0];
  return row ? toAgreement(row as unknown as AgreementRow) : null;
}

// Retires one season's agreement row so the document can be agreed again — LAN-240 (walker M7,
// finding M7-01). No reopen verb (D-002): setting the item back to "No" flipped onboarding_items.status
// only, leaving this row (unique per person/season/type) stranded. Zero retired is a legitimate
// outcome. See relocations.md.
//
// LAN-347 stamps the row instead of deleting it. The delete was "schema-free, nothing lost" (the
// Lead's recorded migration review, 2026-09-09) while the row held only version, moment and person;
// it now holds the consent form the player filled in, which LAN-347 requires back on the next open
// and which nothing else stores. Every reader of "what has this person agreed to" filters
// `reopened_at is null`, so a stamped row is as absent as a deleted one ever was — and the record
// that a consent was given, and on what form, is no longer destroyed by an operator's click.
export async function reopenOnboardingAgreementIn(
  tx: Tx,
  params: { personId: string; seasonId: string; agreementType: OnboardingAgreementType },
): Promise<number> {
  const result = await tx.query(
    `update public.onboarding_agreements
        set reopened_at = now()
      where person_id = $1::uuid and season_id = $2::uuid
        and agreement_type = $3::public.onboarding_agreement_type
        and reopened_at is null`,
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
