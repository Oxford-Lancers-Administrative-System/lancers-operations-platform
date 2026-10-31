import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { TOKEN_LINK_METADATA } from "@/lib/brand";

import { withTransaction } from "@/lib/db";
import {
  allowPlayerAnswerRequest,
  clientKeyFrom,
  logThrottledPlayerAnswerRequest,
  withUniformTerminalTiming,
} from "@/lib/rsvp/public-surface";
import { isPreviewAgent } from "@/lib/rsvp/preview-agents";
import { readPlayerAnswerLandingIn, type PlayerAnswerLanding } from "@/lib/services/player-home";
import {
  answerForSegment,
  readAnswerTokenChannelIn,
  resolveAnswerTokenIn,
  type AnswerTokenChannel,
  type AnswerTokenResolution,
  type PlayerAnswer,
} from "@/lib/services/player-answer-tokens";
import { readSignedRsvpPageIn, type SignedRsvpPage } from "@/lib/services/rsvp";

import { ERROR_PARAM, SAVED_PARAM } from "./params";
import { BUSY_ERROR, UNSAVED_ERROR } from "./presentation";
import { Confirm, type SaveMode } from "./confirm-panel";
import { AlreadyRecorded, Cancelled, RecruitAlreadyRecorded } from "./terminal-panels";

/**
 * The WhatsApp/email answer link — `/a/yes/<t>` and `/a/no/<t>` (LAN-343;
 * LAN-172 shipped it as one `/a/<t>`). A public token surface: token
 * resolution, throttling and the not-found state stay exactly here. This GET
 * writes nothing at all, not even a use counter — a scanner or link preview
 * is guaranteed to fetch it before any human does. The cookie that gates the
 * POST is set by `src/proxy.ts`, not here — a Server Component's render may
 * not set cookies. Step screens split into `confirm-panel.tsx` and
 * `terminal-panels.tsx` (LAN-300).
 *
 * The answer is in the path because Meta's URL button takes a fixed base plus
 * one dynamic suffix, so two buttons need two bases. It is **also** still
 * inside the hashed token, and the two must agree: a Yes token presented at
 * `/a/no/` resolves to nothing, exactly as an invented token does. The segment
 * is therefore a route, never a claim — what the click means is still decided
 * by the digest.
 *
 * Questionnaire B left this route with LAN-343: a recruit's football
 * background is its own message with its own credential, and it lives at
 * `/background/<t>`.
 */
/** The generic club card (LAN-269) — names nothing: not the player, the event, or the answer. */
export const metadata: Metadata = TOKEN_LINK_METADATA;

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ answer: string; token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface Resolved {
  readonly resolution: AnswerTokenResolution;
  readonly base: SignedRsvpPage | null;
  readonly landing: PlayerAnswerLanding | null;
  readonly channel: AnswerTokenChannel | null;
}

const UNRESOLVED: Resolved = {
  resolution: {
    state: "unknown",
    answer: null,
    invitation: null,
    writable: false,
    consumed: false,
  },
  base: null,
  landing: null,
  channel: null,
};

export default async function AnswerLinkPage({ params, searchParams }: PageProps) {
  const { answer: segment, token } = await params;
  const query = await searchParams;
  const expected = answerForSegment(segment);

  const resolved = await withUniformTerminalTiming<Resolved>(
    async () => {
      // An unknown segment costs no database round trip and is the same
      // terminal outcome as an unknown token — held to the same floor below,
      // so which of the two was wrong is not visible from outside.
      if (expected === null) return UNRESOLVED;

      const requestHeaders = await headers();
      const decision = allowPlayerAnswerRequest(clientKeyFrom(requestHeaders), token);
      if (!decision.allowed) {
        logThrottledPlayerAnswerRequest(decision.reason!);
        return UNRESOLVED;
      }

      return withTransaction(async (tx) => {
        const resolution = await resolveAnswerTokenIn(tx, token);
        if (resolution.invitation === null) {
          return { resolution, base: null, landing: null, channel: null };
        }
        // The path said one thing and the hashed token says another. Uniform
        // with every other way this link fails to resolve: nothing about
        // which half disagreed reaches the visitor.
        if (resolution.answer !== expected) return UNRESOLVED;
        const [base, landing, channel] = await Promise.all([
          readSignedRsvpPageIn(tx, resolution.invitation.invitationId),
          readPlayerAnswerLandingIn(tx, resolution.invitation.invitationId),
          readAnswerTokenChannelIn(tx, token),
        ]);
        return { resolution, base, landing, channel };
      });
    },
    (outcome) => outcome.base === null || outcome.resolution.state === "event_started",
  );

  if (resolved.base === null || resolved.resolution.state === "event_started") {
    notFound();
  }

  // No write, including no cookie: `src/proxy.ts` sets the gate cookie on every GET, before this component (see `@/lib/rsvp/answer-gate.ts`).
  if (resolved.resolution.state === "cancelled") {
    return <Cancelled eventName={resolved.base.eventName} />;
  }

  const answer = resolved.resolution.answer as PlayerAnswer;
  const error = firstValue(query[ERROR_PARAM]);
  const previewAgent = isPreviewAgent((await headers()).get("user-agent"));

  // LAN-376. This used to key off `resolution.consumed`, so a second tap of a
  // button the player had already used dead-ended here with no way to change
  // anything — the whole of Brian's "flipping yes and no leaves the answer
  // stuck". A consumed token now renders the confirm screen again and records
  // again. The saved page is reached by the one redirect that lands here:
  // LAN-203's recruit landing, which has no `/events/<t>` page to go to.
  if (firstValue(query[SAVED_PARAM]) !== null) {
    return resolved.base.capacity === "recruit" ? (
      <RecruitAlreadyRecorded answer={answer} base={resolved.base} />
    ) : (
      <AlreadyRecorded token={token} />
    );
  }

  return (
    <Confirm
      token={token}
      answer={answer}
      base={resolved.base}
      landing={resolved.landing as PlayerAnswerLanding}
      mode={saveModeFor({
        error,
        previewAgent,
        channel: resolved.channel,
        answer,
        base: resolved.base,
      })}
    />
  );
}

/**
 * LAN-498 (Brian, 31 October 2026). A WhatsApp link saves on load; anything
 * else — email, or a channel the record cannot prove — keeps the interaction
 * gate, because mail scanners run script. Never from the query string: the
 * channel is read off the token's own delivery record.
 *
 * A known preview fetcher or crawler (`preview-agents.ts`) gets the page with
 * nothing armed at all, on either channel; `submitAnswer` refuses it too.
 *
 * Any standing answer keeps the gate, the same answer as the link's
 * included. Reopening an old WhatsApp tab must not silently turn a later No
 * back into Yes, nor replace a No's reason ("Injured") or a Yes's question
 * answers with the link's bare answer. LAN-376's rule still holds — the tap
 * records, last recorded wins — but it takes the player's own touch or button.
 */
function saveModeFor({
  error,
  previewAgent,
  channel,
  answer,
  base,
}: {
  error: string | null;
  previewAgent: boolean;
  channel: AnswerTokenChannel | null;
  answer: PlayerAnswer;
  base: SignedRsvpPage;
}): SaveMode {
  if (error === BUSY_ERROR) return "busy";
  if (error === UNSAVED_ERROR) return "unsaved";
  if (previewAgent) return "manual";
  const standing = base.currentResponse?.response ?? null;
  if (channel === "whatsapp" && standing === null) return "on-load";
  return "on-interaction";
}
