"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { setRosterGroupColours } from "@/lib/services/roster-group-colours";

/** What Save colours hands back to the Roster categories dialog. */
export type GroupColourSaveResult =
  { readonly ok: true } | { readonly ok: false; readonly error: string };

/**
 * Save colours — LAN-430, W2. `role_management` only, asked here and again by
 * the service. Every band under `/operate` reads the colours through the
 * layout, so the layout is what is revalidated: the board and every record
 * redraw from the next render.
 */
export async function saveRosterGroupColoursAction(
  colours: Record<string, string>,
): Promise<GroupColourSaveResult> {
  try {
    const operator = await requireCapability("role_management");
    await setRosterGroupColours(operator, colours);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return { ok: false, error: `The colours were not changed. ${error.message}` };
  }
  revalidatePath("/operate", "layout");
  return { ok: true };
}
