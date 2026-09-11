"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import { Field, ChoiceField } from "@/components/field";
import { ActionBar } from "@/components/action-bar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import {
  deriveTermCoordinate,
  type RawEventDraft,
  type TermWindow,
} from "@/lib/services/event-input";
import { DEFAULT_TEMPLATE_CLASS, endTimeFromStart } from "@/lib/services/event-template-input";
import type { RawEventQuestion } from "@/lib/services/event-questions-input";
import type { EventTypeFormDefaults } from "@/lib/services/event-template-input";
import { createEventDraftAction, updateEventDraftAction } from "./actions";
import { dateFromScheduledOn, scheduledOnFromDate } from "./date-time-controls";
import { EMPTY_FORM_STATE } from "./form-state";
import QuestionEditor from "./question-editor";
import { EventCoreFields, issueFor } from "./event-core-fields";
import { duplicatedFrom } from "./presentation";

// UX-31 — the event editor, both modes, LAN-154. One component for
// create/edit. Term/week derived from the date (LAN-76); the template fills
// the form field by field, replacing only untouched fields on a type change
// (D40-D47).

export type EventFormMode = "create" | "edit";

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
  eventId?: string;
  terms: readonly TermWindow[];
  initial?: RawEventDraft;
  initialQuestions?: readonly RawEventQuestion[];
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

  const values: RawEventDraft = state.values ?? initial ?? {};
  const value = (field: keyof RawEventDraft): string => {
    const raw = values[field];
    return typeof raw === "string" ? raw : "";
  };

  // Object.values preserves insertion order for non-index string keys (LAN-265).
  const templateList = Object.values(templates);

  // What the Type control opens on: the first practice-class template (D15),
  // expressed against the class rather than a name since LAN-265 allows
  // renaming.
  const openingTemplate =
    templateList.find((option) => option.eventType === DEFAULT_TEMPLATE_CLASS) ?? templateList[0];
  const startingTemplateId = value("templateId") || (openingTemplate?.id ?? "");

  // A blank create has no initial/state.values, and that is the case the
  // template fills — D40-D47.
  const opening = (
    field: keyof RawEventDraft,
    fromTemplate: (defaults: EventTypeFormDefaults) => string,
  ): string => {
    const typed = value(field);
    if (typed !== "") return typed;
    const defaults = templates[startingTemplateId];
    return defaults === undefined ? "" : fromTemplate(defaults);
  };

  const [templateId, setTemplateId] = useState(startingTemplateId);
  // C1. scheduledOn is derived from this Date, never the reverse — DatePicker
  // fires onChange with a provisional Date per keystroke; round-tripping
  // through the string mismatches mid-year-entry.
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

  const template = templates[templateId];
  const typeLabel = template?.name ?? "";

  // D41's rule while still being written: a field still holding the old
  // template's value takes the new one; an operator-written field keeps it.
  function changeTemplate(next: string) {
    const was = templates[templateId];
    const now = templates[next];
    setTemplateId(next);
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

    // D42: template questions leave with the old type; operator's own stay.
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

  // Focuses the first control to fix, by data-field wrapper (not `name` —
  // a MUI select/radio group's `name` sits on an unfocusable hidden input).
  useEffect(() => {
    const first = state.issues[0];
    if (!first || !formRef.current) return;
    const wrapper = formRef.current.querySelector<HTMLElement>(`[data-field="${first.field}"]`);
    const control = wrapper?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([aria-hidden="true"]), [role="combobox"], [role="spinbutton"], textarea',
    );
    (control ?? wrapper)?.focus();
  }, [state.issues]);

  return (
    <Box component="form" action={formAction} ref={formRef} data-testid="event-form">
      {eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}

      <Stack spacing={3} sx={{ maxWidth: 760 }}>
        {duplicatedFromName ? (
          <Notice severity="info" testId="duplicated-from">
            {duplicatedFrom(duplicatedFromName)}
          </Notice>
        ) : null}

        {state.error ? (
          <Notice severity="error" testId="event-form-error">
            {state.error}
          </Notice>
        ) : null}

        <EventCoreFields
          state={state}
          value={value}
          template={template}
          templateId={templateId}
          templateList={templateList}
          onTemplateChange={changeTemplate}
          scheduledOn={scheduledOn}
          scheduledOnDate={scheduledOnDate}
          onScheduledOnDateChange={setScheduledOnDate}
          startsAt={startsAt}
          onStartChange={changeStart}
          endsAt={endsAt}
          onEndChange={(next) => {
            setEndTouched(true);
            setEndsAt(next);
          }}
          term={term}
          terms={terms}
          where={where}
          onWhereChange={setWhere}
          venue={venue}
          onVenueChange={setVenue}
        />

        <Section title="Participation">
          <Stack spacing={3}>
            {/* D18. */}
            <Field
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
            />

            {/* D17: its own field (Brian, 2026-09-09, LAN-264) — decision history: relocations.md. */}
            <Field
              label="Required equipment"
              name="requiredEquipment"
              data-field="requiredEquipment"
              value={requiredEquipment}
              onChange={(event) => setRequiredEquipment(event.target.value)}
              error={Boolean(issueFor(state, "requiredEquipment"))}
              helperText={
                issueFor(state, "requiredEquipment") ?? "What to bring. Leave empty if nothing."
              }
              multiline
              minRows={3}
            />

            <ChoiceField
              label="Attendance"
              name="attendance"
              value={attendance}
              onChange={setAttendance}
              error={Boolean(issueFor(state, "attendance"))}
              helperText={
                issueFor(state, "attendance") ?? "Whether attendance is expected of the audience."
              }
              options={[
                { value: "mandatory", label: "Mandatory" },
                { value: "optional", label: "Optional" },
              ]}
            />

            {/* D23 removed "Response requested" — mandatory/optional already carries it. */}
          </Stack>
        </Section>

        <QuestionEditor
          questions={questions}
          onChange={setQuestions}
          eventTypeLabel={typeLabel}
          issues={state.questionIssues}
          disabled={pending}
        />

        <ActionBar
          primary={
            <Button type="submit" variant="contained" disabled={pending}>
              {pending ? "Saving…" : "Save draft"}
            </Button>
          }
          secondary={
            <Button
              type="submit"
              name="then"
              value="audience"
              variant="outlined"
              disabled={pending}
              data-testid="save-and-choose-audience"
            >
              Save and choose audience
            </Button>
          }
          cancel={
            <Button variant="text" href={cancelHref} disabled={pending}>
              Cancel
            </Button>
          }
        />
      </Stack>
    </Box>
  );
}
