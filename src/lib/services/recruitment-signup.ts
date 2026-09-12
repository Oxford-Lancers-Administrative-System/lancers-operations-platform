import "server-only";

import { todayInClubZone } from "@/lib/club-time";
import { ConstraintViolated, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "./audit";
import { grantSeasonMessagingConsentIn } from "./messaging-consent";
import { findPersonMatchingGivenNameAndPhoneIn } from "./person-duplicate";
import {
  validateAcademicYear,
  validateCollegeEmail,
  validateEmailAddress,
  validatePhoneNumber,
} from "./person-validation";
import { declareRecruitmentCycleJobsIn } from "./recruitment-cycle";
import { recordRecruitmentSignupCodeUseIn } from "./recruitment-signup-codes";

/**
 * The sign-up gate's one write — LAN-202, reached through two doors:
 * {@link signUpAnonymouslyIn} (QR) and {@link signUpWithTokenIn} (tokenised).
 * Unauthenticated by design. A blank field is filled; a set field is left
 * alone (tokenised door's own name is the exception, Task 08 §3).
 */

export interface SignupSubmission {
  readonly givenName: string;
  readonly familyName: string;
  /** Required (LAN-202 finding 1); normalised to E.164 by `validateSignupSubmission`. */
  readonly mobile?: string | null;
  /** Required (LAN-268) — `ox.ac.uk` or a subdomain only. */
  readonly collegeEmail?: string | null;
  /** Personal address. Optional; validated when supplied (finding 3), never silently discarded. */
  readonly email?: string | null;
  readonly knownAs?: string | null;
  readonly college?: string | null;
  /** Raw text, as typed. Optional; validated when supplied (finding 3). */
  readonly matriculationYear?: string | null;
  readonly expectedGraduationYear?: string | null;
  readonly degreeField?: string | null;
  readonly consent: boolean;
}

export interface SignupResult {
  readonly personId: string;
  readonly personCreated: boolean;
  readonly prospectId: string;
  readonly prospectCreated: boolean;
}

export const SIGNUP_REQUIRES_FIRST_NAME_RULE = "recruitment_signup_requires_a_first_name";
export const SIGNUP_REQUIRES_LAST_NAME_RULE = "recruitment_signup_requires_a_last_name";
export const SIGNUP_REQUIRES_CONSENT_RULE = "recruitment_signup_requires_consent";
export const SIGNUP_REQUIRES_MOBILE_RULE = "recruitment_signup_requires_a_mobile_number";
export const SIGNUP_INVALID_MOBILE_RULE = "recruitment_signup_invalid_mobile_number";
export const SIGNUP_INVALID_EMAIL_RULE = "recruitment_signup_invalid_email_address";
const SIGNUP_REQUIRES_COLLEGE_EMAIL_RULE = "recruitment_signup_requires_a_college_email";
const SIGNUP_INVALID_COLLEGE_EMAIL_RULE = "recruitment_signup_invalid_college_email";
export const SIGNUP_INVALID_MATRICULATION_YEAR_RULE =
  "recruitment_signup_invalid_matriculation_year";
export const SIGNUP_INVALID_EXPECTED_GRADUATION_YEAR_RULE =
  "recruitment_signup_invalid_expected_graduation_year";

function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Throws before anything is written, naming the missing/malformed field. Returns the mobile's E.164 digits alongside the trimmed names. */
function validateSignupSubmission(submission: SignupSubmission): {
  givenName: string;
  familyName: string;
  mobileE164: string;
} {
  const givenName = trimmedOrNull(submission.givenName);
  if (!givenName) {
    throw new ConstraintViolated("A first name is required.", {
      rule: SIGNUP_REQUIRES_FIRST_NAME_RULE,
    });
  }
  const familyName = trimmedOrNull(submission.familyName);
  if (!familyName) {
    throw new ConstraintViolated("A last name is required.", {
      rule: SIGNUP_REQUIRES_LAST_NAME_RULE,
    });
  }

  const mobileRaw = trimmedOrNull(submission.mobile);
  if (!mobileRaw) {
    throw new ConstraintViolated("A mobile number is required — it is how the club reaches you.", {
      rule: SIGNUP_REQUIRES_MOBILE_RULE,
    });
  }
  const mobileValidation = validatePhoneNumber(mobileRaw);
  if (!mobileValidation.valid || !mobileValidation.e164) {
    throw new ConstraintViolated(mobileValidation.message, { rule: SIGNUP_INVALID_MOBILE_RULE });
  }

  // LAN-268: refusal message is validateCollegeEmail's own, not re-worded here.
  const collegeEmailRaw = trimmedOrNull(submission.collegeEmail);
  if (!collegeEmailRaw) {
    throw new ConstraintViolated(
      "A college email is required — it is how the club knows you are at the university.",
      { rule: SIGNUP_REQUIRES_COLLEGE_EMAIL_RULE },
    );
  }
  const collegeEmailValidation = validateCollegeEmail(collegeEmailRaw);
  if (!collegeEmailValidation.valid) {
    throw new ConstraintViolated(collegeEmailValidation.message, {
      rule: SIGNUP_INVALID_COLLEGE_EMAIL_RULE,
    });
  }

  const emailRaw = trimmedOrNull(submission.email);
  if (emailRaw) {
    const emailValidation = validateEmailAddress(emailRaw);
    if (!emailValidation.valid) {
      throw new ConstraintViolated(emailValidation.message, { rule: SIGNUP_INVALID_EMAIL_RULE });
    }
  }

  const matriculationRaw = trimmedOrNull(submission.matriculationYear);
  if (matriculationRaw) {
    const yearValidation = validateAcademicYear(matriculationRaw, "Matriculation year");
    if (!yearValidation.valid) {
      throw new ConstraintViolated(yearValidation.message, {
        rule: SIGNUP_INVALID_MATRICULATION_YEAR_RULE,
      });
    }
  }

  const graduationRaw = trimmedOrNull(submission.expectedGraduationYear);
  if (graduationRaw) {
    const yearValidation = validateAcademicYear(graduationRaw, "Expected graduation");
    if (!yearValidation.valid) {
      throw new ConstraintViolated(yearValidation.message, {
        rule: SIGNUP_INVALID_EXPECTED_GRADUATION_YEAR_RULE,
      });
    }
  }

  if (submission.consent !== true) {
    throw new ConstraintViolated(
      "Tick the consent box to save this form — it cannot be saved without it.",
      { rule: SIGNUP_REQUIRES_CONSENT_RULE },
    );
  }
  return { givenName, familyName, mobileE164: mobileValidation.e164 };
}

export interface SignupDuplicateProbe {
  /** Never a name, an email, a phone number, or a database identifier — only whether one matched. */
  readonly found: boolean;
}

const NO_MATCH: SignupDuplicateProbe = { found: false };

/** A phone number too short to mean anything is not run through the check at all. */
const PLAUSIBLE_MOBILE_MIN_DIGITS = 7;

/**
 * Returns a bare boolean, never a name, contact value, or id (W7 privacy).
 * Requires the given name (or alias) *and* phone together, on the same row
 * (LAN-208). No mobile supplied, no probe.
 */
export async function probeExistingRecruitForQrSignup(
  givenName: string,
  mobile: string | null | undefined,
): Promise<SignupDuplicateProbe> {
  const trimmedGiven = trimmedOrNull(givenName);
  const trimmedMobile = trimmedOrNull(mobile);
  if (!trimmedGiven || !trimmedMobile) return NO_MATCH;
  if (trimmedMobile.replace(/\D/g, "").length < PLAUSIBLE_MOBILE_MIN_DIGITS) return NO_MATCH;

  const match = await withTransaction((tx) =>
    findPersonMatchingGivenNameAndPhoneIn(tx, trimmedGiven, trimmedMobile),
  );
  return match ? { found: true } : NO_MATCH;
}

const TEXT_FIELD_COLUMNS = {
  college: "college",
  degreeField: "degree_field",
} as const;

async function fillPersonTextFieldIfBlankIn(
  tx: Tx,
  personId: string,
  column: (typeof TEXT_FIELD_COLUMNS)[keyof typeof TEXT_FIELD_COLUMNS],
  value: string | null | undefined,
): Promise<void> {
  const trimmed = trimmedOrNull(value);
  if (!trimmed) return;
  await tx.query(
    `update public.people set ${column} = $2, updated_at = now() where id = $1::uuid and ${column} is null`,
    [personId, trimmed],
  );
}

const YEAR_FIELD_COLUMNS = {
  matriculationYear: "matriculation_year",
  expectedGraduationYear: "expected_graduation_year",
} as const;

/** Bounds check is a defensive backstop; `validateSignupSubmission` already refused a malformed value before this is reached (finding 3). */
async function fillPersonYearFieldIfBlankIn(
  tx: Tx,
  personId: string,
  column: (typeof YEAR_FIELD_COLUMNS)[keyof typeof YEAR_FIELD_COLUMNS],
  value: string | null | undefined,
): Promise<void> {
  const trimmed = trimmedOrNull(value);
  if (!trimmed) return;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2200) return;
  await tx.query(
    `update public.people set ${column} = $2, updated_at = now() where id = $1::uuid and ${column} is null`,
    [personId, parsed],
  );
}

/** Adds a contact value only when this person holds none of that kind/scope; never supersedes an existing one (that needs `supersedeContactPoint`'s authenticated reason). */
async function fillContactIfNoneIn(
  tx: Tx,
  personId: string,
  kind: "phone" | "email",
  scope: "college" | "personal" | null,
  rawValue: string | null | undefined,
  normalisedValue: string | null = null,
): Promise<void> {
  const trimmed = trimmedOrNull(rawValue);
  if (!trimmed) return;

  const current = await tx.query(
    `select 1 from public.contact_points
      where person_id = $1::uuid and kind = $2::public.contact_point_kind
        and scope is not distinct from $3::public.contact_point_scope
        and valid_until is null and is_preferred`,
    [personId, kind, scope],
  );
  if (current.rows.length > 0) return;

  await tx.query(
    `insert into public.contact_points
       (person_id, kind, scope, raw_value, normalised_value, is_preferred, source)
     values ($1::uuid, $2::public.contact_point_kind, $3::public.contact_point_scope, $4, $5, true, $6)`,
    [personId, kind, scope, trimmed, normalisedValue, "recruitment sign-up (LAN-202)"],
  );
}

/** Writes a `person_aliases` row only when it differs from the given name (same guard as the `known_as` migration). No preferred-name field exists. */
async function recordKnownAsIn(
  tx: Tx,
  personId: string,
  givenName: string,
  knownAs: string | null | undefined,
): Promise<void> {
  const trimmed = trimmedOrNull(knownAs);
  if (!trimmed) return;
  if (trimmed.toLowerCase() === givenName.trim().toLowerCase()) return;

  await tx.query(
    `update public.person_aliases set is_display_name = false
      where person_id = $1::uuid and is_display_name and alias <> $2`,
    [personId, trimmed],
  );
  await tx.query(
    `insert into public.person_aliases (person_id, alias, source, is_display_name)
     values ($1::uuid, $2, $3, true)
     on conflict (person_id, alias) do update set is_display_name = true`,
    [personId, trimmed, "recruitment sign-up (LAN-202)"],
  );
}

async function applyQuestionnaireAAnswersIn(
  tx: Tx,
  personId: string,
  givenName: string,
  submission: SignupSubmission,
  mobileE164: string,
): Promise<void> {
  await recordKnownAsIn(tx, personId, givenName, submission.knownAs);
  await fillPersonTextFieldIfBlankIn(tx, personId, TEXT_FIELD_COLUMNS.college, submission.college);
  await fillPersonTextFieldIfBlankIn(
    tx,
    personId,
    TEXT_FIELD_COLUMNS.degreeField,
    submission.degreeField,
  );
  await fillPersonYearFieldIfBlankIn(
    tx,
    personId,
    YEAR_FIELD_COLUMNS.matriculationYear,
    submission.matriculationYear,
  );
  await fillPersonYearFieldIfBlankIn(
    tx,
    personId,
    YEAR_FIELD_COLUMNS.expectedGraduationYear,
    submission.expectedGraduationYear,
  );
  // raw_value stored as typed; mobileE164 stored as normalised_value for selectMobileNumber.
  await fillContactIfNoneIn(tx, personId, "phone", null, submission.mobile, mobileE164);
  await fillContactIfNoneIn(tx, personId, "email", "personal", submission.email);
  // LAN-268: filled, never superseded — a wrong college email on file is a missing-data queue row.
  await fillContactIfNoneIn(tx, personId, "email", "college", submission.collegeEmail);
}

interface EnsuredProspect {
  readonly id: string;
  readonly created: boolean;
}

/** `on conflict … do nothing` plus a read: idempotent under a retried or double submit (LAN-202 "Done when"). */
async function ensureProspectIn(
  tx: Tx,
  personId: string,
  seasonId: string,
  source: string,
): Promise<EnsuredProspect> {
  // first_contact_on is today — the recruit filling this in is the contact (LAN-247).
  const inserted = await tx.query<{ id: string }>(
    `insert into public.recruitment_prospects (person_id, season_id, source, first_contact_on)
     values ($1::uuid, $2::uuid, $3, $4::date)
     on conflict (person_id, season_id) do nothing
     returning id`,
    [personId, seasonId, source, todayInClubZone()],
  );
  if (inserted.rows[0]) return { id: inserted.rows[0].id, created: true };

  const existing = await tx.query<{ id: string }>(
    `select id from public.recruitment_prospects where person_id = $1::uuid and season_id = $2::uuid`,
    [personId, seasonId],
  );
  return { id: existing.rows[0].id, created: false };
}

async function insertPersonIn(tx: Tx, givenName: string, familyName: string): Promise<string> {
  const result = await tx.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [givenName, familyName],
  );
  return result.rows[0].id;
}

const SELF_ENTRY_SOURCE = "qr_self_entry";

/** The QR (anonymous) door. `linkExistingPersonId` is re-checked here, never trusted from the client; a stale/merged id falls back to creating a new person (W7, LAN-208). */
export async function signUpAnonymouslyIn(
  tx: Tx,
  params: {
    seasonId: string;
    code: string;
    submission: SignupSubmission;
    linkExistingPersonId?: string | null;
  },
): Promise<SignupResult> {
  const { givenName, familyName, mobileE164 } = validateSignupSubmission(params.submission);

  let personId: string;
  let personCreated: boolean;

  if (params.linkExistingPersonId) {
    const existing = await tx.query<{ id: string; merged_into_person_id: string | null }>(
      `select id, merged_into_person_id from public.people where id = $1::uuid for update`,
      [params.linkExistingPersonId],
    );
    const row = existing.rows[0];
    if (row && !row.merged_into_person_id) {
      personId = row.id;
      personCreated = false;
    } else {
      personId = await insertPersonIn(tx, givenName, familyName);
      personCreated = true;
    }
  } else {
    personId = await insertPersonIn(tx, givenName, familyName);
    personCreated = true;
  }

  await applyQuestionnaireAAnswersIn(tx, personId, givenName, params.submission, mobileE164);
  const prospect = await ensureProspectIn(tx, personId, params.seasonId, SELF_ENTRY_SOURCE);
  await grantSeasonMessagingConsentIn(tx, personId, params.seasonId);
  // LAN-305: every capture door reaches the same declarer. This one's grant
  // completes the welcome track by definition, so what it declares is the
  // interest ask and its reminder — and nothing at all once Questionnaire B
  // is answered, which is the declarer's own rule, not a second copy of it.
  await declareRecruitmentCycleJobsIn(tx, personId, params.seasonId);
  await recordRecruitmentSignupCodeUseIn(tx, params.code);

  await recordAudit(tx, {
    actorLabel: personCreated
      ? "recruit: QR sign-up form (new person)"
      : "recruit: QR sign-up form (self-identified as an existing record)",
    action: personCreated ? "person_created" : "recruitment_prospect_self_identified",
    entityTable: "people",
    entityId: personId,
    context: { issue: "LAN-202", door: SELF_ENTRY_SOURCE, season_id: params.seasonId },
  });

  return { personId, personCreated, prospectId: prospect.id, prospectCreated: prospect.created };
}

/** The tokenised, prefilled door. Caller resolves the `person_access_tokens` credential first (`resolvePersonTokenIn`); never creates a second person or prospect row. */
export async function signUpWithTokenIn(
  tx: Tx,
  params: {
    personId: string;
    seasonId: string;
    submission: SignupSubmission;
  },
): Promise<SignupResult> {
  const { givenName, familyName, mobileE164 } = validateSignupSubmission(params.submission);

  // Credential acts as this exact person (Task 08 §3): name is taken at face value, not just filled when blank.
  await tx.query(
    `update public.people set given_name = $2, family_name = $3, updated_at = now() where id = $1::uuid`,
    [params.personId, givenName, familyName],
  );

  await applyQuestionnaireAAnswersIn(tx, params.personId, givenName, params.submission, mobileE164);
  const prospect = await ensureProspectIn(tx, params.personId, params.seasonId, SELF_ENTRY_SOURCE);
  await grantSeasonMessagingConsentIn(tx, params.personId, params.seasonId);
  await declareRecruitmentCycleJobsIn(tx, params.personId, params.seasonId); // LAN-305, as the QR door above.

  await recordAudit(tx, {
    actorLabel: "recruit: WhatsApp sign-up link",
    action: "recruitment_prospect_self_completed",
    entityTable: "people",
    entityId: params.personId,
    context: { issue: "LAN-202", door: SELF_ENTRY_SOURCE, season_id: params.seasonId },
  });

  return {
    personId: params.personId,
    personCreated: false,
    prospectId: prospect.id,
    prospectCreated: prospect.created,
  };
}

export interface SignupPrefill {
  readonly givenName: string;
  readonly familyName: string | null;
  readonly mobile: string | null;
  readonly collegeEmail: string | null;
  readonly email: string | null;
  readonly college: string | null;
  readonly matriculationYear: number | null;
  readonly expectedGraduationYear: number | null;
  readonly degreeField: string | null;
}

/** Exactly what the tokenised door needs to prefill — not `readPersonRecordIn`, which reads provenance/emergency-contact detail this form has no business seeing. */
export async function readSignupPrefillIn(tx: Tx, personId: string): Promise<SignupPrefill> {
  const person = await tx.query<{
    given_name: string;
    family_name: string | null;
    college: string | null;
    matriculation_year: number | null;
    expected_graduation_year: number | null;
    degree_field: string | null;
  }>(
    `select given_name, family_name, college, matriculation_year, expected_graduation_year, degree_field
       from public.people where id = $1::uuid`,
    [personId],
  );
  const row = person.rows[0];

  const contacts = await tx.query<{
    kind: "phone" | "email";
    scope: "college" | "personal" | null;
    raw_value: string;
  }>(
    `select kind::text as kind, scope::text as scope, raw_value from public.contact_points
      where person_id = $1::uuid and valid_until is null and is_preferred`,
    [personId],
  );
  const mobile = contacts.rows.find((c) => c.kind === "phone")?.raw_value ?? null;
  // Personal first, then an unscoped row (pre-LAN-182 data); a college-scoped row is never offered here.
  const email =
    contacts.rows.find((c) => c.kind === "email" && c.scope === "personal")?.raw_value ??
    contacts.rows.find((c) => c.kind === "email" && c.scope === null)?.raw_value ??
    null;
  const collegeEmail =
    contacts.rows.find((c) => c.kind === "email" && c.scope === "college")?.raw_value ?? null;

  return {
    givenName: row?.given_name ?? "",
    familyName: row?.family_name ?? null,
    collegeEmail,
    mobile,
    email,
    college: row?.college ?? null,
    matriculationYear: row?.matriculation_year ?? null,
    expectedGraduationYear: row?.expected_graduation_year ?? null,
    degreeField: row?.degree_field ?? null,
  };
}
