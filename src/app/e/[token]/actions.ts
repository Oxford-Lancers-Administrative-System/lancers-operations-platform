"use server";

import { headers } from "next/headers";

import {
  allowPublicLinkRequest,
  clientKeyFrom,
  logThrottledClubLinkRequest,
} from "@/lib/rsvp/public-surface";
import { recordClubLinkUseByToken } from "@/lib/services/club-link";

/**
 * Counts one real opening of a club link — LAN-269.
 *
 * ## Why this route has an action at all
 *
 * `/e/[token]` writes nothing a coach can see: it is a list they read. The one
 * thing it used to write was `use_count`, stamped at the end of the render, and
 * Q2 — whether club links need expiry — is meant to be settled from that
 * number.
 *
 * A club link is handed round WhatsApp, and WhatsApp fetches the URL to build
 * its preview card before anybody taps it. Every one of those fetches counted.
 * So the render now stamps nothing and this action does it instead, fired by
 * `LinkOpenedBeacon` once a real browser has run the page. Preview crawlers
 * execute no JavaScript and never arrive here.
 *
 * ## What it refuses
 *
 * The same per-link and per-address budget the page is held to. This is a
 * `POST` an anonymous caller reaches with nothing but a guessed token, and
 * without the throttle it would be a cheaper way to spend database round trips
 * than the page it belongs to.
 *
 * It answers nothing in either case. A stranger holding a token learns whether
 * the link is live by opening it, not by whether a counter moved, and
 * `recordClubLinkUseByToken` is silent for a malformed token, an unknown one,
 * a locked row and an outright failure alike.
 */
export async function noteClubLinkOpened(token: string): Promise<void> {
  const decision = allowPublicLinkRequest("club_link", clientKeyFrom(await headers()), token);
  if (!decision.allowed) {
    logThrottledClubLinkRequest(decision.reason!);
    return;
  }

  await recordClubLinkUseByToken(token);
}
