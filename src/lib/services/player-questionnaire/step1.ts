import { withTransaction } from "@/lib/db";
import { EMAIL_SHAPE, PHONE_SHAPE } from "@/app/operate/roster/new/validation";
import { looksLikeEmail, looksLikePhone } from "@/lib/validation/contact";
import { recordOnboardingActivityIn } from "../onboarding-activity-log";
import {
  grantSeasonMessagingConsentIn,
  hasGrantedSeasonMessagingConsentIn,
} from "../messaging-consent";
import type { DisputedPersonField } from "../person-fact-dispute";
import { readPersonRecord, type PersonRecord } from "../person-record";
import {
  supersedeContactPoint,
  updateEmergencyContactField,
  type EmergencyContactFieldUpdate,
} from "../person-write";
import {
  validateAcademicYear,
  validateCollegeEmail,
  validateDateOfBirth,
} from "../person-validation";
import { applyDisputableFieldIn, DISPUTABLE_FIELDS, type FieldSaveOutcome } from "./provenance";
import { readEmergencyContactFactsIn, syncDerivedItemsIn } from "./read";

/**
 * The step 1 save — every field this call was given, applied in one pass.
 * F1 (LAN-230, Brian, 2026-09-02): "Whatever a step saved stays saved…
 * never discards" — each independently-checked slot gates only its own
 * write; nothing here is one all-or-nothing transaction.
 */

export interface DetailsStepInput {
  personId: string;
  seasonId: string;
  membershipId: string;
  grantConsent: boolean;
  fields: Partial<Record<DisputedPersonField, string>>;
  mobile: string;
  /**
   * LAN-268. Validated to the Oxford rule before it is written, and refused
   * with the rule's one sentence — a blank one is never a shape failure here,
   * exactly as a blank mobile is not: required-ness is the form's own check.
   */
  collegeEmail: string;
  personalEmail: string;
  emergencyContact: {
    givenName: string;
    familyName: string;
    relationship: string;
    phone: string;
    email: string;
  };
}

export interface DetailsStepResult {
  errors: Record<string, string>;
  outcomes: Partial<Record<DisputedPersonField, FieldSaveOutcome>>;
}

/**
 * Validates first, then writes every field that validated — never all or
 * nothing. F1 (LAN-230, a critical fix on Brian's own confirmed requirement,
 * 2026-09-02: "Whatever a step saved stays saved… never discards"; CE-008,
 * `REQ-required-set`: "the required set… blocks the form and never the
 * player, and whatever a step saved stays saved"): a submission this module
 * used to abort *entirely* the moment any single field failed its own shape
 * check, discarding nine valid answers over one malformed one. Each of the
 * six independently-checked slots below (mobile, personal email, the two
 * emergency-contact fields, and the two academic years) now gates only its
 * own write; every other slot, and the five disputable fields with no shape
 * check at all, commit regardless of what else in the same submission failed.
 * `errors` is still returned in full, so the player sees exactly what still
 * needs fixing — it just never again means nothing was kept.
 *
 * Every write below is its own already-audited, already-transactional call
 * (`updatePersonField`, `supersedeContactPoint`, `updateEmergencyContactField`)
 * — none of them expose a transaction-scoped variant, so this save is a
 * sequence of independently-committed steps rather than one all-or-nothing
 * transaction. That is not a shortcut: it is the exact semantics
 * `REQ-required-set` asks for — a save interrupted partway through, or one
 * that arrived with some fields invalid, still keeps everything that
 * validated and committed, rather than losing it to an all-or-nothing gate.
 */
export async function saveDetailsStep(input: DetailsStepInput): Promise<DetailsStepResult> {
  const current = await readPersonRecord(input.personId);
  const errors: Record<string, string> = {};

  // Mobile, personal email and the two emergency-contact fields all share one
  // shape idiom — `src/lib/validation/contact.ts`'s own
  // `looksLikePhone`/`looksLikeEmail` (LAN-215, B-007's shared module; this
  // file's import moved onto it when that package extracted the predicates
  // out of `src/app/operate/roster/new/validation.ts`, which now re-exports
  // only the two error sentences) — rather than each inventing its own,
  // per Brian's correction (B-001, LAN-216 round 1): "Should be the same as
  // all other form validations we have." A blank value is never rejected here
  // — required-ness is a separate check (`missingRequiredFields`) — this only
  // catches a value that was actually typed and does not look like its kind.
  const mobileChanged = input.mobile.trim() !== "" && needsMobileWrite(current, input.mobile);
  if (mobileChanged && !looksLikePhone(input.mobile)) errors.mobile = PHONE_SHAPE;
  const emailChanged =
    input.personalEmail.trim() !== "" && needsPersonalEmailWrite(current, input.personalEmail);
  if (emailChanged && !looksLikeEmail(input.personalEmail)) errors.personalEmail = EMAIL_SHAPE;
  // LAN-268. The college email is the one email on this form with a rule
  // beyond shape, and it is asked of the one validator rather than restated:
  // `validateCollegeEmail` already defers to the shared shape check first, so
  // "that is not an address" and "that is not an Oxford address" are two
  // different sentences from the same call. A value that fails is left
  // unwritten and the old one stays on file, which is the same
  // never-all-or-nothing behaviour every other slot in this function has.
  const collegeEmailChanged =
    input.collegeEmail.trim() !== "" && needsCollegeEmailWrite(current, input.collegeEmail);
  let collegeEmailValid = true;
  if (input.collegeEmail.trim() !== "") {
    const validation = validateCollegeEmail(input.collegeEmail);
    if (!validation.valid) {
      errors.collegeEmail = validation.message;
      collegeEmailValid = false;
    }
  }
  const ecPhoneInvalid =
    input.emergencyContact.phone.trim() !== "" && !looksLikePhone(input.emergencyContact.phone);
  if (ecPhoneInvalid) errors.ec_phone = PHONE_SHAPE;
  const ecEmailInvalid =
    input.emergencyContact.email.trim() !== "" && !looksLikeEmail(input.emergencyContact.email);
  if (ecEmailInvalid) errors.ec_email = EMAIL_SHAPE;
  if (input.fields.matriculation_year) {
    const validation = validateAcademicYear(input.fields.matriculation_year, "Matriculation year");
    if (!validation.valid) errors.matriculation_year = validation.message;
  }
  if (input.fields.expected_graduation_year) {
    const validation = validateAcademicYear(
      input.fields.expected_graduation_year,
      "Expected graduation",
    );
    if (!validation.valid) errors.expected_graduation_year = validation.message;
  }
  // LAN-245 (walker M7, finding M7-03): a future date of birth used to reach
  // `updatePersonField` through the disputable-field loop below, where
  // `people_date_of_birth_in_the_past` refused it — and the refusal escaped
  // the server action as a 500 and the generic error boundary. It is a third
  // shape check on exactly the same footing as the two academic years above:
  // the value is left unwritten (the loop skips a field carrying an error)
  // and the player is told, against the field, what is wrong with it.
  if (input.fields.date_of_birth) {
    const validation = validateDateOfBirth(input.fields.date_of_birth);
    if (!validation.valid) errors.date_of_birth = validation.message;
  }

  if (input.grantConsent) {
    // Idempotent by construction: a crafted resubmission of an already-granted
    // tick must never bump `changed_at` again, so this is checked and granted
    // inside one transaction rather than granted unconditionally. Consent is
    // never gated on any other field's validity — it is its own tick.
    await withTransaction(async (tx) => {
      const granted = await hasGrantedSeasonMessagingConsentIn(tx, input.personId, input.seasonId);
      if (!granted) await grantSeasonMessagingConsentIn(tx, input.personId, input.seasonId);
    });
  }

  const outcomes: Partial<Record<DisputedPersonField, FieldSaveOutcome>> = {};
  for (const field of DISPUTABLE_FIELDS) {
    // `matriculation_year`/`expected_graduation_year` are the only two of the
    // seven with a shape check (`validateAcademicYear`, above); a value that
    // failed it is left unwritten rather than parsed and stored anyway — the
    // other five fields have no shape check at all and always attempt to
    // write (a blank one is already a no-op inside `applyDisputableFieldIn`).
    if (errors[field]) continue;
    const raw = input.fields[field];
    if (raw === undefined) continue;
    const outcome = await withTransaction((tx) =>
      applyDisputableFieldIn(tx, {
        personId: input.personId,
        field,
        currentRecord: current,
        newValue: raw,
      }),
    );
    outcomes[field] = outcome;
  }

  if (mobileChanged && !errors.mobile) {
    await supersedeContactPoint({
      actorPersonId: input.personId,
      personId: input.personId,
      kind: "phone",
      rawValue: input.mobile,
      source: "player self-service",
      reason: "Player self-service correction.",
    });
  }
  if (emailChanged && !errors.personalEmail) {
    await supersedeContactPoint({
      actorPersonId: input.personId,
      personId: input.personId,
      kind: "email",
      scope: "personal",
      rawValue: input.personalEmail,
      source: "player self-service",
      reason: "Player self-service correction.",
    });
  }
  if (collegeEmailChanged && collegeEmailValid) {
    await supersedeContactPoint({
      actorPersonId: input.personId,
      personId: input.personId,
      kind: "email",
      scope: "college",
      rawValue: input.collegeEmail,
      source: "player self-service",
      reason: "Player self-service correction.",
    });
  }

  // A malformed emergency-contact phone or email is blanked before reaching
  // `writeEmergencyContactIn`, whose own "never clears a field" rule then
  // treats it exactly as "not submitted" — every other emergency-contact
  // field submitted alongside it still writes.
  await writeEmergencyContactIn(input.personId, {
    ...input.emergencyContact,
    phone: ecPhoneInvalid ? "" : input.emergencyContact.phone,
    email: ecEmailInvalid ? "" : input.emergencyContact.email,
  });

  await withTransaction(async (tx) => {
    await syncDerivedItemsIn(tx, {
      personId: input.personId,
      seasonId: input.seasonId,
      membershipId: input.membershipId,
    });
    await recordOnboardingActivityIn(tx, {
      membershipId: input.membershipId,
      seasonId: input.seasonId,
      section: "Your details",
      kind: "answer",
      channel: "signed link",
      actorPersonId: input.personId,
    });
  });

  return { errors, outcomes };
}

function needsMobileWrite(record: PersonRecord, raw: string): boolean {
  const current = record.contacts.find((c) => c.kind === "phone" && c.validUntil === null);
  return (current?.rawValue ?? "") !== raw.trim();
}

function needsPersonalEmailWrite(record: PersonRecord, raw: string): boolean {
  const current = record.contacts.find(
    (c) => c.kind === "email" && c.scope === "personal" && c.validUntil === null,
  );
  return (current?.rawValue ?? "") !== raw.trim();
}

function needsCollegeEmailWrite(record: PersonRecord, raw: string): boolean {
  const current = record.contacts.find(
    (c) => c.kind === "email" && c.scope === "college" && c.validUntil === null,
  );
  return (current?.rawValue ?? "") !== raw.trim();
}

/**
 * Emergency contact fields are overwritten in place (see the module note) —
 * one `updateEmergencyContactField` call per field that changed, `given_name`
 * always first so a fresh record is never started on any other field
 * (`person_emergency_contacts_given_name_not_blank`, enforced by that
 * function itself).
 */
type EmergencyContactField = "given_name" | "family_name" | "relationship" | "phone" | "email";

const EMERGENCY_CONTACT_FIELD_ORDER: readonly EmergencyContactField[] = Object.freeze([
  "given_name",
  "family_name",
  "relationship",
  "phone",
  "email",
]);

/** One call per field, keeping `updateEmergencyContactField`'s own discriminated union real. */
function emergencyContactUpdateFor(
  field: EmergencyContactField,
  value: string,
): EmergencyContactFieldUpdate {
  switch (field) {
    case "given_name":
      return { field, value };
    case "family_name":
      return { field, value };
    case "relationship":
      return { field, value };
    case "phone":
      return { field, value };
    case "email":
      return { field, value };
  }
}

async function writeEmergencyContactIn(
  personId: string,
  submitted: DetailsStepInput["emergencyContact"],
): Promise<void> {
  const current = await withTransaction((tx) => readEmergencyContactFactsIn(tx, personId));
  const submittedByField: Record<EmergencyContactField, string> = {
    given_name: submitted.givenName.trim(),
    family_name: submitted.familyName.trim(),
    relationship: submitted.relationship.trim(),
    phone: submitted.phone.trim(),
    email: submitted.email.trim(),
  };
  const currentByField: Record<EmergencyContactField, string | null> = {
    given_name: current?.givenName ?? null,
    family_name: current?.familyName ?? null,
    relationship: current?.relationship ?? null,
    phone: current?.phone ?? null,
    email: current?.email ?? null,
  };

  for (const field of EMERGENCY_CONTACT_FIELD_ORDER) {
    const value = submittedByField[field];
    if (value === "") continue; // never clears a field — no decline, ever
    if ((currentByField[field] ?? "") === value) continue;

    const hadValue = currentByField[field] !== null;
    await updateEmergencyContactField({
      actorPersonId: personId,
      personId,
      reason: hadValue ? "Player self-service correction." : null,
      ...emergencyContactUpdateFor(field, value),
    });
  }
}
