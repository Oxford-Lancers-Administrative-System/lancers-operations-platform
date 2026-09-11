/**
 * The one answer surface Q-21 requires — the invitation `?open=` focuses,
 * opened in place with its full event facts and follow-up. Split from
 * `page.tsx` (LAN-300).
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import { Fact, FactGrid } from "@/components/fact";
import { Field } from "@/components/field";

import type { PlayerAnswerLanding, PlayerHomeInvitation } from "@/lib/services/player-home";

import { QuestionField } from "@/app/a/[token]/question-field";
import { changeToYes, submitNo, submitQuestions } from "./actions";
import {
  attendingSentence,
  CHANGE_TO_YES,
  CLOSE_DETAIL,
  formatDeadline,
  NO_REASON_GIVEN,
  otherOutstandingSentence,
  PLANS_CHANGED,
  QUESTIONS_HEADING,
  QUESTIONS_RECORDED,
  REASON_LABEL,
  REASON_PLACEHOLDER,
  REASON_PROMPT,
  SAVE_QUESTIONS,
  SAVE_REASON,
  STANDING_NO,
  STANDING_YES,
  OUTSTANDING_QUESTIONS,
} from "./presentation";
import { MiniYesNo } from "./row-actions";
import { when } from "./summary-row";

/**
 * The one answer surface Q-21 requires, entered with the answer already
 * taken: the event's own facts, live social proof, the other-invitations
 * notice, then the follow-up a Yes or a No still owes.
 *
 * Decision history: docs/ux/tickets/LAN-172-player-answer.md.
 */
export function FocusedPanel({
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
      description={[invitation.templateName, when(invitation)].filter(Boolean).join(" · ")}
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
