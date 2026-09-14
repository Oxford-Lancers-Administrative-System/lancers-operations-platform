"use server";

import { isServiceError, withTransaction } from "@/lib/db";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import { withdrawSeasonMessagingConsentIn } from "@/lib/services/messaging-consent";

/** The opt-out surface's one write (LAN-202, item 6) — one gate (`season_messaging_consents`), not one per channel, so it's honoured immediately everywhere. */
export interface StopOutcome {
  readonly ok: boolean;
  readonly message?: string;
}

export async function withdrawMessagingConsent(token: string): Promise<StopOutcome> {
  try {
    await withTransaction(async (tx) => {
      const resolved = await resolvePersonTokenIn(tx, token, "messaging_stop");
      if (resolved.state !== "valid" || !resolved.resolved) {
        throw new Error("This link is no longer live.");
      }
      await withdrawSeasonMessagingConsentIn(
        tx,
        resolved.resolved.personId,
        resolved.resolved.seasonId,
      );
    });
    return { ok: true };
  } catch (error) {
    if (isServiceError(error)) return { ok: false, message: error.message };
    if (error instanceof Error) return { ok: false, message: error.message };
    return { ok: false, message: "That could not be saved. Try again." };
  }
}
