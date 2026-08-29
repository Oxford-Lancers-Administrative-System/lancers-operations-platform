"use server";

import { redirect } from "next/navigation";

import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { findPersonDuplicates } from "@/lib/services/person-duplicate";
import { createPerson } from "@/lib/services/person-create";
import {
  GENERIC_FAILURE,
  readCreateValues,
  type CreateFieldErrors,
  type CreateState,
} from "./create-state";

/**
 * `/operate/people/new`'s one server action — W3, LAN-185. Every request
 * calls `requireCapability("person_record_authority")` first, itself: the
 * page's own gate is not the enforcement, this is (`src/app/operate/
 * actions.ts`'s own stated posture, applied here).
 *
 * Three intents on one action, the same reason `submitReturnerIntake` gives:
 * "check", "create" and "link" are three answers to one question, and every
 * one re-reads the same fields and re-authorizes the same caller.
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
    let landingPersonId: string;
    try {
      const result = await createPerson({
        actorPersonId: operator.personId,
        input: values,
        decision: { kind: "link_existing", personId },
      });
      landingPersonId = result.personId;
    } catch (error) {
      return {
        values,
        errors: {},
        candidates: previous.candidates,
        exactMatch: null,
        formError: safeMessage(error),
      };
    }
    // Outside the try: `redirect` signals by throwing, and catching it here
    // would turn a successful link into a generic failure message.
    redirect(`/operate/people/${landingPersonId}`);
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
