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
import { readPlayerAnswerLandingIn, type PlayerAnswerLanding } from "@/lib/services/player-home";
import {
  resolveAnswerTokenIn,
  type AnswerTokenResolution,
  type PlayerAnswer,
} from "@/lib/services/player-answer-tokens";
import { readSignedRsvpPageIn, type SignedRsvpPage } from "@/lib/services/rsvp";
import { TOKEN_PATTERN } from "@/lib/services/rsvp-tokens";
import { resolveRecruitmentInterestTokenIn } from "@/lib/services/recruitment-interest-tokens";
import { readRecruitmentProspectIn } from "@/lib/services/recruitment-prospect";

import { QuestionnaireBScreen } from "./interest-questionnaire";
import { ERROR_PARAM } from "./params";
import { BUSY_ERROR } from "./presentation";
import { Confirm } from "./confirm-panel";
import { AlreadyRecorded, Cancelled, RecruitAlreadyRecorded } from "./terminal-panels";

/**
 * The WhatsApp/email answer link. A public token surface: token resolution,
 * throttling and the not-found state stay exactly here. This GET writes
 * nothing at all, not even a use counter — a scanner or link preview is
 * guaranteed to fetch it before any human does. The cookie that gates the
 * POST is set by `src/proxy.ts`, not here — a Server Component's render may
 * not set cookies. Step screens split into `confirm-panel.tsx` and
 * `terminal-panels.tsx` (LAN-300).
 *
 * Decision history: docs/ux/tickets/LAN-172-player-answer.md.
 */
/**
 * The generic club card — LAN-269.
 *
 * This link is the one a player taps straight out of a WhatsApp message, and
 * the questionnaire behind it is the most personal surface in the application.
 * The card names nothing: not the player, not the event, not that a
 * questionnaire exists. `TOKEN_LINK_METADATA` says why.
 */
export const metadata: Metadata = TOKEN_LINK_METADATA;

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
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
}

/**
 * Questionnaire B's own credential — LAN-206 — is a bare, opaque token
 * (`TOKEN_PATTERN`: 43 URL-safe characters, no dots), a shape the answer
 * token below can never produce (`ANSWER_TOKEN_PATTERN` always carries two
 * literal dots and a leading `y`/`n`). Trying this resolution first can
 * therefore never intercept an RSVP link; falling through to the unchanged
 * RSVP resolution below is exactly what happens for every token that is not
 * this shape, `TOKEN_PATTERN` match or not.
 */
async function tryQuestionnaireB(token: string, saved: boolean, edit: boolean) {
  if (!TOKEN_PATTERN.test(token)) return null;

  return withTransaction(async (tx) => {
    const resolution = await resolveRecruitmentInterestTokenIn(tx, token);
    if (resolution.state !== "valid" || !resolution.resolved) return { found: false as const };

    const prospect = await readRecruitmentProspectIn(tx, resolution.resolved.prospectId);
    if (!prospect) return { found: false as const };

    const hasAnyAnswer = Object.values(prospect.answers).some((value) => value !== null);

    return {
      found: true as const,
      screen: (
        <QuestionnaireBScreen
          token={token}
          displayName={prospect.displayName}
          answers={prospect.answers}
          saved={saved}
          edit={edit}
          hasAnyAnswer={hasAnyAnswer}
        />
      ),
    };
  });
}

export default async function AnswerLinkPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;

  const questionnaireB = await tryQuestionnaireB(
    token,
    firstValue(query.saved) === "1",
    firstValue(query.edit) === "1",
  );
  if (questionnaireB) {
    if (!questionnaireB.found) notFound();
    return questionnaireB.screen;
  }

  const resolved = await withUniformTerminalTiming<Resolved>(
    async () => {
      const requestHeaders = await headers();
      const decision = allowPlayerAnswerRequest(clientKeyFrom(requestHeaders), token);
      if (!decision.allowed) {
        logThrottledPlayerAnswerRequest(decision.reason!);
        return {
          resolution: {
            state: "unknown",
            answer: null,
            invitation: null,
            writable: false,
            consumed: false,
          },
          base: null,
          landing: null,
        };
      }

      return withTransaction(async (tx) => {
        const resolution = await resolveAnswerTokenIn(tx, token);
        if (resolution.invitation === null) {
          return { resolution, base: null, landing: null };
        }
        const [base, landing] = await Promise.all([
          readSignedRsvpPageIn(tx, resolution.invitation.invitationId),
          readPlayerAnswerLandingIn(tx, resolution.invitation.invitationId),
        ]);
        return { resolution, base, landing };
      });
    },
    (outcome) => outcome.base === null || outcome.resolution.state === "event_started",
  );

  if (resolved.base === null || resolved.resolution.state === "event_started") {
    notFound();
  }

  // This GET makes no write of any kind, including no cookie — a Server
  // Component's render may not set one in this framework. The gate cookie
  // `actions.ts` checks is set by `src/proxy.ts` instead, on every GET to this
  // exact path, before the request ever reaches this component. See
  // `@/lib/rsvp/answer-gate.ts` for why presence alone is the whole check.

  if (resolved.resolution.state === "cancelled") {
    return <Cancelled eventName={resolved.base.eventName} />;
  }

  const answer = resolved.resolution.answer as PlayerAnswer;
  const error = firstValue(query[ERROR_PARAM]);

  if (resolved.resolution.consumed) {
    // LAN-203. This is a recruit's actual "saved" landing — `submitAnswer`
    // redirects a recruit straight back to this route rather than to
    // `/me/[token]`, which they have no page at, so the token this GET
    // re-resolves is already consumed by the time it renders. The player
    // copy names "your own page", which does not exist for a recruit.
    return resolved.base.capacity === "recruit" ? (
      <RecruitAlreadyRecorded answer={answer} base={resolved.base} />
    ) : (
      <AlreadyRecorded />
    );
  }

  return (
    <Confirm
      token={token}
      answer={answer}
      base={resolved.base}
      landing={resolved.landing as PlayerAnswerLanding}
      busy={error === BUSY_ERROR}
    />
  );
}
