"use server";

import { isServiceError, withTransaction } from "@/lib/db";
import {
  probeExistingRecruitForQrSignup,
  signUpAnonymouslyIn,
  type SignupSubmission,
} from "@/lib/services/recruitment-signup";
import { resolveRecruitmentSignupCodeIn } from "@/lib/services/recruitment-signup-codes";
import type { DuplicateCheckResult, SignupFieldValues, SignupOutcome } from "./signup-form";

/**
 * The QR door's two server actions — LAN-202. Both are plain async functions a
 * Client Component calls directly (never through `<form action>`, because the
 * QR door's own branching — ask "have you signed up before?" only when it has
 * something to ask — needs a result back before deciding what to render next).
 */

/** `W7`'s duplicate probe. Read-only; returns a bare boolean and an opaque id, never a candidate's own details. */
export async function checkForExistingQrRecruit(
  givenName: string,
  mobile: string,
): Promise<DuplicateCheckResult> {
  return probeExistingRecruitForQrSignup(givenName, mobile);
}

function toSubmission(values: SignupFieldValues & { consent: boolean }): SignupSubmission {
  return {
    givenName: values.givenName,
    familyName: values.familyName,
    mobile: values.mobile || null,
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
 * The QR door's one write. `code` is bound by the page (`submitQrSignup.bind(null, code)`)
 * before this reaches the client, so the client never carries the code as
 * form data of its own — it is the credential the URL already supplied.
 */
export async function submitQrSignup(
  code: string,
  values: SignupFieldValues & { consent: boolean; linkExistingPersonId: string | null },
): Promise<SignupOutcome> {
  try {
    await withTransaction(async (tx) => {
      const resolved = await resolveRecruitmentSignupCodeIn(tx, code);
      if (resolved.state !== "valid" || !resolved.seasonId) {
        throw new Error("This code is no longer live. Refresh the page and try again.");
      }
      await signUpAnonymouslyIn(tx, {
        seasonId: resolved.seasonId,
        code,
        submission: toSubmission(values),
        linkExistingPersonId: values.linkExistingPersonId,
      });
    });
    return { ok: true };
  } catch (error) {
    if (isServiceError(error)) return { ok: false, message: error.message };
    if (error instanceof Error) return { ok: false, message: error.message };
    return { ok: false, message: "That could not be saved. Try again." };
  }
}
