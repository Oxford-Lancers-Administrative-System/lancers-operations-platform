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
  parseQuestionSubmissions,
  recordPlayerHomeAnswerIn,
} from "@/lib/services/player-home";
import { NO_REASON_GIVEN_DEFAULT, resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";

/**
 * Writes made from the durable page. LAN-172. Every action re-resolves the
 * token inside its own transaction and passes the resolved `personId`, never
 * the form's values, so an invitation id that does not belong to the token
 * holder is refused identically to one that does not exist (LAN-172-c1 fixed
 * `answerEventQuestionsIn` skipping this proof).
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

/** Owner correction round 5 (OWNER-LAN172-16). Brian: "Once I click Save, the box should go away, and I should just go back to the normal page." */
function plainHomeUrl(token: string): string {
  return `/me/${encodeURIComponent(token)}`;
}

/** "Yes"/"Change to Yes" (OWNER-LAN172-19): never closes the panel — round 5 wrongly closed a revising Change to Yes. Only `submitNo`'s reason form and `submitQuestions` close it. */
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

/** "No"/"Change to No"/"Give a reason" — one write (LAN-172-c2, Q-22). `defaultOk` fills a blank reason with `NO_REASON_GIVEN_DEFAULT`; "Give a reason" sends none and keeps the refusal. */
export async function submitNo(form: FormData): Promise<void> {
  const startedAt = startUniformClock();
  const token = tokenFrom(form);
  const invitationId = str(form, "invitationId");
  const defaultOk = str(form, "defaultOk") === "1";
  const typedReason = str(form, "reason");
  const reason = typedReason === "" && defaultOk ? NO_REASON_GIVEN_DEFAULT : typedReason;
  const close = str(form, "close") === "1";
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
    // As recoverable as LAN-79's decline step: returns to the focused panel, not the uniform refusal. Never closes on a failed save (OWNER-LAN172-16).
    redirect(`${homeUrl(token, invitationId)}&reasonError=1`);
  }

  redirect(close ? plainHomeUrl(token) : homeUrl(token, invitationId));
}

/** Saves the event's own questions for one already-standing Yes. */
export async function submitQuestions(form: FormData): Promise<void> {
  const startedAt = startUniformClock();
  const token = tokenFrom(form);
  const invitationId = str(form, "invitationId");
  const encodedToken = encodeURIComponent(token);

  if (await throttled(token)) await refuse(`/me/${encodedToken}`, startedAt);

  const submissions = parseQuestionSubmissions(form);

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

  // OWNER-LAN172-16: a successful save always closes the panel.
  redirect(plainHomeUrl(token));
}
