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
import { recordRsvpTokenUse } from "@/lib/services/rsvp-tokens";
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
 * The player's two submissions. LAN-79. Plain `<form action={…}>` POSTs
 * answered with a redirect, no client component — errors travel in the query
 * string so the page works with scripting switched off. The token is
 * re-resolved inside the writing transaction by `recordSignedLinkResponse`;
 * neither action trusts an invitation, person or event id from the form.
 *
 * Decision history: docs/ux/tickets/LAN-79-player-rsvp.md
 */

function tokenFrom(form: FormData): string {
  const token = form.get("token");
  return typeof token === "string" ? token : "";
}

function text(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === "string" ? value : "";
}

/** Rate limiting on the write path. `busy`, not `closed`: an earlier version's "responses close when the event starts" was simply untrue (independent review caught it). */
async function throttled(token: string): Promise<boolean> {
  const requestHeaders = await headers();
  const decision = allowRsvpRequest(clientKeyFrom(requestHeaders), token);
  if (decision.allowed) return false;
  logThrottledRsvpRequest(decision.reason!);
  return true;
}

/** Every refusal on this path costs the same wall clock — Next's server-action ids are recoverable from a rendered form, so equalising only the GET would leave a timing side channel open on the POST. */
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
    // A missing reason returns to the declining step, not the invitation, so the player doesn't lose their place; not padded, since it isn't a secret.
    if (failure === REASON_REQUIRED_ERROR) {
      redirect(
        `/rsvp/${encoded}?${STEP_PARAM}=${DECLINE_STEP}&${ERROR_PARAM}=${REASON_REQUIRED_ERROR}`,
      );
    }
    await refuse(`/rsvp/${encoded}?${ERROR_PARAM}=${failure}`, startedAt);
  }

  redirect(`/rsvp/${encoded}?${SAVED_PARAM}=1`);
}

/** Which failure the player is told: reason missing, or window shut — everything else collapses into shut-window so as not to undo the uniform terminal response. Only classifies; the caller redirects (`redirect()` throws). */
function failureFor(error: unknown): string {
  if (isServiceError(error) && error.rule === NO_REQUIRES_A_REASON_RULE) {
    return REASON_REQUIRED_ERROR;
  }
  return CLOSED_ERROR;
}

/**
 * Counts one real opening of this invitation — LAN-269. Fired by
 * `LinkOpenedBeacon` after the browser has run the page; the render itself
 * stamps nothing (a crawler triggers the render). Throttled on the page's
 * budget; a throttled call is silent, and `recordRsvpTokenUse` swallows its
 * own failures, so this never distinguishes a guess.
 *
 * Decision history: docs/ux/design-system.md (LAN-269 has no ticket contract)
 */
export async function noteRsvpLinkOpened(token: string): Promise<void> {
  const decision = allowRsvpRequest(clientKeyFrom(await headers()), token);
  if (!decision.allowed) {
    logThrottledRsvpRequest(decision.reason!);
    return;
  }

  await recordRsvpTokenUse(token);
}
