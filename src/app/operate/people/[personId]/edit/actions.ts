"use server";

import { redirect } from "next/navigation";

import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  addPersonAlias,
  removePersonAlias,
  setDisplayNamePersonAlias,
  supersedeContactPoint,
  updateEmergencyContactField,
  updatePersonField,
} from "@/lib/services/person-write";
import { findPersonDuplicates } from "@/lib/services/person-duplicate";
import { readPersonRecord, type PersonRecord } from "@/lib/services/person-record";
import {
  validateCollegeEmail,
  validateDateOfBirth,
  validatePhoneNumber,
} from "@/lib/services/person-validation";
import {
  GENERIC_FAILURE,
  readEditFormValues,
  type EditFieldErrors,
  type EditState,
} from "./edit-state";

// The record's one server action — W2, LAN-185. One submission for every
// field: re-reads the record fresh, writes only what differs. The
// concurrency check runs once, on the first write — later writes in the
// same submission omit it, since that write already moved the version.
// Mobile validates/normalises server-side too (B3 round 2), even though the
// preview is inline and client-safe.
export async function submitPersonEdit(
  previous: EditState,
  formData: FormData,
): Promise<EditState> {
  const operator = await requireCapability("person_record_authority");
  const personId = String(formData.get("personId") ?? "");
  const values = readEditFormValues(formData);
  const expectedVersion = values.expectedVersion === "" ? null : values.expectedVersion;

  let current: PersonRecord;
  try {
    current = await readPersonRecord(personId);
  } catch (error) {
    return { errors: {}, formError: safeMessage(error) };
  }

  const errors: EditFieldErrors = {};
  let versionChecked = false;
  function nextExpectedVersion(): string | null | undefined {
    if (versionChecked) return undefined;
    versionChecked = true;
    return expectedVersion;
  }

  const mobileChanged = values.mobile.trim() !== (currentMobile(current)?.rawValue ?? "");
  if (mobileChanged && values.mobile.trim() !== "") {
    const validation = validatePhoneNumber(values.mobile);
    if (!validation.valid) errors.mobile = validation.message;
  } else if (mobileChanged && values.mobile.trim() === "" && currentMobile(current)) {
    errors.mobile = "A mobile number cannot be cleared here — supersede it with a new one instead.";
  }

  // College email: LAN-268, Brian 2026-09-09 — refuses before any write,
  // naming the rule, no override. Clearing stays legitimate (only a
  // supplied value is checked).
  const collegeEmailChanged =
    values.collegeEmail.trim() !== (currentEmail(current, "college")?.rawValue ?? "");
  if (collegeEmailChanged && values.collegeEmail.trim() !== "") {
    const validation = validateCollegeEmail(values.collegeEmail);
    if (!validation.valid) errors.collegeEmail = validation.message;
  }

  // Date of birth: LAN-258 (walker M5-03) — the raw database refusal named
  // neither field nor rule; validated per field, before any write.
  const dateOfBirthChanged = values.dateOfBirth.trim() !== (current.dateOfBirth ?? "");
  if (dateOfBirthChanged && values.dateOfBirth.trim() !== "") {
    const validation = validateDateOfBirth(values.dateOfBirth);
    if (!validation.valid) errors.dateOfBirth = validation.message;
  }

  if (Object.keys(errors).length === 0) {
    if (values.givenName.trim() === "") errors.givenName = "Every person needs a first name.";
  }
  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  try {
    if (mobileChanged && values.mobile.trim() !== "") {
      await supersedeContactPoint({
        actorPersonId: operator.personId,
        personId,
        kind: "phone",
        rawValue: values.mobile.trim(),
        reason: values.mobileReason || null,
        source: "operator correction",
        expectedVersion: nextExpectedVersion(),
      });
    }

    if (values.personalEmail.trim() !== (currentEmail(current, "personal")?.rawValue ?? "")) {
      try {
        await supersedeContactPoint({
          actorPersonId: operator.personId,
          personId,
          kind: "email",
          scope: "personal",
          rawValue: values.personalEmail.trim(),
          reason: values.personalEmailReason || null,
          source: "operator correction",
          expectedVersion: nextExpectedVersion(),
        });
      } catch (error) {
        const conflict = await resolveEmailConflict(
          error,
          values.personalEmail.trim(),
          "personalEmail",
        );
        if (conflict) return conflict;
        throw error;
      }
    }

    if (collegeEmailChanged) {
      try {
        await supersedeContactPoint({
          actorPersonId: operator.personId,
          personId,
          kind: "email",
          scope: "college",
          rawValue: values.collegeEmail.trim(),
          reason: values.collegeEmailReason || null,
          source: "operator correction",
          expectedVersion: nextExpectedVersion(),
        });
      } catch (error) {
        const conflict = await resolveEmailConflict(
          error,
          values.collegeEmail.trim(),
          "collegeEmail",
        );
        if (conflict) return conflict;
        throw error;
      }
    }

    if (values.givenName.trim() !== current.givenName) {
      await updatePersonField({
        actorPersonId: operator.personId,
        personId,
        field: "given_name",
        value: values.givenName,
        reason: values.givenNameReason || null,
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.familyName.trim() !== (current.familyName ?? "")) {
      await updatePersonField({
        actorPersonId: operator.personId,
        personId,
        field: "family_name",
        value: values.familyName.trim() === "" ? null : values.familyName.trim(),
        reason: values.familyNameReason || null,
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.college.trim() !== (current.college ?? "")) {
      await updatePersonField({
        actorPersonId: operator.personId,
        personId,
        field: "college",
        value: values.college.trim() === "" ? null : values.college.trim(),
        reason: values.collegeReason || null,
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.degreeField.trim() !== (current.degreeField ?? "")) {
      await updatePersonField({
        actorPersonId: operator.personId,
        personId,
        field: "degree_field",
        value: values.degreeField.trim() === "" ? null : values.degreeField.trim(),
        reason: values.degreeFieldReason || null,
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.studentNumber.trim() !== (current.studentNumber ?? "")) {
      await updatePersonField({
        actorPersonId: operator.personId,
        personId,
        field: "student_number",
        value: values.studentNumber.trim() === "" ? null : values.studentNumber.trim(),
        reason: values.studentNumberReason || null,
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.bafaRegistrationNumber.trim() !== (current.bafaRegistrationNumber ?? "")) {
      await updatePersonField({
        actorPersonId: operator.personId,
        personId,
        field: "bafa_registration_number",
        value:
          values.bafaRegistrationNumber.trim() === "" ? null : values.bafaRegistrationNumber.trim(),
        reason: values.bafaRegistrationNumberReason || null,
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (dateOfBirthChanged) {
      await updatePersonField({
        actorPersonId: operator.personId,
        personId,
        field: "date_of_birth",
        value: values.dateOfBirth.trim() === "" ? null : values.dateOfBirth.trim(),
        reason: values.dateOfBirthReason || null,
        expectedVersion: nextExpectedVersion(),
      });
    }
    const matricNumber = numberOrNull(values.matriculationYear);
    if (matricNumber !== current.matriculationYear) {
      await updatePersonField({
        actorPersonId: operator.personId,
        personId,
        field: "matriculation_year",
        value: matricNumber,
        reason: values.matriculationYearReason || null,
        expectedVersion: nextExpectedVersion(),
      });
    }
    const gradNumber = numberOrNull(values.expectedGraduationYear);
    if (gradNumber !== current.expectedGraduationYear) {
      await updatePersonField({
        actorPersonId: operator.personId,
        personId,
        field: "expected_graduation_year",
        value: gradNumber,
        reason: values.expectedGraduationYearReason || null,
        expectedVersion: nextExpectedVersion(),
      });
    }

    const ec = current.emergencyContact;
    if (values.emergencyGivenName.trim() !== (ec?.givenName ?? "")) {
      await updateEmergencyContactField({
        actorPersonId: operator.personId,
        personId,
        field: "given_name",
        value: values.emergencyGivenName,
        reason: values.emergencyGivenNameReason || null,
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.emergencyFamilyName.trim() !== (ec?.familyName ?? "")) {
      await updateEmergencyContactField({
        actorPersonId: operator.personId,
        personId,
        field: "family_name",
        value: values.emergencyFamilyName.trim() === "" ? null : values.emergencyFamilyName.trim(),
        reason: values.emergencyFamilyNameReason || null,
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.emergencyRelationship.trim() !== (ec?.relationship ?? "")) {
      await updateEmergencyContactField({
        actorPersonId: operator.personId,
        personId,
        field: "relationship",
        value:
          values.emergencyRelationship.trim() === "" ? null : values.emergencyRelationship.trim(),
        reason: values.emergencyRelationshipReason || null,
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.emergencyPhone.trim() !== (ec?.phone ?? "")) {
      await updateEmergencyContactField({
        actorPersonId: operator.personId,
        personId,
        field: "phone",
        value: values.emergencyPhone.trim() === "" ? null : values.emergencyPhone.trim(),
        reason: values.emergencyPhoneReason || null,
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.emergencyEmail.trim() !== (ec?.email ?? "")) {
      await updateEmergencyContactField({
        actorPersonId: operator.personId,
        personId,
        field: "email",
        value: values.emergencyEmail.trim() === "" ? null : values.emergencyEmail.trim(),
        reason: values.emergencyEmailReason || null,
        expectedVersion: nextExpectedVersion(),
      });
    }
  } catch (error) {
    return buildFailureState(error, current, personId);
  }

  redirect(`/operate/people/${personId}`);
}

/** Resolves the other person's id via W3's duplicate check, for the "Compare with…" handoff. */
async function resolveEmailConflict(
  error: unknown,
  email: string,
  field: "personalEmail" | "collegeEmail",
): Promise<EditState | null> {
  if (!isServiceError(error) || error.rule !== "person_contact_email_in_use") return null;
  const candidates = await findPersonDuplicates({ givenName: "", emails: [email] }).catch(() => []);
  const other = candidates.find((c) => c.matchedOn.includes("email"));
  return {
    errors: {},
    emailConflict: other
      ? { personId: other.personId, displayName: other.displayName, field }
      : { personId: "", displayName: "another person", field },
  };
}

function buildFailureState(error: unknown, current: PersonRecord, personId: string): EditState {
  if (isServiceError(error) && error.rule === "person_concurrent_edit") {
    return { errors: {}, concurrentEditMessage: error.message };
  }
  void current;
  void personId;
  return { errors: {}, formError: safeMessage(error) };
}

function currentMobile(record: PersonRecord) {
  return (
    record.contacts.find((c) => c.kind === "phone" && c.validUntil === null && c.isPreferred) ??
    null
  );
}

function currentEmail(record: PersonRecord, scope: "personal" | "college") {
  return (
    record.contacts.find(
      (c) => c.kind === "email" && c.scope === scope && c.validUntil === null && c.isPreferred,
    ) ?? null
  );
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeMessage(error: unknown): string {
  return isServiceError(error) ? error.message : GENERIC_FAILURE;
}

// Aliases — three small actions, each on its own submit button's formAction
// (HTML forbids a nested form), bound with personId/aliasId via .bind since
// React overrides a formAction button's own name/value.

export async function submitRemoveAlias(personId: string, aliasId: string): Promise<void> {
  const operator = await requireCapability("person_record_authority");
  await removePersonAlias({ actorPersonId: operator.personId, personId, aliasId });
  redirect(`/operate/people/${personId}/edit`);
}

export async function submitSetDisplayAlias(personId: string, aliasId: string): Promise<void> {
  const operator = await requireCapability("person_record_authority");
  await setDisplayNamePersonAlias({ actorPersonId: operator.personId, personId, aliasId });
  redirect(`/operate/people/${personId}/edit`);
}

export async function submitAddAlias(personId: string, formData: FormData): Promise<void> {
  const operator = await requireCapability("person_record_authority");
  const newAlias = formData.get("newAlias");
  if (typeof newAlias === "string" && newAlias.trim() !== "") {
    await addPersonAlias({
      actorPersonId: operator.personId,
      personId,
      alias: newAlias,
      source: "operator correction",
    });
  }
  redirect(`/operate/people/${personId}/edit`);
}
