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
  type PlayerAnswerLanding,
  type PlayerHome,
  type PlayerHomeInvitation,
} from "@/lib/services/player-home";

import { QuestionField } from "@/app/a/[token]/question-field";
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
  FOLLOW_UP_ONLY_HELP,
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

  /**
   * OWNER-LAN172-20. The invitation `?open=` focuses already gets its own
   * richly detailed card above, from `FocusedPanel` — rendering it a second
   * time, unchanged, in whichever section it also belongs to left a player
   * looking at two cards for one event, each with its own separate controls,
   * unable to tell whether their answer had been recorded once or twice (it
   * had, correctly, only once — this was purely a rendering choice). Every
   * section below is filtered through this before it decides whether it has
   * anything to show, so a section that becomes empty once its one entry is
   * the focused one does not render an empty heading either.
   */
  const focusedId = focusedInvitation?.invitationId ?? null;
  function withoutFocused<T extends { invitationId: string }>(entries: readonly T[]): readonly T[] {
    return focusedId === null
      ? entries
      : entries.filter((entry) => entry.invitationId !== focusedId);
  }
  const newInvitations = withoutFocused(home.newInvitations);
  const stillNeedAnswer = withoutFocused(home.stillNeedAnswer);
  const followUpNeeded = withoutFocused(home.followUpNeeded);
  const answeredUpcoming = withoutFocused(home.answeredUpcoming);
  const furtherOut = withoutFocused(home.furtherOut);

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
            {pageHeading(home.outstandingCount, home.followUpNeeded.length > 0)}
          </Typography>
          <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1 }}>
            {home.outstandingCount > 0
              ? HEADING_HELP
              : home.followUpNeeded.length > 0
                ? FOLLOW_UP_ONLY_HELP
                : EMPTY_HELP}
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

        {newInvitations.length > 0 ? (
          <Section heading={NEW_INVITATIONS_HEADING}>
            {newInvitations.map((entry) => (
              <SummaryRow
                key={entry.invitationId}
                token={token}
                entry={entry}
                dominant={entry.invitationId === home.nextInvitationId}
              />
            ))}
          </Section>
        ) : null}

        {stillNeedAnswer.length > 0 ? (
          <Section heading={STILL_NEED_ANSWER_HEADING}>
            {stillNeedAnswer.map((entry) => (
              <SummaryRow
                key={entry.invitationId}
                token={token}
                entry={entry}
                dominant={entry.invitationId === home.nextInvitationId}
              />
            ))}
          </Section>
        ) : null}

        {followUpNeeded.length > 0 ? (
          <Section heading={FOLLOW_UP_HEADING}>
            {followUpNeeded.map((entry) => (
              <SummaryRow key={entry.invitationId} token={token} entry={entry} dominant={false} />
            ))}
          </Section>
        ) : null}

        {answeredUpcoming.length > 0 ? (
          <Section heading={ANSWERED_HEADING} help={ANSWERED_HELP}>
            {answeredUpcoming.map((entry) => (
              <SummaryRow key={entry.invitationId} token={token} entry={entry} dominant={false} />
            ))}
          </Section>
        ) : null}

        {furtherOut.length > 0 ? (
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
                {furtherOut.map((entry) => (
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
      {/*
        Owner correction round 6 (OWNER-LAN172-19), reversing round 5's own
        OWNER-LAN172-16 finding for this button: Brian's "one interaction"
        model treats a change of answer exactly like a first answer — it
        records immediately and opens *that* answer's own follow-up, never
        closing the panel by itself. Sending `close=1` here is what let this
        button record a Yes and then hide the very questions it had just made
        outstanding again, with no visible way back to them but the row's own
        separate "Answer questions" button. Only Save (the reason form, the
        questions form) ever closes the panel now.
      */}
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
  /**
   * Owner correction round 4 (LAN-172-r4-F1). Two different questions were
   * conflated into one boolean: "does the form render at all" and "do we
   * show the acknowledgement instead." `landing.outstandingRequiredQuestions`
   * alone answers the second only for an event that HAS a required question
   * -- Brian's own approved rule for that case is "collapse once the
   * required ones are answered, even if an optional one was left blank"
   * (OWNER-LAN172-08). But it is structurally always zero for an event whose
   * questions are ALL optional, which silently deleted the form for that
   * case on every visit, forever -- W2's own acceptance text is explicit:
   * "Optional questions remain visibly optional."
   *
   * The fix keeps Brian's mixed-event rule exactly as approved (a required
   * question, once satisfied, is what closes the panel, regardless of an
   * unanswered optional one) while restoring a real signal for the
   * all-optional case: when an event carries no required question at all,
   * "still outstanding" falls back to any question of any kind left
   * unanswered, so the form keeps showing until the player has actually
   * seen and answered them once.
   */
  const hasRequiredQuestion = landing.questions.some((question) => question.isRequired);
  const questionsStillOutstanding = hasRequiredQuestion
    ? landing.outstandingRequiredQuestions > 0
    : landing.questions.some((question) => question.currentAnswer === null);

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
          {questionsStillOutstanding
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
          {/* Owner correction round 5 (OWNER-LAN172-16): "once I click Save,
              the box should go away" — a successful save closes the panel; a
              failed one (reasonError) still reopens it, unaffected by this
              flag (the catch branch in submitNo never reads `close`). */}
          <input type="hidden" name="close" value="1" />
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
          {/*
            Owner correction round 6 (OWNER-LAN172-19), reversing round 5's
            OWNER-LAN172-16 finding: changing to Yes is not a Save — it must
            open the event's own questions exactly like any other Yes, not
            close on the player before they see whatever this Yes now owes.
          */}
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
        Owner correction round 3 (OWNER-LAN172-08), corrected round 4
        (LAN-172-r4-F1): once nothing is left to offer — a required question,
        or for an all-optional event, any question at all — stop
        re-rendering the identical form; the top Alert above already reads
        "Attending — Answer recorded" in that state. Brian: "it should close
        it up and say 'Answer recorded'... right now, it just goes blank."
        `questionsStillOutstanding` (above) is what keeps this from
        collapsing before an all-optional event's own questions have ever
        been shown — the round-3 fix used outstandingRequiredQuestions alone,
        which is structurally always zero for such an event and hid the form
        forever, contradicting W2's "optional questions remain visibly
        optional."
      */}
      {invitation.standingAnswer === "yes" && questionsStillOutstanding ? (
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
