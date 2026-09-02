"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError, withTransaction } from "@/lib/db";
import { mintRecruitmentSignupCodeIn } from "@/lib/services/recruitment-signup-codes";
import { readCurrentSeasonIn } from "@/lib/services/seasons";
import type { RecruitmentActionState } from "../action-state";

/**
 * `W1-04`'s own action — mint (or re-mint) the season's one live sign-up
 * code. `mintRecruitmentSignupCodeIn` already does the whole of "deactivate a
 * live code and mint a replacement" (Brian, 2026-08-31) atomically, so this
 * is a thin gate around it and nothing more.
 */
export async function mintRecruitmentSignupCodeAction(): Promise<RecruitmentActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
    await withTransaction(async (tx) => {
      const season = await readCurrentSeasonIn(tx);
      await mintRecruitmentSignupCodeIn(tx, season.id, { mintedByPersonId: operator.personId });
    });
  } catch (error) {
    if (!isServiceError(error)) throw error;
    if (error.kind === "not_permitted") throw error;
    return { error: error.message };
  }
  revalidatePath("/operate/recruitment/qr");
  return { error: null };
}
