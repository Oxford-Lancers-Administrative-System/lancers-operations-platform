"use server";

import { redirect } from "next/navigation";

import { requireGeneralOperator } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  enterReturningPlayer,
  findPersonCandidates,
  type ReturnerIntakeResult,
} from "@/lib/services/roster";
import { GENERIC_FAILURE, personLabel, type IntakeState } from "./intake-state";
import { readIntakeValues, validateIntake, type IntakeFormValues } from "./validation";

// The returner intake server action — LAN-74, UX-10..13. One action with an
// intent (check / use_existing / confirm_new), not three, so the guard can't
// be forgotten on one path. Guarded on `requireGeneralOperator()` — deliberately
// not a new capability (excludes coaching seats via LAN-110, not a mapping).
// Nothing writes until use_existing/confirm_new.

export async function submitReturnerIntake(
  _previous: IntakeState,
  formData: FormData,
): Promise<IntakeState> {
  const operator = await requireGeneralOperator();

  const values = readIntakeValues(formData);
  const intent = formData.get("intent");

  if (intent === "back_to_details") {
    return { step: "details", values, errors: {} };
  }

  const errors = validateIntake(values);
  if (Object.keys(errors).length > 0) {
    return { step: "details", values, errors };
  }

  // No knownAs — intake no longer collects a nickname (Brian, 12 Aug 2026).
  const input = {
    givenName: values.givenName,
    familyName: values.familyName,
    email: values.email,
    phone: values.phone,
  };

  if (intent === "check" || intent === "back_to_candidates") {
    try {
      return { step: "candidates", values, candidates: await findPersonCandidates(input) };
    } catch (error) {
      return { step: "details", values, errors: {}, formError: safeMessage(error) };
    }
  }

  if (intent !== "use_existing" && intent !== "confirm_new") {
    return { step: "details", values, errors: {}, formError: GENERIC_FAILURE };
  }

  const selectedPersonId = formData.get("personId");
  if (intent === "use_existing" && typeof selectedPersonId !== "string") {
    return {
      step: "candidates",
      values,
      candidates: await candidatesOrNone(input),
      formError: "Choose the person this is, or confirm that this is a new person.",
    };
  }

  let result: ReturnerIntakeResult;
  try {
    result = await enterReturningPlayer({
      actorPersonId: operator.personId,
      input,
      decision:
        intent === "use_existing"
          ? { kind: "existing", personId: selectedPersonId as string }
          : { kind: "new", confirmed: true },
    });
  } catch (error) {
    return buildFailureState(error, values, input, selectedPersonId);
  }

  // Outside the try — redirect() throws, and catching it here would turn a
  // successful intake into a generic failure message.
  redirect(confirmationHref(result));
}

/** Where UX-13 lives — LAN-257: linked/unsaved travel by kind, never by value (personal data in a query string). */
function confirmationHref(result: ReturnerIntakeResult): string {
  const query = new URLSearchParams({ created: "1" });
  if (!result.personCreated) query.set("linked", "1");
  if (result.contactsNotRecorded.length > 0) {
    query.set("unsaved", result.contactsNotRecorded.map((contact) => contact.kind).join(","));
  }
  return `/operate/roster/${result.membershipId}?${query.toString()}`;
}

/** Turns a refused write into the screen that explains it — the duplicate-membership case gets UX-12. */
async function buildFailureState(
  error: unknown,
  values: IntakeFormValues,
  input: Parameters<typeof findPersonCandidates>[0],
  selectedPersonId: FormDataEntryValue | null,
): Promise<IntakeState> {
  const candidates = await candidatesOrNone(input);

  if (
    isServiceError(error) &&
    error.rule === "season_memberships_one_per_person_per_season" &&
    typeof selectedPersonId === "string"
  ) {
    const person = candidates.find((candidate) => candidate.personId === selectedPersonId);
    return {
      step: "membership_refused",
      values,
      candidates,
      refusal: {
        message: error.message,
        personName: person
          ? personLabel(person)
          : personLabel({ givenName: values.givenName, familyName: values.familyName || null }),
        personGivenName: person ? person.givenName : values.givenName.trim(),
        seasonLabel: person?.currentMembership?.seasonLabel ?? null,
        membershipId: person?.currentMembership?.id ?? null,
      },
    };
  }

  return { step: "candidates", values, candidates, formError: safeMessage(error) };
}

function safeMessage(error: unknown): string {
  return isServiceError(error) ? error.message : GENERIC_FAILURE;
}

/** The candidate list, or an empty one — never a throw; both call sites are already reporting a failure. */
async function candidatesOrNone(
  input: Parameters<typeof findPersonCandidates>[0],
): Promise<Awaited<ReturnType<typeof findPersonCandidates>>> {
  try {
    return await findPersonCandidates(input);
  } catch {
    return [];
  }
}
