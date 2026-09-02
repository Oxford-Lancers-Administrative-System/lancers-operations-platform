"use server";

import { redirect } from "next/navigation";

import { requireCapability } from "@/lib/auth/guards";
import { isServiceError, withTransaction } from "@/lib/db";
import { findPersonDuplicates } from "@/lib/services/person-duplicate";
import { createPerson } from "@/lib/services/person-create";
import { readCandidateIdentitiesIn } from "@/lib/services/recruitment-candidate-identity";
import {
  finishRecruitmentAddIn,
  refuseIfAlreadyAMemberIn,
  requireMobileProvided,
} from "@/lib/services/recruitment-add";
import { readCurrentSeasonIn } from "@/lib/services/seasons";
import {
  GENERIC_FAILURE,
  readAddRecruitValues,
  type AddRecruitCandidate,
  type AddRecruitFieldErrors,
  type AddRecruitState,
} from "./create-state";

/**
 * `/operate/recruitment/new`'s one server action — `W6`, LAN-206. The same
 * three-intent shape `/operate/people/new/actions.ts` uses ("check", "link"
 * and "create" are three answers to one question), because this door reuses
 * that exact form and that exact duplicate check.
 *
 * Every request re-authorizes itself with `requireCapability`, the same
 * "the page's own gate is not the enforcement" posture the shipped action
 * states.
 */
export async function submitAddRecruit(
  previous: AddRecruitState,
  formData: FormData,
): Promise<AddRecruitState> {
  const operator = await requireCapability("person_record_authority");

  const values = readAddRecruitValues(formData);
  const linkPersonId = formData.get("linkPersonId");
  const intent =
    typeof linkPersonId === "string" && linkPersonId !== "" ? "link" : formData.get("intent");

  // F-206-02, correction round 1: `src/app/recruitment-preview/add-recruit.tsx`'s
  // own "Go back and change the details" — hides the candidates panel so the
  // still-visible fields below can be edited before checking again. No
  // service call, nothing written; this is a pure state reset.
  if (intent === "dismiss") {
    return { values, errors: {}, candidates: null, exactMatch: null };
  }

  if (intent === "check") {
    const errors = requiredErrors(values);
    if (Object.keys(errors).length > 0) {
      return { values, errors, candidates: null, exactMatch: null };
    }
    try {
      const candidates = await withIdentities(
        await findPersonDuplicates({
          givenName: values.givenName,
          familyName: values.familyName,
          emails: values.personalEmail ? [values.personalEmail] : [],
          phones: values.mobile ? [values.mobile] : [],
        }),
      );
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
    let prospectId: string;
    try {
      prospectId = await withTransaction(async (tx) => {
        const season = await readCurrentSeasonIn(tx);
        requireMobileProvided(values.mobile);
        await refuseIfAlreadyAMemberIn(tx, personId, season.id);
        const result = await createPerson({
          actorPersonId: operator.personId,
          input: values,
          decision: { kind: "link_existing", personId },
        });
        const finished = await finishRecruitmentAddIn(tx, {
          actorPersonId: operator.personId,
          personId: result.personId,
          givenName: values.givenName,
          seasonId: season.id,
          academic: {
            college: values.college,
            matriculationYear: values.matriculationYear,
            knownAs: values.knownAs,
            expectedGraduationYear: values.expectedGraduationYear,
            degreeField: values.degreeField,
            dateOfBirth: values.dateOfBirth,
            emergencyGivenName: values.emergencyGivenName,
            emergencyFamilyName: values.emergencyFamilyName,
            emergencyRelationship: values.emergencyRelationship,
            emergencyPhone: values.emergencyPhone,
            emergencyEmail: values.emergencyEmail,
            optInEvidence: values.optInEvidence,
            optInNote: values.optInNote,
          },
        });
        return finished.prospectId;
      });
    } catch (error) {
      // V-3 / V-4, correction round 2: a player match used to fall into the
      // ordinary `formError` banner, stacked on the still-visible candidates
      // panel and form beneath it — Brian's own "flurry of information."
      // `refuseIfAlreadyAMemberIn`'s own rule names exactly this outcome; it
      // is not an error to report, it is the one clean confirmation screen
      // below, and everything else this action would otherwise return is
      // dropped in favour of it.
      if (isServiceError(error) && error.rule === "recruitment_add_existing_member_is_not_a_recruit") {
        const candidate = previous.candidates?.find((c) => c.personId === personId) ?? null;
        const identity = candidate?.identity;
        return {
          values,
          errors: {},
          candidates: null,
          exactMatch: null,
          alreadyMember: {
            displayName: candidate?.displayName ?? "This person",
            membershipStatus: identity && identity.kind === "player" ? identity.membershipStatus : "active",
            seasonLabel: identity && identity.kind === "player" ? identity.seasonLabel : "this season",
          },
        };
      }
      return {
        values,
        errors: {},
        candidates: previous.candidates,
        exactMatch: null,
        formError: safeMessage(error),
      };
    }
    redirect(`/operate/recruitment/${prospectId}`);
  }

  if (intent === "create") {
    const errors = requiredErrors(values);
    if (Object.keys(errors).length > 0) {
      return { values, errors, candidates: previous.candidates, exactMatch: null };
    }
    const overrideReason = formData.get("overrideReason");
    let prospectId: string;
    try {
      prospectId = await withTransaction(async (tx) => {
        const season = await readCurrentSeasonIn(tx);
        requireMobileProvided(values.mobile);
        const result = await createPerson({
          actorPersonId: operator.personId,
          input: values,
          decision: {
            kind: "create_new",
            overrideReason: typeof overrideReason === "string" ? overrideReason : null,
          },
        });
        const finished = await finishRecruitmentAddIn(tx, {
          actorPersonId: operator.personId,
          personId: result.personId,
          givenName: values.givenName,
          seasonId: season.id,
          academic: {
            college: values.college,
            matriculationYear: values.matriculationYear,
            knownAs: values.knownAs,
            expectedGraduationYear: values.expectedGraduationYear,
            degreeField: values.degreeField,
            dateOfBirth: values.dateOfBirth,
            emergencyGivenName: values.emergencyGivenName,
            emergencyFamilyName: values.emergencyFamilyName,
            emergencyRelationship: values.emergencyRelationship,
            emergencyPhone: values.emergencyPhone,
            emergencyEmail: values.emergencyEmail,
            optInEvidence: values.optInEvidence,
            optInNote: values.optInNote,
          },
        });
        return finished.prospectId;
      });
    } catch (error) {
      if (isServiceError(error) && error.rule === "person_create_exact_match_requires_reason") {
        const candidates =
          previous.candidates ??
          (await withIdentities(
            await findPersonDuplicates({
              givenName: values.givenName,
              familyName: values.familyName,
              emails: values.personalEmail ? [values.personalEmail] : [],
              phones: values.mobile ? [values.mobile] : [],
            }).catch(() => []),
          ));
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
    redirect(`/operate/recruitment/${prospectId}`);
  }

  return { ...previous, formError: GENERIC_FAILURE };
}

async function withIdentities(
  candidates: Awaited<ReturnType<typeof findPersonDuplicates>>,
): Promise<AddRecruitCandidate[]> {
  if (candidates.length === 0) return [];
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const identities = await readCandidateIdentitiesIn(
      tx,
      candidates.map((c) => c.personId),
      season.id,
    );
    return candidates.map((candidate) => ({
      ...candidate,
      identity: identities.get(candidate.personId) ?? { kind: "none" as const },
    }));
  });
}

function requiredErrors(values: {
  givenName: string;
  familyName: string;
  mobile: string;
  personalEmail: string;
}): AddRecruitFieldErrors {
  const errors: AddRecruitFieldErrors = {};
  if (values.givenName.trim() === "") errors.givenName = "Required";
  if (values.familyName.trim() === "") errors.familyName = "Required";
  // Task 09 §9.1 / Brian 2026-09-01: mobile is required at this door, not
  // "mobile or email" — `requireMobileProvided` is the service layer's own
  // backstop of the same rule; this is the form-facing field error for it.
  if (values.mobile.trim() === "") errors.mobile = "A mobile number is required at this door.";
  return errors;
}

function validationFieldErrors(error: unknown): AddRecruitFieldErrors | null {
  if (!isServiceError(error)) return null;
  if (typeof error.rule !== "string") return null;
  if (error.rule.startsWith("phone_")) return { mobile: error.message };
  if (error.rule.startsWith("email_")) return { personalEmail: error.message };
  if (error.rule === "people_given_name_not_blank") return { givenName: error.message };
  if (error.rule === "people_family_name_not_blank") return { familyName: error.message };
  if (error.rule === "recruitment_add_mobile_required") return { mobile: error.message };
  return null;
}

function safeMessage(error: unknown): string {
  return isServiceError(error) ? error.message : GENERIC_FAILURE;
}
