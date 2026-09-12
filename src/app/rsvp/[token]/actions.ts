"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isServiceError, withTransaction } from "@/lib/db";
import {
  allowRsvpRequest,
  clientKeyFrom,
  holdUniformRefusal,
  logThrottledRsvpRequest,
  startUniformClock,
} from "@/lib/rsvp/public-surface";
import { issuePersonTokenIn } from "@/lib/services/player-answer-tokens";
import { readInvitationOwnerIn } from "@/lib/services/player-home";
import { NO_REQUIRES_A_REASON_RULE, recordSignedLinkResponse } from "@/lib/services/rsvp";
import { recordRsvpTokenUse, resolveRsvpTokenIn } from "@/lib/services/rsvp-tokens";
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
 * "See all your events." from the saved page — LAN-343.
 *
 * This page was a closed loop: "Change response" and "Close" both pointed back
 * at itself, and nothing here led to the player's own page. The page it now
 * leads to needs a durable credential, whose plaintext cannot be recovered, so
 * one is minted behind this click — a POST, deliberately, because the GET this
 * page is reached by must keep writing nothing for a link-preview crawler, and
 * a crawler never submits a form.
 *
 * The person comes from this link's own RSVP token, never from the form. A
 * recruit is refused: they have no events page at all
 * (`REQ-recruit-sees-public-only`), and `saved-and-cancelled.tsx` does not
 * render the control for them either.
 */
export async function openEventsPage(form: FormData): Promise<void> {
  const startedAt = startUniformClock();
  const token = tokenFrom(form);
  const here = `/rsvp/${encodeURIComponent(token)}?${SAVED_PARAM}=1`;

  if (await throttled(token)) return refuse(here, startedAt);

  let destination: string;
  try {
    destination = await withTransaction(async (tx) => {
      const resolution = await resolveRsvpTokenIn(tx, token);
      if (resolution.invitation === null) throw new Error("unresolved");
      const owner = await readInvitationOwnerIn(tx, resolution.invitation.invitationId);
      if (owner === null || owner.capacity === "recruit") throw new Error("unresolved");
      const durable = await issuePersonTokenIn(tx, owner.personId, owner.seasonId);
      return `/events/${encodeURIComponent(durable.token)}`;
    });
  } catch {
    return refuse(here, startedAt);
  }

  redirect(destination);
}

/**
 * Counts one real opening of this invitation — LAN-269. Fired by
 * `LinkOpenedBeacon` after the browser has run the page; the render itself
 * stamps nothing (a crawler triggers the render). Throttled on the page's
 * budget; a throttled call is silent, and `recordRsvpTokenUse` swallows its
 * own failures, so this never distinguishes a guess.
 */
export async function noteRsvpLinkOpened(token: string): Promise<void> {
  const decision = allowRsvpRequest(clientKeyFrom(await headers()), token);
  if (!decision.allowed) {
    logThrottledRsvpRequest(decision.reason!);
    return;
  }

  await recordRsvpTokenUse(token);
}
