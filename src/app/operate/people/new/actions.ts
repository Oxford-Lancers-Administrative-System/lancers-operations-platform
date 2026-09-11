"use server";

import { redirect } from "next/navigation";

import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { findPersonDuplicates } from "@/lib/services/person-duplicate";
import { createPerson } from "@/lib/services/person-create";
import type { PersonRecord } from "@/lib/services/person-record";
import {
  GENERIC_FAILURE,
  readCreateValues,
  type CreateFieldErrors,
  type CreateState,
} from "./create-state";

/**
 * `/operate/people/new`'s one server action — W3, LAN-185. Every request
 * re-calls `requireCapability("person_record_authority")`. Three intents
 * ("check"/"create"/"link") on one action, all re-reading and re-authorizing.
 */
export async function submitCreatePerson(
  previous: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const operator = await requireCapability("person_record_authority");

  const values = readCreateValues(formData);
  const linkPersonId = formData.get("linkPersonId");
  const intent =
    typeof linkPersonId === "string" && linkPersonId !== "" ? "link" : formData.get("intent");

  if (intent === "check") {
    const errors = requiredErrors(values);
    if (Object.keys(errors).length > 0) {
      return { values, errors, candidates: null, exactMatch: null };
    }
    try {
      const candidates = await findPersonDuplicates({
        givenName: values.givenName,
        familyName: values.familyName,
        emails: values.personalEmail ? [values.personalEmail] : [],
        phones: values.mobile ? [values.mobile] : [],
      });
      return { values, errors: {}, candidates, exactMatch: null };
    } catch (error) {
      return {
        values,
        errors: {},
        candidates: null,
        exactMatch: null,
        formError: safeMessage(error),
      };
    }
  }

  if (intent === "link") {
    const personId = linkPersonId as string;
    let landing: string;
    try {
      const result = await createPerson({
        actorPersonId: operator.personId,
        input: values,
        decision: { kind: "link_existing", personId },
      });
      landing = linkedHref(result.personId, values, result.record);
    } catch (error) {
      return {
        values,
        errors: {},
        candidates: previous.candidates,
        exactMatch: null,
        formError: safeMessage(error),
      };
    }
    // Outside the try — `redirect` throws, and catching it would report a successful link as failure.
    redirect(landing);
  }

  if (intent === "create") {
    const errors = requiredErrors(values);
    if (Object.keys(errors).length > 0) {
      return { values, errors, candidates: previous.candidates, exactMatch: null };
    }
    const overrideReason = formData.get("overrideReason");
    let landingPersonId: string;
    try {
      const result = await createPerson({
        actorPersonId: operator.personId,
        input: values,
        decision: {
          kind: "create_new",
          overrideReason: typeof overrideReason === "string" ? overrideReason : null,
        },
      });
      landingPersonId = result.personId;
    } catch (error) {
      if (isServiceError(error) && error.rule === "person_create_exact_match_requires_reason") {
        const candidates =
          previous.candidates ??
          (await findPersonDuplicates({
            givenName: values.givenName,
            familyName: values.familyName,
            emails: values.personalEmail ? [values.personalEmail] : [],
            phones: values.mobile ? [values.mobile] : [],
          }).catch(() => []));
        const exactMatch =
          candidates.find((c) => c.matchedOn.includes("email") || c.matchedOn.includes("phone")) ??
          null;
        return {
          values,
          errors: {},
          candidates,
          exactMatch,
          reasonError: exactMatch ? undefined : error.message,
        };
      }
      const fieldErrors = validationFieldErrors(error);
      if (fieldErrors) {
        return { values, errors: fieldErrors, candidates: previous.candidates, exactMatch: null };
      }
      return {
        values,
        errors: {},
        candidates: previous.candidates,
        exactMatch: previous.exactMatch,
        formError: safeMessage(error),
      };
    }
    redirect(`/operate/people/${landingPersonId}`);
  }

  return { ...previous, formError: GENERIC_FAILURE };
}

/**
 * Where "This is them" lands, and what it has to admit — LAN-257. Nothing
 * is written to the chosen person; a differing typed value is named, not
 * guessed at. Query carries only field names, never the value.
 */
function linkedHref(
  personId: string,
  values: { mobile: string; personalEmail: string },
  record: PersonRecord,
): string {
  const unsaved: string[] = [];
  if (typedValueIsNew(values.mobile, record, "phone", null)) unsaved.push("phone");
  if (typedValueIsNew(values.personalEmail, record, "email", "personal")) unsaved.push("email");
  if (unsaved.length === 0) return `/operate/people/${personId}`;

  const query = new URLSearchParams({ linked: "1", unsaved: unsaved.join(",") });
  return `/operate/people/${personId}?${query.toString()}`;
}

/**
 * Whether a typed value is one this person does not already hold — a value
 * already on record was not discarded, and historical rows count too.
 */
function typedValueIsNew(
  typed: string,
  record: PersonRecord,
  kind: "email" | "phone",
  scope: "personal" | "college" | null,
): boolean {
  const value = typed.trim();
  if (value === "") return false;
  return !record.contacts.some(
    (contact) =>
      contact.kind === kind &&
      contact.scope === scope &&
      contact.rawValue.trim().toLowerCase() === value.toLowerCase(),
  );
}

function requiredErrors(values: {
  givenName: string;
  familyName: string;
  mobile: string;
  personalEmail: string;
}): CreateFieldErrors {
  const errors: CreateFieldErrors = {};
  if (values.givenName.trim() === "") errors.givenName = "Required";
  if (values.familyName.trim() === "") errors.familyName = "Required";
  if (values.mobile.trim() === "" && values.personalEmail.trim() === "") {
    errors.mobile = "Enter a mobile number or a personal email.";
    errors.personalEmail = "Enter a mobile number or a personal email.";
  }
  return errors;
}

function validationFieldErrors(error: unknown): CreateFieldErrors | null {
  if (!isServiceError(error)) return null;
  if (typeof error.rule !== "string") return null;
  if (error.rule.startsWith("phone_")) return { mobile: error.message };
  if (error.rule.startsWith("email_")) return { personalEmail: error.message };
  if (error.rule === "people_given_name_not_blank") return { givenName: error.message };
  if (error.rule === "people_family_name_not_blank") return { familyName: error.message };
  return null;
}

function safeMessage(error: unknown): string {
  return isServiceError(error) ? error.message : GENERIC_FAILURE;
}
