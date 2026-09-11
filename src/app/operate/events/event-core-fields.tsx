"use client";

import { Section } from "@/components/section";
import { Field, SelectField, ChoiceField, DateField, TimeField } from "@/components/field";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { RawEventDraft, TermCoordinate, TermWindow } from "@/lib/services/event-input";
import type { EventTypeFormDefaults } from "@/lib/services/event-template-input";
import type { EventFormState } from "./form-state";
import VenueField from "./venue-field";
import {
  CLUB_TIME_ZONE_NOTE,
  describeTermCoordinate,
  formatLongDate,
  JOINING_URL_IS_PUBLIC_WARNING,
} from "./presentation";

export function issueFor(state: EventFormState, field: keyof RawEventDraft): string | undefined {
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

/**
 * The `Section title="Event"` block: name, type, the date/time trio, and
 * where. `event-form.tsx` owns every value and handler here; this sibling
 * only lays them out.
 */
export function EventCoreFields({
  state,
  value,
  template,
  templateId,
  templateList,
  onTemplateChange,
  scheduledOn,
  scheduledOnDate,
  onScheduledOnDateChange,
  startsAt,
  onStartChange,
  endsAt,
  onEndChange,
  term,
  terms,
  where,
  onWhereChange,
  venue,
  onVenueChange,
}: {
  state: EventFormState;
  value: (field: keyof RawEventDraft) => string;
  template: EventTypeFormDefaults | undefined;
  templateId: string;
  templateList: readonly EventTypeFormDefaults[];
  onTemplateChange: (next: string) => void;
  scheduledOn: string;
  scheduledOnDate: Date | null;
  onScheduledOnDateChange: (next: Date | null) => void;
  startsAt: string;
  onStartChange: (next: string) => void;
  endsAt: string;
  onEndChange: (next: string) => void;
  term: TermCoordinate;
  terms: readonly TermWindow[];
  where: string;
  onWhereChange: (next: string) => void;
  venue: string;
  onVenueChange: (next: string) => void;
}) {
  return (
    <Section title="Event">
      <Stack spacing={3}>
        <Field
          label="Name"
          name="name"
          data-field="name"
          defaultValue={value("name")}
          error={Boolean(issueFor(state, "name"))}
          helperText={
            issueFor(state, "name") ??
            // Still keyed off the behavioural class and not the template's
            // name, which is the distinction LAN-265 draws: the hint is
            // about fixtures, and a club that renames Game to "Match" or
            // creates a second game-class template should keep getting it.
            (template?.eventType === "game" ? "The opponent goes in the name." : undefined)
          }
        />

        {/*
          Still labelled **Type**, and that is deliberate rather than
          overlooked. LAN-265 changed what the control selects — a template
          the club created, not one of seven fixed types — but "what type of
          event is this?" is the question an operator is answering, and
          "Template" is the word for the row on the administration screen
          they are choosing from rather than for the choice they are making
          here.

          `shrink` is explicit because this select always has a value — the
          first template when nothing was chosen — and MUI was leaving the
          outline's notch closed, so the label sat on top of the value.
          Found in the LAN-151 browser preflight, on both the create and the
          edit screen; every other field on this form notches correctly
          because every other field can legitimately be empty.
        */}
        <SelectField
          label="Type"
          name="templateId"
          field="templateId"
          value={templateId}
          onChange={(event) => onTemplateChange(event.target.value)}
          error={Boolean(issueFor(state, "templateId"))}
          helperText={issueFor(state, "templateId")}
          options={templateList.map((option) => ({
            value: option.id,
            label: option.name,
          }))}
        />

        {/*
          C1 + C2. A native `<input type="date">`/`<input type="time">`
          renders in the browser/OS locale and ignores the page — that is
          what put an American mm/dd/yyyy date picker and a 24-hour clock
          in front of an operator who typed a British one, and is the root
          cause of W154C-F1's crash. MUI X's `DatePicker`/`TimePicker`
          draw their own field rather than delegating to the OS, so
          `format` holds no matter what the browser or OS thinks a date or
          time looks like. Each carries a hidden input for the form post —
          the visible field shows "24/08/2026"; the value the server
          action reads is still plain `scheduledOn`/`startsAt`/`endsAt`,
          exactly as before.

          D2 (round 2, Q-27): Brian reversed himself on the clock, not on
          locale-independence — "I want it to be a normal 12-hour clock
          with AM and PM" supersedes the 24-hour half of C2, and he was
          explicit that he misread his own earlier note. `ampm={true}` and
          `format="hh:mm a"` are still fixed props, not a return to the
          browser's locale: the whole reason a British operator on a
          US-locale machine crashed this form is not undone by which
          clock face is drawn, only by drawing one deliberately either
          way. The five-minute step (`minutesStep`/`timeSteps`) is
          unaffected, and so is the stored value — `startsAt`/`endsAt`
          still post plain 24-hour `HH:mm` through the hidden input;
          `dateFromTimeString`/`timeStringFromDate` never changed.
        */}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <DateField
              label="Date"
              name="scheduledOn"
              value={scheduledOn}
              dateValue={scheduledOnDate}
              onDateChange={onScheduledOnDateChange}
              error={Boolean(issueFor(state, "scheduledOn"))}
              helperText={
                issueFor(state, "scheduledOn") ??
                "Day, month, year — e.g. 24/08/2026. A draft may have no date yet."
              }
            />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <TimeField
              label="Start"
              name="startsAt"
              value={startsAt}
              onChange={onStartChange}
              error={Boolean(issueFor(state, "startsAt"))}
              helperText={
                issueFor(state, "startsAt") ?? "12-hour clock, five-minute steps, e.g. 08:00 PM."
              }
            />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <TimeField
              label="End"
              name="endsAt"
              value={endsAt}
              onChange={onEndChange}
              error={Boolean(issueFor(state, "endsAt"))}
              helperText={
                issueFor(state, "endsAt") ??
                (template?.durationMinutes !== null && template !== undefined
                  ? "Follows the start; adjust it."
                  : "Must be after the start.")
              }
            />
          </Box>
        </Stack>

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
        <Typography
          variant="body2"
          color="text.secondary"
          data-testid="derived-term"
          aria-live="polite"
        >
          {!isFormattableScheduledOn(scheduledOn) ? (
            "Choose a date and the Oxford term and week are worked out from it."
          ) : (
            <>
              <strong>{formatLongDate(scheduledOn)}</strong>
              {" — "}
              {describeTermCoordinate(term, terms)}
            </>
          )}
        </Typography>

        {/*
          D20. Where the event is, as a property, rather than something
          guessed from what somebody typed into the venue field. It decides
          what that field then means (D21) and whether a joining link is a
          thing this event can have at all.
        */}
        <ChoiceField
          label="Where"
          name="deliveryMode"
          value={where}
          onChange={onWhereChange}
          error={Boolean(issueFor(state, "deliveryMode"))}
          helperText={
            issueFor(state, "deliveryMode") ??
            "In person takes an address; online takes the destination, such as Teams."
          }
          options={[
            { value: "in_person", label: "In person" },
            { value: "online", label: "Online" },
          ]}
        />

        {/*
          LAN-115 replaced the plain venue text field with a searchable
          place/address combobox. It is still one `name="venue"` input
          posting one line of text, so nothing about how this form is read,
          validated, saved or audited changed with it. An online event is
          not searching a map, so it gets a plain field for its destination.
        */}
        {where === "online" ? (
          <Field
            label="Destination"
            name="venue"
            data-field="venue"
            value={venue}
            onChange={(event) => onVenueChange(event.target.value)}
            error={Boolean(issueFor(state, "venue"))}
            helperText={issueFor(state, "venue") ?? "Where online — Teams, Zoom, a Discord."}
          />
        ) : (
          <VenueField
            name="venue"
            value={venue}
            onValueChange={onVenueChange}
            errorMessage={issueFor(state, "venue")}
          />
        )}

        {/*
          LAN-284 reversed REQ-no-joining-url: this link is published on
          the public event page and carried in the subscription feed. The
          helper text is the warning, and it is a warning rather than a
          gate — nothing here can check whether a meeting has a passcode
          set, so the only real control is the operator's own care.
        */}
        {where === "online" ? (
          <Field
            label="Joining link"
            name="joiningUrl"
            data-field="joiningUrl"
            defaultValue={value("joiningUrl")}
            error={Boolean(issueFor(state, "joiningUrl"))}
            helperText={issueFor(state, "joiningUrl") ?? JOINING_URL_IS_PUBLIC_WARNING}
          />
        ) : null}
      </Stack>
    </Section>
  );
}
