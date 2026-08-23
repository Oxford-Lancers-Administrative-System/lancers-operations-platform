"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  deriveTermCoordinate,
  DRAFTABLE_EVENT_TYPES,
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
import VenueField from "../../venue-field";
import { EMPTY_FORM_STATE } from "../../form-state";
import {
  CLUB_TIME_ZONE_NOTE,
  describeTermCoordinate,
  JOINING_URL_IS_NEVER_PUBLIC,
  labelFor,
  TYPE_LABELS,
} from "../../presentation";
import { amendEventAction } from "../change-actions";
import {
  ALREADY_SENT_DETAIL,
  ALREADY_SENT_HEADING,
  AMEND_BACK_LABEL,
  AMEND_CONTINUE_LABEL,
  AMEND_DISCARD_LABEL,
  AMEND_STAYS_APPROVED,
  AMEND_UNSAVED_BADGE,
  describeChange,
  EXPLAINING_HEADING,
  NO_REASON_FIELD_DETAIL,
  noAnswerDetail,
  notifyDefaultDetail,
  ONE_MESSAGE_NOT_ONE_PER_FIELD,
  QUEUED_MESSAGES_HEADING,
  queuedMessagesDetail,
  REVIEW_HEADLINE_PREFIX,
  saveAndNotifyLabel,
  silenceConsequence,
  SILENCE_NOTIFY_LABEL,
  SILENCE_PROCEED_LABEL,
  SILENCE_RIGHT_AND_WRONG,
  silenceHeadline,
  TELL_PEOPLE_HEADING,
  WHAT_CHANGED_HEADING,
  whoHearsAboutIt,
  yesStandsDetail,
} from "../change-presentation";

/**
 * W5's amendment, as one form with three panels — LAN-156.
 *
 * ## Why one form and not three routes
 *
 * REQ-amend-in-place says changes are held until saved and that discarding
 * leaves no trace. The strongest way to satisfy that is for there to be nowhere
 * to hold a change: the fields stay in this one `<form>`, the review panel
 * reads them, and the single submit is the only write. There is no pending
 * amendment row, no draft store and no server round trip between typing and
 * saving — so abandoning is closing the tab, and it writes nothing because
 * nothing was ever sent anywhere.
 *
 * The mockup annotates the review step with `?step=review`, and this build does
 * not change the address bar. That is the one deliberate departure from W5's
 * screens: putting the step in the URL would mean a server round trip, which
 * would mean the typed-but-unsaved values had to live somewhere between the two
 * renders. The screens themselves are the mockup's.
 *
 * ## The fields are not unmounted between panels
 *
 * They are hidden. A `<form>` posts the inputs it contains, so unmounting the
 * editor to show the review would post an empty amendment — and re-mounting it
 * afterwards would lose what was typed. `hidden` on the container keeps them in
 * the document, keeps them out of the accessibility tree, and keeps them in the
 * submission.
 *
 * ## The review reads the form, not a copy of it
 *
 * `readDraft()` builds the diff from `new FormData(formRef.current)` at the
 * moment the operator presses **Save changes…**, so what the review panel shows
 * is what the submit will send — including the venue, which is an uncontrolled
 * combobox this component deliberately does not mirror into state. A review
 * built from a private copy is the shape that produces a screen agreeing with
 * itself and disagreeing with the database.
 */

type Step = "edit" | "review" | "silence";

export interface AmendAudience {
  invited: number;
  saidYes: number;
  saidNo: number;
  noAnswer: number;
}

function issueFor(issues: readonly FieldIssue[], field: keyof RawEventDraft): string | undefined {
  return issues.find((issue) => issue.field === field)?.message;
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
  const [deliveryMode, setDeliveryMode] = useState(value("deliveryMode") || "in_person");

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
    const control = formRef.current?.elements.namedItem(first.field);
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
      eventType: field("eventType"),
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
      eventType: validation.value.eventType,
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

  return (
    <Box component="form" action={formAction} ref={formRef} data-testid="amend-form">
      <input type="hidden" name="eventId" value={eventId} />
      <input
        type="hidden"
        name="silenceConfirmed"
        value={silenceConfirmed ? "true" : "false"}
        data-testid="silence-confirmed"
      />

      <Stack spacing={3}>
        {state.error ? (
          <Alert severity="error" data-testid="amend-error">
            {state.error}
          </Alert>
        ) : null}

        <Box hidden={step !== "edit"} data-testid="amend-edit-step">
          <Stack spacing={3}>
            <Alert severity="info" data-testid="stays-approved-note">
              {AMEND_STAYS_APPROVED}
            </Alert>

            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="already-sent">
              <Stack spacing={1.5}>
                <Typography variant="h6" component="h2">
                  {ALREADY_SENT_HEADING}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                  <Chip label={`${audience.invited} invited — kept`} data-testid="kept-invited" />
                  <Chip label={`${audience.saidYes} said yes — kept`} data-testid="kept-said-yes" />
                  <Chip label={`${audience.saidNo} said no — kept`} data-testid="kept-said-no" />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {ALREADY_SENT_DETAIL}
                </Typography>
              </Stack>
            </Paper>

            {nothingChanged ? (
              <Alert severity="info" data-testid="nothing-changed">
                Nothing has changed yet.
              </Alert>
            ) : null}

            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
              <Stack spacing={3}>
                <TextField
                  name="name"
                  label="Name"
                  defaultValue={value("name")}
                  error={Boolean(issueFor(issues, "name"))}
                  helperText={issueFor(issues, "name")}
                  fullWidth
                />

                <TextField
                  name="eventType"
                  label="Kind of event"
                  select
                  defaultValue={value("eventType")}
                  error={Boolean(issueFor(issues, "eventType"))}
                  helperText={issueFor(issues, "eventType")}
                  fullWidth
                >
                  {DRAFTABLE_EVENT_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>
                      {labelFor(TYPE_LABELS, type)}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  name="scheduledOn"
                  label="Date"
                  type="date"
                  value={scheduledOn}
                  onChange={(event) => setScheduledOn(event.target.value)}
                  error={Boolean(issueFor(issues, "scheduledOn"))}
                  helperText={issueFor(issues, "scheduledOn") ?? termLine}
                  slotProps={{ inputLabel: { shrink: true } }}
                  fullWidth
                />

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    name="startsAt"
                    label="Start"
                    type="time"
                    defaultValue={value("startsAt")}
                    error={Boolean(issueFor(issues, "startsAt"))}
                    helperText={issueFor(issues, "startsAt") ?? CLUB_TIME_ZONE_NOTE}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 300 } }}
                    fullWidth
                  />
                  <TextField
                    name="endsAt"
                    label="End"
                    type="time"
                    defaultValue={value("endsAt")}
                    error={Boolean(issueFor(issues, "endsAt"))}
                    helperText={issueFor(issues, "endsAt")}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 300 } }}
                    fullWidth
                  />
                </Stack>

                <FormControl>
                  <FormLabel id="amend-delivery-mode">Where it happens</FormLabel>
                  <RadioGroup
                    aria-labelledby="amend-delivery-mode"
                    name="deliveryMode"
                    value={deliveryMode}
                    onChange={(event) => setDeliveryMode(event.target.value)}
                    row
                  >
                    <FormControlLabel value="in_person" control={<Radio />} label="In person" />
                    <FormControlLabel value="online" control={<Radio />} label="Online" />
                  </RadioGroup>
                </FormControl>

                <VenueField
                  name="venue"
                  defaultValue={value("venue")}
                  errorMessage={issueFor(issues, "venue")}
                />

                {deliveryMode === "online" ? (
                  <TextField
                    name="joiningUrl"
                    label="Joining link"
                    defaultValue={value("joiningUrl")}
                    error={Boolean(issueFor(issues, "joiningUrl"))}
                    helperText={issueFor(issues, "joiningUrl") ?? JOINING_URL_IS_NEVER_PUBLIC}
                    fullWidth
                  />
                ) : (
                  <input type="hidden" name="joiningUrl" value="" />
                )}

                <TextField
                  name="description"
                  label="Description"
                  defaultValue={value("description")}
                  multiline
                  minRows={2}
                  fullWidth
                />

                <TextField
                  name="requiredEquipment"
                  label="Required equipment"
                  defaultValue={value("requiredEquipment")}
                  fullWidth
                />

                <FormControl error={Boolean(issueFor(issues, "attendance"))}>
                  <FormLabel id="amend-attendance">Attendance</FormLabel>
                  <RadioGroup
                    aria-labelledby="amend-attendance"
                    name="attendance"
                    defaultValue={value("attendance")}
                    row
                  >
                    <FormControlLabel value="mandatory" control={<Radio />} label="Mandatory" />
                    <FormControlLabel value="optional" control={<Radio />} label="Optional" />
                  </RadioGroup>
                  {issueFor(issues, "attendance") ? (
                    <FormHelperText>{issueFor(issues, "attendance")}</FormHelperText>
                  ) : null}
                </FormControl>
              </Stack>
            </Paper>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
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
              <Button
                variant="outlined"
                href={`/operate/events/${eventId}`}
                disabled={pending}
                sx={{ minHeight: 44 }}
                data-testid="discard-changes"
              >
                {AMEND_DISCARD_LABEL}
              </Button>
            </Stack>
          </Stack>
        </Box>

        {step === "review" ? (
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="amend-review-step">
            <Stack spacing={3}>
              <Box>
                <Typography variant="h6" component="h2">
                  {`${REVIEW_HEADLINE_PREFIX} ${eventName}`}
                </Typography>
                <Chip
                  size="small"
                  color="warning"
                  label={AMEND_UNSAVED_BADGE}
                  sx={{ mt: 1 }}
                  data-testid="unsaved-badge"
                />
              </Box>

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
                      <Typography variant="body2">{describeChange(change)}</Typography>
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
                <Typography variant="body2" data-testid="who-hears">
                  {whoHearsAboutIt(audience.invited, audience.saidNo)}
                </Typography>
                <Typography variant="body2" color="text.secondary" data-testid="notify-default">
                  {notifyDefaultDetail(material, isFuture)}
                </Typography>
                {notify ? (
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    {yesStandsDetail(audience.saidYes) ? (
                      <Typography variant="body2" color="text.secondary">
                        {yesStandsDetail(audience.saidYes)}
                      </Typography>
                    ) : null}
                    {noAnswerDetail(audience.noAnswer) ? (
                      <Typography variant="body2" color="text.secondary">
                        {noAnswerDetail(audience.noAnswer)}
                      </Typography>
                    ) : null}
                    <Typography variant="body2" color="text.secondary">
                      {ONE_MESSAGE_NOT_ONE_PER_FIELD}
                    </Typography>
                  </Stack>
                ) : null}
              </Box>

              <Box>
                <Typography variant="overline" color="text.secondary" component="p">
                  {QUEUED_MESSAGES_HEADING}
                </Typography>
                <Typography variant="body2" color="text.secondary" data-testid="queued-messages">
                  {queuedMessagesDetail(unsentMessages)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="overline" color="text.secondary" component="p">
                  {EXPLAINING_HEADING}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {NO_REASON_FIELD_DETAIL}
                </Typography>
              </Box>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={pending}
                  sx={{ minHeight: 44 }}
                  data-testid="save-amendment"
                >
                  {pending ? "Saving…" : saveAndNotifyLabel(notify, audience.invited)}
                </Button>
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
              </Stack>
            </Stack>
          </Paper>
        ) : null}

        {step === "silence" ? (
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="amend-silence-step">
            <Stack spacing={2}>
              <Typography variant="h6" component="h2" data-testid="silence-headline">
                {silenceHeadline(changes)}
              </Typography>
              <Alert severity="warning" data-testid="silence-consequence">
                {silenceConsequence(audience.invited, changes)}
              </Alert>
              <Typography variant="body2" color="text.secondary">
                {SILENCE_RIGHT_AND_WRONG}
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
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
              </Stack>
            </Stack>
          </Paper>
        ) : null}
      </Stack>
    </Box>
  );
}
