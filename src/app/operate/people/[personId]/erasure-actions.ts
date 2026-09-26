"use server";

import { revalidatePath } from "next/cache";

import { isServiceError } from "@/lib/db";
import {
  confirmErasure,
  exportPersonRecord,
  withdrawErasureConfirmation,
} from "@/lib/services/person-erasure";

/**
 * The erasure and export actions — LAN-361. Each opens with the service's own
 * `requireCapability("person_erasure")`; nothing here decides authority.
 */

export interface ErasureActionState {
  readonly error: string | null;
  readonly done: "awaiting-second" | "erased" | "withdrawn" | null;
}

/** A `NotPermitted` comes back as state like any service error (LAN-423); a bug still throws. */
function stateFor(error: unknown): ErasureActionState {
  if (!isServiceError(error)) throw error;
  return { error: error.message, done: null };
}

export async function confirmErasureAction(params: {
  personId: string;
  requestedOn: string;
}): Promise<ErasureActionState> {
  let outcome;
  try {
    outcome = await confirmErasure(params);
  } catch (error) {
    return stateFor(error);
  }
  revalidatePath(`/operate/people/${params.personId}`);
  return { error: null, done: outcome.state };
}

export async function withdrawErasureConfirmationAction(params: {
  personId: string;
}): Promise<ErasureActionState> {
  try {
    await withdrawErasureConfirmation(params.personId);
  } catch (error) {
    return stateFor(error);
  }
  revalidatePath(`/operate/people/${params.personId}`);
  return { error: null, done: "withdrawn" };
}

/**
 * The subject access export, as text the browser saves. Returned rather than
 * written anywhere: the file is the General Manager's to hand over, and this
 * system keeps no copy of it.
 */
export async function exportPersonAction(params: {
  personId: string;
}): Promise<{ json: string | null; error: string | null }> {
  try {
    const exported = await exportPersonRecord(params.personId);
    return { json: JSON.stringify(exported, null, 2), error: null };
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return { json: null, error: error.message };
  }
}
