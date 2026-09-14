import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { PublicShell } from "@/components/public-shell";
import { QuestionField } from "@/components/question-field";
import { TOKEN_LINK_METADATA } from "@/lib/brand";

import { withTransaction } from "@/lib/db";
import {
  allowRsvpRequest,
  clientKeyFrom,
  logThrottledRsvpRequest,
  withUniformTerminalTiming,
} from "@/lib/rsvp/public-surface";
import { readPlayerAnswerLandingIn, type PlayerAnswerLanding } from "@/lib/services/player-home";
import { readSignedRsvpPageIn, type SignedRsvpPage } from "@/lib/services/rsvp";
import { resolveRsvpTokenIn } from "@/lib/services/rsvp-tokens";

import { saveEventQuestions } from "./actions";
import {
  BUSY_ERROR,
  BUSY_MESSAGE,
  formatEventDate,
  formatEventTime,
  NOTHING_OUTSTANDING_HEADING,
  NOTHING_OUTSTANDING_NOTE,
  QUESTIONS_HEADING,
  SAVE_QUESTIONS,
  SAVED_NOTICE,
} from "./presentation";

/**
 * `/questions/<t>` — the nudge's own page, LAN-343.
 *
 * The nudge asks for one thing: the event's own questions, for a player whose
 * Yes already stands. Until now the message linked at `/rsvp/<t>`, which is
 * the answer page and asks nothing, and the questions were reachable only by
 * expanding a row on the player's events page — so the one message about them
 * did not go to them.
 *
 * The credential is the per-invitation RSVP access token the nudge's own
 * dispatch already mints, and the invitation is resolved from the token alone:
 * no query string, because a Meta dynamic URL button appends exactly one
 * suffix and there is nowhere else to put anything.
 *
 * This GET writes nothing — not a use counter, not a stamp.
 * `resolveRsvpTokenIn` has been a pure read since LAN-269, for the reason this
 * route inherits: the link is pasted into WhatsApp, and a preview crawler
 * fetches it before the player does.
 */
/** The generic club card (LAN-269) — names neither the player nor the event. */
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
  readonly page: SignedRsvpPage | null;
  readonly landing: PlayerAnswerLanding | null;
}

export default async function EventQuestionsPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;
  const saved = firstValue(query.saved) === "1";
  const busy = firstValue(query.error) === BUSY_ERROR;

  const resolved = await withUniformTerminalTiming<Resolved>(
    async () => {
      const requestHeaders = await headers();
      const decision = allowRsvpRequest(clientKeyFrom(requestHeaders), token);
      if (!decision.allowed) {
        logThrottledRsvpRequest(decision.reason!);
        return { page: null, landing: null };
      }

      return withTransaction(async (tx) => {
        const resolution = await resolveRsvpTokenIn(tx, token);
        // Only `valid`. Every other state — unknown, expired, revoked,
        // superseded, event started, cancelled — is one uniform response, the
        // contract LAN-79 set for this token family: there is nothing left to
        // answer in any of them, and which one it was is not the visitor's to
        // learn.
        if (resolution.state !== "valid" || resolution.invitation === null) {
          return { page: null, landing: null };
        }
        const [page, landing] = await Promise.all([
          readSignedRsvpPageIn(tx, resolution.invitation.invitationId),
          readPlayerAnswerLandingIn(tx, resolution.invitation.invitationId),
        ]);
        return { page, landing };
      });
    },
    (outcome) => outcome.page === null,
  );

  if (resolved.page === null || resolved.landing === null) {
    notFound();
  }

  const page = resolved.page;
  const landing = resolved.landing;
  const when =
    [formatEventDate(page.scheduledOn), formatEventTime(page.startsAt, page.endsAt)]
      .filter(Boolean)
      .join(" · ") || null;

  return (
    <PublicShell layout="stack">
      <Stack spacing={3}>
        <Typography variant="overline" color="text.secondary">
          {page.templateName}
        </Typography>
        <PageHeader
          title={landing.questions.length > 0 ? QUESTIONS_HEADING : NOTHING_OUTSTANDING_HEADING}
          subtitle={when ? `${page.eventName} · ${when}` : page.eventName}
        />

        {busy ? <Notice severity="warning">{BUSY_MESSAGE}</Notice> : null}
        {saved ? <Notice severity="success">{SAVED_NOTICE}</Notice> : null}

        {landing.questions.length > 0 ? (
          <Box component="form" action={saveEventQuestions}>
            <input type="hidden" name="token" value={token} />
            <Stack spacing={2}>
              {landing.questions.map((question) => (
                <QuestionField key={question.id} question={question} />
              ))}
              <Button type="submit" variant="contained" sx={{ minHeight: 48 }}>
                {SAVE_QUESTIONS}
              </Button>
            </Stack>
          </Box>
        ) : (
          <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
            {NOTHING_OUTSTANDING_NOTE}
          </Typography>
        )}
      </Stack>
    </PublicShell>
  );
}
