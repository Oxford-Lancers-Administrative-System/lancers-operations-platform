"use server";

import { headers } from "next/headers";

import {
  allowPublicLinkRequest,
  clientKeyFrom,
  logThrottledClubLinkRequest,
} from "@/lib/rsvp/public-surface";
import { recordClubLinkUseByToken } from "@/lib/services/club-link";

/**
 * Counts one real opening of a club link — LAN-269. Stamped from here, fired
 * by `LinkOpenedBeacon` once a real browser has run the page, rather than
 * during render: WhatsApp fetches the URL for its preview card before anyone
 * taps it, and a preview crawler never runs this action's JavaScript. Held to
 * the same per-link/per-address throttle as the page. Answers nothing either
 * way: `recordClubLinkUseByToken` is silent for a malformed, unknown or
 * locked token and for an outright failure alike.
 *
 * Decision history: docs/ux/design-system.md (LAN-269 has no ticket contract)
 */
export async function noteClubLinkOpened(token: string): Promise<void> {
  const decision = allowPublicLinkRequest("club_link", clientKeyFrom(await headers()), token);
  if (!decision.allowed) {
    logThrottledClubLinkRequest(decision.reason!);
    return;
  }

  await recordClubLinkUseByToken(token);
}
