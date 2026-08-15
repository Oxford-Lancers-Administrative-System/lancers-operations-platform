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
  describeTermCoordinate,
  formatLongDate,
  labelFor,
  SOLICITS_RESPONSE_MEANING,
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
  const solicits = value("solicitsResponse");

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

            <TextField
              select
              label="Type"
              name="eventType"
              data-field="eventType"
              defaultValue={value("eventType") || "practice"}
              error={Boolean(issueFor(state, "eventType"))}
              helperText={issueFor(state, "eventType")}
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
                helperText={issueFor(state, "startsAt") ?? "24-hour clock, e.g. 20:00."}
                slotProps={{ inputLabel: { shrink: true } }}
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
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
            </Stack>

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
              LAN-115 replaced the plain venue text field with a searchable
              place/address combobox. It is still one `name="venue"` input
              posting one line of text, so nothing about how this form is read,
              validated, saved or audited changed with it.
            */}
            <VenueField
              name="venue"
              defaultValue={value("venue")}
              errorMessage={issueFor(state, "venue")}
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

            <FormControl
              error={Boolean(issueFor(state, "solicitsResponse"))}
              data-field="solicitsResponse"
            >
              <FormLabel id="solicits-label">Response requested</FormLabel>
              <RadioGroup
                aria-labelledby="solicits-label"
                name="solicitsResponse"
                defaultValue={solicits}
              >
                <FormControlLabel value="yes" control={<Radio />} label="Yes" />
                <FormControlLabel value="no" control={<Radio />} label="No" />
              </RadioGroup>
              <FormHelperText data-testid="solicits-meaning">
                {issueFor(state, "solicitsResponse") ?? SOLICITS_RESPONSE_MEANING}
              </FormHelperText>
            </FormControl>

            <Typography variant="body2" color="text.secondary">
              Attendance expected and response requested are different questions. An optional event
              may still ask who is coming; a mandatory one may ask nothing.
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
