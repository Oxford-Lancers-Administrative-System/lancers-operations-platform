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
 * The tokenised door's one write. `token` is bound by the page
 * (`submitTokenSignup.bind(null, token)`) — the client never carries it as
 * form data, only as the URL it already loaded.
 *
 * Re-resolves the credential here rather than trusting a `personId` the
 * client might send: the token is the whole of this door's authorization
 * (Task 08 §3, "acts as the Person"), so trusting a client-supplied id instead
 * would let anybody who can call this action name whichever person they like.
 */
export async function submitTokenSignup(
  token: string,
  values: SignupFieldValues & { consent: boolean; linkExistingPersonId: string | null },
): Promise<SignupOutcome> {
  try {
    await withTransaction(async (tx) => {
      const resolved = await resolvePersonTokenIn(tx, token);
      if (resolved.state !== "valid" || !resolved.resolved) {
        throw new Error("This link is no longer live. Ask the club to send it again.");
      }
      await signUpWithTokenIn(tx, {
        personId: resolved.resolved.personId,
        seasonId: resolved.resolved.seasonId,
        submission: toSubmission(values),
      });
    });
    return { ok: true };
  } catch (error) {
    if (isServiceError(error)) return { ok: false, message: error.message };
    if (error instanceof Error) return { ok: false, message: error.message };
    return { ok: false, message: "That could not be saved. Try again." };
  }
}
