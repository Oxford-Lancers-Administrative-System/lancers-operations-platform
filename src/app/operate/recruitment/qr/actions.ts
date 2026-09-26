"use server";

import { revalidatePath } from "next/cache";
import { requireGrant } from "@/lib/auth/guards";
import { isServiceError, withTransaction } from "@/lib/db";
import { mintRecruitmentSignupCodeIn } from "@/lib/services/recruitment-signup-codes";
import { readCurrentSeasonIn } from "@/lib/services/seasons";
import type { RecruitmentActionState } from "../action-state";
import { ADD_RECRUITS } from "@/lib/auth/roster-access";

// `W1-04`'s action — mint/re-mint the season's one live sign-up code, atomically (Brian, 2026-08-31).
export async function mintRecruitmentSignupCodeAction(): Promise<RecruitmentActionState> {
  try {
    // LAN-432: the May add recruits switch. Inside the try (LAN-423): a
    // refusal is the page's answer, never a crashed page.
    const operator = await requireGrant(ADD_RECRUITS);
    await withTransaction(async (tx) => {
      const season = await readCurrentSeasonIn(tx);
      await mintRecruitmentSignupCodeIn(tx, season.id, { mintedByPersonId: operator.personId });
    });
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return { error: error.message };
  }
  revalidatePath("/operate/recruitment/qr");
  return { error: null };
}
