import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

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

import { submitAnswer } from "./actions";
import { ERROR_PARAM } from "./params";
import {
  ALREADY_RECORDED_HEADING,
  ALREADY_RECORDED_NOTE,
  BANNER,
  BUSY_ERROR,
  BUSY_MESSAGE,
  CANCELLED_HEADING,
  CANCELLED_NOTE,
  NO_EXPLANATION,
  NO_HEADING,
  PRIVACY_NOTE,
  YES_HEADING,
  attendingSentence,
  cancelledSentence,
  confirmLabel,
  eventTypeLabel,
  otherOutstandingSentence,
} from "./presentation";

/**
 * The WhatsApp/email answer link — LAN-172, W2-01 through W2-04, Q-11's
 * release gate.
 *
 * ## This GET writes nothing at all
 *
 * Not even a use counter. `REQ-no-false-rsvp` requires the GET to be entirely
 * side-effect-free, which is stricter than LAN-79's own page (that one bumps
 * `rsvp_access_tokens.use_count` on every valid read) — deliberately, because
 * this is the one URL Meta's own click-tracking hop, a corporate scanner and a
 * link preview are all guaranteed to fetch before any human does.
 *
 * The cookie that gates the POST is set by `src/proxy.ts`, not here — a Server
 * Component's render may not set cookies in this framework, and routing that
 * concern through the proxy is what keeps this file a pure read.
 */
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

export default async function AnswerLinkPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;

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
    return <AlreadyRecorded />;
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "grey.100", py: { xs: 3, sm: 6 }, px: 2 }}>
      <Box sx={{ maxWidth: 720, mx: "auto" }}>
        <Typography
          component="p"
          sx={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "text.secondary",
            mb: 2,
          }}
        >
          {BANNER}
        </Typography>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2 }}>
          {children}
        </Paper>
      </Box>
    </Box>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography
        component="dt"
        sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary", mb: 0.5 }}
      >
        {label}
      </Typography>
      <Typography component="dd" sx={{ m: 0, fontSize: 15, color: "text.primary" }}>
        {value}
      </Typography>
    </Box>
  );
}

function Confirm({
  token,
  answer,
  base,
  landing,
  busy,
}: {
  token: string;
  answer: PlayerAnswer;
  base: SignedRsvpPage;
  landing: PlayerAnswerLanding;
  busy: boolean;
}) {
  const when = [base.scheduledOn, base.startsAt].filter(Boolean).join(" · ") || null;
  const attending = attendingSentence(landing.attendingCount);
  const otherOutstanding = otherOutstandingSentence(landing.otherOutstandingCount);

  return (
    <Shell>
      <Chip
        label={eventTypeLabel(base.eventType)}
        size="small"
        color="primary"
        sx={{ mb: 1.5, fontWeight: 700, letterSpacing: "0.04em" }}
      />
      <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
        {answer === "yes" ? YES_HEADING : NO_HEADING}
      </Typography>
      <Typography sx={{ fontSize: { xs: 17, sm: 19 }, fontWeight: 600, mt: 1 }}>
        {base.eventName}
        {when ? ` · ${when}` : ""}
      </Typography>

      {answer === "no" ? (
        <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1.5 }}>
          {NO_EXPLANATION}
        </Typography>
      ) : null}

      {busy ? (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {BUSY_MESSAGE}
        </Alert>
      ) : null}

      <Box
        component="dl"
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 2.5,
          mt: 3,
          mb: 1,
        }}
      >
        {base.venue ? <Fact label="Venue" value={base.venue} /> : null}
        {attending ? <Fact label="Attendance so far" value={attending} /> : null}
      </Box>
      {otherOutstanding ? (
        <Alert severity="info" sx={{ mt: 1, mb: 1 }}>
          {otherOutstanding}
        </Alert>
      ) : null}
      {answer === "yes" && landing.questions.length > 0 ? (
        <Alert severity="info" sx={{ mt: 1, mb: 1 }}>
          This event has {landing.questions.length === 1 ? "a question" : "questions"} for you to
          answer next, on your own page.
        </Alert>
      ) : null}

      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2, mb: 2 }}>
        {PRIVACY_NOTE}
      </Typography>

      <Box component="form" action={submitAnswer}>
        <input type="hidden" name="token" value={token} />
        {/*
          Emphasis always points at Yes (Brian, 2026-08-25): the Yes button is
          filled, and the No button — even though it is the only control on
          this page, with nothing to be visually secondary *to* — stays
          unfilled. The rule is chosen by what the action means, not by
          whether it is sharing the row with something else.
        */}
        <Button
          type="submit"
          variant={answer === "yes" ? "contained" : "outlined"}
          color={answer === "yes" ? "success" : "inherit"}
          fullWidth
          sx={{ minHeight: 48 }}
        >
          {confirmLabel(answer)}
        </Button>
      </Box>
    </Shell>
  );
}

function AlreadyRecorded() {
  return (
    <Shell>
      <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
        {ALREADY_RECORDED_HEADING}
      </Typography>
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1.5 }}>
        {ALREADY_RECORDED_NOTE}
      </Typography>
    </Shell>
  );
}

function Cancelled({ eventName }: { eventName: string }) {
  return (
    <Shell>
      <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
        {CANCELLED_HEADING}
      </Typography>
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
        {cancelledSentence(eventName)}
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 2 }}>
        {CANCELLED_NOTE}
      </Typography>
    </Shell>
  );
}
