"use client";

import { Section } from "@/components/section";
import { Field, ChoiceField, DateField, TimeField, NO_AUTOFILL } from "@/components/field";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { FieldIssue, RawEventDraft } from "@/lib/services/event-input";
import VenueField from "../../venue-field";
import { CLUB_TIME_ZONE_NOTE, JOINING_URL_IS_PUBLIC_WARNING } from "../../presentation";

function issueFor(issues: readonly FieldIssue[], field: keyof RawEventDraft): string | undefined {
  return issues.find((issue) => issue.field === field)?.message;
}

/** The `Section title="Event"` fields of the edit step — everything but the template. */
export function AmendEventFields({
  issues,
  value,
  templateId,
  scheduledOn,
  scheduledDate,
  onScheduledDateChange,
  onScheduledOnChange,
  termLine,
  startsAt,
  onStartsAtChange,
  endsAt,
  onEndsAtChange,
  deliveryMode,
  onDeliveryModeChange,
  venue,
  onVenueChange,
  attendance,
  onAttendanceChange,
}: {
  issues: readonly FieldIssue[];
  value: (field: keyof RawEventDraft) => string;
  templateId: string;
  scheduledOn: string;
  scheduledDate: Date | null;
  onScheduledDateChange: (next: Date | null) => void;
  onScheduledOnChange: (next: string) => void;
  termLine: string;
  startsAt: string;
  onStartsAtChange: (next: string) => void;
  endsAt: string;
  onEndsAtChange: (next: string) => void;
  deliveryMode: string;
  onDeliveryModeChange: (next: string) => void;
  venue: string;
  onVenueChange: (next: string) => void;
  attendance: string;
  onAttendanceChange: (next: string) => void;
}) {
  return (
    <Section title="Event">
      <Stack spacing={3}>
        <Field
          name="name"
          label="Name"
          // LAN-324: the event's name, never the operator's.
          autoComplete={NO_AUTOFILL}
          defaultValue={value("name")}
          error={Boolean(issueFor(issues, "name"))}
          helperText={issueFor(issues, "name")}
        />

        {/*
          LAN-265, Brian 2026-09-09: "Amend does not change template."
          The control that used to sit here is gone rather than
          disabled — a greyed-out select on the one screen whose job is
          changing things reads as a fault. What kind of event this is
          is stated on the event page above; changing it means
          cancelling this event and creating the other one, because the
          audience, the questions and the cadence forty people were
          messaged on all came from the template.
        */}
        <input type="hidden" name="templateId" value={templateId} />

        <DateField
          name="scheduledOn"
          label="Date"
          value={scheduledOn}
          dateValue={scheduledDate}
          onDateChange={onScheduledDateChange}
          onChange={onScheduledOnChange}
          error={Boolean(issueFor(issues, "scheduledOn"))}
          helperText={issueFor(issues, "scheduledOn") || undefined}
        />
        <Typography variant="caption" color="text.secondary" aria-live="polite">
          {termLine}
        </Typography>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TimeField
            name="startsAt"
            label="Start"
            value={startsAt}
            onChange={onStartsAtChange}
            error={Boolean(issueFor(issues, "startsAt"))}
            helperText={issueFor(issues, "startsAt") ?? CLUB_TIME_ZONE_NOTE}
          />
          <TimeField
            name="endsAt"
            label="End"
            value={endsAt}
            onChange={onEndsAtChange}
            error={Boolean(issueFor(issues, "endsAt"))}
            helperText={issueFor(issues, "endsAt")}
          />
        </Stack>

        <ChoiceField
          name="deliveryMode"
          label="Where it happens"
          value={deliveryMode}
          onChange={onDeliveryModeChange}
          row
          options={[
            { value: "in_person", label: "In person" },
            { value: "online", label: "Online" },
          ]}
        />

        <VenueField
          name="venue"
          value={venue}
          onValueChange={onVenueChange}
          errorMessage={issueFor(issues, "venue")}
        />

        {deliveryMode === "online" ? (
          <Field
            name="joiningUrl"
            label="Joining link"
            autoComplete={NO_AUTOFILL}
            defaultValue={value("joiningUrl")}
            error={Boolean(issueFor(issues, "joiningUrl"))}
            helperText={issueFor(issues, "joiningUrl") ?? JOINING_URL_IS_PUBLIC_WARNING}
          />
        ) : (
          <input type="hidden" name="joiningUrl" value="" />
        )}

        <Field
          name="description"
          label="Description"
          defaultValue={value("description")}
          multiline
          minRows={2}
        />

        {/* LAN-264. Free text that behaves exactly like Description. */}
        <Field
          name="requiredEquipment"
          label="Required equipment"
          defaultValue={value("requiredEquipment")}
          helperText="What to bring. Leave empty if nothing."
          multiline
          minRows={3}
        />

        <ChoiceField
          name="attendance"
          label="Attendance"
          value={attendance}
          onChange={onAttendanceChange}
          row
          error={Boolean(issueFor(issues, "attendance"))}
          helperText={issueFor(issues, "attendance")}
          options={[
            { value: "mandatory", label: "Mandatory" },
            { value: "optional", label: "Optional" },
          ]}
        />
      </Stack>
    </Section>
  );
}
