"use server";

import { headers } from "next/headers";

import { isServiceError, withTransaction } from "@/lib/db";
import {
  allowPlayerHomeRequest,
  allowQrPartialPatchRequest,
  clientKeyFrom,
  logThrottledPlayerHomeRequest,
  logThrottledQrPartialPatchRequest,
} from "@/lib/rsvp/public-surface";
import { findPersonMatchingGivenNameAndPhoneIn } from "@/lib/services/person-duplicate";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import {
  completePartialQrSignupIn,
  isPartialQrSignupOpenIn,
  PARTIAL_TOKEN_PURPOSE,
  patchPartialQrSignupIn,
  probeExistingRecruitForQrSignup,
  signUpAnonymouslyIn,
  startPartialQrSignupIn,
  voidPartialQrSignupIn,
  type PartialSignupSubmission,
  type SignupSubmission,
} from "@/lib/services/recruitment-signup";
import { resolveRecruitmentSignupCodeIn } from "@/lib/services/recruitment-signup-codes";
import type {
  DuplicateCheckResult,
  PartialSaveStart,
  SignupFieldValues,
  SignupOutcome,
} from "./signup-form";

/** The QR door's two server actions — LAN-202. Plain async functions a Client Component calls directly, not through `<form action>`, since branching needs a result back before deciding what to render.
 */

/** `W7`'s duplicate probe. Read-only, returns a bare boolean, never details or a database id (LAN-208). Gated by `code` resolving to a live season — codes are printed on posters. */
export async function checkForExistingQrRecruit(
  code: string,
  givenName: string,
  mobile: string,
  /** LAN-425: the page's partial credential, so the probe excludes the visitor's own record. */
  partialToken?: string | null,
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
  const resolved = await withTransaction(async (tx) => {
    const code_ = await resolveRecruitmentSignupCodeIn(tx, code);
    if (code_.state !== "valid") return null;
    const own = partialToken
      ? await resolvePersonTokenIn(tx, partialToken, PARTIAL_TOKEN_PURPOSE)
      : null;
    return { excludePersonId: own?.resolved?.personId ?? null };
  });
  if (!resolved) return { found: false };
  return probeExistingRecruitForQrSignup(givenName, mobile, resolved);
}

function toPartial(values: SignupFieldValues): PartialSignupSubmission {
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
  };
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
  values: SignupFieldValues & {
    consent: boolean;
    confirmedExistingMatch: boolean;
    /** LAN-425: the partial save's credential, when the page holds one. Re-resolved here; a dead one falls through to an ordinary sign-up. */
    partialToken?: string | null;
  },
): Promise<SignupOutcome> {
  try {
    const refusal = await withTransaction(async (tx) => {
      const resolved = await resolveRecruitmentSignupCodeIn(tx, code);
      if (resolved.state !== "valid" || !resolved.seasonId) return NOT_LIVE;
      // LAN-425: a live, still-open partial is completed in place — unless the
      // visitor confirmed they are somebody already on file, in which case the
      // existing record is linked as before and the partial is voided.
      let partialPersonId: string | null = null;
      if (values.partialToken) {
        const partial = await resolvePersonTokenIn(tx, values.partialToken, PARTIAL_TOKEN_PURPOSE);
        if (
          partial.state === "valid" &&
          partial.resolved &&
          partial.resolved.seasonId === resolved.seasonId &&
          (await isPartialQrSignupOpenIn(tx, partial.resolved.personId, resolved.seasonId))
        ) {
          partialPersonId = partial.resolved.personId;
        }
      }
      if (partialPersonId && !values.confirmedExistingMatch) {
        await completePartialQrSignupIn(tx, {
          personId: partialPersonId,
          seasonId: resolved.seasonId,
          code,
          submission: toSubmission(values),
        });
        return null;
      }
      const linkExistingPersonId = values.confirmedExistingMatch
        ? ((
            await findPersonMatchingGivenNameAndPhoneIn(tx, values.givenName, values.mobile, {
              excludePersonId: partialPersonId,
            })
          )?.personId ?? null)
        : null;
      await signUpAnonymouslyIn(tx, {
        seasonId: resolved.seasonId,
        code,
        submission: toSubmission(values),
        linkExistingPersonId,
      });
      if (partialPersonId) {
        await voidPartialQrSignupIn(tx, { personId: partialPersonId, seasonId: resolved.seasonId });
      }
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

/**
 * LAN-425. The partial save's first write, once both names are typed. Best
 * effort by design: a throttled, refused or failed start returns no token and
 * the visitor never hears about it — the page tries again on the next pause
 * unless the name-and-mobile probe matched somebody, in which case it stops
 * trying and the real Save asks "have you signed up before?" as today.
 * Throttled on the printed code like the probe: one request per visitor.
 */
export async function startPartialQrSignup(
  code: string,
  values: SignupFieldValues,
): Promise<PartialSaveStart> {
  const decision = allowPlayerHomeRequest(clientKeyFrom(await headers()), code);
  if (!decision.allowed) {
    logThrottledPlayerHomeRequest(decision.reason!);
    return { token: null, retry: true };
  }
  try {
    return await withTransaction(async (tx) => {
      const resolved = await resolveRecruitmentSignupCodeIn(tx, code);
      if (resolved.state !== "valid" || !resolved.seasonId) return { token: null, retry: false };
      const started = await startPartialQrSignupIn(tx, {
        seasonId: resolved.seasonId,
        submission: toPartial(values),
      });
      if (!started) return { token: null, retry: false };
      return { token: started.token, retry: false };
    });
  } catch (error) {
    if (!isServiceError(error)) console.error("[join] startPartialQrSignup failed", error);
    return { token: null, retry: true };
  }
}

/**
 * LAN-425. Every later pause: everything typed so far, on the record the
 * token names. Throttled on the token itself, never on the shared code, so
 * one stand's typists cannot spend each other's allowance. Silent on
 * failure: the next patch carries every field again.
 */
export async function patchPartialQrSignup(
  code: string,
  token: string,
  values: SignupFieldValues,
): Promise<void> {
  const decision = allowQrPartialPatchRequest(clientKeyFrom(await headers()), token);
  if (!decision.allowed) {
    logThrottledQrPartialPatchRequest(decision.reason!);
    return;
  }
  try {
    await withTransaction(async (tx) => {
      const resolved = await resolveRecruitmentSignupCodeIn(tx, code);
      if (resolved.state !== "valid" || !resolved.seasonId) return;
      const partial = await resolvePersonTokenIn(tx, token, PARTIAL_TOKEN_PURPOSE);
      if (partial.state !== "valid" || !partial.resolved) return;
      if (partial.resolved.seasonId !== resolved.seasonId) return;
      await patchPartialQrSignupIn(tx, {
        personId: partial.resolved.personId,
        seasonId: partial.resolved.seasonId,
        submission: toPartial(values),
      });
    });
  } catch (error) {
    // Review F4: a refused patch is silent to the visitor by design, so it
    // must not be silent to the log as well.
    if (isServiceError(error)) console.warn("[join] partial patch refused:", error.message);
    else console.error("[join] patchPartialQrSignup failed", error);
  }
}
