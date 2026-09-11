"use client";

import { Section } from "@/components/section";
import { Notice } from "@/components/notice";
import { ActionBar } from "@/components/action-bar";
import { Metric, MetricRow } from "@/components/metric";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import { EMPTY_FORM_STATE } from "../../form-state";
import { describeTermCoordinate } from "../../presentation";
import { amendEventAction } from "../change-actions";
import { AmendEventFields } from "./amend-event-fields";
import {
  ALREADY_SENT_DETAIL,
  ALREADY_SENT_HEADING,
  AMEND_BACK_LABEL,
  AMEND_CONTINUE_LABEL,
  AMEND_DISCARD_LABEL,
  AMEND_UNSAVED_BADGE,
  describeChange,
  notifyDefaultDetail,
  QUEUED_MESSAGES_HEADING,
  queuedMessagesDetail,
  RESCHEDULE_RECOMPUTES_NOTE,
  REVIEW_HEADLINE_PREFIX,
  saveAndNotifyLabel,
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
 *
 * Decision history: docs/ux/tickets/LAN-156-amend-and-cancel.md
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
}) {
  const [state, formAction, pending] = useActionState(amendEventAction, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  const [chosenStep, setChosenStep] = useState<Step>("edit");
  /**
   * The refusal the operator has already been shown and moved on from.
   *
   * A server refusal has to put them back at the fields, because that is where
   * the thing to fix is — but it must not pin them there afterwards, or
   * pressing **Save changes…** a second time would appear to do nothing. So the
   * step is derived from "is there a refusal I have not acknowledged yet"
   * rather than pushed by an effect, which is also what
   * `react-hooks/set-state-in-effect` is asking for: an effect that
   * synchronously sets state is a cascading render, and this is a value that
   * can simply be computed.
   */
  const [acknowledged, setAcknowledged] = useState<unknown>(null);
  const [changes, setChanges] = useState<readonly AmendmentChange[]>([]);
  const [notify, setNotify] = useState(false);
  const [silenceConfirmed, setSilenceConfirmed] = useState(false);
  const [localIssues, setLocalIssues] = useState<readonly FieldIssue[]>([]);
  const [nothingChanged, setNothingChanged] = useState(false);

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
  // `VenueField` is a controlled combobox — see the doc comment above on
  // "The review reads the form, not a copy of it" for why that no longer
  // means what it once did here.
  const [venue, setVenue] = useState(value("venue"));

  const issues = localIssues.length > 0 ? localIssues : state.issues;

  const refused = (state.issues.length > 0 || state.error !== null) && acknowledged !== state;
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
      // LAN-265. The form carries it as a hidden field rather than a control:
      // an amendment cannot change the template, and `validateEventDraft`
      // refuses a draft that names none.
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

    if (next.length === 0) {
      setNothingChanged(true);
      return;
    }

    setChanges(next);
    // D55, as W5 reframed it: the defaults decide where the one tick starts.
    setNotify(defaultNotify(next, { isFuture }));
    setSilenceConfirmed(false);
    setStep("review");
  }

  /**
   * Moving the tick. Turning it **off** on a change that moved the date, time
   * or venue does not simply toggle — it opens the confirmation, which is the
   * whole of W5-03b. Turning it back on closes it again.
   */
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
  // W8, REQ-reschedule-recomputes. `startsAt` moves the anchor exactly as
  // `scheduledOn` does — see `recomputeScheduleOnRescheduleIn`'s own note on
  // why `endsAt` is not here.
  const isReschedule = changes.some(
    (change) => change.field === "scheduledOn" || change.field === "startsAt",
  );

  return (
    <Box component="form" action={formAction} ref={formRef} data-testid="amend-form">
      <input type="hidden" name="eventId" value={eventId} />
      {/*
        LAN-244. The version this form was opened on, posted alongside the
        fields, so the save can tell what this operator changed from what they
        merely carried. Without it a second tab's save reverted whatever the
        first tab had written and the change history recorded the reversion as
        an amendment somebody made. `before` is the same snapshot the review
        panel diffs against, so the review and the write agree by construction.
      */}
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
                </Stack>
              </Box>

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
                {/*
                  Two lines at most, and the second only where it is true:
                  how many people get a message, and whether moving the tick
                  will stop and ask. Brian, 2026-08-23 — a control says what it
                  does and what the consequence is, and nothing else.
                */}
                <Typography variant="body2" data-testid="who-hears">
                  {whoHearsAboutIt(audience.invited)}
                </Typography>
                {notifyDefaultDetail(material, isFuture) ? (
                  <Typography variant="body2" color="text.secondary" data-testid="notify-default">
                    {notifyDefaultDetail(material, isFuture)}
                  </Typography>
                ) : null}
              </Box>

              {/*
                Only where messages are actually held. A heading over a sentence
                saying nothing is waiting is a fact about nothing.
              */}
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
                    {pending ? "Saving…" : saveAndNotifyLabel(notify, audience.invited)}
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
