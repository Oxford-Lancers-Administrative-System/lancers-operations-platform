"use server";

import { isServiceError, withTransaction } from "@/lib/db";
import { findPersonMatchingGivenNameAndPhoneIn } from "@/lib/services/person-duplicate";
import {
  probeExistingRecruitForQrSignup,
  signUpAnonymouslyIn,
  type SignupSubmission,
} from "@/lib/services/recruitment-signup";
import { resolveRecruitmentSignupCodeIn } from "@/lib/services/recruitment-signup-codes";
import type { DuplicateCheckResult, SignupFieldValues, SignupOutcome } from "./signup-form";

/** The QR door's two server actions — LAN-202. Plain async functions a Client Component calls directly, not through `<form action>`, since branching needs a result back before deciding what to render.
 */

/** `W7`'s duplicate probe. Read-only, returns a bare boolean, never details or a database id (LAN-208). Gated by `code` resolving to a live season — codes are printed on posters. */
export async function checkForExistingQrRecruit(
  code: string,
  givenName: string,
  mobile: string,
): Promise<DuplicateCheckResult> {
  const resolved = await withTransaction((tx) => resolveRecruitmentSignupCodeIn(tx, code));
  if (resolved.state !== "valid") return { found: false };
  return probeExistingRecruitForQrSignup(givenName, mobile);
}

function toSubmission(values: SignupFieldValues & { consent: boolean }): SignupSubmission {
  return {
    givenName: values.givenName,
    familyName: values.familyName,
    mobile: values.mobile || null,
    collegeEmail: values.collegeEmail || null,
    email: values.email || null,
    knownAs: values.knownAs || null,
    college: values.college || null,
    matriculationYear: values.matriculationYear || null,
    expectedGraduationYear: values.expectedGraduationYear || null,
    degreeField: values.degreeField || null,
    consent: values.consent,
  };
}

/**
 * The QR door's one write. `code` is bound by the page before this reaches
 * the client — it never carries the code as its own form data.
 * `confirmedExistingMatch` is a bare boolean, never a person id (LAN-208):
 * when true, re-runs the same strict name-and-phone match the probe used,
 * against the values as typed now, falling back to a new person if it
 * resolves to nothing.
 */
export async function submitQrSignup(
  code: string,
  values: SignupFieldValues & { consent: boolean; confirmedExistingMatch: boolean },
): Promise<SignupOutcome> {
  try {
    await withTransaction(async (tx) => {
      const resolved = await resolveRecruitmentSignupCodeIn(tx, code);
      if (resolved.state !== "valid" || !resolved.seasonId) {
        throw new Error("This code is no longer live. Refresh the page and try again.");
      }
      const linkExistingPersonId = values.confirmedExistingMatch
        ? ((await findPersonMatchingGivenNameAndPhoneIn(tx, values.givenName, values.mobile))
            ?.personId ?? null)
        : null;
      await signUpAnonymouslyIn(tx, {
        seasonId: resolved.seasonId,
        code,
        submission: toSubmission(values),
        linkExistingPersonId,
      });
    });
    return { ok: true };
  } catch (error) {
    if (isServiceError(error)) return { ok: false, message: error.message };
    if (error instanceof Error) return { ok: false, message: error.message };
    return { ok: false, message: "That could not be saved. Try again." };
  }
}
