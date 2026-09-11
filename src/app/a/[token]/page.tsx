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
/** The generic club card (LAN-269) — names nothing: not the player, the event, or that a questionnaire exists. */
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

/** Questionnaire B's credential (LAN-206) is a bare opaque token (`TOKEN_PATTERN`), a shape the answer token can never produce, so this can't intercept an RSVP link. */
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

  // No write, including no cookie: `src/proxy.ts` sets the gate cookie on every GET, before this component (see `@/lib/rsvp/answer-gate.ts`).
  if (resolved.resolution.state === "cancelled") {
    return <Cancelled eventName={resolved.base.eventName} />;
  }

  const answer = resolved.resolution.answer as PlayerAnswer;
  const error = firstValue(query[ERROR_PARAM]);

  if (resolved.resolution.consumed) {
    // LAN-203: a recruit's actual "saved" landing — `submitAnswer` redirects them back here, not to `/me/[token]`, which they have no page at.
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
