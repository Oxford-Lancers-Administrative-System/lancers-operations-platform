"use client";

import { useActionState, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormLabel from "@mui/material/FormLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { enGB } from "date-fns/locale/en-GB";

import {
  dateFromScheduledOn,
  dateFromTimeString,
  scheduledOnFromDate,
  timeStringFromDate,
} from "@/app/operate/events/date-time-controls";
import type { ParticipationQuestion } from "@/lib/services/participation-view";

import { recordOperatorAnswerAction } from "./record-answer-actions";
import { EMPTY_RECORD_ANSWER_STATE } from "./record-answer-state";
import {
  CANCEL,
  EVENT_QUESTIONS_HEADING,
  EVENT_QUESTIONS_HELPER,
  QUESTION_OPTIONAL,
  REASON_LABEL,
  REASON_PLACEHOLDER,
  REASON_PRIVACY_NOTE,
  REASON_REQUIRED_FOR_NO,
  RECORD_ANSWER,
  RECORDING,
  recordAnswerDialogTitle,
  RESPONSE_NO_LABEL,
  RESPONSE_YES_LABEL,
  WHAT_DID_THEY_SAY,
  WHEN_DID_THEY_TELL_YOU,
  WHEN_HELPER,
} from "./presentation";

/**
 * The club's own "now", read as if it were the browser's local calendar.
 *
 * `date-time-controls.ts`'s helpers round-trip a `Date` through its *local*
 * getters — that is what makes the picker's field show exactly what the
 * operator typed. An operator's machine is not guaranteed to be set to
 * `Europe/London`, so a plain `new Date()` would default the field to the
 * wrong wall clock on a laptop set to another zone. Reading the club's zone
 * through `Intl` first and constructing the `Date` from those parts means the
 * picker's local getters read back the club's own "now" regardless of what the
 * operator's machine thinks the time is — the same trick `club-time.ts` plays
 * for calendar days, one level more specific.
 */
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
  // Floored to the TimePicker's own five-minute step (`minutesStep`/
  // `timeSteps` below). The real current minute is almost never itself a
  // multiple of five, and MUI treats a value that does not land on an offered
  // step as invalid — a permanent, unrelated red state on the Time field that
  // has nothing to do with whether an answer can be recorded
  // (OWNER-LAN170-04's second cause, found alongside the future/past one).
  // Flooring, not rounding, also keeps this function's promise that its
  // result is never later than the real "now" it is reading.
  const flooredMinutes = Math.floor((part("hour") * 60 + part("minute")) / 5) * 5;
  return new Date(part("year"), part("month") - 1, part("day"), 0, flooredMinutes);
}

/**
 * One question's answer, inline in the recording form — W3's own acceptance
 * evidence: "the event's own questions are answerable in the same form",
 * never required here even when the event marks them required of the player.
 *
 * A boolean question gets the same Yes/No shape the answer itself uses,
 * because that is what the question means. A choice question offers its own
 * stored options as buttons rather than a select — there are never more than a
 * handful (`event_questions_choices_match_type` requires at least two), and a
 * button an operator can see all of at once is faster to use standing at the
 * side of a pitch than a menu that has to be opened first. A text question is
 * a plain field.
 */
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
            {QUESTION_OPTIONAL}
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
            {QUESTION_OPTIONAL}
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
    <TextField
      label={`${question.prompt} (${QUESTION_OPTIONAL})`}
      name={fieldName}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      fullWidth
      multiline
    />
  );
}

/**
 * **Record answer** — the row action with no answer at all, and the dialog it
 * opens. W3, LAN-170.
 *
 * ## Yes is always the filled control
 *
 * A gate condition of this package, not a rendering preference: the affirmative
 * choice always carries the filled treatment and the negative choice never
 * does, so which button is filled never depends on which the operator has
 * picked. Picking a state that keeps that true and still shows the operator
 * which one they chose rules out swapping `variant`/`color` between the two —
 * doing that would make "No" filled the moment it was selected, exactly the
 * toggle this package's brief forbids. Selection is shown with `aria-pressed`
 * for assistive technology; Yes needs no further sighted cue because it is
 * already the one filled control, and No — always outlined — takes the
 * `action.selected` background tint the app already uses elsewhere for "this
 * is the chosen one" (see `calendar/year-column.tsx`), not a bespoke ring or
 * dimmed sibling. The base treatment — filled success on Yes, outlined error
 * on No — never changes underneath it.
 *
 * ## The form is inside the dialog, not around it
 *
 * MUI's `Dialog` renders through a portal onto `document.body`. A `<form>`
 * wrapping the `Dialog` in JSX therefore does not wrap its submit button in
 * the real DOM, and the button does nothing — `membership-actions.tsx`
 * documents finding exactly this defect by pressing the real button against a
 * real database. The form here starts inside `Dialog` and encloses
 * `DialogActions` for the same reason that file's does.
 */
export function RecordAnswerControl({
  eventId,
  invitationId,
  displayName,
  questions,
}: {
  eventId: string;
  invitationId: string;
  displayName: string;
  questions: readonly ParticipationQuestion[];
}) {
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

  // Adjusted during render rather than in an effect — the React-recommended
  // shape for "reset state when a prop/state value changes" — so a successful
  // save closes the dialog and clears the form in the same commit the new
  // `state` arrives in, with no extra render in between and nothing to run
  // twice under Strict Mode.
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
      <Button
        type="button"
        size="small"
        onClick={openDialog}
        data-testid="record-answer-open"
        sx={{ minHeight: 44, textTransform: "none" }}
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
        <DialogTitle id="record-answer-title">{recordAnswerDialogTitle(displayName)}</DialogTitle>
        <Box component="form" action={formAction} data-testid="record-answer-form">
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="invitationId" value={invitationId} />
          <input type="hidden" name="response" value={response ?? ""} />
          <input type="hidden" name="respondedAtDate" value={scheduledOn} />
          <input type="hidden" name="respondedAtTime" value={timeString} />
          <DialogContent dividers>
            <Stack spacing={2}>
              {state.error ? (
                <Alert severity="error" data-testid="record-answer-error">
                  {state.error}
                </Alert>
              ) : null}

              <Box>
                <FormLabel component="legend">{WHAT_DID_THEY_SAY}</FormLabel>
                <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
                  <Button
                    type="button"
                    variant="contained"
                    color="success"
                    disabled={pending}
                    onClick={() => setResponse("yes")}
                    aria-pressed={response === "yes"}
                    data-testid="response-yes"
                    sx={{ minHeight: 44, flex: 1 }}
                  >
                    {RESPONSE_YES_LABEL}
                  </Button>
                  <Button
                    type="button"
                    variant="outlined"
                    color="error"
                    disabled={pending}
                    onClick={() => setResponse("no")}
                    aria-pressed={response === "no"}
                    data-testid="response-no"
                    sx={{
                      minHeight: 44,
                      flex: 1,
                      // Yes is unmistakable because it is always the filled
                      // control (REQ-emphasis-points-at-yes); No is always
                      // outlined, so it needs its own quiet confirmation that
                      // it is the one currently chosen. `action.selected` is
                      // the shipped idiom for "this is the selected one"
                      // (see calendar/year-column.tsx) rather than the
                      // bespoke ring-and-dim treatment this replaces.
                      bgcolor: response === "no" ? "action.selected" : undefined,
                    }}
                  >
                    {RESPONSE_NO_LABEL}
                  </Button>
                </Stack>
              </Box>

              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enGB}>
                <Box>
                  <FormLabel component="legend">{WHEN_DID_THEY_TELL_YOU}</FormLabel>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 1 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <DatePicker
                        label="Date"
                        value={dateFromScheduledOn(scheduledOn)}
                        onChange={(next) => {
                          if (!next) return;
                          const merged = new Date(next);
                          merged.setHours(when.getHours(), when.getMinutes(), 0, 0);
                          setWhen(merged);
                        }}
                        // Not `disableFuture`: MUI computes "today" from the
                        // browser's own real clock and zone, but this
                        // control's value is deliberately the *club's* wall
                        // clock (see `nowInClubZoneAsLocalDate` above) held in
                        // a `Date` whose local getters echo London's day, not
                        // the operator's. Whenever the operator's machine
                        // sits west of London and it is already past midnight
                        // there, `disableFuture` reads that as "tomorrow" and
                        // permanently flags the field as an error with
                        // nothing the operator did wrong (OWNER-LAN170-04).
                        // `maxDate` computed the same club-zone way compares
                        // like with like regardless of the operator's own
                        // time zone.
                        maxDate={nowInClubZoneAsLocalDate()}
                        disabled={pending}
                        format="dd/MM/yyyy"
                        slotProps={{ textField: { fullWidth: true } }}
                      />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <TimePicker
                        label="Time"
                        value={dateFromTimeString(timeString)}
                        onChange={(next) => {
                          const timeValue = timeStringFromDate(next);
                          const parsed = dateFromTimeString(timeValue);
                          if (!parsed) return;
                          const merged = new Date(when);
                          merged.setHours(parsed.getHours(), parsed.getMinutes(), 0, 0);
                          setWhen(merged);
                        }}
                        disabled={pending}
                        ampm={true}
                        format="hh:mm a"
                        minutesStep={5}
                        timeSteps={{ minutes: 5 }}
                        slotProps={{ textField: { fullWidth: true } }}
                      />
                    </Box>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {WHEN_HELPER}
                  </Typography>
                </Box>
              </LocalizationProvider>

              <Box>
                <TextField
                  label={REASON_LABEL}
                  name="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={pending}
                  multiline
                  minRows={2}
                  fullWidth
                  placeholder={REASON_PLACEHOLDER}
                  helperText={REASON_REQUIRED_FOR_NO}
                  required={response === "no"}
                />
                {response === "no" ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {REASON_PRIVACY_NOTE}
                  </Typography>
                ) : null}
              </Box>

              {questions.length > 0 ? (
                <Box>
                  <Typography variant="overline" color="text.secondary" component="h3">
                    {EVENT_QUESTIONS_HEADING}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {EVENT_QUESTIONS_HELPER}
                  </Typography>
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
                </Box>
              ) : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpen(false)} disabled={pending} sx={{ minHeight: 44 }}>
              {CANCEL}
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={pending || response === null}
              sx={{ minHeight: 44 }}
              data-testid="record-answer-submit"
            >
              {pending ? RECORDING : RECORD_ANSWER}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  );
}
