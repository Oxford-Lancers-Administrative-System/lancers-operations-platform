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

/**
 * UX-31 — the event editor, in both of its modes, as LAN-154 extended it. One
 * component for create and edit: same screen, same rules, differing only in
 * the action posted to, the heading, and whether fields start empty. The
 * Oxford term/week are derived from the date, never entered (LAN-76); the
 * template fills the form field by field, replacing only untouched fields on
 * a type change (D40–D47); a validation failure preserves entries, names the
 * field, and moves focus to the first one.
 *
 * Decision history: docs/ux/tickets/LAN-154-event-authoring-and-templates.md
 */

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
  /** The draft being edited. Absent when creating. */
  eventId?: string;
  /** The Oxford calendar, for deriving the coordinate as the operator types. */
  terms: readonly TermWindow[];
  initial?: RawEventDraft;
  /** The questions already on this event, or the ones its template gives. */
  initialQuestions?: readonly RawEventQuestion[];
  /** Every template the club has, because the Type control decides which applies. */
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

  /**
   * The templates the operator may pick from, in the order the list shows them.
   *
   * `readEventFormDefaults` keys them by id and orders that record by name, and
   * `Object.values` preserves insertion order for string keys that are not
   * array indices — which a uuid never is. LAN-265.
   */
  const templateList = Object.values(templates);

  /**
   * What the Type control opens on.
   *
   * An edit and a refused submission both bring their own. A blank create opens
   * on a **practice**, which is what D15 settled and what the club schedules
   * most of — and it used to be the literal string `practice`, which was safe
   * while the seven types were the seven templates and one of them was always
   * called Practice.
   *
   * After LAN-265 a club can rename or delete any of them, so the rule is
   * expressed against the behavioural class instead: the first practice-class
   * template on the list, which is the Practice template on a club that has not
   * created its own and remains a practice on one that renamed it. A club whose
   * templates are all something else opens on the first of them, and one with no
   * templates at all gets an empty control and a refusal on save rather than a
   * form that silently posts an id nobody has.
   */
  const openingTemplate =
    templateList.find((option) => option.eventType === DEFAULT_TEMPLATE_CLASS) ?? templateList[0];
  const startingTemplateId = value("templateId") || (openingTemplate?.id ?? "");

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
    const defaults = templates[startingTemplateId];
    return defaults === undefined ? "" : fromTemplate(defaults);
  };

  const [templateId, setTemplateId] = useState(startingTemplateId);
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

  const template = templates[templateId];
  const typeLabel = template?.name ?? "";

  /**
   * D41's rule, applied while the event is still being written.
   *
   * A field still holding what the old type's template gave it takes the new
   * type's value; a field the operator wrote keeps what they wrote. The same
   * comparison the service makes against a saved draft, for the same reason —
   * and the reason it is here rather than only there is that changing the type
   * is the one moment on this form when the template underneath it changes.
   */
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

            {/*
              D17: its own field, so it is not buried in a paragraph — and
              free text that behaves exactly like Description above (Brian,
              2026-09-09; LAN-264). It was a one-line input, which meant Enter
              submitted the form and a kit list could not be written at all.
            */}
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

            {/*
              D23 removed "Response requested" from this form. It was not a real
              concept: mandatory or optional already carries it, and everyone
              sent an event is expected to answer.
            */}
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
