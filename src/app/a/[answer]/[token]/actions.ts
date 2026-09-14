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
import {
  answerEventQuestionsIn,
  parseQuestionSubmissions,
  readInvitationOwnerIn,
} from "@/lib/services/player-home";
import {
  answerSegmentOf,
  consumeAnswerTokenIn,
  issuePersonTokenIn,
  resolveAnswerTokenIn,
  type PlayerAnswer,
} from "@/lib/services/player-answer-tokens";
import { ERROR_PARAM } from "./params";
import { BUSY_ERROR } from "./presentation";

/**
 * The answer link's writes. LAN-172, Q-11. The cookie is checked before
 * `withTransaction` opens: an automated POST with no cookie never opens a
 * transaction at all. A successful POST redirects to `/events/<t>`, not back
 * to this route, minting a durable credential in the same transaction.
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

/**
 * Where a refusal sends the visitor back to — this same link. LAN-343 put the
 * answer in the path, and it is read back off the token rather than out of the
 * form: the token is the only thing here that cannot be edited by whoever
 * submitted. A token that parses as neither takes the `no` spelling and lands
 * on the uniform terminal page, which is where it was going anyway.
 */
function selfUrl(token: string): string {
  return `/a/${answerSegmentOf(token) ?? "no"}/${encodeURIComponent(token)}`;
}

export async function submitAnswer(form: FormData): Promise<void> {
  const startedAt = startUniformClock();
  const token = typeof form.get("token") === "string" ? (form.get("token") as string) : "";
  const here = selfUrl(token);
  const intent = typeof form.get("intent") === "string" ? (form.get("intent") as string) : "";
  const response = responseOverrideFor(intent);
  const reason = typeof form.get("reason") === "string" ? (form.get("reason") as string) : "";
  const submissions = parseQuestionSubmissions(form);

  const requestHeaders = await headers();
  const decision = allowPlayerAnswerRequest(clientKeyFrom(requestHeaders), token);
  if (!decision.allowed) {
    logThrottledPlayerAnswerRequest(decision.reason!);
    return refuse(`${here}?${ERROR_PARAM}=${BUSY_ERROR}`, startedAt);
  }

  const jar = await cookies();
  const gateIsOpen = (jar.get(ANSWER_GATE_COOKIE)?.value ?? "") !== "";
  if (!gateIsOpen) {
    // Never a distinguishable error (would teach an automated caller to carry the cookie) — same uniform closed-link outcome as revoked/expired.
    return refuse(here, startedAt);
  }

  let destination: string;
  try {
    destination = await withTransaction(async (tx) => {
      const recorded = await consumeAnswerTokenIn(tx, token, { response, reason });

      // LAN-203, REQ-recruit-sees-public-only: a recruit has no events page
      // (that page's `readPlayerHomeIn` is roster-and-attendance exposure
      // this requirement forbids). Redirects back here instead, rendering
      // `AlreadyRecorded` with no durable credential minted.
      if (recorded.capacity === "recruit") {
        return here;
      }

      if (recorded.answer === "yes" && submissions.length > 0) {
        await answerEventQuestionsIn(tx, recorded.personId, recorded.invitationId, submissions);
      }
      const durable = await issuePersonTokenIn(tx, recorded.personId, recorded.seasonId);
      return `/events/${encodeURIComponent(durable.token)}?open=${encodeURIComponent(recorded.invitationId)}`;
    });
  } catch {
    return refuse(here, startedAt);
  }

  redirect(destination);
}

/**
 * "See all your events." from the already-recorded page — LAN-343.
 *
 * The page it links to needs a durable credential and the plaintext of one
 * cannot be recovered, so this mints one behind a click. A POST, deliberately:
 * the GET this page is reached by still writes nothing, which is the whole
 * posture a link pasted into WhatsApp depends on, and a preview crawler never
 * submits a form. The person is resolved from this link's own answer token,
 * never from anything the form carried.
 *
 * A recruit never reaches this: `page.tsx` renders `RecruitAlreadyRecorded`
 * for them, which offers no such link (`REQ-recruit-sees-public-only`).
 */
export async function openEventsPage(form: FormData): Promise<void> {
  const startedAt = startUniformClock();
  const token = typeof form.get("token") === "string" ? (form.get("token") as string) : "";
  const here = selfUrl(token);

  const requestHeaders = await headers();
  const decision = allowPlayerAnswerRequest(clientKeyFrom(requestHeaders), token);
  if (!decision.allowed) {
    logThrottledPlayerAnswerRequest(decision.reason!);
    return refuse(here, startedAt);
  }

  let destination: string;
  try {
    destination = await withTransaction(async (tx) => {
      const resolution = await resolveAnswerTokenIn(tx, token);
      if (resolution.state !== "valid" || resolution.invitation === null) {
        throw new Error("unresolved");
      }
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
