"use server";

import { revalidatePath } from "next/cache";

import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { resolvePersonFactDispute } from "@/lib/services/person-fact-dispute";

/**
 * `/operate/people/[personId]`'s one dispute-resolution action —
 * `WP-operator-record` (LAN-217), `W7`, `REQ-no-silent-overwrite`.
 *
 * Four-role only, the same `person_record_authority` gate the record's own
 * read and its other write actions use (`record-actions.ts`'s own module
 * note). `resolution` is exactly `resolvePersonFactDisputeIn`'s own two —
 * keep the club's value, or take the player's — and nothing here accepts a
 * note: `W7`'s delegated decision is that neither this control nor the item
 * `Select` draws a free-text field, so this action does not accept one either.
 */

export interface DisputeActionState {
  error: string | null;
}

const OK: DisputeActionState = { error: null };

export async function resolvePersonFactDisputeAction(params: {
  personId: string;
  disputeId: string;
  resolution: "keep_club" | "take_player";
}): Promise<DisputeActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
    await resolvePersonFactDispute({
      disputeId: params.disputeId,
      resolverPersonId: operator.personId,
      resolution: params.resolution,
    });
  } catch (error) {
    if (!isServiceError(error)) throw error;
    if (error.kind === "not_permitted") throw error;
    return { error: error.message };
  }
  revalidatePath(`/operate/people/${params.personId}`);
  return OK;
}
