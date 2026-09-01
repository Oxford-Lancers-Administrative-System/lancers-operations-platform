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

/**
 * The QR door's two server actions — LAN-202. Both are plain async functions a
 * Client Component calls directly (never through `<form action>`, because the
 * QR door's own branching — ask "have you signed up before?" only when it has
 * something to ask — needs a result back before deciding what to render next).
 */

/**
 * `W7`'s duplicate probe. Read-only; returns a bare boolean, never a
 * candidate's own details or a database identifier (LAN-208).
 *
 * Gated by `code` resolving to a live, non-deactivated season — the same
 * check {@link submitQrSignup} makes before its own write. Codes are printed
 * on posters and this is otherwise callable by anyone who has ever loaded any
 * `/join/[code]` page; a deactivated or unknown code refuses the probe rather
 * than leaving it reachable indefinitely.
 */
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
 *
 * `confirmedExistingMatch` is a bare boolean — "the recruit pressed 'Yes,
 * that's me' on the probe's own question" — never a person id (LAN-208): the
 * probe that asked the question never handed one back, so there is nothing
 * for the client to echo. When true, this re-runs the *exact same* strict
 * given-name-and-phone match {@link probeExistingRecruitForQrSignup} used,
 * against `values.givenName`/`values.mobile` as the recruit has them typed
 * right now, and links to whatever that resolves to — `signUpAnonymouslyIn`
 * falls back to creating a new person if it resolves to nothing or to a
 * merged-away row, exactly as it already does for a stale id.
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
        ? (await findPersonMatchingGivenNameAndPhoneIn(tx, values.givenName, values.mobile))
            ?.personId ?? null
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
