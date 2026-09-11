import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { withTransaction } from "@/lib/db";
import {
  needsFollowUp,
  readPlayerAnswerLandingIn,
  type PlayerHomeInvitation,
} from "@/lib/services/player-home";
import { Fact, FactGrid } from "@/components/fact";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { PublicShell } from "@/components/public-shell";
import { Refusal } from "@/components/refusal";
import { RowCard, RowCardList } from "@/components/row-card";
import { Section } from "@/components/section";
import { StatusChip } from "@/components/status-chip";
import {
  ADD_REASON,
  ANSWERED_HEADING,
  ANSWERED_HELP,
  ANSWER_NO,
  ANSWER_QUESTIONS,
  ANSWER_YES,
  AWAITING_ANSWER_CHIP,
  CHANGE_TO_NO,
  CHANGE_TO_YES,
  EDIT_REASON,
  EMPTY_HELP,
  FOLLOW_UP_HEADING,
  FOLLOW_UP_NO_REASON_SENTENCE,
  FOLLOW_UP_ONLY_HELP,
  FOLLOW_UP_QUESTIONS_SENTENCE,
  FURTHER_OUT_HEADING,
  FURTHER_OUT_HELP,
  FURTHER_OUT_SUMMARY,
  HEADING_HELP,
  NEW_INVITATIONS_HEADING,
  NEXT_CHIP,
  NO_REASON_GIVEN,
  OUTSTANDING_QUESTIONS,
  PRIVACY_NOTE,
  PUBLIC_CALENDAR_LINK,
  QUESTIONS_RECORDED,
  STANDING_NO,
  STANDING_YES,
  STILL_NEED_ANSWER_HEADING,
  STILL_NEED_ANSWER_SENTENCE,
  answeredSentence,
  attendingSentence,
  eventTypeLabel,
  formatDeadline,
  formatEventDate,
  formatEventTime,
  otherOutstandingSentence,
  pageHeading,
} from "@/app/me/[token]/presentation";
import { gateShellPage } from "@/app/operate/gate";
import { pickFocusedInvitation, pickPlayerHomeSubject } from "../picks";

/**
 * S9 — the player's own page (`/me/[token]`), on the public shell. LAN-225's
 * player-surfaces addendum. Read by person id through the operator tier,
 * never by token. Copy is `/me/[token]`'s `presentation.ts`, unchanged; only
 * chrome and components change. Buttons are drawn, not wired. F2 not fixed
 * here: `Your answers` stays unbounded, a product change nobody has taken
 * (finding P1, `player-surfaces.md`).
 *
 * Decision history: docs/ux/tickets/LAN-231-design-rollout.md
 */
const TOUCH = 44;

/** The place the focused invitation sits in, not its name — a band needs a label; "the next one" is what the panel is for. */
const FOCUSED_BAND = "Answer this one next";

function when(entry: PlayerHomeInvitation): string | null {
  const date = formatEventDate(entry.scheduledOn);
  const time = formatEventTime(entry.startsAt, entry.endsAt);
  return [date, time].filter(Boolean).join(" · ") || null;
}

/** `/me/[token]`'s own `rowSentence`, unchanged. */
function rowSentence(entry: PlayerHomeInvitation): string | null {
  if (entry.standingAnswer === null) {
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

function AnswerChip({ entry, dominant }: { entry: PlayerHomeInvitation; dominant: boolean }) {
  if (entry.standingAnswer === null) {
    return (
      <StatusChip domain="rsvp" status="none" label={dominant ? NEXT_CHIP : AWAITING_ANSWER_CHIP} />
    );
  }
  if (entry.standingAnswer === "no" && entry.reasonIsDefault) {
    return <StatusChip domain="rsvp" status="no" label={NO_REASON_GIVEN} />;
  }
  return (
    <StatusChip
      domain="rsvp"
      status={entry.standingAnswer}
      label={entry.standingAnswer === "yes" ? STANDING_YES : STANDING_NO}
    />
  );
}

/** `/me/[token]`'s `RowActions`, in the kit's shapes. Contained primary, not green `color="success"` — design-system.md §1: the club palette has no green, and a filled green on fourteen rows is not a status. Listed as a delta on the review page. */
function RowActions({ entry }: { entry: PlayerHomeInvitation }) {
  const yes = (
    <Button type="button" variant="contained" sx={{ minHeight: TOUCH, flex: 1 }}>
      {ANSWER_YES}
    </Button>
  );
  const changeToYes = (
    <Button type="button" variant="contained" sx={{ minHeight: TOUCH, flex: 1 }}>
      {CHANGE_TO_YES}
    </Button>
  );
  const no = (
    <Button type="button" variant="outlined" sx={{ minHeight: TOUCH, flex: 1 }}>
      {ANSWER_NO}
    </Button>
  );
  const changeAnswer = (
    <Button type="button" variant="outlined" sx={{ minHeight: TOUCH, flex: 1 }}>
      {CHANGE_TO_NO}
    </Button>
  );
  const open = (label: string, emphasis: boolean) => (
    <Button
      type="button"
      variant={emphasis ? "contained" : "outlined"}
      sx={{ minHeight: TOUCH, flex: 1 }}
    >
      {label}
    </Button>
  );

  if (entry.standingAnswer === null) {
    return (
      <>
        {yes}
        {no}
      </>
    );
  }
  if (needsFollowUp(entry)) {
    if (entry.standingAnswer === "no" && entry.reasonIsDefault) {
      return (
        <>
          {changeToYes}
          {open(ADD_REASON, false)}
        </>
      );
    }
    return (
      <>
        {open(ANSWER_QUESTIONS, true)}
        {changeAnswer}
      </>
    );
  }
  if (entry.standingAnswer === "yes") return changeAnswer;
  return (
    <>
      {changeToYes}
      {open(EDIT_REASON, false)}
    </>
  );
}

function InvitationCard({ entry, dominant }: { entry: PlayerHomeInvitation; dominant: boolean }) {
  const sentence = rowSentence(entry);
  return (
    <RowCard
      title={entry.eventName}
      chips={<AnswerChip entry={entry} dominant={dominant} />}
      sublines={[
        // Type and time on one line, not the title row: the longest date pushed event names onto two lines at 1440.
        [eventTypeLabel(entry.eventType), when(entry)].filter(Boolean).join(" · "),
        ...(sentence ? [sentence] : []),
      ]}
      actions={<RowActions entry={entry} />}
      testId={dominant ? "invitation-next" : "invitation"}
    />
  );
}

export default async function PlayerHomePreviewPage() {
  const gate = await gateShellPage("/design-preview/player-home");
  if ("screen" in gate) return gate.screen;

  const subject = await pickPlayerHomeSubject();
  if (!subject) {
    return (
      <PublicShell caption="Your invitations" width="medium">
        <Refusal
          title="No player to show"
          message="The seed has no active membership with a player page to draw."
          action={{ href: "/design-preview", label: "Back to the preview" }}
        />
      </PublicShell>
    );
  }

  const { home } = subject;
  const focused = pickFocusedInvitation(home);
  const landing = focused
    ? await withTransaction((tx) => readPlayerAnswerLandingIn(tx, focused.invitationId))
    : null;
  const skipFocused = <T extends { invitationId: string }>(entries: readonly T[]): readonly T[] =>
    focused === null ? entries : entries.filter((e) => e.invitationId !== focused.invitationId);

  const newInvitations = skipFocused(home.newInvitations);
  const stillNeedAnswer = skipFocused(home.stillNeedAnswer);
  const followUpNeeded = skipFocused(home.followUpNeeded);
  const answeredUpcoming = skipFocused(home.answeredUpcoming);
  const furtherOut = skipFocused(home.furtherOut);

  const otherOutstanding = landing ? otherOutstandingSentence(landing.otherOutstandingCount) : null;
  const attending = landing ? attendingSentence(landing.attendingCount) : null;

  return (
    <PublicShell
      caption="Your invitations"
      width="medium"
      layout="stack"
      testId="player-home-preview"
    >
      <Stack spacing={3}>
        <PageHeader
          eyebrow={home.playerName || undefined}
          title={pageHeading(home.outstandingCount, home.followUpNeeded.length > 0)}
          subtitle={
            home.outstandingCount > 0
              ? HEADING_HELP
              : home.followUpNeeded.length > 0
                ? FOLLOW_UP_ONLY_HELP
                : EMPTY_HELP
          }
        />
        <Typography variant="caption" color="text.secondary" component="p">
          {PRIVACY_NOTE}
        </Typography>

        {focused ? (
          // Band titled with the place, not the record — the name is the `h2` inside (design-system.md §2).
          <Section
            title={FOCUSED_BAND}
            variant="banded"
            band="attendance"
            testId="focused-invitation"
          >
            <Stack spacing={2} sx={{ py: 1.5 }}>
              <Stack spacing={0.5}>
                {/* Type is a category, not a status (design-system.md §4) — never a `StatusChip`. */}
                <Typography variant="overline" component="p" color="text.secondary">
                  {eventTypeLabel(focused.eventType)}
                </Typography>
                <Stack
                  direction="row"
                  spacing={1.5}
                  sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
                >
                  <Typography variant="h2" component="h2">
                    {focused.eventName}
                  </Typography>
                  <AnswerChip entry={focused} dominant />
                </Stack>
              </Stack>
              <FactGrid columns={2}>
                <Fact label="When" value={when(focused)} emphasis />
                <Fact label="Venue" value={focused.venue} emphasis />
                <Fact
                  label="Response deadline"
                  value={formatDeadline(focused.responseDeadline)}
                  emphasis
                />
                <Fact label="Saying yes so far" value={attending} />
              </FactGrid>
              {focused.standingAnswer === "yes" ? (
                <Notice severity="success">
                  {focused.outstandingRequiredQuestions > 0
                    ? `${STANDING_YES} — ${OUTSTANDING_QUESTIONS}`
                    : `${STANDING_YES} — ${QUESTIONS_RECORDED}`}
                </Notice>
              ) : null}
              {otherOutstanding ? <Notice severity="info">{otherOutstanding}</Notice> : null}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <RowActions entry={focused} />
              </Stack>
            </Stack>
          </Section>
        ) : null}

        {newInvitations.length > 0 ? (
          <Section title={NEW_INVITATIONS_HEADING} testId="new-invitations">
            <RowCardList at="all">
              {newInvitations.map((entry) => (
                <InvitationCard
                  key={entry.invitationId}
                  entry={entry}
                  dominant={entry.invitationId === home.nextInvitationId}
                />
              ))}
            </RowCardList>
          </Section>
        ) : null}

        {stillNeedAnswer.length > 0 ? (
          <Section title={STILL_NEED_ANSWER_HEADING} testId="still-need-answer">
            <RowCardList at="all">
              {stillNeedAnswer.map((entry) => (
                <InvitationCard
                  key={entry.invitationId}
                  entry={entry}
                  dominant={entry.invitationId === home.nextInvitationId}
                />
              ))}
            </RowCardList>
          </Section>
        ) : null}

        {followUpNeeded.length > 0 ? (
          <Section title={FOLLOW_UP_HEADING} testId="follow-up-needed">
            <RowCardList at="all">
              {followUpNeeded.map((entry) => (
                <InvitationCard key={entry.invitationId} entry={entry} dominant={false} />
              ))}
            </RowCardList>
          </Section>
        ) : null}

        {answeredUpcoming.length > 0 ? (
          <Section title={ANSWERED_HEADING} description={ANSWERED_HELP} testId="answered-upcoming">
            <RowCardList at="all">
              {answeredUpcoming.map((entry) => (
                <InvitationCard key={entry.invitationId} entry={entry} dominant={false} />
              ))}
            </RowCardList>
          </Section>
        ) : null}

        {/* Closed on arrival, like `/me/[token]` today — opening it turned the first draft into a 9,676px page against 3,269px. */}
        {furtherOut.length > 0 ? (
          <Section
            title={FURTHER_OUT_HEADING}
            summary={FURTHER_OUT_SUMMARY}
            description={FURTHER_OUT_HELP}
            collapsible
            testId="further-out"
          >
            <RowCardList at="all">
              {furtherOut.map((entry) => (
                <InvitationCard key={entry.invitationId} entry={entry} dominant={false} />
              ))}
            </RowCardList>
          </Section>
        ) : null}

        {home.outstandingCount === 0 ? (
          <Button href="/calendar" variant="outlined" sx={{ minHeight: TOUCH, alignSelf: "start" }}>
            {PUBLIC_CALENDAR_LINK}
          </Button>
        ) : null}
      </Stack>
    </PublicShell>
  );
}
