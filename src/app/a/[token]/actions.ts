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
 * The answer link's one write. LAN-172, Q-11. The cookie is checked before
 * `withTransaction` opens: an automated POST with no cookie never opens a
 * transaction at all. A successful POST redirects to `/me/[token]`, not back
 * to `/a/[token]`, minting a durable credential in the same transaction.
 * `intent` (unset / `change-to-yes` / `change-to-no`) distinguishes the
 * landing page's three forward controls, all posting here; it changes what an
 * already-authenticated click means, never who is clicking —
 * `consumeAnswerTokenIn` still resolves person and invitation from the
 * token's own hash.
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
    // Never a distinguishable error (would teach an automated caller to carry the cookie) — same uniform closed-link outcome as revoked/expired.
    return refuse(`/a/${encoded}`, startedAt);
  }

  let destination: string;
  try {
    destination = await withTransaction(async (tx) => {
      const recorded = await consumeAnswerTokenIn(tx, token, { response, reason });

      // LAN-203, REQ-recruit-sees-public-only: a recruit has no `/me/[token]`
      // page (that page's `readPlayerHomeIn` is roster-and-attendance exposure
      // this requirement forbids). Redirects back here instead, rendering
      // `AlreadyRecorded` with no durable credential minted.
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
