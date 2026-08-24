"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { enGB } from "date-fns/locale/en-GB";
import {
  deriveTermCoordinate,
  DRAFTABLE_EVENT_TYPES,
  type RawEventDraft,
  type TermWindow,
} from "@/lib/services/event-input";
import { endTimeFromStart } from "@/lib/services/event-template-input";
import type { RawEventQuestion } from "@/lib/services/event-questions-input";
import type { EventTypeFormDefaults } from "@/lib/services/event-template-input";
import { createEventDraftAction, updateEventDraftAction } from "./actions";
import {
  dateFromScheduledOn,
  dateFromTimeString,
  scheduledOnFromDate,
  timeStringFromDate,
} from "./date-time-controls";
import { EMPTY_FORM_STATE, type EventFormState } from "./form-state";
import QuestionEditor from "./question-editor";
import VenueField from "./venue-field";
import {
  CLUB_TIME_ZONE_NOTE,
  describeTermCoordinate,
  duplicatedFrom,
  formatLongDate,
  JOINING_URL_IS_NEVER_PUBLIC,
  labelFor,
  TYPE_LABELS,
} from "./presentation";

/**
 * UX-31 — the event editor, in both of its modes, as LAN-154 extended it.
 *
 * One component for create and edit because they are the same screen with the
 * same rules; the differences are the action it posts to, the heading above it
 * and whether the fields start empty.
 *
 * ## The date is the source of truth
 *
 * Brian's LAN-76 clarification: the operator enters the real date and times,
 * and the Oxford term and week are **derived** from the date rather than chosen
 * beside it. The three used to be independent fields, which let an operator
 * record a date in Michaelmas and label it Hilary week 4 with nothing to
 * disagree.
 *
 * The derivation runs twice, on purpose. Here, as the operator types, so the
 * coordinate appears under the date as read-only context — the clarification's
 * "may be displayed as read-only contextual information after the date is
 * selected". And again in the service, inside the transaction, from the same
 * pure function, because a value computed in a browser is a value the browser
 * can change. What is shown is a courtesy; what is stored is derived
 * server-side.
 *
 * Origin is gone from the form for the same reason and by the same
 * instruction: an operator entering a practice on the club's own calendar was
 * being asked to classify its provenance from four unexplained words. It is
 * derived on create and left alone on edit.
 *
 * ## The type's template fills the form in, field by field
 *
 * D40 through D47. Choosing **Practice** puts the Practice template's venue,
 * description, equipment, attendance and questions into the form, where the
 * operator can see them and change them. Changing the type to **Social**
 * replaces **only the fields nobody has touched** — the same rule D41 applies to
 * a saved draft, applied here while the event is still being written, so that
 * picking the wrong type first does not cost somebody the description they just
 * wrote.
 *
 * `templates` therefore carries all seven, not one: the rule needs the value the
 * previous type gave a field to decide whether the operator changed it.
 *
 * ## Attendance now has a default, and that is a deliberate change
 *
 * LAN-76 made mandatory-or-optional an explicit choice with no default, so that
 * an event never quietly claimed attendance was expected when nobody had said
 * so. D15 and W8 change what is right here: name, type and date are the minimum
 * to save a draft, and the template says whether this kind of event expects
 * attendance. So the control starts on the template's answer, and on **Optional**
 * where the template does not say — which is the direction the old rule cared
 * about, since "optional" claims nothing. It is visible and one click from the
 * other, rather than a hidden default.
 *
 * ## Validation behaviour
 *
 * The shared state contract requires a validation failure to "preserve entries,
 * identify the field, state the correction, focus the first invalid control".
 * The action returns exactly what was submitted plus a field-keyed list, this
 * component re-renders from those values, and the effect below moves focus to
 * the first named field.
 */

export type EventFormMode = "create" | "edit";

function issueFor(state: EventFormState, field: keyof RawEventDraft): string | undefined {
  return state.issues.find((issue) => issue.field === field)?.message;
}

const SCHEDULED_ON_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether `scheduledOn` is a `YYYY-MM-DD` that `formatLongDate` can safely
 * turn into a sentence.
 *
 * W154C-F1: the date field used to be a native `<input type="date">`, which
 * renders in the browser's locale (D86) and let Chrome's segmented editor
 * land on a value like `20261-12-11` mid-edit — a five-digit year that is
 * neither empty nor a parseable date. `scheduledOn === ""` let everything
 * else through to `formatLongDate`, which only guards falsy input, so
 * `Intl.DateTimeFormat` threw on the resulting `Invalid Date` and took the
 * whole form with it.
 *
 * C1 replaced that native control with MUI X's `DatePicker`, whose field
 * validates its own sections and only ever calls back with a complete,
 * in-range `Date` or `null` — so the five-digit-year shape this guards
 * against can no longer reach `scheduledOn` from the picker itself. The guard
 * stays anyway: `scheduledOn` also arrives from a rejected submission's
 * `state.values`, a path this function does not control, and the derived-term
 * alert should fall back to its placeholder for any in-progress or malformed
 * value on that path too rather than only an empty one.
 */
function isFormattableScheduledOn(candidate: string): boolean {
  if (!SCHEDULED_ON_PATTERN.test(candidate)) return false;
  return !Number.isNaN(Date.parse(`${candidate}T00:00:00Z`));
}

/** The inherited text fields, and how each is read out of a form value bag. */
const INHERITED_TEXT = ["venue", "description", "requiredEquipment"] as const;

export default function EventForm({
  mode,
  eventId,
  terms,
  initial,
  initialQuestions,
  templates,
  duplicatedFromName,
  cancelHref,
}: {
  mode: EventFormMode;
  /** The draft being edited. Absent when creating. */
  eventId?: string;
  /** The Oxford calendar, for deriving the coordinate as the operator types. */
  terms: readonly TermWindow[];
  initial?: RawEventDraft;
  /** The questions already on this event, or the ones its type's template gives. */
  initialQuestions?: readonly RawEventQuestion[];
  /** All seven templates, because the Type control decides which one applies. */
  templates: Readonly<Record<string, EventTypeFormDefaults>>;
  /** D39 — the event this form was prefilled from, when it was. */
  duplicatedFromName?: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createEventDraftAction : updateEventDraftAction,
    EMPTY_FORM_STATE,
  );

  const formRef = useRef<HTMLFormElement>(null);

  // What was typed wins over what was loaded, so a rejected submission comes
  // back with the operator's own words in it.
  const values: RawEventDraft = state.values ?? initial ?? {};
  const value = (field: keyof RawEventDraft): string => {
    const raw = values[field];
    return typeof raw === "string" ? raw : "";
  };

  const startingType = value("eventType") || "practice";

  /**
   * What this form opens with, before anybody has typed anything.
   *
   * An **edit** carries the event's stored values, and a refused submission
   * carries what was typed — both arrive as `initial`/`state.values`, and both
   * win. A blank **create** has neither, and that is the case the template
   * fills: D40 through D47 say a new event of a type starts as that type says,
   * visibly and editably, rather than as an empty form the operator retypes the
   * same five answers into every Wednesday.
   */
  const opening = (
    field: keyof RawEventDraft,
    fromTemplate: (defaults: EventTypeFormDefaults) => string,
  ): string => {
    const typed = value(field);
    if (typed !== "") return typed;
    const defaults = templates[startingType];
    return defaults === undefined ? "" : fromTemplate(defaults);
  };

  const [eventType, setEventType] = useState(startingType);
  /**
   * C1. `scheduledOn` (the `YYYY-MM-DD` the server action and the rest of
   * this component read) is *derived* from this Date, never the other way
   * round. `DatePicker` is controlled, and its field fires `onChange` with a
   * genuine, if provisional, `Date` the instant the year section holds even
   * one digit — a day and month already typed plus a year of "2" is a real
   * 0002-08-24. Round-tripping that through `scheduledOn` and back on every
   * keystroke works until the field's own display keeps building a year the
   * string briefly could not represent consistently; keeping the `Date`
   * itself as the source of truth and only ever handing the field back
   * exactly what it just gave us sidesteps the mismatch entirely, at the
   * cost of one extra piece of state.
   */
  const [scheduledOnDate, setScheduledOnDate] = useState<Date | null>(() =>
    dateFromScheduledOn(value("scheduledOn")),
  );
  const scheduledOn = scheduledOnFromDate(scheduledOnDate);
  const [startsAt, setStartsAt] = useState(value("startsAt"));
  const [endsAt, setEndsAt] = useState(value("endsAt"));
  const [endTouched, setEndTouched] = useState(value("endsAt") !== "");
  const [where, setWhere] = useState(
    () => opening("deliveryMode", (defaults) => defaults.deliveryMode) || "in_person",
  );
  const [venue, setVenue] = useState(() => opening("venue", (defaults) => defaults.venue));
  const [description, setDescription] = useState(() =>
    opening("description", (defaults) => defaults.description),
  );
  const [requiredEquipment, setRequiredEquipment] = useState(() =>
    opening("requiredEquipment", (defaults) => defaults.requiredEquipment),
  );
  const [attendance, setAttendance] = useState(
    () => opening("attendance", (defaults) => defaults.attendance) || "optional",
  );
  const [questions, setQuestions] = useState<RawEventQuestion[]>(() => [
    ...(initialQuestions ?? []),
  ]);

  const term = useMemo(
    () => deriveTermCoordinate(scheduledOn === "" ? null : scheduledOn, terms),
    [scheduledOn, terms],
  );

  const template = templates[eventType];
  const typeLabel = labelFor(TYPE_LABELS, eventType);

  /**
   * D41's rule, applied while the event is still being written.
   *
   * A field still holding what the old type's template gave it takes the new
   * type's value; a field the operator wrote keeps what they wrote. The same
   * comparison the service makes against a saved draft, for the same reason —
   * and the reason it is here rather than only there is that changing the type
   * is the one moment on this form when the template underneath it changes.
   */
  function changeType(next: string) {
    const was = templates[eventType];
    const now = templates[next];
    setEventType(next);
    if (!was || !now) return;

    if (where === was.deliveryMode) setWhere(now.deliveryMode);
    if (venue === was.venue) setVenue(now.venue);
    if (description === was.description) setDescription(now.description);
    if (requiredEquipment === was.requiredEquipment) {
      setRequiredEquipment(now.requiredEquipment);
    }
    if (attendance === was.attendance) setAttendance(now.attendance);
    if (!endTouched && startsAt !== "") {
      setEndsAt(endTimeFromStart(startsAt, now.durationMinutes) ?? "");
    }

    // D42. The questions the old type supplied leave with it; the operator's own
    // stay exactly where they are, in the order they were in.
    setQuestions((current) => [
      ...current.filter((question) => question.fromTemplate !== "true"),
      ...now.questions,
    ]);
  }

  /** D78 — entering a start fills the end from the type's default length. */
  function changeStart(next: string) {
    setStartsAt(next);
    if (endTouched || next === "" || !template) return;
    setEndsAt(endTimeFromStart(next, template.durationMinutes) ?? "");
  }

  // Focus the first control the operator has to fix. The field name comes off
  // the returned issue rather than being tracked in the component, so the form
  // and the rule that produced the correction cannot drift apart.
  //
  // The lookup is by `data-field` on the control's wrapper, not by `name`,
  // because a MUI select and a radio group both carry `name` on an element that
  // cannot take focus — a hidden input. The first genuinely focusable
  // descendant is what an operator's cursor has to land on.
  useEffect(() => {
    const first = state.issues[0];
    if (!first || !formRef.current) return;
    const wrapper = formRef.current.querySelector<HTMLElement>(`[data-field="${first.field}"]`);
    const control = wrapper?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([aria-hidden="true"]), [role="combobox"], textarea',
    );
    (control ?? wrapper)?.focus();
  }, [state.issues]);

  return (
    <Box component="form" action={formAction} ref={formRef} data-testid="event-form">
      {eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}

      <Stack spacing={3} sx={{ maxWidth: 760 }}>
        <Alert severity="info" data-testid="draft-boundary-note">
          Draft events have no invitations, responses or attendance. Saving a draft does not
          distribute anything.
        </Alert>

        {duplicatedFromName ? (
          <Alert severity="info" icon={false} data-testid="duplicated-from">
            {duplicatedFrom(duplicatedFromName)}
          </Alert>
        ) : null}

        {state.error ? (
          <Alert severity="error" data-testid="event-form-error">
            {state.error}
          </Alert>
        ) : null}

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={3}>
            <TextField
              label="Name"
              name="name"
              data-field="name"
              defaultValue={value("name")}
              error={Boolean(issueFor(state, "name"))}
              helperText={
                issueFor(state, "name") ??
                (eventType === "game" ? "The opponent goes in the name." : undefined)
              }
              fullWidth
            />

            {/*
              `shrink` is explicit because this select always has a value —
              `practice` when nothing was chosen — and MUI was leaving the
              outline's notch closed, so the label sat on top of the value.
              Found in the LAN-151 browser preflight, on both the create and the
              edit screen; every other field on this form notches correctly
              because every other field can legitimately be empty.
            */}
            <TextField
              select
              label="Type"
              name="eventType"
              data-field="eventType"
              value={eventType}
              onChange={(event) => changeType(event.target.value)}
              error={Boolean(issueFor(state, "eventType"))}
              helperText={issueFor(state, "eventType")}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            >
              {DRAFTABLE_EVENT_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {labelFor(TYPE_LABELS, type)}
                </MenuItem>
              ))}
            </TextField>

            {/*
              C1 + C2. A native `<input type="date">`/`<input type="time">`
              renders in the browser/OS locale and ignores the page — that is
              what put an American mm/dd/yyyy date picker and a 12-hour clock
              in front of an operator who typed a British one, and is the root
              cause of W154C-F1's crash. MUI X's `DatePicker`/`TimePicker`
              draw their own field rather than delegating to the OS, so
              `format`, `ampm={false}` and the five-minute step hold no matter
              what the browser or OS thinks a date or time looks like. Each
              carries a hidden input for the form post — the visible field
              shows "24/08/2026"; the value the server action reads is still
              plain `scheduledOn`/`startsAt`/`endsAt`, exactly as before.
            */}
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enGB}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <Box data-field="scheduledOn" sx={{ flex: 1 }}>
                  <DatePicker
                    label="Date"
                    value={scheduledOnDate}
                    onChange={(next) => setScheduledOnDate(next)}
                    format="dd/MM/yyyy"
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        error: Boolean(issueFor(state, "scheduledOn")),
                        helperText:
                          issueFor(state, "scheduledOn") ??
                          "Day, month, year — e.g. 24/08/2026. A draft may have no date yet.",
                      },
                    }}
                  />
                  <input type="hidden" name="scheduledOn" value={scheduledOn} />
                </Box>
                <Box data-field="startsAt" sx={{ flex: 1 }}>
                  <TimePicker
                    label="Start"
                    value={dateFromTimeString(startsAt)}
                    onChange={(next) => changeStart(timeStringFromDate(next))}
                    ampm={false}
                    format="HH:mm"
                    minutesStep={5}
                    timeSteps={{ minutes: 5 }}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        error: Boolean(issueFor(state, "startsAt")),
                        helperText:
                          issueFor(state, "startsAt") ??
                          "24-hour clock, five-minute steps, e.g. 20:00.",
                      },
                    }}
                  />
                  <input type="hidden" name="startsAt" value={startsAt} />
                </Box>
                <Box data-field="endsAt" sx={{ flex: 1 }}>
                  <TimePicker
                    label="End"
                    value={dateFromTimeString(endsAt)}
                    onChange={(next) => {
                      setEndTouched(true);
                      setEndsAt(timeStringFromDate(next));
                    }}
                    ampm={false}
                    format="HH:mm"
                    minutesStep={5}
                    timeSteps={{ minutes: 5 }}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        error: Boolean(issueFor(state, "endsAt")),
                        helperText:
                          issueFor(state, "endsAt") ??
                          (template?.durationMinutes !== null && template !== undefined
                            ? "Follows the start; adjust it."
                            : "Must be after the start."),
                      },
                    }}
                  />
                  <input type="hidden" name="endsAt" value={endsAt} />
                </Box>
              </Stack>
            </LocalizationProvider>

            {/*
              D86. C1/C2 fixed the date and time *format*; neither field says
              what time zone it is in, and the club has exactly one — none of
              this trio carries a zone of its own. Saying which zone these are
              is the whole of D86 and it is said once, here, beside the three
              fields it is about.
            */}
            <Typography variant="body2" color="text.secondary" data-testid="club-time-zone-note">
              {CLUB_TIME_ZONE_NOTE}
            </Typography>

            {/*
              Derived, and shown so the operator can see the derivation was
              right — never an input. `aria-live` because it changes under them
              in response to the date rather than to anything they focused.
            */}
            <Alert severity="info" icon={false} data-testid="derived-term" aria-live="polite">
              {!isFormattableScheduledOn(scheduledOn) ? (
                "Choose a date and the Oxford term and week are worked out from it."
              ) : (
                <>
                  <strong>{formatLongDate(scheduledOn)}</strong>
                  {" — "}
                  {describeTermCoordinate(term, terms)}
                </>
              )}
            </Alert>

            {/*
              D20. Where the event is, as a property, rather than something
              guessed from what somebody typed into the venue field. It decides
              what that field then means (D21) and whether a joining link is a
              thing this event can have at all.
            */}
            <FormControl error={Boolean(issueFor(state, "deliveryMode"))} data-field="deliveryMode">
              <FormLabel id="delivery-mode-label">Where</FormLabel>
              <RadioGroup
                aria-labelledby="delivery-mode-label"
                name="deliveryMode"
                value={where}
                onChange={(event) => setWhere(event.target.value)}
              >
                <FormControlLabel value="in_person" control={<Radio />} label="In person" />
                <FormControlLabel value="online" control={<Radio />} label="Online" />
              </RadioGroup>
              <FormHelperText>
                {issueFor(state, "deliveryMode") ??
                  "In person takes an address; online takes the destination, such as Teams."}
              </FormHelperText>
            </FormControl>

            {/*
              LAN-115 replaced the plain venue text field with a searchable
              place/address combobox. It is still one `name="venue"` input
              posting one line of text, so nothing about how this form is read,
              validated, saved or audited changed with it. An online event is
              not searching a map, so it gets a plain field for its destination.
            */}
            {where === "online" ? (
              <TextField
                label="Destination"
                name="venue"
                data-field="venue"
                value={venue}
                onChange={(event) => setVenue(event.target.value)}
                error={Boolean(issueFor(state, "venue"))}
                helperText={issueFor(state, "venue") ?? "Where online — Teams, Zoom, a Discord."}
                fullWidth
              />
            ) : (
              <VenueField
                name="venue"
                value={venue}
                onValueChange={setVenue}
                errorMessage={issueFor(state, "venue")}
              />
            )}

            {/*
              REQ-no-joining-url. Stored on the event and never public, never in
              a subscription feed and never in a payload behind one. How an
              invited person receives it is deliberately unsolved, and this form
              does not pretend otherwise.
            */}
            {where === "online" ? (
              <TextField
                label="Joining link"
                name="joiningUrl"
                data-field="joiningUrl"
                defaultValue={value("joiningUrl")}
                error={Boolean(issueFor(state, "joiningUrl"))}
                helperText={issueFor(state, "joiningUrl") ?? JOINING_URL_IS_NEVER_PUBLIC}
                fullWidth
              />
            ) : null}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={3}>
            {/* D18. */}
            <TextField
              label="Description"
              name="description"
              data-field="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              error={Boolean(issueFor(state, "description"))}
              helperText={
                issueFor(state, "description") ?? "What this is, and anything people need to know."
              }
              multiline
              minRows={3}
              fullWidth
            />

            {/* D17: its own field, so it is not buried in a paragraph. */}
            <TextField
              label="Required equipment"
              name="requiredEquipment"
              data-field="requiredEquipment"
              value={requiredEquipment}
              onChange={(event) => setRequiredEquipment(event.target.value)}
              error={Boolean(issueFor(state, "requiredEquipment"))}
              helperText={
                issueFor(state, "requiredEquipment") ?? "What to bring. Leave empty if nothing."
              }
              fullWidth
            />

            <FormControl error={Boolean(issueFor(state, "attendance"))} data-field="attendance">
              <FormLabel id="attendance-label">Attendance</FormLabel>
              <RadioGroup
                aria-labelledby="attendance-label"
                name="attendance"
                value={attendance}
                onChange={(event) => setAttendance(event.target.value)}
              >
                <FormControlLabel value="mandatory" control={<Radio />} label="Mandatory" />
                <FormControlLabel value="optional" control={<Radio />} label="Optional" />
              </RadioGroup>
              <FormHelperText>
                {issueFor(state, "attendance") ?? "Whether attendance is expected of the audience."}
              </FormHelperText>
            </FormControl>

            {/*
              D23 removed "Response requested" from this form. It was not a real
              concept: mandatory or optional already carries it, and everyone
              sent an event is expected to answer.
            */}
            <Typography variant="body2" color="text.secondary" data-testid="everyone-answers-note">
              Everyone this event is sent to is asked to answer. Mandatory or optional says whether
              the club expects them to be there, not whether it wants to know.
            </Typography>
          </Stack>
        </Paper>

        <QuestionEditor
          questions={questions}
          onChange={setQuestions}
          eventTypeLabel={typeLabel}
          issues={state.questionIssues}
          disabled={pending}
        />

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ alignItems: { sm: "center" } }}
        >
          <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
            {pending ? "Saving…" : "Save draft"}
          </Button>
          {/*
            The same submission, landing somewhere else. `formAction` is not
            available on a React Server Action form, so the destination travels
            as a field the action reads — which also means a browser cannot send
            it anywhere the action does not already know about.
          */}
          <Button
            type="submit"
            name="then"
            value="audience"
            variant="outlined"
            disabled={pending}
            data-testid="save-and-choose-audience"
            sx={{ minHeight: 44 }}
          >
            Save and choose audience
          </Button>
          <Button variant="text" href={cancelHref} disabled={pending}>
            Cancel
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

export { INHERITED_TEXT };
