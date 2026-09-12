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
import { DESCRIPTION_LABEL, EQUIPMENT_LABEL } from "@/lib/services/event-vocabulary";

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
  // LAN-172-r4-F1: `outstandingRequiredQuestions` alone is structurally always
  // zero for an all-optional event, silently deleting the form forever
  // (violates W2's "optional questions remain visibly optional"). Keeps
  // Brian's mixed-event rule (OWNER-LAN172-08: required satisfied closes the
  // panel) while falling back to "any question unanswered" when none is required.
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
        {/*
          LAN-323. Clint, on this page: "EVENTS DO NOT SHOW THE DESCRIPTION, I
          THINK THEY SHOULD." Both fields now appear, separately labelled and
          labelled as the public event page labels them, and neither renders at
          all when the operator left it empty — `Fact` would otherwise say "not
          recorded" for a field that is optional by design.
        */}
        <FactGrid>
          <Fact label="Venue" value={invitation.venue} />
          <Fact label="Response deadline" value={deadline} />
          {invitation.requiredEquipment ? (
            <Fact
              label={EQUIPMENT_LABEL}
              value={invitation.requiredEquipment}
              multiline
              testId="player-event-equipment"
            />
          ) : null}
          {invitation.description ? (
            <Box sx={{ gridColumn: { sm: "1 / -1" } }}>
              <Fact
                label={DESCRIPTION_LABEL}
                value={invitation.description}
                multiline
                testId="player-event-description"
              />
            </Box>
          ) : null}
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
          // OWNER-LAN172-09: a standing No with the honest default is a recorded answer, not a fault. `info` is a neutral tone.
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

        {/* OWNER-LAN172-09: reason field leads, "Change to Yes" follows. Reason stays optional (REQ-no-reason-given). */}
        {invitation.standingAnswer === "no" ? (
          <Box component="form" action={submitNo} sx={{ mb: 2 }}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="invitationId" value={invitation.invitationId} />
            {/* OWNER-LAN172-16: a successful save closes the panel; a failed one (reasonError) reopens it unaffected. */}
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
            {/* OWNER-LAN172-19, reversing round 5: changing to Yes is not a Save — must open the event's own questions like any other Yes. */}
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

        {/* OWNER-LAN172-08/LAN-172-r4-F1: stops re-rendering once nothing is left to offer; the top Alert already reads "Answer recorded". */}
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
