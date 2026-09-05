"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { sendOnboardingNudges } from "@/lib/services/messaging-scheduler";

/**
 * The queue's own nudge — LAN-218, `W8`, `M3`, `T11-batch-nudge`.
 *
 * One or several people, each getting their own compiled ask on their own
 * link (`sendOnboardingNudges`'s own isolation, proved directly in
 * `onboarding-chase-dispatch.test.ts`). Unlimited and outside the automated
 * cap — never refused because a chase is exhausted; the queue only ever
 * warns.
 *
 * `person_record_authority` — the same four-role gate the page itself is
 * behind (`gateShellPage`, `page.tsx`). The gate here is the actual
 * boundary; the page's own gate is a courtesy that stops an unauthorized
 * reader from seeing the button at all.
 */
export interface NudgeActionResult {
  readonly error: string | null;
  readonly notice: string | null;
}

function nudgeSentNotice(accepted: number): string {
  return accepted === 1 ? "Nudged 1 person." : `Nudged ${accepted} people.`;
}

function nudgeProblemNotice(refused: number, total: number): string {
  if (refused === total) {
    return total === 1
      ? "This person could not be nudged. Open their record to see why."
      : "Nobody selected could be nudged. Open each record to see why.";
  }
  return refused === 1
    ? "One selected person could not be nudged. Open their record to see why."
    : `${refused} selected people could not be nudged. Open their records to see why.`;
}

export async function nudgeSelectedAction(
  membershipIds: readonly string[],
): Promise<NudgeActionResult> {
  const operator = await requireCapability("person_record_authority");

  const ids = Array.from(new Set(membershipIds.filter((id) => id.trim() !== "")));
  if (ids.length === 0) {
    return { error: "Select at least one person to nudge.", notice: null };
  }

  try {
    const results = await sendOnboardingNudges(operator.personId, ids);
    const accepted = results.filter((result) => result.outcome === "accepted").length;
    const refused = results.length - accepted;

    revalidatePath("/operate/people/missing");

    return {
      notice: accepted > 0 ? nudgeSentNotice(accepted) : null,
      error: refused > 0 ? nudgeProblemNotice(refused, results.length) : null,
    };
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return { error: error.message, notice: null };
  }
}
