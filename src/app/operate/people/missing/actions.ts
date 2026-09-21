"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { sendOnboardingNudges } from "@/lib/services/messaging-scheduler";

// The queue's own nudge — LAN-218, `W8`, `M3`, `T11-batch-nudge`. Unlimited,
// outside the automated cap; gated on `person_record_authority`, the real
// boundary (the page's own gate is a courtesy).
export interface NudgeActionResult {
  readonly error: string | null;
  readonly notice: string | null;
}

function nudgeSentNotice(accepted: number): string {
  return accepted === 1 ? "Nudged 1 person." : `Nudged ${accepted} people.`;
}

// LAN-394. A nudge the safety guard deferred is queued: the job exists and
// will go out when the club's sending allowance allows. It is neither a
// success to report as "Nudged" nor a problem to send somebody to a record
// about, so it gets its own sentence.
function nudgeWaitingNotice(deferred: number): string {
  return deferred === 1
    ? "1 nudge is queued — waiting for the sending allowance."
    : `${deferred} nudges are queued — waiting for the sending allowance.`;
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
    const deferred = results.filter((result) => result.outcome === "deferred").length;
    const refused = results.length - accepted - deferred;

    revalidatePath("/operate/people/missing");

    const notices = [
      accepted > 0 ? nudgeSentNotice(accepted) : null,
      deferred > 0 ? nudgeWaitingNotice(deferred) : null,
    ].filter((line): line is string => line !== null);

    return {
      notice: notices.length > 0 ? notices.join(" ") : null,
      // The denominator excludes what is waiting: telling an operator that
      // "3 of 5 could not be nudged" when two of them are queued would send
      // them to two records with nothing wrong in them.
      error: refused > 0 ? nudgeProblemNotice(refused, results.length - deferred) : null,
    };
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return { error: error.message, notice: null };
  }
}
