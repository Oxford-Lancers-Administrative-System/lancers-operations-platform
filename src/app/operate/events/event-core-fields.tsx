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
 * turn into a sentence — guards a malformed value from a rejected submission.
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
            // LAN-265: keyed off the behavioural class, not the template name.
            (template?.eventType === "game" ? "The opponent goes in the name." : undefined)
          }
        />

        {/* Still labelled "Type" — selects a club template, not one of seven fixed types. `shrink` fixes the notch bug LAN-151 found. */}
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

        {/* C1/C2: MUI X DatePicker/TimePicker replace native locale-dependent controls (W154C-F1 crash). D2 (Q-27): 12-hour clock with AM/PM, `format="hh:mm a"`. Stored value still plain HH:mm through the hidden input. */}
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

        {/* D86: club has one time zone; stated once, here, beside the trio it's about. */}
        <Typography variant="body2" color="text.secondary" data-testid="club-time-zone-note">
          {CLUB_TIME_ZONE_NOTE}
        </Typography>

        {/* Derived, never an input; aria-live because it changes without focus. */}
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

        {/* D20: delivery mode as a property, not guessed from the venue text — decides what venue means (D21) and whether a joining link exists. */}
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

        {/* LAN-115: searchable venue combobox; still one `name="venue"` text input. Online events get a plain destination field instead. */}
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

        {/* LAN-284: joining link publish warning. */}
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
