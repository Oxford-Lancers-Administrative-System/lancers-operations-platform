"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  allowPlayerHomeRequest,
  clientKeyFrom,
  holdUniformRefusal,
  logThrottledPlayerHomeRequest,
  startUniformClock,
} from "@/lib/rsvp/public-surface";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import { withTransaction, isServiceError } from "@/lib/db";
import {
  agreeOnboardingDocument,
  claimTrustItem,
  readQuestionnaireView,
  recordHudlNoInvitation,
  saveDetailsStep,
  STEP_ORDER,
  type DetailsStepInput,
  type QuestionnaireStep,
} from "@/lib/services/player-questionnaire";
import type { OnboardingAgreementType } from "@/lib/services/onboarding-agreements";
import {
  mapServiceErrors,
  readDetailsValues,
  validateRequiredDetails,
  type DetailsFormState,
} from "./validation";

/**
 * Every write `/me/[token]/details` makes — LAN-216.
 *
 * Every action re-resolves the durable token inside its own transaction and
 * acts only on the `personId`/`seasonId` that resolution returns — never on
 * anything the form itself claims — the same posture `/me/[token]/actions.ts`
 * already states for its own writes. The throttle and uniform-timing pair is
 * `src/lib/rsvp/public-surface.ts`'s `allowPlayerHomeRequest` /
 * `logThrottledPlayerHomeRequest`, the exact bucket `/me/[token]` itself
 * uses — this is the same durable credential and the same page family, not a
 * new surface with its own allowance.
 */

function str(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === "string" ? value : "";
}

function checked(form: FormData, field: string): boolean {
  return str(form, field) === "1";
}

async function throttled(token: string): Promise<boolean> {
  const requestHeaders = await headers();
  const decision = allowPlayerHomeRequest(clientKeyFrom(requestHeaders), token);
  if (decision.allowed) return false;
  logThrottledPlayerHomeRequest(decision.reason!);
  return true;
}

async function refuse(target: string, startedAt: number): Promise<never> {
  await holdUniformRefusal(startedAt);
  redirect(target);
}

function detailsUrl(token: string, step?: string, extra?: string): string {
  const encoded = encodeURIComponent(token);
  const query = [step ? `step=${step}` : null, extra ?? null].filter(Boolean).join("&");
  return `/me/${encoded}/details${query ? `?${query}` : ""}`;
}

interface Resolution {
  personId: string;
  seasonId: string;
  membershipId: string;
}

/** Re-resolves the token and the membership it now carries — never trusts the form's own claim. */
async function resolveOrThrow(token: string): Promise<Resolution> {
  return withTransaction(async (tx) => {
    const resolution = await resolvePersonTokenIn(tx, token);
    if (resolution.state !== "valid" || !resolution.resolved) {
      throw new Error("unresolved");
    }
    const membership = await tx.query<{ id: string }>(
      `select id from public.season_memberships where person_id = $1::uuid and season_id = $2::uuid`,
      [resolution.resolved.personId, resolution.resolved.seasonId],
    );
    const membershipId = membership.rows[0]?.id;
    if (!membershipId) throw new Error("no-membership");
    return {
      personId: resolution.resolved.personId,
      seasonId: resolution.resolved.seasonId,
      membershipId,
    };
  });
}

/** Where the sequence should land after a successful save — freshly recomputed, never assumed. */
async function nextStepUrl(token: string, resolution: Resolution): Promise<string> {
  const view = await readQuestionnaireView(resolution.personId, resolution.seasonId);
  const step = view?.nextStep ?? "done";
  return detailsUrl(token, step === "done" ? "done" : step);
}

/**
 * The literal next page in the sequence — `R3-G`, "nothing gates": BUCS Play
 * and Hudl are not required to advance, so "Continue"/"Finish" must move
 * forward through the five pages whether or not the player just claimed this
 * one, exactly as `W4-05`/`W4-06` say ("continue anyway. The club will ask
 * you again"). A **fresh** page load with no step named still resumes at the
 * first step genuinely still outstanding (`readQuestionnaireView`'s own
 * `nextStep`) — the two are only ever the same step when this one just
 * became done.
 */
function literalNextStepUrl(token: string, current: QuestionnaireStep): string {
  const index = STEP_ORDER.indexOf(current);
  const next = STEP_ORDER[index + 1];
  return detailsUrl(token, next ?? "done");
}

// ---------------------------------------------------------------------------
// Step 1 — the details
// ---------------------------------------------------------------------------

/**
 * B-009 (LAN-216, correction round 2): with `noValidate` now on the form
 * (`./details-form.tsx`), every submission reaches this action regardless of
 * what was or was not typed — the browser no longer refuses a blank required
 * field before this code ever runs. This is therefore where "required" is
 * enforced: `validateRequiredDetails` names every blank required field.
 *
 * F1 (LAN-230, critical — Brian's own confirmed requirement, 2026-09-02:
 * "Whatever a step saved stays saved… never discards"): this used to return
 * the moment `validateRequiredDetails` found even one blank required field,
 * *never calling `saveDetailsStep` at all* — nine valid answers submitted
 * alongside one blank required one were silently discarded, not merely left
 * unmarked as complete. `saveDetailsStep` is now always called, and always
 * writes every field that validated, whether or not a required field was
 * left blank or another field failed its own shape check (that module's own
 * fix, `player-questionnaire.ts`). The two error maps are merged afterwards —
 * a shape error `saveDetailsStep` already reported for a field wins over a
 * generic "required" one, since a value that failed shape *was* submitted —
 * for `useActionState` to redraw the form with, rather than a redirect:
 * everything that validated is already saved, nothing typed is lost, and no
 * navigation happens while anything still needs fixing.
 */
export async function saveDetails(
  _previous: DetailsFormState,
  form: FormData,
): Promise<DetailsFormState> {
  const startedAt = startUniformClock();
  const token = str(form, "token");
  const values = readDetailsValues(form);

  if (await throttled(token)) await refuse(detailsUrl(token), startedAt);

  let resolution: Resolution;
  try {
    resolution = await resolveOrThrow(token);
  } catch {
    return refuse(detailsUrl(token), startedAt);
  }

  const requiredErrors = validateRequiredDetails(values);

  const input: DetailsStepInput = {
    personId: resolution.personId,
    seasonId: resolution.seasonId,
    membershipId: resolution.membershipId,
    grantConsent: checked(form, "consent"),
    fields: {
      given_name: values.given_name,
      family_name: values.family_name,
      college: values.college,
      matriculation_year: values.matriculation_year,
      expected_graduation_year: values.expected_graduation_year,
      degree_field: values.degree_field,
      date_of_birth: values.date_of_birth,
    },
    mobile: values.mobile,
    personalEmail: values.personal_email,
    emergencyContact: {
      givenName: values.ec_given_name,
      familyName: values.ec_family_name,
      relationship: values.ec_relationship,
      phone: values.ec_phone,
      email: values.ec_email,
    },
  };

  const result = await saveDetailsStep(input);
  const shapeErrors = mapServiceErrors(result.errors);
  // A field the service itself flagged (it was submitted, but malformed)
  // takes precedence over a generic "required" one for the same field — the
  // player typed something; say what is wrong with it, not that it is blank.
  const errors: DetailsFormState["errors"] = { ...requiredErrors, ...shapeErrors };
  if (Object.keys(errors).length > 0) {
    return { values, errors };
  }

  redirect(await nextStepUrl(token, resolution));
}

// ---------------------------------------------------------------------------
// Steps 2 and 3 — the two documents
// ---------------------------------------------------------------------------

export async function agreeDocument(form: FormData): Promise<void> {
  const startedAt = startUniformClock();
  const token = str(form, "token");
  const agreementType = str(form, "agreementType") as OnboardingAgreementType;

  if (await throttled(token)) await refuse(detailsUrl(token), startedAt);
  if (!checked(form, "agree")) {
    return redirect(detailsUrl(token, agreementType, "agreeError=1"));
  }

  let resolution: Resolution;
  try {
    resolution = await resolveOrThrow(token);
  } catch {
    return refuse(detailsUrl(token), startedAt);
  }

  try {
    await agreeOnboardingDocument({
      personId: resolution.personId,
      seasonId: resolution.seasonId,
      membershipId: resolution.membershipId,
      agreementType,
    });
  } catch (error) {
    // Already agreed this season (a resubmitted or double-clicked form) is not
    // a failure — the step is already done, so the sequence simply moves on.
    if (
      !isServiceError(error) ||
      error.rule !== "onboarding_agreements_one_per_person_season_type"
    ) {
      return refuse(detailsUrl(token), startedAt);
    }
  }

  redirect(await nextStepUrl(token, resolution));
}

// ---------------------------------------------------------------------------
// Steps 4 and 5 — BUCS Play and Hudl
// ---------------------------------------------------------------------------

export async function submitTrustStep(form: FormData): Promise<void> {
  const startedAt = startUniformClock();
  const token = str(form, "token");
  const code = str(form, "code") as "bucs_play" | "hudl_access";

  if (await throttled(token)) await refuse(detailsUrl(token), startedAt);

  let resolution: Resolution;
  try {
    resolution = await resolveOrThrow(token);
  } catch {
    return refuse(detailsUrl(token), startedAt);
  }

  if (checked(form, "claim")) {
    await claimTrustItem({
      personId: resolution.personId,
      seasonId: resolution.seasonId,
      membershipId: resolution.membershipId,
      code,
    });
  }

  if (code === "hudl_access" && checked(form, "no_invitation")) {
    await recordHudlNoInvitation({
      personId: resolution.personId,
      seasonId: resolution.seasonId,
      membershipId: resolution.membershipId,
    });
  }

  const current: QuestionnaireStep = code === "bucs_play" ? "bucs_play" : "hudl";
  redirect(literalNextStepUrl(token, current));
}
