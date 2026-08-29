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
import { validatePhoneNumber } from "@/lib/services/person-validation";
import { describeWhatsappSeamConsequence } from "@/lib/services/person-whatsapp-seam";
import { readCurrentSeason } from "@/lib/services/seasons";
import {
  GENERIC_FAILURE,
  readEditFormValues,
  type EditFieldErrors,
  type EditState,
} from "./edit-state";

/**
 * `/operate/people/[personId]/edit`'s one server action — W2, LAN-185.
 * `requireCapability("person_record_authority")` first, itself, the same
 * posture every action under this package states.
 *
 * ## Why every field is one submission
 *
 * The mockup draws one page and one Save. This action re-reads the current
 * record fresh (never trusting a hidden "previous value" the client could
 * carry stale or tampered) and writes only the fields that actually differ,
 * each through `person-write.ts`'s own function — the ordinary correction
 * path, unchanged. A field left untouched is never written.
 *
 * ## The concurrency check runs once, first
 *
 * `assertNoConcurrentPersonChange` (inside `person-write.ts`) is checked
 * against the version the form loaded with, on the *first* write this
 * submission makes. Every later write in the same submission omits it — by
 * then this submission's own earlier write has legitimately moved the
 * version, and checking again would refuse a save against itself.
 */
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

  // ---- Mobile: validated, normalised and read back before it commits -----
  const mobileChanged = values.mobile.trim() !== (currentMobile(current)?.rawValue ?? "");
  if (mobileChanged && values.mobile.trim() !== "") {
    const validation = validatePhoneNumber(values.mobile);
    if (!validation.valid) {
      errors.mobile = validation.message;
    } else if (values.confirmMobile !== "1") {
      const season = await readCurrentSeason().catch(() => null);
      const previousMobile = currentMobile(current);
      const seam = describeWhatsappSeamConsequence(
        previousMobile?.rawValue ?? "",
        season?.label ?? "the active season",
        // Honest today: no substrate answers this — see person-whatsapp-seam.ts.
        false,
      );
      return {
        errors: {},
        pendingMobileConfirmation: {
          raw: values.mobile.trim(),
          normalisedPreview: `+${validation.e164}`,
          reason: values.mobileReason,
          whatsappWarning: seam.message,
        },
      };
    }
  } else if (mobileChanged && values.mobile.trim() === "" && currentMobile(current)) {
    errors.mobile = "A mobile number cannot be cleared here — supersede it with a new one instead.";
  }

  // ---- Every other field, only where it changed -----------------------
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

    if (values.collegeEmail.trim() !== (currentEmail(current, "college")?.rawValue ?? "")) {
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
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.familyName.trim() !== (current.familyName ?? "")) {
      await updatePersonField({
        actorPersonId: operator.personId,
        personId,
        field: "family_name",
        value: values.familyName.trim() === "" ? null : values.familyName.trim(),
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.college.trim() !== (current.college ?? "")) {
      await updatePersonField({
        actorPersonId: operator.personId,
        personId,
        field: "college",
        value: values.college.trim() === "" ? null : values.college.trim(),
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.degreeField.trim() !== (current.degreeField ?? "")) {
      await updatePersonField({
        actorPersonId: operator.personId,
        personId,
        field: "degree_field",
        value: values.degreeField.trim() === "" ? null : values.degreeField.trim(),
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.dateOfBirth.trim() !== (current.dateOfBirth ?? "")) {
      await updatePersonField({
        actorPersonId: operator.personId,
        personId,
        field: "date_of_birth",
        value: values.dateOfBirth.trim() === "" ? null : values.dateOfBirth.trim(),
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
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.emergencyFamilyName.trim() !== (ec?.familyName ?? "")) {
      await updateEmergencyContactField({
        actorPersonId: operator.personId,
        personId,
        field: "family_name",
        value: values.emergencyFamilyName.trim() === "" ? null : values.emergencyFamilyName.trim(),
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
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.emergencyPhone.trim() !== (ec?.phone ?? "")) {
      await updateEmergencyContactField({
        actorPersonId: operator.personId,
        personId,
        field: "phone",
        value: values.emergencyPhone.trim() === "" ? null : values.emergencyPhone.trim(),
        expectedVersion: nextExpectedVersion(),
      });
    }
    if (values.emergencyEmail.trim() !== (ec?.email ?? "")) {
      await updateEmergencyContactField({
        actorPersonId: operator.personId,
        personId,
        field: "email",
        value: values.emergencyEmail.trim() === "" ? null : values.emergencyEmail.trim(),
        expectedVersion: nextExpectedVersion(),
      });
    }
  } catch (error) {
    return buildFailureState(error, current, personId);
  }

  redirect(`/operate/people/${personId}`);
}

/**
 * `person-write.ts` refuses "email already belongs to another person" with
 * only a rule and a sentence — `DatabaseErrorContext` deliberately carries no
 * row value. This asks the same duplicate check W3 uses to resolve the
 * other person's id, so the "Compare with …" handoff has somewhere to go.
 */
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

// ---------------------------------------------------------------------------
// Aliases — three small actions, called from the Aliases field.
//
// HTML forbids a nested `<form>`, so each lives on its own submit button's
// `formAction` inside the record's one outer form, bound with `personId` (and
// an alias id, for remove/setDisplay) via `.bind`. React overrides a submit
// button's own `name`/`value` the moment `formAction` is a function — "React
// needs it to encode which action should be invoked" — so the alias id
// cannot travel as a button's name/value the way `/operate/people/new`'s
// candidate rows carry theirs; it has to be bound into the action itself
// instead. Every one of these redirects back to this same page, so a click
// here never also submits the record's other fields.
// ---------------------------------------------------------------------------

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
