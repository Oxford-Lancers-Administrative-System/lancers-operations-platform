"use client";

import { useActionState, useEffect, useRef } from "react";
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
  DRAFTABLE_EVENT_TYPES,
  EVENT_ORIGINS,
  type RawEventDraft,
} from "@/lib/services/event-input";
import { createEventDraftAction, updateEventDraftAction } from "./actions";
import { EMPTY_FORM_STATE, type EventFormState } from "./form-state";
import {
  labelFor,
  ORIGIN_LABELS,
  SOLICITS_RESPONSE_MEANING,
  TERM_LABELS,
  TYPE_LABELS,
} from "./presentation";

/**
 * UX-31 — the event editor, in both of its modes.
 *
 * One component for create and edit because they are the same screen with the
 * same rules; the differences are the action it posts to, the heading above it
 * and whether the fields start empty. Two components would be two places for
 * the response-solicited radio to acquire a default.
 *
 * ## The two flags have no default, deliberately
 *
 * LAN-76: "The response-solicited flag is an explicit choice in the form, not a
 * silent default, and its meaning is stated on screen." So `Response requested`
 * starts unselected and the form refuses to save until it is answered, with
 * the meaning printed beside it rather than hidden in a tooltip. Attendance is
 * treated the same way — it costs one radio group and removes the other silent
 * default the wireframe's filled-in values would otherwise invite.
 *
 * ## Validation behaviour
 *
 * The shared state contract requires a validation failure to "preserve entries,
 * identify the field, state the correction, focus the first invalid control".
 * The action returns exactly what was submitted plus a field-keyed list, this
 * component re-renders from those values, and the effect below moves focus to
 * the first named field. Nothing is retyped and nothing is guessed at.
 */

export type EventFormMode = "create" | "edit";

export interface TermOption {
  id: string;
  name: string;
  academicYear: string;
}

/** Oxford weeks. Michaelmas runs from −1; Hilary and Trinity from 0th. */
const WEEK_NUMBERS = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8];

function issueFor(state: EventFormState, field: keyof RawEventDraft): string | undefined {
  return state.issues.find((issue) => issue.field === field)?.message;
}

export default function EventForm({
  mode,
  eventId,
  ownerName,
  terms,
  initial,
  cancelHref,
}: {
  mode: EventFormMode;
  /** The draft being edited. Absent when creating. */
  eventId?: string;
  /** Shown, not chosen: the owner is the operator who created the draft. */
  ownerName: string;
  terms: readonly TermOption[];
  initial?: RawEventDraft;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createEventDraftAction : updateEventDraftAction,
    EMPTY_FORM_STATE,
  );

  const formRef = useRef<HTMLFormElement>(null);

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

  // What was typed wins over what was loaded, so a rejected submission comes
  // back with the operator's own words in it.
  const values: RawEventDraft = state.values ?? initial ?? {};
  const value = (field: keyof RawEventDraft): string => {
    const raw = values[field];
    return typeof raw === "string" ? raw : "";
  };

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

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
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

              <TextField
                select
                label="Origin"
                name="origin"
                data-field="origin"
                defaultValue={value("origin") || "club_controlled"}
                error={Boolean(issueFor(state, "origin"))}
                helperText={issueFor(state, "origin") ?? "Who controls when this event happens."}
                fullWidth
              >
                {EVENT_ORIGINS.map((origin) => (
                  <MenuItem key={origin} value={origin}>
                    {labelFor(ORIGIN_LABELS, origin)}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Date"
                name="scheduledOn"
                data-field="scheduledOn"
                type="date"
                defaultValue={value("scheduledOn")}
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
                helperText={issueFor(state, "startsAt")}
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
                helperText={issueFor(state, "endsAt")}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
            </Stack>

            <TextField
              label="Venue"
              name="venue"
              data-field="venue"
              defaultValue={value("venue")}
              error={Boolean(issueFor(state, "venue"))}
              helperText={issueFor(state, "venue")}
              fullWidth
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                select
                label="Term"
                name="termId"
                data-field="termId"
                defaultValue={value("termId")}
                error={Boolean(issueFor(state, "termId"))}
                helperText={
                  issueFor(state, "termId") ?? "Leave blank if the event is outside term."
                }
                fullWidth
              >
                <MenuItem value="">Outside term</MenuItem>
                {terms.map((term) => (
                  <MenuItem key={term.id} value={term.id}>
                    {`${labelFor(TERM_LABELS, term.name)} ${term.academicYear}`}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                label="Week"
                name="weekNumber"
                data-field="weekNumber"
                defaultValue={value("weekNumber")}
                error={Boolean(issueFor(state, "weekNumber"))}
                helperText={issueFor(state, "weekNumber")}
                fullWidth
              >
                <MenuItem value="">No week</MenuItem>
                {WEEK_NUMBERS.map((week) => (
                  <MenuItem key={week} value={String(week)}>
                    {week === -1 ? "Week −1" : `Week ${week}`}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <TextField
              label="Owner"
              value={ownerName}
              helperText="The operator who creates the event owns it."
              slotProps={{ input: { readOnly: true } }}
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
