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
import { answerEventQuestionsIn, parseQuestionSubmissions } from "@/lib/services/player-home";
import {
  consumeAnswerTokenIn,
  issuePersonTokenIn,
  type PlayerAnswer,
} from "@/lib/services/player-answer-tokens";
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
 *
 * ## Owner correction round 5 (OWNER-LAN172-12, OWNER-LAN172-13)
 *
 * This is still the **only** write this page makes, and still the same
 * single cookie-gated action — W2 line 61's "asks applicable event
 * questions" and the No-path's own reason field are folded into this exact
 * submit rather than answered by a second action or a second page, which is
 * what "I shouldn't have to click twice" and Q-11's "must not weaken,
 * bypass or share the gate" both call for at once: one cookie check, one
 * transaction, one write, whatever the form also carried this time.
 *
 * `intent` distinguishes the landing page's three possible forward controls,
 * all posting to this same action:
 * - unset (the ordinary confirm/"Save options" button) — records whatever
 *   this token's own `y`/`n` encodes;
 * - `"change-to-yes"` — the No page's primary "Change to Yes" button;
 * - `"change-to-no"` — the Yes page's secondary "Plans changed?" link.
 *
 * Neither shortcut is a new authorization: `consumeAnswerTokenIn` still
 * resolves the acting person and invitation entirely from this token's own
 * hash, exactly as it always did. `intent` only ever changes what an
 * already-authenticated click means, never who is clicking.
 */
async function refuse(target: string, startedAt: number): Promise<never> {
  await holdUniformRefusal(startedAt);
  redirect(target);
}

function responseOverrideFor(intent: string): PlayerAnswer | undefined {
  if (intent === "change-to-yes") return "yes";
  if (intent === "change-to-no") return "no";
  return undefined;
}

export async function submitAnswer(form: FormData): Promise<void> {
  const startedAt = startUniformClock();
  const token = typeof form.get("token") === "string" ? (form.get("token") as string) : "";
  const encoded = encodeURIComponent(token);
  const intent = typeof form.get("intent") === "string" ? (form.get("intent") as string) : "";
  const response = responseOverrideFor(intent);
  const reason = typeof form.get("reason") === "string" ? (form.get("reason") as string) : "";
  const submissions = parseQuestionSubmissions(form);

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
      const recorded = await consumeAnswerTokenIn(tx, token, { response, reason });

      // LAN-203, REQ-recruit-sees-public-only. A recruit has no durable
      // `/me/[token]` page to be sent to — there is no event page for them
      // at all, and that page reads every invitation a person has ever held
      // (`readPlayerHomeIn`), which is exactly the roster-and-attendance
      // exposure this requirement forbids. Recruit invitations also carry no
      // event questions to answer (`event_questions.applies_to_capacities`
      // is never seeded with `recruit`), so `submissions` is always empty
      // for one and the branch below is never reached on their behalf.
      // Redirecting back to this same route re-resolves the now-consumed
      // token and renders `AlreadyRecorded` — the one saved-confirmation
      // screen this journey needs, with no second page and no durable
      // credential minted for a person who will never use one.
      if (recorded.capacity === "recruit") {
        return `/a/${encoded}`;
      }

      if (recorded.answer === "yes" && submissions.length > 0) {
        await answerEventQuestionsIn(tx, recorded.personId, recorded.invitationId, submissions);
      }
      const durable = await issuePersonTokenIn(tx, recorded.personId, recorded.seasonId);
      return `/me/${encodeURIComponent(durable.token)}?open=${encodeURIComponent(recorded.invitationId)}`;
    });
  } catch {
    return refuse(`/a/${encoded}`, startedAt);
  }

  redirect(destination);
}
