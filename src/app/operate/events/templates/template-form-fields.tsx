"use client";

import { Field, SelectField } from "@/components/field";
import { Section } from "@/components/section";
import Stack from "@mui/material/Stack";
import type { RawEventTemplate } from "@/lib/services/event-template-input";
import type { TemplateFormState } from "./form-state";
import {
  describeDuration,
  TEMPLATE_DURATION_LABEL,
  TEMPLATE_DURATION_OPTIONS,
  TEMPLATE_EVENT_HEADLINE,
} from "./presentation";

export function issueFor(
  state: TemplateFormState,
  field: keyof RawEventTemplate,
): string | undefined {
  return state.issues.find((issue) => issue.field === field)?.message;
}

/**
 * The per-event defaults a template carries — where, how long, and what an
 * operator working from it will read. D78 and C6: a duration rather than a
 * start time, chosen from a fixed grid rather than typed.
 */
export function TemplateEventFields({
  state,
  busy,
  deliveryMode,
  onDeliveryModeChange,
  venue,
  onVenueChange,
  duration,
  onDurationChange,
  offGridDuration,
  equipment,
  onEquipmentChange,
  description,
  onDescriptionChange,
  attendance,
  onAttendanceChange,
}: {
  state: TemplateFormState;
  busy: boolean;
  deliveryMode: string;
  onDeliveryModeChange: (value: string) => void;
  venue: string;
  onVenueChange: (value: string) => void;
  duration: string;
  onDurationChange: (value: string) => void;
  /** C6's off-grid case — see `template-editor.tsx` for where it is derived. */
  offGridDuration: number | null;
  equipment: string;
  onEquipmentChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  attendance: string;
  onAttendanceChange: (value: string) => void;
}) {
  return (
    <Section title={TEMPLATE_EVENT_HEADLINE}>
      <Stack spacing={3}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <SelectField
            label="Where"
            name="defaultDeliveryMode"
            data-field="defaultDeliveryMode"
            value={deliveryMode}
            onChange={(event) => onDeliveryModeChange(event.target.value)}
            error={Boolean(issueFor(state, "defaultDeliveryMode"))}
            helperText={issueFor(state, "defaultDeliveryMode")}
            disabled={busy}
            slotProps={{ inputLabel: { shrink: true } }}
            options={[
              { value: "unset", label: "Not set" },
              { value: "in_person", label: "In person" },
              { value: "online", label: "Online" },
            ]}
          />

          <Field
            label="Venue"
            name="defaultVenue"
            data-field="defaultVenue"
            value={venue}
            onChange={(event) => onVenueChange(event.target.value)}
            error={Boolean(issueFor(state, "defaultVenue"))}
            helperText={issueFor(state, "defaultVenue")}
            disabled={busy}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>

        {/*
          D78. A duration, not a start time — "the name is always going to
          be unique ... Usual time doesn't make any sense to me" (Brian,
          2026-08-21). A type recurs; a particular Wednesday does not.

          C6. Brian: "In the template, the default times should be done
          in 30-minute increments between 30 minutes and 4 hours ... It
          shouldn't be freeform text." Eight options, each labelled by
          the same `describeDuration` the template list and the
          confirmation dialog already use.
        */}
        <SelectField
          label={TEMPLATE_DURATION_LABEL}
          name="defaultDurationMinutes"
          data-field="defaultDurationMinutes"
          value={duration}
          onChange={(event) => onDurationChange(event.target.value)}
          error={Boolean(issueFor(state, "defaultDurationMinutes"))}
          helperText={issueFor(state, "defaultDurationMinutes")}
          disabled={busy}
          slotProps={{ inputLabel: { shrink: true } }}
          options={[
            { value: "", label: "Not set" },
            ...(offGridDuration !== null
              ? [{ value: String(offGridDuration), label: describeDuration(offGridDuration) }]
              : []),
            ...TEMPLATE_DURATION_OPTIONS.map((minutes) => ({
              value: String(minutes),
              label: describeDuration(minutes),
            })),
          ]}
        />

        {/* LAN-264. Free text that behaves exactly like Description below. */}
        <Field
          label="Required equipment"
          name="defaultRequiredEquipment"
          data-field="defaultRequiredEquipment"
          value={equipment}
          onChange={(event) => onEquipmentChange(event.target.value)}
          error={Boolean(issueFor(state, "defaultRequiredEquipment"))}
          helperText={issueFor(state, "defaultRequiredEquipment")}
          disabled={busy}
          multiline
          minRows={3}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <Field
          label="Description"
          name="defaultDescription"
          data-field="defaultDescription"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          error={Boolean(issueFor(state, "defaultDescription"))}
          helperText={issueFor(state, "defaultDescription")}
          disabled={busy}
          multiline
          minRows={3}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <SelectField
          label="Attendance"
          name="defaultAttendance"
          data-field="defaultAttendance"
          value={attendance}
          onChange={(event) => onAttendanceChange(event.target.value)}
          disabled={busy}
          slotProps={{ inputLabel: { shrink: true } }}
          options={[
            { value: "unset", label: "Not set" },
            { value: "mandatory", label: "Mandatory" },
            { value: "optional", label: "Optional" },
          ]}
        />
      </Stack>
    </Section>
  );
}
