"use server";

import { headers } from "next/headers";

import { isServiceError, withTransaction } from "@/lib/db";
import {
  allowPlayerHomeRequest,
  clientKeyFrom,
  logThrottledPlayerHomeRequest,
} from "@/lib/rsvp/public-surface";
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
  // The boolean is small on purpose, but unthrottled it is still an oracle for
  // "is this name on this number a recruit" (LAN-352). Same brake as every
  // other public door; a throttled probe reads as "not found", which is the
  // answer that changes nothing.
  const decision = allowPlayerHomeRequest(clientKeyFrom(await headers()), code);
  if (!decision.allowed) {
    logThrottledPlayerHomeRequest(decision.reason!);
    return { found: false };
  }
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

const NOT_LIVE = "This code is no longer live. Refresh the page and try again.";
const GENERIC_FAILURE = "That could not be saved. Try again.";

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
    const refusal = await withTransaction(async (tx) => {
      const resolved = await resolveRecruitmentSignupCodeIn(tx, code);
      if (resolved.state !== "valid" || !resolved.seasonId) return NOT_LIVE;
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
      return null;
    });
    return refusal === null ? { ok: true } : { ok: false, message: refusal };
  } catch (error) {
    // A ServiceError's message is written for a person. Anything else is a
    // defect, and its text belongs in the server log, never in an anonymous
    // visitor's browser (LAN-352).
    if (isServiceError(error)) return { ok: false, message: error.message };
    console.error("[join] submitQrSignup failed", error);
    return { ok: false, message: GENERIC_FAILURE };
  }
}
