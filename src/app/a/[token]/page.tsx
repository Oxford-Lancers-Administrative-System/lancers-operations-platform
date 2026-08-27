import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
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
import { formatDeadline, formatEventDate, formatEventTime } from "@/app/rsvp/[token]/presentation";

import { AutoSubmitOnInteraction } from "./auto-submit";
import { QuestionField } from "./question-field";
import { submitAnswer } from "./actions";
import { ANSWER_FORM_ID, ERROR_PARAM } from "./params";
import {
  ALREADY_RECORDED_HEADING,
  ALREADY_RECORDED_NOTE,
  BANNER,
  BUSY_ERROR,
  BUSY_MESSAGE,
  CANCELLED_HEADING,
  CANCELLED_NOTE,
  CHANGE_TO_YES,
  GIVE_REASON_AND_CONTINUE,
  NO_EXPLANATION,
  NO_HEADING,
  PLANS_CHANGED,
  PRIVACY_NOTE,
  QUESTIONS_HEADING,
  REASON_LABEL,
  REASON_PLACEHOLDER,
  REASON_PROMPT,
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
  const date = formatEventDate(base.scheduledOn);
  const time = formatEventTime(base.startsAt, base.endsAt);
  const when = [date, time].filter(Boolean).join(" · ") || null;
  const deadline = formatDeadline(base.responseDeadline);
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
        {base.playerName ? <Fact label="Player" value={base.playerName} /> : null}
        {base.venue ? <Fact label="Venue" value={base.venue} /> : null}
        {deadline ? <Fact label="Response deadline" value={deadline} /> : null}
        <Fact label="Your answer" value={answer === "yes" ? YES_HEADING : "You're not attending"} />
      </Box>
      {attending ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>{attending}</Typography>
      ) : null}
      {otherOutstanding ? (
        <Alert severity="info" sx={{ mt: 1, mb: 1 }}>
          {otherOutstanding}
        </Alert>
      ) : null}

      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2, mb: 2 }}>
        {PRIVACY_NOTE}
      </Typography>

      {/*
        Owner correction round 5 (OWNER-LAN172-12, OWNER-LAN172-13): the
        follow-up itself — the event's own questions for a Yes, the reason
        field for a No — is asked right here, in the same form as the
        confirm button, so one submit both records the answer and saves it.
        W2 line 61: the Yes landing "asks applicable event questions"; the
        No-path section: "the reason field belongs on that page."

        Owner correction round 6 (OWNER-LAN172-17), gated by Q-30 in round 7
        (LAN-172-r5-F1): this exact form is what `AutoSubmitOnInteraction`
        below submits itself, in a JS-capable browser, the moment the player
        first interacts with the page — a real pointer, key, touch or scroll,
        never on mount alone (an unconditional mount-fire let any JS-executing
        automated visitor, including a security scanner, complete this write
        with no human action at all — exactly what REQ-no-false-rsvp forbids).
        `id={ANSWER_FORM_ID}` is how that component finds this form; nothing
        else about the form changes for that purpose, so the unmodified
        visible button remains Q-11's own fallback — for no JavaScript, and
        now also for a human who reads without ever touching the screen.

        Owner correction round 6 (OWNER-LAN172-18): `enforceRequired={false}`
        below means a blank required question never blocks this submit,
        whether it fires automatically or from a human's own click — the
        answer is never gated on a question, per W2 acceptance criterion 6.
      */}
      <Box id={ANSWER_FORM_ID} component="form" action={submitAnswer}>
        <input type="hidden" name="token" value={token} />

        {answer === "yes" && landing.questions.length > 0 ? (
          <Stack spacing={2} sx={{ mb: 3 }}>
            <Typography component="h2" sx={{ fontSize: 15, fontWeight: 700 }}>
              {QUESTIONS_HEADING}
            </Typography>
            {landing.questions.map((question) => (
              <QuestionField key={question.id} question={question} enforceRequired={false} />
            ))}
          </Stack>
        ) : null}

        {answer === "no" ? (
          <Stack spacing={1.5} sx={{ mb: 3 }}>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{REASON_PROMPT}</Typography>
            <TextField
              name="reason"
              label={REASON_LABEL}
              placeholder={REASON_PLACEHOLDER}
              fullWidth
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
          </Stack>
        ) : null}

        {/*
          Emphasis always points at Yes (Brian, 2026-08-25): the Yes button is
          filled. On the No page, `REQ-emphasis-points-at-yes` puts the same
          rule on two controls at once — "Give a reason and continue"
          completes the No and stays unfilled; "Change to Yes" is the
          affirmative action and gets W2's own "primary treatment." Neither
          is a second continue control competing with the other — W2: "Give
          a reason and continue is the single forward action."
        */}
        {answer === "no" ? (
          <Stack direction="row" spacing={1.5}>
            <Button
              type="submit"
              name="intent"
              value="answer"
              variant="outlined"
              color="inherit"
              fullWidth
              sx={{ minHeight: 48 }}
            >
              {GIVE_REASON_AND_CONTINUE}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="change-to-yes"
              variant="contained"
              color="success"
              fullWidth
              sx={{ minHeight: 48 }}
            >
              {CHANGE_TO_YES}
            </Button>
          </Stack>
        ) : (
          <Button
            type="submit"
            variant="contained"
            color="success"
            fullWidth
            sx={{ minHeight: 48 }}
          >
            {confirmLabel(answer, landing.questions.length > 0)}
          </Button>
        )}
      </Box>

      {/*
        Owner correction round 6 (OWNER-LAN172-17), interaction-gated by Q-30
        in round 7. `busy` means an earlier submit was already refused as
        rate-limited and redirected back here — arming the listener again
        immediately would let the player's very next scroll retry against the
        same limiter with no pause to read `BUSY_MESSAGE`, so this one case is
        left to the visible button instead. Every other load arms the
        listener once and waits for a genuine interaction, per
        `AutoSubmitOnInteraction`'s own guard.
      */}
      {!busy ? <AutoSubmitOnInteraction formId={ANSWER_FORM_ID} /> : null}

      {/*
        W2's Yes-path bullet, quoted verbatim: "Changing to No remains
        available but visually secondary and lightly framed." A separate,
        small form — abandoning the questions being filled above is exactly
        what choosing this does, the same trade `/me/[token]`'s own "Plans
        changed?" already makes.
      */}
      {answer === "yes" ? (
        <Box component="form" action={submitAnswer} sx={{ mt: 2 }}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="intent" value="change-to-no" />
          <Button
            type="submit"
            variant="text"
            color="inherit"
            sx={{ minHeight: 40, fontWeight: 400, textTransform: "none" }}
          >
            {PLANS_CHANGED}
          </Button>
        </Box>
      ) : null}
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
