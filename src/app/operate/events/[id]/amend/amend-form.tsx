"use client";

import { Section } from "@/components/section";
import { Notice } from "@/components/notice";
import { ActionBar } from "@/components/action-bar";
import { preventImplicitSubmit } from "@/components/field";
import { Metric, MetricRow } from "@/components/metric";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import {
  deriveTermCoordinate,
  validateEventDraft,
  type FieldIssue,
  type RawEventDraft,
  type TermWindow,
} from "@/lib/services/event-input";
import {
  defaultNotify,
  diffAmendment,
  silenceNeedsConfirmation,
  type AmendableEvent,
  type AmendmentChange,
} from "@/lib/services/event-amendment-rules";
import {
  eventQuestionsDiffer,
  validateEventQuestions,
  type RawEventQuestion,
} from "@/lib/services/event-questions-input";
import { RECRUITMENT_EVENT_TYPE } from "@/lib/services/audience-selection";
import { EMPTY_FORM_STATE } from "../../form-state";
import { describeTermCoordinate, RECRUIT_QUESTIONS_NOTICE } from "../../presentation";
import QuestionEditor from "../../question-editor";
import { editApprovedEventAction } from "../change-actions";
import { AmendEventFields } from "./amend-event-fields";
import {
  ALREADY_SENT_DETAIL,
  ALREADY_SENT_HEADING,
  AMEND_BACK_LABEL,
  AMEND_CONTINUE_LABEL,
  AMEND_DISCARD_LABEL,
  AMEND_UNSAVED_BADGE,
  CORRECTION_TICK_LABEL,
  describeChange,
  notifyDefaultDetail,
  QUESTIONS_CHANGED_LINE,
  questionChangeSummary,
  QUEUED_MESSAGES_HEADING,
  queuedMessagesDetail,
  RESCHEDULE_RECOMPUTES_NOTE,
  REVIEW_HEADLINE_PREFIX,
  saveEventLabel,
  silenceConsequence,
  SILENCE_NOTIFY_LABEL,
  SILENCE_PROCEED_LABEL,
  silenceHeadline,
  TELL_PEOPLE_HEADING,
  WHAT_CHANGED_HEADING,
  whoHearsAboutIt,
} from "../change-presentation";

/**
 * W5's amendment, as one form with three panels — LAN-156. Nothing is held
 * outside this `<form>`: the edit fields stay mounted but `hidden` under the
 * review and silence panels, so a submit always posts what was typed and
 * discarding is closing the tab. `readDraft()` diffs `FormData(formRef)` at
 * submit time, so the review always shows exactly what will be sent.
 */

type Step = "edit" | "review" | "silence";

export interface AmendAudience {
  invited: number;
  saidYes: number;
  saidNo: number;
  noAnswer: number;
}

export default function AmendForm({
  eventId,
  eventName,
  initial,
  before,
  terms,
  audience,
  unsentMessages,
  isFuture,
  initialQuestions,
  eventTypeLabel,
  eventType,
  mayEditQuestions,
}: {
  eventId: string;
  eventName: string;
  /** The stored event, as form values. */
  initial: RawEventDraft;
  /** The stored event, typed, which every diff is taken against. */
  before: AmendableEvent;
  terms: readonly TermWindow[];
  audience: AmendAudience;
  unsentMessages: number;
  isFuture: boolean;
  /** LAN-419 — the questions as stored, which this page now edits too. */
  initialQuestions: readonly RawEventQuestion[];
  /** The template's name, for the question editor's own labels. */
  eventTypeLabel: string;
  /** The `public.event_type` class, for LAN-339's recruit notice. */
  eventType: string;
  /**
   * LAN-419 — whether this operator holds `event_calendar_management` as well
   * as `event_approval`. The two carry the same role list today and are
   * deliberately still two decisions, so the questions half is offered to
   * whoever may actually save it rather than to whoever reached this page.
   */
  mayEditQuestions: boolean;
}) {
  const [state, formAction, pending] = useActionState(editApprovedEventAction, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  const [chosenStep, setChosenStep] = useState<Step>("edit");
  /**
   * The refusal already shown and moved on from — derived from "is there an
   * unacknowledged refusal" rather than pushed by an effect (avoids a
   * cascading-render lint violation).
   */
  const [acknowledged, setAcknowledged] = useState<unknown>(null);
  const [changes, setChanges] = useState<readonly AmendmentChange[]>([]);
  const [notify, setNotify] = useState(false);
  const [silenceConfirmed, setSilenceConfirmed] = useState(false);
  const [localIssues, setLocalIssues] = useState<readonly FieldIssue[]>([]);
  const [nothingChanged, setNothingChanged] = useState(false);

  /**
   * LAN-419 — the questions, edited on the same page and saved by the same
   * press. What was typed wins over what was loaded, exactly as the detail
   * fields do, so a refused submission comes back with the operator's own
   * wording in it.
   */
  const [questions, setQuestions] = useState<RawEventQuestion[]>(() => [
    ...(state.questions ?? initialQuestions),
  ]);
  const [correction, setCorrection] = useState(false);
  const questionChange = state.questionChange ?? null;

  /**
   * Whether the questions differ from the stored ones at all — the same rule
   * the action applies before it writes, imported rather than repeated, so the
   * review the operator reads and the save that follows cannot disagree. A
   * list that does not validate counts as changed: the review is where it is
   * told, and that is the step that shows it.
   */
  const questionsChanged = useMemo(() => {
    const stored = validateEventQuestions([...initialQuestions]);
    const submitted = validateEventQuestions(questions);
    if (!stored.ok || !submitted.ok) return true;
    return eventQuestionsDiffer(stored.value, submitted.value);
  }, [initialQuestions, questions]);

  // What was typed wins over what was loaded, so a refused submission comes back
  // with the operator's own words in it.
  const values: RawEventDraft = state.values ?? initial;
  const value = (field: keyof RawEventDraft): string => {
    const raw = values[field];
    return typeof raw === "string" ? raw : "";
  };

  const [scheduledOn, setScheduledOn] = useState(value("scheduledOn"));
  const [scheduledDate, setScheduledDate] = useState<Date | null>(() =>
    value("scheduledOn") ? new Date(`${value("scheduledOn")}T00:00:00`) : null,
  );
  const [startsAt, setStartsAt] = useState(value("startsAt"));
  const [endsAt, setEndsAt] = useState(value("endsAt"));
  const [attendance, setAttendance] = useState(value("attendance"));
  const [deliveryMode, setDeliveryMode] = useState(value("deliveryMode") || "in_person");
  // `VenueField` is a controlled combobox — see the file header for why.
  const [venue, setVenue] = useState(value("venue"));

  const issues = localIssues.length > 0 ? localIssues : state.issues;

  // LAN-419: a question that does not validate sends the operator back to the
  // fields, exactly as a detail that does not.
  const refused =
    (state.issues.length > 0 || state.questionIssues.length > 0 || state.error !== null) &&
    acknowledged !== state;
  const step: Step = refused ? "edit" : chosenStep;

  function setStep(next: Step) {
    setAcknowledged(state);
    setChosenStep(next);
  }

  useEffect(() => {
    const first = issues[0];
    if (!first) return;
    const wrapper = formRef.current?.querySelector<HTMLElement>(`[data-field="${first.field}"]`);
    const control =
      wrapper?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([aria-hidden="true"]), [role="combobox"], [role="spinbutton"], textarea',
      ) ?? formRef.current?.elements.namedItem(first.field);
    if (control instanceof HTMLElement) control.focus();
  }, [issues]);

  const termLine = useMemo(
    () => describeTermCoordinate(deriveTermCoordinate(scheduledOn || null, terms), terms),
    [scheduledOn, terms],
  );

  /** Reads the live form, exactly as the submission will. */
  function readDraft(): RawEventDraft {
    const form = formRef.current;
    const data = form ? new FormData(form) : new FormData();
    const field = (name: string): string => {
      const raw = data.get(name);
      return typeof raw === "string" ? raw : "";
    };
    return {
      name: field("name"),
      // LAN-265: template can't change on an amendment — hidden field, not a control.
      templateId: field("templateId"),
      scheduledOn: field("scheduledOn"),
      startsAt: field("startsAt"),
      endsAt: field("endsAt"),
      deliveryMode: field("deliveryMode"),
      venue: field("venue"),
      description: field("description"),
      requiredEquipment: field("requiredEquipment"),
      joiningUrl: field("joiningUrl"),
      attendance: field("attendance"),
    };
  }

  function goToReview() {
    setNothingChanged(false);
    const raw = readDraft();
    const validation = validateEventDraft(raw);
    if (!validation.ok) {
      setLocalIssues(validation.issues);
      setStep("edit");
      return;
    }
    setLocalIssues([]);

    const next = diffAmendment(before, {
      name: validation.value.name,
      templateId: validation.value.templateId,
      scheduledOn: validation.value.scheduledOn,
      startsAt: validation.value.startsAt,
      endsAt: validation.value.endsAt,
      deliveryMode: validation.value.deliveryMode,
      venue: validation.value.venue,
      description: validation.value.description,
      requiredEquipment: validation.value.requiredEquipment,
      joiningUrl: validation.value.joiningUrl,
      isMandatory: validation.value.isMandatory,
    });

    // LAN-419: a questions-only change is a change. Nothing is refused here
    // for having left the details alone.
    if (next.length === 0 && !questionsChanged) {
      setNothingChanged(true);
      return;
    }

    setChanges(next);
    // D55, as W5 reframed it: the defaults decide where the one tick starts.
    setNotify(defaultNotify(next, { isFuture }));
    setSilenceConfirmed(false);
    setStep("review");
  }

  /** Turning notify off on a date/time/venue change opens confirmation (W5-03b); back on closes it. */
  function moveTheTick(next: boolean) {
    if (!next && silenceNeedsConfirmation(changes, { isFuture })) {
      setNotify(false);
      setStep("silence");
      return;
    }
    setNotify(next);
    setSilenceConfirmed(false);
  }

  const material = changes.some((change) => change.material);
  // W8, REQ-reschedule-recomputes: startsAt moves the anchor like scheduledOn does.
  const isReschedule = changes.some(
    (change) => change.field === "scheduledOn" || change.field === "startsAt",
  );

  return (
    <Box
      component="form"
      action={formAction}
      ref={formRef}
      onKeyDown={preventImplicitSubmit}
      data-testid="amend-form"
    >
      <input type="hidden" name="eventId" value={eventId} />
      {/* LAN-244: the version this form opened on, posted with the fields, so a second tab's save can't silently revert the first tab's write. */}
      <input
        type="hidden"
        name="baseline"
        value={JSON.stringify(before)}
        data-testid="amend-baseline"
      />
      <input
        type="hidden"
        name="silenceConfirmed"
        value={silenceConfirmed ? "true" : "false"}
        data-testid="silence-confirmed"
      />

      <Stack spacing={3}>
        {state.error ? (
          <Notice severity="error" testId="amend-error">
            {state.error}
          </Notice>
        ) : null}

        <Box hidden={step !== "edit"} data-testid="amend-edit-step">
          <Stack spacing={3}>
            <Section title={ALREADY_SENT_HEADING} testId="already-sent">
              <Stack spacing={1.5}>
                <MetricRow>
                  <Metric value={audience.invited} label="Invited — kept" testId="kept-invited" />
                  <Metric value={audience.saidYes} label="Said yes — kept" testId="kept-said-yes" />
                  <Metric value={audience.saidNo} label="Said no — kept" testId="kept-said-no" />
                </MetricRow>
                <Typography variant="body2" color="text.secondary">
                  {ALREADY_SENT_DETAIL}
                </Typography>
              </Stack>
            </Section>

            {nothingChanged ? (
              <Notice severity="info" testId="nothing-changed">
                Nothing has changed yet.
              </Notice>
            ) : null}

            <AmendEventFields
              issues={issues}
              value={value}
              templateId={value("templateId")}
              scheduledOn={scheduledOn}
              scheduledDate={scheduledDate}
              onScheduledDateChange={setScheduledDate}
              onScheduledOnChange={setScheduledOn}
              termLine={termLine}
              startsAt={startsAt}
              onStartsAtChange={setStartsAt}
              endsAt={endsAt}
              onEndsAtChange={setEndsAt}
              deliveryMode={deliveryMode}
              onDeliveryModeChange={setDeliveryMode}
              venue={venue}
              onVenueChange={setVenue}
              attendance={attendance}
              onAttendanceChange={setAttendance}
            />

            {/* LAN-419, Brian on the 2026-09-22 call: "if I go to edit an
                event, it also includes the questions". The draft form has
                always had them below the facts; this is the same editor, in
                the same place, on an approved event. Remove is absent because
                an answer already given points at the question row (LAN-318). */}
            {mayEditQuestions ? (
              <Section title="Questions" testId="amend-questions">
                <QuestionEditor
                  questions={questions}
                  onChange={setQuestions}
                  eventTypeLabel={eventTypeLabel}
                  issues={state.questionIssues}
                  disabled={pending}
                  removable={false}
                  notice={
                    eventType === RECRUITMENT_EVENT_TYPE ? RECRUIT_QUESTIONS_NOTICE : undefined
                  }
                />
              </Section>
            ) : null}

            <ActionBar
              primary={
                <Button
                  variant="contained"
                  type="button"
                  onClick={goToReview}
                  disabled={pending}
                  sx={{ minHeight: 44 }}
                  data-testid="continue-to-review"
                >
                  {AMEND_CONTINUE_LABEL}
                </Button>
              }
              secondary={
                <Button
                  variant="outlined"
                  href={`/operate/events/${eventId}`}
                  disabled={pending}
                  sx={{ minHeight: 44 }}
                  data-testid="discard-changes"
                >
                  {AMEND_DISCARD_LABEL}
                </Button>
              }
            />
          </Stack>
        </Box>

        {step === "review" ? (
          <Section title={`${REVIEW_HEADLINE_PREFIX} ${eventName}`} testId="amend-review-step">
            <Stack spacing={3}>
              <Notice severity="warning" testId="unsaved-badge">
                {AMEND_UNSAVED_BADGE}
              </Notice>

              <Box>
                <Typography variant="overline" color="text.secondary" component="p">
                  {WHAT_CHANGED_HEADING}
                </Typography>
                <Stack
                  component="ul"
                  spacing={0}
                  sx={{ listStyle: "none", p: 0, m: 0 }}
                  data-testid="what-changed"
                >
                  {changes.map((change) => (
                    <Box
                      component="li"
                      key={change.field}
                      sx={{ py: 1, borderBottom: 1, borderColor: "divider" }}
                      data-testid={`change-${change.field}`}
                    >
                      {/* LAN-264: a multi-line value reads as it was typed. */}
                      <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
                        {describeChange(change)}
                      </Typography>
                    </Box>
                  ))}
                  {/* LAN-419 — the questions are part of this save, so they are
                      part of what it says it will do. A row, in the same list,
                      because they are one change among the others. */}
                  {questionsChanged ? (
                    <Box
                      component="li"
                      sx={{ py: 1, borderBottom: 1, borderColor: "divider" }}
                      data-testid="change-questions"
                    >
                      <Typography variant="body2">{QUESTIONS_CHANGED_LINE}</Typography>
                    </Box>
                  ) : null}
                </Stack>
              </Box>

              {/* LAN-367, carried into the combined save: a question change
                  that would void answers is confirmed before anything at all
                  is written — the details included. D3's correction tick is
                  here, on the same terms. */}
              {questionChange ? (
                <Box>
                  <Notice severity="warning" testId="event-questions-confirm">
                    {questionChangeSummary(
                      questionChange.changedPrompts.length,
                      questionChange.addedCount,
                      questionChange.peopleToAsk,
                    )}
                  </Notice>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={correction}
                        onChange={(event) => setCorrection(event.target.checked)}
                        disabled={pending}
                        data-testid="event-questions-correction"
                      />
                    }
                    label={CORRECTION_TICK_LABEL}
                  />
                  <input type="hidden" name="correction" value={correction ? "1" : "0"} />
                  <input type="hidden" name="confirm" value="1" />
                </Box>
              ) : null}

              <Box>
                <Typography variant="overline" color="text.secondary" component="p">
                  {TELL_PEOPLE_HEADING}
                </Typography>
                <Box data-testid="notify-tick">
                  <FormControlLabel
                    control={
                      <Switch
                        name="notify"
                        checked={notify}
                        onChange={(event) => moveTheTick(event.target.checked)}
                      />
                    }
                    label={notify ? "Notify" : "Silent"}
                  />
                </Box>
                {/* Two lines at most: how many people get a message, and whether moving the tick will stop and ask. */}
                <Typography variant="body2" data-testid="who-hears">
                  {whoHearsAboutIt(audience.invited)}
                </Typography>
                {notifyDefaultDetail(material, isFuture) ? (
                  <Typography variant="body2" color="text.secondary" data-testid="notify-default">
                    {notifyDefaultDetail(material, isFuture)}
                  </Typography>
                ) : null}
              </Box>

              {/* Only shown where messages are actually held. */}
              {queuedMessagesDetail(unsentMessages) ? (
                <Box>
                  <Typography variant="overline" color="text.secondary" component="p">
                    {QUEUED_MESSAGES_HEADING}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" data-testid="queued-messages">
                    {queuedMessagesDetail(unsentMessages)}
                  </Typography>
                </Box>
              ) : null}

              {isReschedule ? (
                <Notice severity="info" testId="reschedule-recomputes-note">
                  {RESCHEDULE_RECOMPUTES_NOTE}
                </Notice>
              ) : null}

              <ActionBar
                primary={
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={pending}
                    sx={{ minHeight: 44 }}
                    data-testid="save-amendment"
                  >
                    {pending
                      ? "Saving…"
                      : saveEventLabel(notify, audience.invited, questionChange !== null)}
                  </Button>
                }
                secondary={
                  <Button
                    type="button"
                    variant="outlined"
                    onClick={() => setStep("edit")}
                    disabled={pending}
                    sx={{ minHeight: 44 }}
                    data-testid="back-to-edit"
                  >
                    {AMEND_BACK_LABEL}
                  </Button>
                }
              />
            </Stack>
          </Section>
        ) : null}

        {step === "silence" ? (
          <Section title={silenceHeadline(changes)} testId="amend-silence-step">
            <Stack spacing={2}>
              <Notice severity="warning" testId="silence-consequence">
                {silenceConsequence(audience.invited, changes)}
              </Notice>
              <ActionBar
                primary={
                  <Button
                    type="button"
                    variant="contained"
                    onClick={() => {
                      setNotify(true);
                      setSilenceConfirmed(false);
                      setStep("review");
                    }}
                    disabled={pending}
                    sx={{ minHeight: 44 }}
                    data-testid="silence-notify-instead"
                  >
                    {SILENCE_NOTIFY_LABEL}
                  </Button>
                }
                secondary={
                  <Button
                    type="button"
                    variant="outlined"
                    color="warning"
                    onClick={() => {
                      setSilenceConfirmed(true);
                      setStep("review");
                    }}
                    disabled={pending}
                    sx={{ minHeight: 44 }}
                    data-testid="silence-accept"
                  >
                    {SILENCE_PROCEED_LABEL}
                  </Button>
                }
              />
            </Stack>
          </Section>
        ) : null}
      </Stack>
    </Box>
  );
}
