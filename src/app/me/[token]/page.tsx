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
  needsFollowUp,
  readPlayerAnswerLandingIn,
  readPlayerHomeIn,
  type EventQuestionForAnswer,
  type PlayerAnswerLanding,
  type PlayerHome,
  type PlayerHomeInvitation,
} from "@/lib/services/player-home";

import { changeToYes, submitNo, submitQuestions } from "./actions";
import {
  ADD_REASON,
  ANSWERED_HEADING,
  ANSWERED_HELP,
  ANSWER_NO,
  ANSWER_QUESTIONS,
  ANSWER_YES,
  attendingSentence,
  AWAITING_ANSWER_CHIP,
  BANNER,
  CHANGE_TO_NO,
  CHANGE_TO_YES,
  CLOSE_DETAIL,
  EDIT_REASON,
  EMPTY_HELP,
  FOLLOW_UP_HEADING,
  FOLLOW_UP_NO_REASON_SENTENCE,
  FOLLOW_UP_QUESTIONS_SENTENCE,
  formatDeadline,
  formatEventDate,
  formatEventTime,
  FURTHER_OUT_HEADING,
  FURTHER_OUT_HELP,
  FURTHER_OUT_SUMMARY,
  HEADING_HELP,
  NEW_INVITATIONS_HEADING,
  NEXT_CHIP,
  NO_REASON_GIVEN,
  otherOutstandingSentence,
  OUTSTANDING_QUESTIONS,
  PLANS_CHANGED,
  pageHeading,
  PRIVACY_NOTE,
  PUBLIC_CALENDAR_LINK,
  QUESTIONS_HEADING,
  QUESTIONS_RECORDED,
  REASON_LABEL,
  REASON_PLACEHOLDER,
  REASON_PROMPT,
  SAVE_QUESTIONS,
  SAVE_REASON,
  STANDING_NO,
  STANDING_YES,
  STILL_NEED_ANSWER_HEADING,
  STILL_NEED_ANSWER_SENTENCE,
  answeredSentence,
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

/** Every invitation across the four near-term buckets plus further-out, flattened once. */
function allEntries(home: PlayerHome): readonly PlayerHomeInvitation[] {
  return [
    ...home.newInvitations,
    ...home.stillNeedAnswer,
    ...home.followUpNeeded,
    ...home.answeredUpcoming,
    ...home.furtherOut,
  ];
}

export default async function PlayerHomePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;
  const openInvitationId = firstValue(query.open);
  const reasonError = firstValue(query.reasonError) !== null;

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
          allEntries(home).some((entry) => entry.invitationId === openInvitationId);
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

  const home = resolved.home;
  const focusedInvitation =
    openInvitationId !== null
      ? (allEntries(home).find((entry) => entry.invitationId === openInvitationId) ?? null)
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
          {/*
            Brian, 2026-08-26: the player's own name at the top, so they know
            they are on the right page. Nothing else personal — the approved
            mockup's own heading (a count of outstanding work) still leads.
          */}
          {home.playerName ? (
            <Typography
              component="p"
              sx={{ fontSize: 13, fontWeight: 700, color: "text.secondary", mb: 0.5 }}
            >
              {home.playerName}
            </Typography>
          ) : null}
          <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
            {pageHeading(home.outstandingCount)}
          </Typography>
          <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1 }}>
            {home.outstandingCount === 0 ? EMPTY_HELP : HEADING_HELP}
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1.5 }}>
            {PRIVACY_NOTE}
          </Typography>
        </Paper>

        {focusedInvitation && resolved.focused ? (
          <FocusedPanel
            token={token}
            invitation={focusedInvitation}
            landing={resolved.focused}
            reasonError={reasonError}
          />
        ) : null}

        {home.newInvitations.length > 0 ? (
          <Section heading={NEW_INVITATIONS_HEADING}>
            {home.newInvitations.map((entry) => (
              <SummaryRow
                key={entry.invitationId}
                token={token}
                entry={entry}
                dominant={entry.invitationId === home.nextInvitationId}
              />
            ))}
          </Section>
        ) : null}

        {home.stillNeedAnswer.length > 0 ? (
          <Section heading={STILL_NEED_ANSWER_HEADING}>
            {home.stillNeedAnswer.map((entry) => (
              <SummaryRow
                key={entry.invitationId}
                token={token}
                entry={entry}
                dominant={entry.invitationId === home.nextInvitationId}
              />
            ))}
          </Section>
        ) : null}

        {home.followUpNeeded.length > 0 ? (
          <Section heading={FOLLOW_UP_HEADING}>
            {home.followUpNeeded.map((entry) => (
              <SummaryRow key={entry.invitationId} token={token} entry={entry} dominant={false} />
            ))}
          </Section>
        ) : null}

        {home.answeredUpcoming.length > 0 ? (
          <Section heading={ANSWERED_HEADING} help={ANSWERED_HELP}>
            {home.answeredUpcoming.map((entry) => (
              <SummaryRow key={entry.invitationId} token={token} entry={entry} dominant={false} />
            ))}
          </Section>
        ) : null}

        {home.furtherOut.length > 0 ? (
          <Box
            component="details"
            sx={{
              mb: 3,
              borderRadius: 2,
              bgcolor: "background.paper",
              "& summary": {
                cursor: "pointer",
                listStyle: "none",
                p: { xs: 2.5, sm: 3 },
                borderRadius: 2,
                fontWeight: 700,
                fontSize: 16,
              },
              "& summary::-webkit-details-marker": { display: "none" },
            }}
          >
            <Box component="summary">{FURTHER_OUT_SUMMARY}</Box>
            <Box sx={{ px: { xs: 2.5, sm: 3 }, pb: { xs: 2.5, sm: 3 } }}>
              <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, mb: 0.5 }}>
                {FURTHER_OUT_HEADING}
              </Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2 }}>
                {FURTHER_OUT_HELP}
              </Typography>
              <Stack spacing={2}>
                {home.furtherOut.map((entry) => (
                  <SummaryRow
                    key={entry.invitationId}
                    token={token}
                    entry={entry}
                    dominant={false}
                  />
                ))}
              </Stack>
            </Box>
          </Box>
        ) : null}

        {home.outstandingCount === 0 ? (
          <Button href="/calendar" variant="outlined" sx={{ mt: 1, minHeight: 44 }}>
            {PUBLIC_CALENDAR_LINK}
          </Button>
        ) : null}
      </Box>
    </Box>
  );
}

function Section({
  heading,
  help,
  children,
}: {
  heading: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2, mb: 3 }}>
      <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, mb: help ? 0.5 : 2 }}>
        {heading}
      </Typography>
      {help ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2 }}>{help}</Typography>
      ) : null}
      <Stack spacing={2}>{children}</Stack>
    </Paper>
  );
}

function when(entry: PlayerHomeInvitation): string | null {
  const date = formatEventDate(entry.scheduledOn);
  const time = formatEventTime(entry.startsAt, entry.endsAt);
  return [date, time].filter(Boolean).join(" · ") || null;
}

/** The row's own one-line state sentence — Q-23's "what the copy says". */
function rowSentence(entry: PlayerHomeInvitation): string | null {
  if (entry.standingAnswer === null) {
    // The club has already followed up once — that fact is what separates
    // `Still need your answer` from `New invitations`, so it leads the row
    // rather than being crowded out by the count/deadline line every
    // unanswered row also carries.
    if (entry.reminderSent) return STILL_NEED_ANSWER_SENTENCE;
    const deadline = formatDeadline(entry.responseDeadline);
    const proof = attendingSentence(entry.attendingCount);
    const bits = [proof, deadline ? `Answer by ${deadline}` : null].filter(Boolean);
    return bits.length > 0 ? bits.join(" · ") : null;
  }
  if (needsFollowUp(entry)) {
    return entry.standingAnswer === "no" && entry.reasonIsDefault
      ? FOLLOW_UP_NO_REASON_SENTENCE
      : FOLLOW_UP_QUESTIONS_SENTENCE;
  }
  return answeredSentence(entry.standingAnswer, entry.reason);
}

/**
 * Inline, one-tap Yes/No — the approved row control (`W2.html:956`
 * `mini-actions`), not a navigation button. A player's own No stands from
 * this click with the honest default: `defaultOk` tells `submitNo` there is
 * no text field on this row to demand a reason from — Q-22, REQ-no-reason-given.
 */
function MiniYesNo({ token, invitationId }: { token: string; invitationId: string }) {
  return (
    <Stack direction="row" spacing={1}>
      <Box component="form" action={changeToYes} sx={{ flex: 1 }}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="invitationId" value={invitationId} />
        <Button type="submit" variant="contained" color="success" fullWidth sx={{ minHeight: 40 }}>
          {ANSWER_YES}
        </Button>
      </Box>
      <Box component="form" action={submitNo} sx={{ flex: 1 }}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="invitationId" value={invitationId} />
        <input type="hidden" name="defaultOk" value="1" />
        <Button type="submit" variant="outlined" color="inherit" fullWidth sx={{ minHeight: 40 }}>
          {ANSWER_NO}
        </Button>
      </Box>
    </Stack>
  );
}

function ChangeToNoButton({ token, invitationId }: { token: string; invitationId: string }) {
  return (
    <Box component="form" action={submitNo} sx={{ flex: 1, minWidth: 0 }}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <input type="hidden" name="defaultOk" value="1" />
      <Button type="submit" variant="outlined" color="inherit" fullWidth sx={{ minHeight: 40 }}>
        {CHANGE_TO_NO}
      </Button>
    </Box>
  );
}

function ChangeToYesButton({ token, invitationId }: { token: string; invitationId: string }) {
  return (
    <Box component="form" action={changeToYes} sx={{ flex: 1, minWidth: 0 }}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <Button type="submit" variant="contained" color="success" fullWidth sx={{ minHeight: 40 }}>
        {CHANGE_TO_YES}
      </Button>
    </Box>
  );
}

function OpenLink({
  token,
  invitationId,
  label,
  emphasis,
}: {
  token: string;
  invitationId: string;
  label: string;
  emphasis?: boolean;
}) {
  return (
    <Button
      href={`/me/${encodeURIComponent(token)}?open=${encodeURIComponent(invitationId)}`}
      variant={emphasis ? "contained" : "outlined"}
      color={emphasis ? "primary" : "inherit"}
      fullWidth
      sx={{ minHeight: 40, flex: 1, minWidth: 0 }}
    >
      {label}
    </Button>
  );
}

/** Two direct actions per row (standards rule — never a bare navigation button doing the work of two taps). */
function RowActions({ token, entry }: { token: string; entry: PlayerHomeInvitation }) {
  if (entry.standingAnswer === null) {
    return <MiniYesNo token={token} invitationId={entry.invitationId} />;
  }
  if (needsFollowUp(entry)) {
    if (entry.standingAnswer === "no" && entry.reasonIsDefault) {
      return (
        <Stack direction="row" spacing={1}>
          <ChangeToYesButton token={token} invitationId={entry.invitationId} />
          <OpenLink token={token} invitationId={entry.invitationId} label={ADD_REASON} />
        </Stack>
      );
    }
    return (
      <Stack direction="row" spacing={1}>
        <OpenLink
          token={token}
          invitationId={entry.invitationId}
          label={ANSWER_QUESTIONS}
          emphasis
        />
        <ChangeToNoButton token={token} invitationId={entry.invitationId} />
      </Stack>
    );
  }
  if (entry.standingAnswer === "yes") {
    return <ChangeToNoButton token={token} invitationId={entry.invitationId} />;
  }
  return (
    <Stack direction="row" spacing={1}>
      <ChangeToYesButton token={token} invitationId={entry.invitationId} />
      <OpenLink token={token} invitationId={entry.invitationId} label={EDIT_REASON} />
    </Stack>
  );
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
  const sentence = rowSentence(entry);

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
        sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
      >
        <Box sx={{ minWidth: 0 }}>
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
          {entry.standingAnswer === null ? (
            <Chip
              label={dominant ? NEXT_CHIP : AWAITING_ANSWER_CHIP}
              size="small"
              variant="outlined"
              color="primary"
              sx={{ mt: 0.75, mr: 0.75 }}
            />
          ) : (
            <Chip
              label={
                entry.standingAnswer === "no" && entry.reasonIsDefault
                  ? NO_REASON_GIVEN
                  : entry.standingAnswer === "yes"
                    ? STANDING_YES
                    : STANDING_NO
              }
              size="small"
              color={entry.standingAnswer === "yes" ? "success" : "error"}
              sx={{ mt: 0.75, mr: 0.75 }}
            />
          )}
          {sentence ? (
            <Typography sx={{ fontSize: 12.5, color: "text.secondary", mt: 0.5 }}>
              {sentence}
            </Typography>
          ) : null}
        </Box>
        <Box sx={{ minWidth: { sm: 220 } }}>
          <RowActions token={token} entry={entry} />
        </Box>
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

/**
 * The one answer surface Q-21 requires, entered with the answer already
 * taken — restored to the full W2-03/W2-04 richness (Q-22): the event's own
 * facts, live social proof, the other-invitations notice, then the follow-up
 * a Yes or a No still owes.
 */
function FocusedPanel({
  token,
  invitation,
  landing,
  reasonError,
}: {
  token: string;
  invitation: PlayerHomeInvitation;
  landing: PlayerAnswerLanding;
  reasonError: boolean;
}) {
  const deadline = formatDeadline(invitation.responseDeadline);
  const attending = attendingSentence(landing.attendingCount);
  const otherOutstanding = otherOutstandingSentence(landing.otherOutstandingCount);

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
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{when(invitation)}</Typography>

      <Box
        component="dl"
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 1.5,
          mt: 1.5,
          mb: 2,
        }}
      >
        {invitation.venue ? (
          <Box>
            <Typography
              component="dt"
              sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}
            >
              Venue
            </Typography>
            <Typography component="dd" sx={{ m: 0, fontSize: 14 }}>
              {invitation.venue}
            </Typography>
          </Box>
        ) : null}
        {deadline ? (
          <Box>
            <Typography
              component="dt"
              sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}
            >
              Response deadline
            </Typography>
            <Typography component="dd" sx={{ m: 0, fontSize: 14 }}>
              {deadline}
            </Typography>
          </Box>
        ) : null}
      </Box>

      {invitation.standingAnswer === "yes" ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          {invitation.outstandingRequiredQuestions > 0
            ? `${STANDING_YES} — ${OUTSTANDING_QUESTIONS}`
            : landing.questions.length > 0
              ? `${STANDING_YES} — ${QUESTIONS_RECORDED}`
              : STANDING_YES}
        </Alert>
      ) : invitation.standingAnswer === "no" ? (
        // Owner correction round 3 (OWNER-LAN172-09): a standing No carrying
        // the honest default is a recorded answer, not a fault — Brian:
        // "the reason in default is very, very odd" (referring to the alarm,
        // not the reason itself). `info` reads as a neutral fact, matching
        // the tone `otherOutstanding` already uses below.
        <Alert severity="info" sx={{ mb: 2 }}>
          {invitation.reasonIsDefault
            ? `${STANDING_NO} — ${NO_REASON_GIVEN}`
            : `${STANDING_NO} — ${invitation.reason}`}
        </Alert>
      ) : null}

      {attending ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>{attending}</Typography>
      ) : null}
      {otherOutstanding ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {otherOutstanding}
        </Alert>
      ) : null}

      {invitation.standingAnswer === null ? (
        <Box sx={{ mb: 2 }}>
          <MiniYesNo token={token} invitationId={invitation.invitationId} />
        </Box>
      ) : null}

      {invitation.standingAnswer === "yes" ? (
        <Box component="form" action={submitNo}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="invitationId" value={invitation.invitationId} />
          <input type="hidden" name="reason" value="" />
          <input type="hidden" name="defaultOk" value="1" />
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

      {/*
        Owner correction round 3 (OWNER-LAN172-09): the reason field now
        leads, "Change to Yes" follows as the standing exit — Brian's panel
        opened for him to explain a No, not to be routed toward reconsidering
        it first. The reason stays optional (REQ-no-reason-given: the No
        already stands without it), so the field carries no `required` marker
        — only the dedicated Save action still refuses a submitted-but-blank
        real reason, exactly as it always has (LAN-79's own recoverable error).
      */}
      {invitation.standingAnswer === "no" ? (
        <Box component="form" action={submitNo} sx={{ mb: 2 }}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="invitationId" value={invitation.invitationId} />
          <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>
            {REASON_PROMPT}
          </Typography>
          <Stack spacing={1.5}>
            <TextField
              name="reason"
              label={REASON_LABEL}
              placeholder={REASON_PLACEHOLDER}
              fullWidth
              error={reasonError}
              helperText={reasonError ? "Choose a reason before saving." : undefined}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
            <Button type="submit" variant="outlined" fullWidth sx={{ minHeight: 44 }}>
              {SAVE_REASON}
            </Button>
          </Stack>
        </Box>
      ) : null}

      {invitation.standingAnswer !== "yes" && invitation.standingAnswer !== null ? (
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
            {CHANGE_TO_YES}
          </Button>
        </Box>
      ) : null}

      {/*
        Owner correction round 3 (OWNER-LAN172-08): once nothing required
        remains outstanding, stop re-rendering the identical form — the top
        Alert above already reads "Attending — Answer recorded" in that
        state. Brian: "it should close it up and say 'Answer recorded'...
        right now, it just goes blank."
      */}
      {invitation.standingAnswer === "yes" && invitation.outstandingRequiredQuestions > 0 ? (
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
