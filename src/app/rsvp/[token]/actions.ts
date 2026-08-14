"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isServiceError } from "@/lib/db";
import {
  allowRsvpRequest,
  clientKeyFrom,
  holdUniformRefusal,
  logThrottledRsvpRequest,
  startUniformClock,
} from "@/lib/rsvp/public-surface";
import { NO_REQUIRES_A_REASON_RULE, recordSignedLinkResponse } from "@/lib/services/rsvp";
import {
  BUSY_ERROR,
  CLOSED_ERROR,
  DECLINE_STEP,
  ERROR_PARAM,
  REASON_REQUIRED_ERROR,
  SAVED_PARAM,
  STEP_PARAM,
} from "./params";

/**
 * The player's two submissions. LAN-79.
 *
 * ## Plain forms, on purpose
 *
 * Both actions are reached by an ordinary `<form action={…}>` POST and answer
 * with a redirect. Nothing here needs `useActionState`, a fetch, or any client
 * component, because the acceptance criteria require the page to work "with
 * JavaScript restricted to what a plain form submission needs" — a player is on
 * a phone, outdoors, on a bad connection. Errors therefore travel back in the
 * query string rather than in React state, which is the only version of this
 * that survives with scripting switched off.
 *
 * ## The token comes from the URL, and the invitation from the token
 *
 * Neither action accepts an invitation id, a person id or an event id, and
 * neither trusts anything else the form carries. The token is re-resolved
 * inside the writing transaction by `recordSignedLinkResponse`, so a form
 * rendered before the event started cannot be replayed after it.
 */

function tokenFrom(form: FormData): string {
  const token = form.get("token");
  return typeof token === "string" ? token : "";
}

function text(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === "string" ? value : "";
}

/**
 * Rate limiting on the write path.
 *
 * Refused with its own error rather than with `closed`. The first version told
 * a throttled player "responses close when the event starts" — a statement
 * about their event that was simply untrue, and one they could do nothing
 * about. Independent review caught it. `busy` says what is actually happening
 * and invites them to try again, which is the honest and the useful answer.
 */
async function throttled(token: string): Promise<boolean> {
  const requestHeaders = await headers();
  const decision = allowRsvpRequest(clientKeyFrom(requestHeaders), token);
  if (decision.allowed) return false;
  logThrottledRsvpRequest(decision.reason!);
  return true;
}

/**
 * Every refusal on this path costs the same wall clock, for the same reason the
 * read path equalises: an unknown token is refused without a database round
 * trip while a revoked one costs a three-table join, and Next's server-action
 * ids are recoverable from any legitimate player's rendered form, so an
 * attacker can post arbitrary tokens straight at this action and time the
 * redirect. Equalising only the GET would leave the side channel open on the
 * POST.
 */
async function refuse(target: string, startedAt: number): Promise<never> {
  await holdUniformRefusal(startedAt);
  redirect(target);
}

/** UX-60's one-tap Attending. */
export async function submitAttending(form: FormData): Promise<void> {
  const startedAt = startUniformClock();
  const token = tokenFrom(form);
  const encoded = encodeURIComponent(token);

  if (await throttled(token)) {
    await refuse(`/rsvp/${encoded}?${ERROR_PARAM}=${BUSY_ERROR}`, startedAt);
  }

  try {
    await recordSignedLinkResponse(token, { response: "yes" });
  } catch (error) {
    await refuse(`/rsvp/${encoded}?${ERROR_PARAM}=${failureFor(error)}`, startedAt);
  }

  redirect(`/rsvp/${encoded}?${SAVED_PARAM}=1`);
}

/** UX-61's Save Not attending. */
export async function submitNotAttending(form: FormData): Promise<void> {
  const startedAt = startUniformClock();
  const token = tokenFrom(form);
  const encoded = encodeURIComponent(token);

  if (await throttled(token)) {
    await refuse(`/rsvp/${encoded}?${ERROR_PARAM}=${BUSY_ERROR}`, startedAt);
  }

  try {
    await recordSignedLinkResponse(token, {
      response: "no",
      reason: text(form, "reason"),
    });
  } catch (error) {
    const failure = failureFor(error);
    // A missing reason returns to the declining step with the message, rather
    // than to the invitation — the player is mid-answer and should not lose it.
    // It is also the one refusal that is not a secret, so it is not padded.
    if (failure === REASON_REQUIRED_ERROR) {
      redirect(
        `/rsvp/${encoded}?${STEP_PARAM}=${DECLINE_STEP}&${ERROR_PARAM}=${REASON_REQUIRED_ERROR}`,
      );
    }
    await refuse(`/rsvp/${encoded}?${ERROR_PARAM}=${failure}`, startedAt);
  }

  redirect(`/rsvp/${encoded}?${SAVED_PARAM}=1`);
}

/**
 * Which failure the player is told about.
 *
 * Exactly two outcomes are distinguishable, and both are things the player can
 * act on: the reason is missing, or the window is shut. Every other failure —
 * including a revoked token and an unknown one — collapses into the shut-window
 * case, because saying more would undo the uniform terminal response.
 *
 * `redirect()` throws to perform the navigation, so it must not be caught here;
 * this function only classifies, and the caller redirects.
 */
function failureFor(error: unknown): string {
  if (isServiceError(error) && error.rule === NO_REQUIRES_A_REASON_RULE) {
    return REASON_REQUIRED_ERROR;
  }
  return CLOSED_ERROR;
}
