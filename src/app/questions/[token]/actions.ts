"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { withTransaction } from "@/lib/db";
import {
  allowRsvpRequest,
  clientKeyFrom,
  holdUniformRefusal,
  logThrottledRsvpRequest,
  startUniformClock,
} from "@/lib/rsvp/public-surface";
import { answerInvitationQuestionsIn, parseQuestionSubmissions } from "@/lib/services/player-home";
import { resolveRsvpTokenIn } from "@/lib/services/rsvp-tokens";

import { BUSY_ERROR } from "./presentation";

/**
 * The nudge page's one write — LAN-343.
 *
 * The token is re-resolved inside this action's own transaction and the
 * invitation is taken from it, never from the form: the form carries the
 * credential and the answers, and nothing else it says is trusted. A token
 * that no longer resolves is refused with the same uniform hold and the same
 * redirect a rate-limited submit gets, so which of the two happened is not
 * visible from outside.
 */
export async function saveEventQuestions(form: FormData): Promise<void> {
  const startedAt = startUniformClock();
  const token = typeof form.get("token") === "string" ? (form.get("token") as string) : "";
  const here = `/questions/${encodeURIComponent(token)}`;
  const submissions = parseQuestionSubmissions(form);

  const requestHeaders = await headers();
  const decision = allowRsvpRequest(clientKeyFrom(requestHeaders), token);
  if (!decision.allowed) {
    logThrottledRsvpRequest(decision.reason!);
    await holdUniformRefusal(startedAt);
    redirect(`${here}?error=${BUSY_ERROR}`);
  }

  try {
    await withTransaction(async (tx) => {
      const resolution = await resolveRsvpTokenIn(tx, token);
      if (resolution.state !== "valid" || resolution.invitation === null) {
        throw new Error("unresolved");
      }
      await answerInvitationQuestionsIn(tx, resolution.invitation.invitationId, submissions);
    });
  } catch {
    await holdUniformRefusal(startedAt);
    redirect(`${here}?error=${BUSY_ERROR}`);
  }

  redirect(`${here}?saved=1`);
}
