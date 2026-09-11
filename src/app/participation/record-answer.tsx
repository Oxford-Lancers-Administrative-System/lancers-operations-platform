"use client";

import { useActionState, useMemo, useState } from "react";
import { Notice } from "@/components/notice";
import { ActionBar } from "@/components/action-bar";
import { FieldGroup } from "@/components/section";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormLabel from "@mui/material/FormLabel";
import Stack from "@mui/material/Stack";
import { Field, DateField, TimeField } from "@/components/field";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";

import {
  dateFromScheduledOn,
  dateFromTimeString,
  scheduledOnFromDate,
  timeStringFromDate,
} from "@/app/operate/events/date-time-controls";
import type { EventFactsBase, ParticipationQuestion } from "@/lib/services/participation-view";

import { recordOperatorAnswerAction } from "./record-answer-actions";
import { EMPTY_RECORD_ANSWER_STATE } from "./record-answer-state";
import {
  CANCEL,
  EVENT_QUESTIONS_HEADING,
  QUESTION_OPTIONAL,
  QUESTION_REQUIRED_OF_PLAYER_OPTIONAL_HERE,
  REASON_LABEL,
  REASON_PLACEHOLDER,
  REASON_PRIVACY_NOTE,
  REASON_REQUIRED_FOR_NO,
  RECORD_ANSWER,
  RECORDING,
  recordAnswerDialogTitle,
  recordAnswerEventSubtitle,
  RESPONSE_NO_LABEL,
  RESPONSE_YES_LABEL,
  WHAT_DID_THEY_SAY,
  WHEN_DID_THEY_TELL_YOU,
  WHEN_HELPER,
} from "./presentation";

/** The club's own "now", read as if it were the browser's local calendar — an operator's machine may not be set to Europe/London (same trick as `club-time.ts`). */
function nowInClubZoneAsLocalDate(): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((one) => one.type === type)?.value ?? "0");
  // Floored (not rounded) to the TimePicker's five-minute step, or MUI reads an off-step value as invalid (OWNER-LAN170-04).
  const flooredMinutes = Math.floor((part("hour") * 60 + part("minute")) / 5) * 5;
  return new Date(part("year"), part("month") - 1, part("day"), 0, flooredMinutes);
}

/** OWNER-LAN170-08: the event's rule and this form's are different facts — required of the player, never required to record here. */
function questionOptionalLabel(question: ParticipationQuestion): string {
  return question.isRequired ? QUESTION_REQUIRED_OF_PLAYER_OPTIONAL_HERE : QUESTION_OPTIONAL;
}

/** One question's answer, inline in the recording form — W3, never required here. Choice questions offer buttons, not a select: never more than a handful, faster to use pitch-side. */
function QuestionField({
  question,
  value,
  onChange,
  disabled,
}: {
  question: ParticipationQuestion;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const fieldName = `question:${question.id}`;

  if (question.answerType === "boolean") {
    return (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {question.prompt}{" "}
          <Typography component="span" color="text.secondary">
            {questionOptionalLabel(question)}
          </Typography>
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
          {(["Yes", "No"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              variant={value === option ? "contained" : "outlined"}
              disabled={disabled}
              onClick={() => onChange(value === option ? "" : option)}
              sx={{ minHeight: 44, flex: 1 }}
              aria-pressed={value === option}
            >
              {option}
            </Button>
          ))}
        </Stack>
        <input type="hidden" name={fieldName} value={value} />
      </Box>
    );
  }

  if (question.answerType === "choice" && question.choices && question.choices.length > 0) {
    return (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {question.prompt}{" "}
          <Typography component="span" color="text.secondary">
            {questionOptionalLabel(question)}
          </Typography>
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: "wrap", gap: 1 }}>
          {question.choices.map((choice) => (
            <Button
              key={choice}
              type="button"
              variant={value === choice ? "contained" : "outlined"}
              disabled={disabled}
              onClick={() => onChange(value === choice ? "" : choice)}
              sx={{ minHeight: 44 }}
              aria-pressed={value === choice}
            >
              {choice}
            </Button>
          ))}
        </Stack>
        <input type="hidden" name={fieldName} value={value} />
      </Box>
    );
  }

  return (
    <Field
      label={`${question.prompt} (${questionOptionalLabel(question)})`}
      name={fieldName}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      multiline
    />
  );
}

/**
 * **Record answer** — the row action with no answer at all, and the dialog it
 * opens. W3, LAN-170. `ToggleButtonGroup exclusive`, not two buttons
 * (OWNER-LAN170-06: Brian's "I can't tell which answer I picked"). Yes/No
 * both get MUI's selected treatment; `REQ-emphasis-points-at-yes` does not
 * apply here (Brian, 26 August 2026 — that rule is W2's, player-facing).
 * Only one branch's fields show at a time (OWNER-LAN170-07). The form starts
 * inside `Dialog`, not around it — MUI's `Dialog` portals to `document.body`,
 * so a wrapping `<form>` would not enclose the real submit button
 * (`membership-actions.tsx` found this defect). The dialog names which event
 * it recording against (OWNER-LAN170-09, round 4).
 *
 * Decision history: missions/intake/M-PEOPLE-AND-ROSTER
 */
export function RecordAnswerControl({
  event,
  invitationId,
  displayName,
  questions,
}: {
  event: Pick<EventFactsBase, "id" | "name" | "scheduledOn" | "startsAt" | "endsAt">;
  invitationId: string;
  displayName: string;
  questions: readonly ParticipationQuestion[];
}) {
  const eventId = event.id;
  const [state, formAction, pending] = useActionState(
    recordOperatorAnswerAction,
    EMPTY_RECORD_ANSWER_STATE,
  );
  const [open, setOpen] = useState(false);
  const [response, setResponse] = useState<"yes" | "no" | null>(null);
  const [reason, setReason] = useState("");
  const [when, setWhen] = useState<Date>(() => nowInClubZoneAsLocalDate());
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});

  const scheduledOn = useMemo(() => scheduledOnFromDate(when), [when]);
  const timeString = useMemo(() => timeStringFromDate(when), [when]);

  // Adjusted during render, not an effect — React's shape for "reset state when a value changes" — so a save closes the dialog in the same commit.
  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.success) {
      setOpen(false);
      setResponse(null);
      setReason("");
      setWhen(nowInClubZoneAsLocalDate());
      setQuestionAnswers({});
    }
  }

  function openDialog() {
    setWhen(nowInClubZoneAsLocalDate());
    setOpen(true);
  }

  function setQuestionAnswer(questionId: string, value: string) {
    setQuestionAnswers((previous) => ({ ...previous, [questionId]: value }));
  }

  return (
    <>
      {/* OWNER-LAN170-05: restored ordinary bordered row-action treatment; Brian: "it's just awkward" as bare text. */}
      <Button
        type="button"
        variant="outlined"
        color="inherit"
        size="small"
        onClick={openDialog}
        data-testid="record-answer-open"
        sx={{ minHeight: 44 }}
      >
        {RECORD_ANSWER}
      </Button>

      <Dialog
        open={open}
        onClose={() => (pending ? null : setOpen(false))}
        fullWidth
        maxWidth="sm"
        aria-labelledby="record-answer-title"
      >
        <DialogTitle id="record-answer-title">
          {/* Wrapped in `span`, not a block element: `DialogTitle` renders into an `<h2>`. `sx={{ display: "block" }}` puts each line on its own row (W3-02/W3-04). */}
          <Box component="span" sx={{ display: "block" }}>
            {recordAnswerDialogTitle(displayName)}
          </Box>
          <Typography
            component="span"
            variant="body2"
            color="text.secondary"
            sx={{ display: "block", mt: 0.5 }}
            data-testid="record-answer-event-subtitle"
          >
            {recordAnswerEventSubtitle(event)}
          </Typography>
        </DialogTitle>
        <Box component="form" action={formAction} data-testid="record-answer-form">
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="invitationId" value={invitationId} />
          <input type="hidden" name="response" value={response ?? ""} />
          <DialogContent dividers>
            <Stack spacing={2}>
              {state.error ? (
                <Notice severity="error" testId="record-answer-error">
                  {state.error}
                </Notice>
              ) : null}

              <Box>
                <FormLabel component="legend" id="what-did-they-say-label">
                  {WHAT_DID_THEY_SAY}
                </FormLabel>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  value={response}
                  onChange={(_event, next: "yes" | "no" | null) => setResponse(next)}
                  disabled={pending}
                  aria-labelledby="what-did-they-say-label"
                  sx={{ mt: 1 }}
                >
                  <ToggleButton
                    value="yes"
                    color="success"
                    data-testid="response-yes"
                    sx={{ minHeight: 44, flex: 1 }}
                  >
                    {RESPONSE_YES_LABEL}
                  </ToggleButton>
                  <ToggleButton
                    value="no"
                    color="error"
                    data-testid="response-no"
                    sx={{ minHeight: 44, flex: 1 }}
                  >
                    {RESPONSE_NO_LABEL}
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <Box>
                <FormLabel component="legend">{WHEN_DID_THEY_TELL_YOU}</FormLabel>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 1 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <DateField
                      label="Date"
                      name="respondedAtDate"
                      value={scheduledOn}
                      dateValue={dateFromScheduledOn(scheduledOn)}
                      helperText=""
                      onDateChange={(next) => {
                        if (!next) return;
                        const merged = new Date(next);
                        merged.setHours(when.getHours(), when.getMinutes(), 0, 0);
                        setWhen(merged);
                      }}
                      // Not `disableFuture`: it reads the browser's real clock/zone, but this value is the club's wall clock — a west-of-London operator past midnight would get a permanent false error (OWNER-LAN170-04). `maxDate` uses the same club-zone computation.
                      maxDate={nowInClubZoneAsLocalDate()}
                      disabled={pending}
                    />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <TimeField
                      label="Time"
                      name="respondedAtTime"
                      value={timeString}
                      dateValue={dateFromTimeString(timeString)}
                      helperText=""
                      onDateChange={(next) => {
                        const timeValue = timeStringFromDate(next);
                        const parsed = dateFromTimeString(timeValue);
                        if (!parsed) return;
                        const merged = new Date(when);
                        merged.setHours(parsed.getHours(), parsed.getMinutes(), 0, 0);
                        setWhen(merged);
                      }}
                      disabled={pending}
                    />
                  </Box>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {WHEN_HELPER}
                </Typography>
              </Box>

              {/* OWNER-LAN170-07: one branch's fields at a time. */}
              {response === "no" ? (
                <Box>
                  <Field
                    label={REASON_LABEL}
                    name="reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    disabled={pending}
                    multiline
                    minRows={2}
                    placeholder={REASON_PLACEHOLDER}
                    helperText={REASON_REQUIRED_FOR_NO}
                    required
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {REASON_PRIVACY_NOTE}
                  </Typography>
                </Box>
              ) : null}

              {response === "yes" && questions.length > 0 ? (
                <FieldGroup title={EVENT_QUESTIONS_HEADING}>
                  <Stack spacing={2} sx={{ mt: 1 }}>
                    {questions.map((question) => (
                      <QuestionField
                        key={question.id}
                        question={question}
                        value={questionAnswers[question.id] ?? ""}
                        onChange={(value) => setQuestionAnswer(question.id, value)}
                        disabled={pending}
                      />
                    ))}
                  </Stack>
                </FieldGroup>
              ) : null}
            </Stack>
          </DialogContent>
          <Box sx={{ px: 2, py: 1.5 }}>
            <ActionBar
              primary={
                <Button
                  type="submit"
                  variant="contained"
                  disabled={pending || response === null}
                  data-testid="record-answer-submit"
                >
                  {pending ? RECORDING : RECORD_ANSWER}
                </Button>
              }
              cancel={
                <Button onClick={() => setOpen(false)} disabled={pending}>
                  {CANCEL}
                </Button>
              }
              note={response === null ? "Choose Yes or No to record the answer." : undefined}
            />
          </Box>
        </Box>
      </Dialog>
    </>
  );
}
