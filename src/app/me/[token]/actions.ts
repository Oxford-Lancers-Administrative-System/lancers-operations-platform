"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { withTransaction } from "@/lib/db";
import {
  allowPlayerHomeRequest,
  clientKeyFrom,
  holdUniformRefusal,
  logThrottledPlayerHomeRequest,
  startUniformClock,
} from "@/lib/rsvp/public-surface";
import {
  answerEventQuestionsIn,
  recordPlayerHomeAnswerIn,
  type QuestionAnswerSubmission,
} from "@/lib/services/player-home";
import { NO_REASON_GIVEN_DEFAULT, resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";

/**
 * Writes made from the durable page. LAN-172.
 *
 * Every action re-resolves the durable token inside its own transaction and
 * passes the resolved `personId` — never the form's own values — into the
 * service call that re-proves the target invitation belongs to that person.
 * `recordPlayerHomeAnswerIn` and `answerEventQuestionsIn` each do this proof
 * themselves, so an invitation id taken from a request that does not belong
 * to the token holder is refused identically to one that does not exist at
 * all. Correction LAN-172-c1: `answerEventQuestionsIn` previously took no
 * `personId` and skipped this proof entirely.
 */

function str(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === "string" ? value : "";
}

/** The durable token, read the same literal way every other token route does. */
function tokenFrom(form: FormData): string {
  const token = form.get("token");
  return typeof token === "string" ? token : "";
}

async function throttled(token: string): Promise<boolean> {
  const requestHeaders = await headers();
  const decision = allowPlayerHomeRequest(clientKeyFrom(requestHeaders), token);
  if (decision.allowed) return false;
  logThrottledPlayerHomeRequest(decision.reason!);
  return true;
}

async function refuse(target: string, startedAt: number): Promise<never> {
  await holdUniformRefusal(startedAt);
  redirect(target);
}

function homeUrl(token: string, invitationId: string): string {
  return `/me/${encodeURIComponent(token)}?open=${encodeURIComponent(invitationId)}`;
}

/** The one-click "Yes, I'm attending" / "Change to Yes" control. */
export async function changeToYes(form: FormData): Promise<void> {
  const startedAt = startUniformClock();
  const token = tokenFrom(form);
  const invitationId = str(form, "invitationId");
  const encodedToken = encodeURIComponent(token);

  if (await throttled(token)) await refuse(`/me/${encodedToken}`, startedAt);

  try {
    await withTransaction(async (tx) => {
      const resolution = await resolvePersonTokenIn(tx, token);
      if (resolution.state !== "valid" || !resolution.resolved) {
        throw new Error("unresolved");
      }
      await recordPlayerHomeAnswerIn(tx, resolution.resolved.personId, invitationId, {
        response: "yes",
      });
    });
  } catch {
    await refuse(`/me/${encodedToken}`, startedAt);
  }

  redirect(homeUrl(token, invitationId));
}

/**
 * "No, I'm not attending" / "Change to No" / "Give a reason and continue" —
 * one action, because all three are the same write: record No with whatever
 * reason the form carries.
 *
 * Correction LAN-172-c2 (Q-22, `REQ-no-reason-given`): the click itself must
 * be enough for a **player's** own No, exactly as it already is on the
 * WhatsApp answer link — a page with a text field in front of the player is
 * not a reason to demand one before the answer stands. `defaultOk` is set by
 * the two side-by-side row controls and by "Plans changed?", which submit no
 * `reason` at all; a blank reason there is filled with the same
 * `NO_REASON_GIVEN_DEFAULT` the WhatsApp path already records, never refused.
 * The *separate* "Give a reason and continue" form — replacing an already-
 * standing default with the player's real explanation — sends no `defaultOk`
 * and keeps the original refusal: nothing meaningful was submitted, so the
 * player sees the same recoverable error LAN-79 already used.
 */
export async function submitNo(form: FormData): Promise<void> {
  const startedAt = startUniformClock();
  const token = tokenFrom(form);
  const invitationId = str(form, "invitationId");
  const defaultOk = str(form, "defaultOk") === "1";
  const typedReason = str(form, "reason");
  const reason = typedReason === "" && defaultOk ? NO_REASON_GIVEN_DEFAULT : typedReason;
  const encodedToken = encodeURIComponent(token);

  if (await throttled(token)) await refuse(`/me/${encodedToken}`, startedAt);

  try {
    await withTransaction(async (tx) => {
      const resolution = await resolvePersonTokenIn(tx, token);
      if (resolution.state !== "valid" || !resolution.resolved) {
        throw new Error("unresolved");
      }
      await recordPlayerHomeAnswerIn(tx, resolution.resolved.personId, invitationId, {
        response: "no",
        reason,
      });
    });
  } catch {
    // A blank reason is exactly as recoverable as LAN-79's own decline step,
    // so it returns to the same focused panel rather than the uniform
    // refusal — the player is mid-answer and should not lose their place.
    redirect(`${homeUrl(token, invitationId)}&reasonError=1`);
  }

  redirect(homeUrl(token, invitationId));
}

/** Saves the event's own questions for one already-standing Yes. */
export async function submitQuestions(form: FormData): Promise<void> {
  const startedAt = startUniformClock();
  const token = tokenFrom(form);
  const invitationId = str(form, "invitationId");
  const encodedToken = encodeURIComponent(token);

  if (await throttled(token)) await refuse(`/me/${encodedToken}`, startedAt);

  const submissions: QuestionAnswerSubmission[] = [];
  for (const [key, value] of form.entries()) {
    const match = /^q_(.+)$/.exec(key);
    if (!match || typeof value !== "string" || value === "") continue;
    const questionId = match[1];
    const kind = str(form, `qkind_${questionId}`);
    if (kind === "boolean") {
      submissions.push({ questionId, boolean: value === "true" });
    } else if (kind === "choice") {
      submissions.push({ questionId, choice: value });
    } else {
      submissions.push({ questionId, text: value });
    }
  }

  try {
    await withTransaction(async (tx) => {
      const resolution = await resolvePersonTokenIn(tx, token);
      if (resolution.state !== "valid" || !resolution.resolved) {
        throw new Error("unresolved");
      }
      await answerEventQuestionsIn(tx, resolution.resolved.personId, invitationId, submissions);
    });
  } catch {
    await refuse(`/me/${encodedToken}`, startedAt);
  }

  redirect(homeUrl(token, invitationId));
}
