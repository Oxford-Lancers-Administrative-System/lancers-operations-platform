"use client";

import { useMemo, useState } from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  deriveTermCoordinate,
  DRAFTABLE_EVENT_TYPES,
  type TermWindow,
} from "@/lib/services/event-input";
import type { EventTypeFormDefaults } from "@/lib/services/event-template-input";
import { ActionBar } from "@/components/action-bar";
import { Fact, FactList } from "@/components/fact";
import { ChoiceField, DateField, Field, SelectField, TimeField } from "@/components/field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { StatusChip } from "@/components/status-chip";
import {
  CLUB_TIME_ZONE_NOTE,
  describeTermCoordinate,
  formatLongDate,
  labelFor,
  QUESTIONS_HEADLINE,
  TYPE_LABELS,
} from "@/app/operate/events/presentation";

/**
 * The create-event form, drawn from the kit — LAN-225 S4.
 *
 * Every field `event-form.tsx` shows, in its order and with its own helper
 * words; the type's template fills the form in the same way (D40–D47) so the
 * preview opens on Practice's defaults and swaps them on a type change. The
 * question editor is drawn as the list the template gives plus its one
 * button. Nothing posts.
 */
export default function EventFormPreview({
  terms,
  templates,
}: {
  terms: readonly TermWindow[];
  templates: Readonly<Record<string, EventTypeFormDefaults>>;
}) {
  const [eventType, setEventType] = useState("practice");
  const [scheduledOn, setScheduledOn] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const template = templates[eventType];
  const [where, setWhere] = useState<string>(template?.deliveryMode ?? "in_person");
  const [venue, setVenue] = useState(template?.venue ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [equipment, setEquipment] = useState(template?.requiredEquipment ?? "");
  const [attendance, setAttendance] = useState(template?.attendance ?? "optional");

  const term = useMemo(
    () => deriveTermCoordinate(scheduledOn === "" ? null : scheduledOn, terms),
    [scheduledOn, terms],
  );

  function changeType(next: string) {
    const was = templates[eventType];
    const now = templates[next];
    setEventType(next);
    if (!was || !now) return;
    if (where === was.deliveryMode) setWhere(now.deliveryMode);
    if (venue === was.venue) setVenue(now.venue);
    if (description === was.description) setDescription(now.description);
    if (equipment === was.requiredEquipment) setEquipment(now.requiredEquipment);
    if (attendance === was.attendance) setAttendance(now.attendance);
  }

  const questions = template?.questions ?? [];
  const dated = /^\d{4}-\d{2}-\d{2}$/.test(scheduledOn);

  return (
    <Stack
      spacing={3}
      component="form"
      onSubmit={(event) => event.preventDefault()}
      data-testid="event-form-preview"
    >
      <PageHeader
        title="Create event"
        subtitle="Record the operational facts before resolving an audience. Draft events have no invitations, responses or attendance; saving a draft does not distribute anything."
        back={{ href: "/operate/events", label: "Back to events" }}
      />

      <Section title="Event" testId="event">
        <Stack spacing={3}>
          <Field
            label="Name"
            name="name"
            field="name"
            helperText={eventType === "game" ? "The opponent goes in the name." : undefined}
          />
          <SelectField
            label="Type"
            name="eventType"
            field="eventType"
            value={eventType}
            onChange={(event) => changeType(event.target.value)}
            options={DRAFTABLE_EVENT_TYPES.map((type) => ({
              value: type,
              label: labelFor(TYPE_LABELS, type),
            }))}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <DateField
                label="Date"
                name="scheduledOn"
                value={scheduledOn}
                onChange={setScheduledOn}
                helperText="Day, month, year — e.g. 24/08/2026. A draft may have no date yet."
              />
            </Stack>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <TimeField
                label="Start"
                name="startsAt"
                value={startsAt}
                onChange={setStartsAt}
                helperText="12-hour clock, five-minute steps, e.g. 08:00 PM."
              />
            </Stack>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <TimeField
                label="End"
                name="endsAt"
                value={endsAt}
                onChange={setEndsAt}
                helperText={
                  template?.durationMinutes
                    ? "Follows the start; adjust it."
                    : "Must be after the start."
                }
              />
            </Stack>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {CLUB_TIME_ZONE_NOTE}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            aria-live="polite"
            data-testid="derived-term"
          >
            {dated ? (
              <>
                <strong>{formatLongDate(scheduledOn)}</strong>
                {" — "}
                {describeTermCoordinate(term, terms)}
              </>
            ) : (
              "Choose a date and the Oxford term and week are worked out from it."
            )}
          </Typography>
          <ChoiceField
            label="Where"
            name="deliveryMode"
            value={where}
            onChange={setWhere}
            options={[
              { value: "in_person", label: "In person" },
              { value: "online", label: "Online" },
            ]}
            helperText="In person takes an address; online takes the destination, such as Teams."
          />
          <Field
            label={where === "online" ? "Destination" : "Venue"}
            name="venue"
            field="venue"
            value={venue}
            onChange={(event) => setVenue(event.target.value)}
            helperText={
              where === "online"
                ? "Where online — Teams, Zoom, a Discord."
                : "Search for a place, or type the address."
            }
          />
          {where === "online" ? (
            <Field
              label="Joining link"
              name="joiningUrl"
              field="joiningUrl"
              helperText="Stored on the event and never public."
            />
          ) : null}
        </Stack>
      </Section>

      <Section title="Details" testId="details">
        <Stack spacing={3}>
          <Field
            label="Description"
            name="description"
            field="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            helperText="What this is, and anything people need to know."
            multiline
            minRows={3}
          />
          <Field
            label="Required equipment"
            name="requiredEquipment"
            field="requiredEquipment"
            value={equipment}
            onChange={(event) => setEquipment(event.target.value)}
            helperText="What to bring. Leave empty if nothing."
          />
          <ChoiceField
            label="Attendance"
            name="attendance"
            value={attendance}
            onChange={(next) => setAttendance(next as "mandatory" | "optional")}
            options={[
              { value: "mandatory", label: "Mandatory" },
              { value: "optional", label: "Optional" },
            ]}
            helperText="Whether attendance is expected of the audience."
          />
          <Typography variant="body2" color="text.secondary">
            Everyone this event is sent to is asked to answer. Mandatory or optional says whether
            the club expects them to be there, not whether it wants to know.
          </Typography>
        </Stack>
      </Section>

      <Section
        title={QUESTIONS_HEADLINE}
        description={`What a ${labelFor(TYPE_LABELS, eventType).toLowerCase()} asks, from its template. Add your own below.`}
        action={
          <Button variant="outlined" size="small">
            Add a question
          </Button>
        }
        testId="questions"
      >
        {questions.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing extra is asked.
          </Typography>
        ) : (
          <FactList>
            {questions.map((question, index) => (
              <Fact
                key={`${question.prompt}-${index}`}
                label={question.prompt ?? ""}
                layout="inline"
                value={
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.75 }}
                  >
                    <Typography variant="body2">{question.answerType ?? "text"}</Typography>
                    <StatusChip
                      domain="onboardingItem"
                      status={question.required === "required" ? "required" : "optional"}
                      label={question.required === "required" ? "Required" : "Optional"}
                    />
                    <StatusChip
                      domain="onboardingItem"
                      status="from_template"
                      label={`From the ${labelFor(TYPE_LABELS, eventType)} template`}
                    />
                  </Stack>
                }
              />
            ))}
          </FactList>
        )}
      </Section>

      <ActionBar
        primary={
          <Button type="submit" variant="contained">
            Save draft
          </Button>
        }
        secondary={
          <Button type="submit" variant="outlined">
            Save and choose audience
          </Button>
        }
        cancel={
          <Button variant="text" href="/operate/events">
            Cancel
          </Button>
        }
      />
    </Stack>
  );
}
