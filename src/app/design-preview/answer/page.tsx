import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { withTransaction } from "@/lib/db";
import { readPlayerAnswerLandingIn } from "@/lib/services/player-home";
import { readSignedRsvpPageIn } from "@/lib/services/rsvp";
import { ActionBar } from "@/components/action-bar";
import { Fact, FactGrid } from "@/components/fact";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { PublicShell } from "@/components/public-shell";
import { Refusal } from "@/components/refusal";
import { Section } from "@/components/section";
import { Field, SelectField } from "@/components/field";
import { StatusChip } from "@/components/status-chip";
import {
  PLANS_CHANGED,
  PRIVACY_NOTE,
  QUESTIONS_HEADING,
  YES_HEADING,
  attendingSentence,
  confirmLabel,
  eventTypeLabel,
  otherOutstandingSentence,
} from "@/app/a/[token]/presentation";
import { formatDeadline, formatEventDate, formatEventTime } from "@/app/rsvp/[token]/presentation";
import { gateShellPage } from "@/app/operate/gate";
import { pickApprovedEvent, pickInvitationId } from "../picks";

/**
 * S11 — the one-tap answer landing (`/a/[token]`), on the public shell.
 * LAN-225's player-surfaces addendum. Read by invitation id through the
 * operator tier, never by token. The Yes side is drawn (the audit's captured
 * state, `a-token--confirm-yes--*.png`); copy unchanged, including the
 * deliberate Yes emphasis (LAN-172, REQ-emphasis-points-at-yes). Drawn, not
 * wired — the real page's single form both records and saves; a preview must
 * not.
 *
 * Decision history: docs/ux/tickets/LAN-231-design-rollout.md
 */
export default async function AnswerPreviewPage() {
  const gate = await gateShellPage("/design-preview/answer");
  if ("screen" in gate) return gate.screen;

  const event = await pickApprovedEvent();
  const invitationId = event ? await pickInvitationId(event.id) : null;
  if (!invitationId) {
    return (
      <PublicShell caption="Your answer" width="medium">
        <Refusal
          title="No invitation to show"
          message="The seed has no approved event with an invitation to a player."
          action={{ href: "/design-preview", label: "Back to the preview" }}
        />
      </PublicShell>
    );
  }

  const { base, landing } = await withTransaction(async (tx) => ({
    base: await readSignedRsvpPageIn(tx, invitationId),
    landing: await readPlayerAnswerLandingIn(tx, invitationId),
  }));

  const date = formatEventDate(base.scheduledOn);
  const time = formatEventTime(base.startsAt, base.endsAt);
  const when = [date, time].filter(Boolean).join(" · ") || null;
  const attending = attendingSentence(landing.attendingCount);
  const otherOutstanding = otherOutstandingSentence(landing.otherOutstandingCount);

  return (
    <PublicShell caption="Your answer" width="medium" layout="stack" testId="answer-preview">
      <Stack spacing={3}>
        {/* Heading is the answer, not the event — the player already pressed a button; the page confirms what it recorded. */}
        <PageHeader
          eyebrow={eventTypeLabel(base.eventType)}
          title={YES_HEADING}
          subtitle={when ? `${base.eventName} · ${when}` : base.eventName}
        />
        <Section
          title="This invitation"
          variant="banded"
          band="attendance"
          testId="answer-headline"
        >
          <Stack spacing={2} sx={{ py: 1.5 }}>
            <FactGrid columns={2}>
              {base.playerName ? <Fact label="Player" value={base.playerName} emphasis /> : null}
              <Fact label="When" value={when} emphasis />
              <Fact label="Venue" value={base.venue} emphasis />
              <Fact label="Response deadline" value={formatDeadline(base.responseDeadline)} />
              {/* Not a chip beside the heading, which already says the answer — that would be colour without information. */}
              <Fact
                label="Your answer"
                value={<StatusChip domain="rsvp" status="yes" label={YES_HEADING} />}
              />
            </FactGrid>
            {attending ? (
              <Typography variant="body2" color="text.secondary">
                {attending}
              </Typography>
            ) : null}
          </Stack>
        </Section>

        {otherOutstanding ? <Notice severity="info">{otherOutstanding}</Notice> : null}

        {landing.questions.length > 0 ? (
          <Section title={QUESTIONS_HEADING} testId="answer-questions">
            <Stack spacing={2}>
              {landing.questions.map((question) =>
                question.answerType === "choice" && question.choices ? (
                  <SelectField
                    key={question.id}
                    label={question.prompt}
                    name={`q_${question.id}`}
                    defaultValue={question.currentAnswer?.choice ?? ""}
                    required={question.isRequired}
                    options={question.choices.map((choice) => ({
                      value: choice,
                      label: choice,
                    }))}
                  />
                ) : question.answerType === "boolean" ? (
                  <SelectField
                    key={question.id}
                    label={question.prompt}
                    name={`q_${question.id}`}
                    defaultValue={
                      question.currentAnswer?.boolean === true
                        ? "true"
                        : question.currentAnswer?.boolean === false
                          ? "false"
                          : ""
                    }
                    required={question.isRequired}
                    options={[
                      { value: "true", label: "Yes" },
                      { value: "false", label: "No" },
                    ]}
                  />
                ) : (
                  <Field
                    key={question.id}
                    label={question.prompt}
                    name={`q_${question.id}`}
                    defaultValue={question.currentAnswer?.text ?? ""}
                    required={question.isRequired}
                  />
                ),
              )}
            </Stack>
          </Section>
        ) : null}

        <Typography variant="caption" color="text.secondary" component="p">
          {PRIVACY_NOTE}
        </Typography>

        <ActionBar
          primary={
            /* Oxford Blue, not MUI green — S9's own note on the palette. */
            <Button type="button" variant="contained" sx={{ minHeight: 48 }}>
              {confirmLabel("yes", landing.questions.length > 0)}
            </Button>
          }
          secondary={
            <Button type="button" variant="text">
              {PLANS_CHANGED}
            </Button>
          }
        />
      </Stack>
    </PublicShell>
  );
}
