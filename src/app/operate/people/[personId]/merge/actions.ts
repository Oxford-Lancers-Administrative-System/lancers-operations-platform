"use server";

import { redirect } from "next/navigation";

import { requireCapability } from "@/lib/auth/guards";
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

/**
 * `/operate/people/[personId]/merge`'s one server action — W4, LAN-185.
 * `requireCapability("person_record_authority")` first, itself.
 *
 * `survivorPersonId` and `loserPersonId` are hidden fields the comparison
 * screen sets from its own `?with=` query — "Make this the survivor" swaps
 * which id is which by navigating, not by anything this action decides.
 */
export async function submitMerge(_previous: MergeState, formData: FormData): Promise<MergeState> {
  const operator = await requireCapability("person_record_authority");

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

  // B-003: one radio group per colliding season, `consent_<seasonId>` — the
  // season ids are dynamic per pair, so read them back from the submitted
  // keys rather than a static label map like the two loops above.
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
