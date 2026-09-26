"use server";

import { redirect } from "next/navigation";

import { requireGrant } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { isServiceError } from "@/lib/db";
import {
  MERGE_CONTACT_KIND_LABELS,
  MERGE_PERSON_FIELD_LABELS,
  mergePersons,
  type MergeChoice,
  type MergeConsentChoices,
  type MergeFieldChoices,
} from "@/lib/services/person-merge";
import { GENERIC_FAILURE, INITIAL_MERGE_STATE, type MergeState } from "./merge-state";
import { WHOLE_RECORD_AUTHORITY } from "@/lib/auth/roster-access";

// The merge page's one server action — W4, LAN-185. survivor/loserPersonId
// swap by navigating (?with=), not by anything this action decides.
export async function submitMerge(_previous: MergeState, formData: FormData): Promise<MergeState> {
  // LAN-432: a merge rewrites a whole person, so it asks for the whole record.
  // LAN-423: a refusal is the form's own error, never a crashed page.
  let operator: ResolvedOperator;
  try {
    operator = await requireGrant(WHOLE_RECORD_AUTHORITY);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return { formError: error.message };
  }

  const survivorPersonId = String(formData.get("survivorPersonId") ?? "");
  const loserPersonId = String(formData.get("loserPersonId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  if (reason.trim() === "") {
    return { ...INITIAL_MERGE_STATE, reasonError: "A reason is required." };
  }

  const fieldChoices: MergeFieldChoices = {};
  for (const field of Object.keys(
    MERGE_PERSON_FIELD_LABELS,
  ) as (keyof typeof MERGE_PERSON_FIELD_LABELS)[]) {
    const choice = formData.get(`field_${field}`);
    if (choice === "survivor" || choice === "loser") fieldChoices[field] = choice as MergeChoice;
  }
  for (const kind of Object.keys(
    MERGE_CONTACT_KIND_LABELS,
  ) as (keyof typeof MERGE_CONTACT_KIND_LABELS)[]) {
    const choice = formData.get(`contact_${kind}`);
    if (choice === "survivor" || choice === "loser") fieldChoices[kind] = choice as MergeChoice;
  }

  // B-003: consent_<seasonId> keys are dynamic per pair, read back rather than a static map.
  const consentChoices: MergeConsentChoices = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("consent_")) continue;
    if (value === "survivor" || value === "loser") {
      consentChoices[key.slice("consent_".length)] = value;
    }
  }

  try {
    await mergePersons({
      actorPersonId: operator.personId,
      survivorPersonId,
      loserPersonId,
      reason,
      fieldChoices,
      consentChoices,
    });
  } catch (error) {
    return { formError: isServiceError(error) ? error.message : GENERIC_FAILURE };
  }

  redirect(`/operate/people/${survivorPersonId}`);
}
