"use server";

import { isServiceError, withTransaction } from "@/lib/db";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import {
  isSeasonRosterMemberIn,
  withdrawSeasonMessagingConsentIn,
} from "@/lib/services/messaging-consent";

/** The opt-out surface's one write (LAN-202, item 6) — one gate (`season_messaging_consents`), not one per channel, so it's honoured immediately everywhere. */
export interface StopOutcome {
  readonly ok: boolean;
  readonly message?: string;
}

const NOT_LIVE = "This link is no longer live.";
/** LAN-372. The page renders no control for a member; this is the boundary, not the courtesy. */
const MEMBERS_ARE_EXEMPT =
  "You are on the roster, so club messages continue. To leave the team, talk to the club.";
const GENERIC_FAILURE = "That could not be saved. Try again.";

export async function withdrawMessagingConsent(token: string): Promise<StopOutcome> {
  try {
    const refusal = await withTransaction(async (tx) => {
      const resolved = await resolvePersonTokenIn(tx, token, "messaging_stop");
      if (resolved.state !== "valid" || !resolved.resolved) return NOT_LIVE;
      // LAN-372: consent is a recruit concept, so there is nothing here for a
      // roster player to withdraw and nothing is written.
      if (
        await isSeasonRosterMemberIn(tx, resolved.resolved.personId, resolved.resolved.seasonId)
      ) {
        return MEMBERS_ARE_EXEMPT;
      }
      await withdrawSeasonMessagingConsentIn(
        tx,
        resolved.resolved.personId,
        resolved.resolved.seasonId,
      );
      return null;
    });
    return refusal === null ? { ok: true } : { ok: false, message: refusal };
  } catch (error) {
    // A ServiceError's message is written for a person. Anything else is a
    // defect, and its text belongs in the server log, never in an anonymous
    // visitor's browser (LAN-352).
    if (isServiceError(error)) return { ok: false, message: error.message };
    console.error("[stop] withdrawMessagingConsent failed", error);
    return { ok: false, message: GENERIC_FAILURE };
  }
}
