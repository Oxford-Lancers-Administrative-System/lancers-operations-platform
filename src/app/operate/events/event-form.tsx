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
import {
  deriveTermCoordinate,
  DRAFTABLE_EVENT_TYPES,
  type RawEventDraft,
  type TermWindow,
} from "@/lib/services/event-input";
import { createEventDraftAction, updateEventDraftAction } from "./actions";
import { EMPTY_FORM_STATE, type EventFormState } from "./form-state";
import VenueField from "./venue-field";
import {
  AUDIENCE_COMES_LATER,
  CLUB_TIME_ZONE_NOTE,
  describeTermCoordinate,
  formatLongDate,
  JOINING_URL_IS_NEVER_PUBLIC,
  labelFor,
  TYPE_LABELS,
} from "./presentation";

/**
 * UX-31 — the event editor, in both of its modes.
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
 * The creator is not shown either. It is written to `owner_person_id` and named
 * in every audit row, which is where accountability lives; printing the
 * operator's own name back at them while they type was noise.
 *
 * ## The two flags have no default, deliberately
 *
 * LAN-76, reaffirmed by the clarification: the response-requested flag is "an
 * explicit choice in the form, not a silent default, and its meaning is stated
 * on screen". Attendance is treated the same way.
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

export default function EventForm({
  mode,
  eventId,
  terms,
  initial,
  cancelHref,
}: {
  mode: EventFormMode;
  /** The draft being edited. Absent when creating. */
  eventId?: string;
  /** The Oxford calendar, for deriving the coordinate as the operator types. */
  terms: readonly TermWindow[];
  initial?: RawEventDraft;
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

  // The date drives the term line, so it is the one field this component
  // tracks. Everything else is uncontrolled and read from the form on submit.
  const [scheduledOn, setScheduledOn] = useState(value("scheduledOn"));
  const term = useMemo(
    () => deriveTermCoordinate(scheduledOn === "" ? null : scheduledOn, terms),
    [scheduledOn, terms],
  );

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

  const attendance = value("attendance");
  // Controlled, because it decides which of the two venue fields is on screen
  // and whether the joining link exists at all (D20, D21).
  const [where, setWhere] = useState(value("deliveryMode") || "in_person");

  return (
    <Box component="form" action={formAction} ref={formRef} data-testid="event-form">
      {eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}

      <Stack spacing={3} sx={{ maxWidth: 760 }}>
        <Alert severity="info" data-testid="draft-boundary-note">
          Draft events have no invitations, responses or attendance. Saving a draft does not
          distribute anything.
        </Alert>

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
              helperText={issueFor(state, "name")}
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
              defaultValue={value("eventType") || "practice"}
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

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Date"
                name="scheduledOn"
                data-field="scheduledOn"
                type="date"
                value={scheduledOn}
                onChange={(event) => setScheduledOn(event.target.value)}
                error={Boolean(issueFor(state, "scheduledOn"))}
                helperText={
                  issueFor(state, "scheduledOn") ??
                  "A draft may have no date yet. Approval will require one."
                }
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
              <TextField
                label="Start"
                name="startsAt"
                data-field="startsAt"
                type="time"
                defaultValue={value("startsAt")}
                error={Boolean(issueFor(state, "startsAt"))}
                helperText={
                  issueFor(state, "startsAt") ?? `24-hour clock, five-minute steps, e.g. 20:00.`
                }
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 300 } }}
                fullWidth
              />
              <TextField
                label="End"
                name="endsAt"
                data-field="endsAt"
                type="time"
                defaultValue={value("endsAt")}
                error={Boolean(issueFor(state, "endsAt"))}
                helperText={issueFor(state, "endsAt") ?? "Must be after the start."}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 300 } }}
                fullWidth
              />
            </Stack>

            {/*
              D86. The date input renders in the browser's locale, so an
              operator in Oxford can be looking at `mm/dd/yyyy`, and the times
              carry no zone of their own. Saying which zone these are is the
              whole of D86 and it is said once, here, beside the three fields it
              is about.
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
              {scheduledOn === "" ? (
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
                defaultValue={value("venue")}
                error={Boolean(issueFor(state, "venue"))}
                helperText={issueFor(state, "venue") ?? "Where online — Teams, Zoom, a Discord."}
                fullWidth
              />
            ) : (
              <VenueField
                name="venue"
                defaultValue={value("venue")}
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
              defaultValue={value("description")}
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
              defaultValue={value("requiredEquipment")}
              error={Boolean(issueFor(state, "requiredEquipment"))}
              helperText={
                issueFor(state, "requiredEquipment") ?? "What to bring. Leave empty if nothing."
              }
              fullWidth
            />
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={3}>
            <FormControl error={Boolean(issueFor(state, "attendance"))} data-field="attendance">
              <FormLabel id="attendance-label">Attendance</FormLabel>
              <RadioGroup
                aria-labelledby="attendance-label"
                name="attendance"
                defaultValue={attendance}
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

        <Alert severity="info" data-testid="audience-comes-later">
          {AUDIENCE_COMES_LATER}
        </Alert>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ alignItems: { sm: "center" } }}
        >
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? "Saving…" : "Save draft"}
          </Button>
          <Button variant="outlined" href={cancelHref} disabled={pending}>
            Cancel
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
