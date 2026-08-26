"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { withTransaction } from "@/lib/db";
import { ANSWER_GATE_COOKIE } from "@/lib/rsvp/answer-gate";
import {
  allowPlayerAnswerRequest,
  clientKeyFrom,
  holdUniformRefusal,
  logThrottledPlayerAnswerRequest,
  startUniformClock,
} from "@/lib/rsvp/public-surface";
import { consumeAnswerTokenIn, issuePersonTokenIn } from "@/lib/services/player-answer-tokens";
import { ERROR_PARAM } from "./params";
import { BUSY_ERROR } from "./presentation";

/**
 * The answer link's one write. LAN-172, Q-11.
 *
 * ## The cookie is checked here, before the transaction opens
 *
 * `REQ-no-false-rsvp`'s whole mechanism is that the write is refused unless
 * the browser carries the cookie the GET set for this exact path. Checking it
 * before `withTransaction` means an automated POST with no cookie never opens
 * a database transaction at all — the cheapest possible refusal for the
 * traffic this exists to repel.
 *
 * ## Every answer ends on the player's own page
 *
 * A successful POST does not redirect back to `/a/[token]`. It mints a fresh
 * durable credential in the same transaction that recorded the response and
 * redirects straight to `/me/[token]`, focused on the invitation just
 * answered — the journey's own words, "ends on the player's own page."
 */
async function refuse(target: string, startedAt: number): Promise<never> {
  await holdUniformRefusal(startedAt);
  redirect(target);
}

export async function submitAnswer(form: FormData): Promise<void> {
  const startedAt = startUniformClock();
  const token = typeof form.get("token") === "string" ? (form.get("token") as string) : "";
  const encoded = encodeURIComponent(token);

  const requestHeaders = await headers();
  const decision = allowPlayerAnswerRequest(clientKeyFrom(requestHeaders), token);
  if (!decision.allowed) {
    logThrottledPlayerAnswerRequest(decision.reason!);
    return refuse(`/a/${encoded}?${ERROR_PARAM}=${BUSY_ERROR}`, startedAt);
  }

  const jar = await cookies();
  const gateIsOpen = (jar.get(ANSWER_GATE_COOKIE)?.value ?? "") !== "";
  if (!gateIsOpen) {
    // The one refusal that is never shown as a distinguishable error: telling
    // an automated caller "your cookie was missing" would simply teach it to
    // carry one. It gets the same uniform closed-link outcome a revoked or
    // expired token gets — the page reloads and, for a real player who merely
    // had cookies blocked, `page.tsx` resolves the token fresh and offers the
    // control again.
    return refuse(`/a/${encoded}`, startedAt);
  }

  let destination: string;
  try {
    destination = await withTransaction(async (tx) => {
      const recorded = await consumeAnswerTokenIn(tx, token);
      const durable = await issuePersonTokenIn(tx, recorded.personId, recorded.seasonId);
      return `/me/${encodeURIComponent(durable.token)}?open=${encodeURIComponent(recorded.invitationId)}`;
    });
  } catch {
    return refuse(`/a/${encoded}`, startedAt);
  }

  redirect(destination);
}
