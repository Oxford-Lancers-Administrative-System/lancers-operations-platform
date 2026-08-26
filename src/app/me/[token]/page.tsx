import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { withTransaction } from "@/lib/db";
import {
  allowPlayerHomeRequest,
  clientKeyFrom,
  logThrottledPlayerHomeRequest,
  withUniformTerminalTiming,
} from "@/lib/rsvp/public-surface";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import {
  readPlayerAnswerLandingIn,
  readPlayerHomeIn,
  type EventQuestionForAnswer,
  type PlayerAnswerLanding,
  type PlayerHome,
  type PlayerHomeInvitation,
} from "@/lib/services/player-home";

import { changeToYes, submitNo, submitQuestions } from "./actions";
import {
  ANSWER_NO,
  ANSWER_YES,
  ANSWERED_HEADING,
  BANNER,
  CHANGE,
  CHANGE_TO_NO,
  CHANGE_TO_YES,
  CLOSE_DETAIL,
  NEEDS_ANSWER_HEADING,
  NO_OUTSTANDING_EVENTS,
  NO_REASON_GIVEN,
  OUTSTANDING_QUESTIONS,
  PAGE_HEADING,
  PLANS_CHANGED,
  PRIVACY_NOTE,
  PUBLIC_CALENDAR_LINK,
  QUESTIONS_HEADING,
  REASON_LABEL,
  REASON_PLACEHOLDER,
  REASON_PROMPT,
  SAVE_QUESTIONS,
  SAVE_REASON,
  SEE_ANSWERED,
  STANDING_NO,
  STANDING_YES,
  eventTypeLabel,
} from "./presentation";

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
  readonly personId: string | null;
  readonly home: PlayerHome | null;
  readonly focused: PlayerAnswerLanding | null;
}

export default async function PlayerHomePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;
  const openInvitationId = firstValue(query.open);
  const reasonError = firstValue(query.reasonError) !== null;
  const changingToNo = firstValue(query.changingToNo) !== null;

  const resolved = await withUniformTerminalTiming<Resolved>(
    async () => {
      const requestHeaders = await headers();
      const decision = allowPlayerHomeRequest(clientKeyFrom(requestHeaders), token);
      if (!decision.allowed) {
        logThrottledPlayerHomeRequest(decision.reason!);
        return { personId: null, home: null, focused: null };
      }

      return withTransaction(async (tx) => {
        const resolution = await resolvePersonTokenIn(tx, token);
        if (resolution.state !== "valid" || !resolution.resolved) {
          return { personId: null, home: null, focused: null };
        }
        const home = await readPlayerHomeIn(tx, resolution.resolved.personId);
        const belongsToThisPerson =
          openInvitationId !== null &&
          [...home.needsAnswer, ...home.answeredUpcoming].some(
            (entry) => entry.invitationId === openInvitationId,
          );
        const focused = belongsToThisPerson
          ? await readPlayerAnswerLandingIn(tx, openInvitationId as string)
          : null;
        return { personId: resolution.resolved.personId, home, focused };
      });
    },
    (outcome) => outcome.personId === null,
  );

  if (resolved.personId === null || resolved.home === null) {
    notFound();
  }

  const { needsAnswer, answeredUpcoming } = resolved.home;
  const focusedInvitation =
    openInvitationId !== null
      ? ([...needsAnswer, ...answeredUpcoming].find(
          (entry) => entry.invitationId === openInvitationId,
        ) ?? null)
      : null;

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
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2, mb: 3 }}>
          <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
            {PAGE_HEADING}
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1 }}>
            {PRIVACY_NOTE}
          </Typography>
        </Paper>

        {focusedInvitation && resolved.focused ? (
          <FocusedPanel
            token={token}
            invitation={focusedInvitation}
            landing={resolved.focused}
            reasonError={reasonError}
            changingToNo={changingToNo || reasonError}
          />
        ) : null}

        {needsAnswer.length === 0 && answeredUpcoming.length === 0 ? (
          <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2 }}>
            <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>
              {NO_OUTSTANDING_EVENTS}
            </Typography>
            <Button href="/calendar" variant="outlined" sx={{ mt: 2, minHeight: 44 }}>
              {PUBLIC_CALENDAR_LINK}
            </Button>
          </Paper>
        ) : null}

        {needsAnswer.length > 0 ? (
          <Section heading={NEEDS_ANSWER_HEADING}>
            {needsAnswer.map((entry, index) => (
              <SummaryRow
                key={entry.invitationId}
                token={token}
                entry={entry}
                dominant={index === 0}
              />
            ))}
          </Section>
        ) : null}

        {answeredUpcoming.length > 0 ? (
          <Section heading={ANSWERED_HEADING}>
            {answeredUpcoming.map((entry) => (
              <SummaryRow key={entry.invitationId} token={token} entry={entry} dominant={false} />
            ))}
          </Section>
        ) : null}

        {needsAnswer.length === 0 && answeredUpcoming.length > 0 ? (
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2 }}>
            {SEE_ANSWERED}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2, mb: 3 }}>
      <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, mb: 2 }}>
        {heading}
      </Typography>
      <Stack spacing={2}>{children}</Stack>
    </Paper>
  );
}

function when(entry: PlayerHomeInvitation): string {
  const parts = [entry.scheduledOn, entry.startsAt].filter(Boolean);
  return parts.join(" · ");
}

function SummaryRow({
  token,
  entry,
  dominant,
}: {
  token: string;
  entry: PlayerHomeInvitation;
  dominant: boolean;
}) {
  const followUp =
    entry.standingAnswer === "no" && entry.reasonIsDefault
      ? NO_REASON_GIVEN
      : entry.outstandingRequiredQuestions > 0
        ? OUTSTANDING_QUESTIONS
        : null;

  return (
    <Box
      sx={{
        p: 2,
        border: "1px solid",
        borderColor: dominant ? "primary.main" : "grey.300",
        borderRadius: 1.5,
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ justifyContent: "space-between" }}
      >
        <Box>
          <Chip
            label={eventTypeLabel(entry.eventType)}
            size="small"
            color="primary"
            sx={{ mb: 0.75, fontWeight: 700 }}
          />
          <Typography sx={{ fontSize: dominant ? 18 : 16, fontWeight: dominant ? 700 : 600 }}>
            {entry.eventName}
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{when(entry)}</Typography>
          {entry.standingAnswer ? (
            <Chip
              label={entry.standingAnswer === "yes" ? STANDING_YES : STANDING_NO}
              size="small"
              color={entry.standingAnswer === "yes" ? "success" : "error"}
              sx={{ mt: 0.75 }}
            />
          ) : null}
          {followUp ? (
            <Typography sx={{ fontSize: 12, color: "warning.main", mt: 0.5, fontWeight: 600 }}>
              {followUp}
            </Typography>
          ) : null}
        </Box>
        <Button
          href={`/me/${encodeURIComponent(token)}?open=${encodeURIComponent(entry.invitationId)}`}
          variant={entry.standingAnswer === null ? "contained" : "outlined"}
          color={entry.standingAnswer === null ? "primary" : "inherit"}
          sx={{ minHeight: 44, alignSelf: { xs: "stretch", sm: "center" } }}
        >
          {entry.standingAnswer === null ? "Answer" : CHANGE}
        </Button>
      </Stack>
    </Box>
  );
}

function QuestionField({ question }: { question: EventQuestionForAnswer }) {
  const name = `q_${question.id}`;
  const kindField = (
    <input type="hidden" name={`qkind_${question.id}`} value={question.answerType} />
  );

  if (question.answerType === "boolean") {
    return (
      <>
        {kindField}
        <TextField
          select
          name={name}
          label={question.prompt}
          required={question.isRequired}
          fullWidth
          defaultValue={
            question.currentAnswer?.boolean === true
              ? "true"
              : question.currentAnswer?.boolean === false
                ? "false"
                : ""
          }
        >
          <MenuItem value="">(no answer)</MenuItem>
          <MenuItem value="true">Yes</MenuItem>
          <MenuItem value="false">No</MenuItem>
        </TextField>
      </>
    );
  }
  if (question.answerType === "choice") {
    return (
      <>
        {kindField}
        <TextField
          select
          name={name}
          label={question.prompt}
          required={question.isRequired}
          fullWidth
          defaultValue={question.currentAnswer?.choice ?? ""}
        >
          <MenuItem value="">(no answer)</MenuItem>
          {(question.choices ?? []).map((choice) => (
            <MenuItem key={choice} value={choice}>
              {choice}
            </MenuItem>
          ))}
        </TextField>
      </>
    );
  }
  return (
    <>
      {kindField}
      <TextField
        name={name}
        label={question.prompt}
        required={question.isRequired}
        fullWidth
        defaultValue={question.currentAnswer?.text ?? ""}
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />
    </>
  );
}

function FocusedPanel({
  token,
  invitation,
  landing,
  reasonError,
  changingToNo,
}: {
  token: string;
  invitation: PlayerHomeInvitation;
  landing: PlayerAnswerLanding;
  reasonError: boolean;
  changingToNo: boolean;
}) {
  // A standing Yes shows "changing your mind" as a lightly framed secondary
  // link rather than a permanently visible reason form — the wireframe's own
  // words: "visually secondary and lightly framed: 'Plans changed? You can
  // change your answer.'" A blank-looking mandatory field sitting under an
  // already-attending status the moment the page loads is exactly the
  // opposite of that, and independent visual review caught it in the
  // preflight screenshot before this comment existed.
  const showNoForm = invitation.standingAnswer !== "yes" || changingToNo;
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2.5, sm: 3 },
        borderRadius: 2,
        mb: 3,
        border: "2px solid",
        borderColor: "primary.main",
      }}
    >
      <Chip
        label={eventTypeLabel(invitation.eventType)}
        size="small"
        color="primary"
        sx={{ mb: 1, fontWeight: 700 }}
      />
      <Typography component="h2" sx={{ fontSize: 20, fontWeight: 700 }}>
        {invitation.eventName}
      </Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2 }}>
        {when(invitation)}
      </Typography>

      {invitation.standingAnswer === "yes" ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          {STANDING_YES}
        </Alert>
      ) : invitation.standingAnswer === "no" ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {invitation.reasonIsDefault
            ? `${STANDING_NO} — ${NO_REASON_GIVEN}`
            : `${STANDING_NO} — ${invitation.reason}`}
        </Alert>
      ) : null}

      {invitation.standingAnswer !== "yes" ? (
        <Box component="form" action={changeToYes} sx={{ mb: 2 }}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="invitationId" value={invitation.invitationId} />
          <Button
            type="submit"
            variant="contained"
            color="success"
            fullWidth
            sx={{ minHeight: 48 }}
          >
            {invitation.standingAnswer === null ? ANSWER_YES : CHANGE_TO_YES}
          </Button>
        </Box>
      ) : null}

      {!showNoForm ? (
        <Button
          href={`/me/${encodeURIComponent(token)}?open=${encodeURIComponent(invitation.invitationId)}&changingToNo=1`}
          variant="text"
          color="inherit"
          sx={{ minHeight: 40, fontWeight: 400, textTransform: "none" }}
        >
          {PLANS_CHANGED}
        </Button>
      ) : (
        <Box component="form" action={submitNo}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="invitationId" value={invitation.invitationId} />
          {invitation.standingAnswer !== null ? (
            <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>
              {REASON_PROMPT}
            </Typography>
          ) : null}
          <Stack spacing={1.5}>
            <TextField
              name="reason"
              label={REASON_LABEL}
              placeholder={REASON_PLACEHOLDER}
              required
              fullWidth
              error={reasonError}
              helperText={reasonError ? "Choose a reason before saving." : undefined}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
            <Button
              type="submit"
              variant={invitation.standingAnswer === null ? "outlined" : "contained"}
              color={invitation.standingAnswer === "yes" ? "inherit" : undefined}
              fullWidth
              sx={{ minHeight: 44 }}
            >
              {invitation.standingAnswer === "no"
                ? SAVE_REASON
                : invitation.standingAnswer === null
                  ? ANSWER_NO
                  : CHANGE_TO_NO}
            </Button>
          </Stack>
        </Box>
      )}

      {invitation.standingAnswer === "yes" && landing.questions.length > 0 ? (
        <Box component="form" action={submitQuestions} sx={{ mt: 3 }}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="invitationId" value={invitation.invitationId} />
          <Typography component="h3" sx={{ fontSize: 15, fontWeight: 700, mb: 1.5 }}>
            {QUESTIONS_HEADING}
          </Typography>
          <Stack spacing={2}>
            {landing.questions.map((question) => (
              <QuestionField key={question.id} question={question} />
            ))}
            <Button type="submit" variant="contained" sx={{ minHeight: 44 }}>
              {SAVE_QUESTIONS}
            </Button>
          </Stack>
        </Box>
      ) : null}

      <Button
        href={`/me/${encodeURIComponent(token)}`}
        variant="text"
        sx={{ mt: 2, minHeight: 40 }}
      >
        {CLOSE_DETAIL}
      </Button>
    </Paper>
  );
}
