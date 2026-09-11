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
 * The step 1 save — every field applied in one pass, independently gated
 * (F1, LAN-230): nothing here is one all-or-nothing transaction.
 */

export interface DetailsStepInput {
  personId: string;
  seasonId: string;
  membershipId: string;
  grantConsent: boolean;
  fields: Partial<Record<DisputedPersonField, string>>;
  mobile: string;
  /** LAN-268: validated to the Oxford rule before write; blank is never a shape failure here. */
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
 * nothing (F1, LAN-230). Each independently-checked slot (mobile, personal
 * email, emergency-contact phone/email, two academic years) gates only its
 * own write; the five disputable fields with no shape check always attempt
 * to write. `errors` is returned in full regardless of what committed.
 * Every write is its own already-audited, already-transactional call — this
 * save is a sequence of independently-committed steps, not one transaction.
 */
export async function saveDetailsStep(input: DetailsStepInput): Promise<DetailsStepResult> {
  const current = await readPersonRecord(input.personId);
  const errors: Record<string, string> = {};

  // Shared shape idiom (LAN-215, B-007, B-001/LAN-216). Blank is never rejected here; required-ness is separate.
  const mobileChanged = input.mobile.trim() !== "" && needsMobileWrite(current, input.mobile);
  if (mobileChanged && !looksLikePhone(input.mobile)) errors.mobile = PHONE_SHAPE;
  const emailChanged =
    input.personalEmail.trim() !== "" && needsPersonalEmailWrite(current, input.personalEmail);
  if (emailChanged && !looksLikeEmail(input.personalEmail)) errors.personalEmail = EMAIL_SHAPE;
  // LAN-268: validateCollegeEmail is the one validator, deferring to the shared shape check first. Invalid stays unwritten.
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
  // LAN-245 (M7-03): same footing as the two academic years above — unwritten on failure, told against the field.
  if (input.fields.date_of_birth) {
    const validation = validateDateOfBirth(input.fields.date_of_birth);
    if (!validation.valid) errors.date_of_birth = validation.message;
  }

  if (input.grantConsent) {
    await withTransaction(async (tx) => {
      const granted = await hasGrantedSeasonMessagingConsentIn(tx, input.personId, input.seasonId);
      if (!granted) await grantSeasonMessagingConsentIn(tx, input.personId, input.seasonId);
    });
  }

  const outcomes: Partial<Record<DisputedPersonField, FieldSaveOutcome>> = {};
  for (const field of DISPUTABLE_FIELDS) {
    // Only the two academic years have a shape check; the other five always attempt to write.
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

  // A malformed phone/email is blanked before reaching writeEmergencyContactIn, whose "never clears a field" rule treats it as not submitted.
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

/** One `updateEmergencyContactField` call per changed field, `given_name` always first (`person_emergency_contacts_given_name_not_blank`). */
type EmergencyContactField = "given_name" | "family_name" | "relationship" | "phone" | "email";

const EMERGENCY_CONTACT_FIELD_ORDER: readonly EmergencyContactField[] = Object.freeze([
  "given_name",
  "family_name",
  "relationship",
  "phone",
  "email",
]);

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
    if (value === "") continue;
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
