"use server";

import { isServiceError, withTransaction } from "@/lib/db";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import { signUpWithTokenIn, type SignupSubmission } from "@/lib/services/recruitment-signup";
import type { SignupFieldValues, SignupOutcome } from "@/app/join/[code]/signup-form";

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

const NOT_LIVE = "This link is no longer live. Ask the club to send it again.";
const GENERIC_FAILURE = "That could not be saved. Try again.";

/** The tokenised door's one write. `token` is bound by the page, never carried as client form data. Re-resolves the credential rather than trusting a client-supplied `personId` (Task 08 §3). */
export async function submitTokenSignup(
  token: string,
  values: SignupFieldValues & { consent: boolean; confirmedExistingMatch: boolean },
): Promise<SignupOutcome> {
  try {
    const refusal = await withTransaction(async (tx) => {
      const resolved = await resolvePersonTokenIn(tx, token, "recruit_signup");
      if (resolved.state !== "valid" || !resolved.resolved) return NOT_LIVE;
      await signUpWithTokenIn(tx, {
        personId: resolved.resolved.personId,
        seasonId: resolved.resolved.seasonId,
        submission: toSubmission(values),
      });
      return null;
    });
    return refusal === null ? { ok: true } : { ok: false, message: refusal };
  } catch (error) {
    // A ServiceError's message is written for a person. Anything else is a
    // defect, and its text belongs in the server log, never in an anonymous
    // visitor's browser (LAN-352).
    if (isServiceError(error)) return { ok: false, message: error.message };
    console.error("[signup] submitTokenSignup failed", error);
    return { ok: false, message: GENERIC_FAILURE };
  }
}
