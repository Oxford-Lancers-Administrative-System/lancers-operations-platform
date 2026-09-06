import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Notice } from "@/components/notice";
import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { RowCard, RowCardList } from "@/components/row-card";
import { StatusChip } from "@/components/status-chip";
import { Fact, FactGrid } from "@/components/fact";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
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
  CHANGE_TO_NO,
  CHANGE_TO_YES,
  CLOSE_DETAIL,
  EDIT_REASON,
  FOLLOW_UP_HEADING,
  FOLLOW_UP_NO_REASON_SENTENCE,
  FOLLOW_UP_QUESTIONS_SENTENCE,
  formatDeadline,
  formatEventDate,
  formatEventTime,
  FURTHER_OUT_HEADING,
  FURTHER_OUT_HELP,
  FURTHER_OUT_SUMMARY,
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
    <PublicShell layout="stack">
      <Stack spacing={3}>
        <PageHeader
          title={pageHeading(home.outstandingCount, home.followUpNeeded.length > 0)}
          eyebrow={home.playerName ?? undefined}
          subtitle={PRIVACY_NOTE}
        />
        {focusedInvitation && resolved.focused ? (
          <FocusedPanel
            token={token}
            invitation={focusedInvitation}
            landing={resolved.focused}
            reasonError={reasonError}
          />
        ) : null}

        {newInvitations.length > 0 ? (
          <Section title={NEW_INVITATIONS_HEADING}>
            <RowCardList at="all">
              {newInvitations.map((entry) => (
                <SummaryRow
                  key={entry.invitationId}
                  token={token}
                  entry={entry}
                  dominant={entry.invitationId === home.nextInvitationId}
                />
              ))}
            </RowCardList>
          </Section>
        ) : null}

        {stillNeedAnswer.length > 0 ? (
          <Section title={STILL_NEED_ANSWER_HEADING}>
            <RowCardList at="all">
              {stillNeedAnswer.map((entry) => (
                <SummaryRow
                  key={entry.invitationId}
                  token={token}
                  entry={entry}
                  dominant={entry.invitationId === home.nextInvitationId}
                />
              ))}
            </RowCardList>
          </Section>
        ) : null}

        {followUpNeeded.length > 0 ? (
          <Section title={FOLLOW_UP_HEADING}>
            <RowCardList at="all">
              {followUpNeeded.map((entry) => (
                <SummaryRow key={entry.invitationId} token={token} entry={entry} dominant={false} />
              ))}
            </RowCardList>
          </Section>
        ) : null}

        {answeredUpcoming.length > 0 ? (
          <Section title={ANSWERED_HEADING} description={ANSWERED_HELP} collapsible>
            <RowCardList at="all">
              {answeredUpcoming.map((entry) => (
                <SummaryRow key={entry.invitationId} token={token} entry={entry} dominant={false} />
              ))}
            </RowCardList>
          </Section>
        ) : null}

        {furtherOut.length > 0 ? (
          <Section
            title={FURTHER_OUT_HEADING}
            description={FURTHER_OUT_HELP}
            summary={FURTHER_OUT_SUMMARY}
            collapsible
          >
            <RowCardList at="all">
              {furtherOut.map((entry) => (
                <SummaryRow key={entry.invitationId} token={token} entry={entry} dominant={false} />
              ))}
            </RowCardList>
          </Section>
        ) : null}

        {home.outstandingCount === 0 ? (
          <Button href="/calendar" variant="outlined" sx={{ mt: 1, minHeight: 44 }}>
            {PUBLIC_CALENDAR_LINK}
          </Button>
        ) : null}
      </Stack>
    </PublicShell>
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
        <Button type="submit" variant="contained" color="primary" fullWidth sx={{ minHeight: 40 }}>
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
      <Button type="submit" variant="contained" color="primary" fullWidth sx={{ minHeight: 40 }}>
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
    <RowCard
      title={entry.eventName}
      sublines={[eventTypeLabel(entry.eventType), when(entry), ...(sentence ? [sentence] : [])]}
      chips={
        <StatusChip
          domain="rsvp"
          status={entry.standingAnswer ?? "none"}
          label={
            entry.standingAnswer === null
              ? dominant
                ? NEXT_CHIP
                : AWAITING_ANSWER_CHIP
              : entry.standingAnswer === "no" && entry.reasonIsDefault
                ? NO_REASON_GIVEN
                : entry.standingAnswer === "yes"
                  ? STANDING_YES
                  : STANDING_NO
          }
        />
      }
      actions={<RowActions token={token} entry={entry} />}
    />
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
    <Section
      title={invitation.eventName}
      description={[eventTypeLabel(invitation.eventType), when(invitation)]
        .filter(Boolean)
        .join(" · ")}
    >
      <Stack spacing={2}>
        <FactGrid>
          <Fact label="Venue" value={invitation.venue} />
          <Fact label="Response deadline" value={deadline} />
        </FactGrid>

        {invitation.standingAnswer === "yes" ? (
          <Notice severity="success">
            {questionsStillOutstanding
              ? `${STANDING_YES} — ${OUTSTANDING_QUESTIONS}`
              : landing.questions.length > 0
                ? `${STANDING_YES} — ${QUESTIONS_RECORDED}`
                : STANDING_YES}
          </Notice>
        ) : invitation.standingAnswer === "no" ? (
          // Owner correction round 3 (OWNER-LAN172-09): a standing No carrying
          // the honest default is a recorded answer, not a fault — Brian:
          // "the reason in default is very, very odd" (referring to the alarm,
          // not the reason itself). `info` reads as a neutral fact, matching
          // the tone `otherOutstanding` already uses below.
          <Notice severity="info">
            {invitation.reasonIsDefault
              ? `${STANDING_NO} — ${NO_REASON_GIVEN}`
              : `${STANDING_NO} — ${invitation.reason}`}
          </Notice>
        ) : null}

        {attending ? (
          <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>{attending}</Typography>
        ) : null}
        {otherOutstanding ? <Notice severity="info">{otherOutstanding}</Notice> : null}

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
              <Field
                name="reason"
                label={REASON_LABEL}
                placeholder={REASON_PLACEHOLDER}

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
      </Stack>
    </Section>
  );
}
