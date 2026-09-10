import "server-only";

import { ConstraintViolated, NotFound, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "./audit";
import { actorRequirement } from "./actor";
import { todayInClubZone } from "@/lib/club-time";
import { UUID_PATTERN, type EventDeliveryMode, type EventStatus } from "./event-input";
import { createMessagingScheduleIn, DEFAULT_MESSAGING_SCHEDULE } from "./messaging-schedule";
import {
  DEFAULT_TEMPLATE_CLASS,
  endTimeFromStart,
  type EventTemplateInput,
  type EventTypeFormDefaults,
} from "./event-template-input";
import {
  groupsForEventType,
  resolveSelection,
  groupSelectionKeys,
  type AudienceCandidate,
  type AudienceGroupKey,
} from "./audience-selection";
import { listAudienceCatalogueIn } from "./event-audience";
import {
  joinQuestionChoices,
  readTemplateQuestionsAsEventInputIn,
  writeEventQuestionsIn,
  readEventQuestionsIn,
  type EventQuestion,
  type EventQuestionInput,
} from "./event-questions";

/**
 * Event-type templates — what each kind of event starts as. LAN-154, workflow
 * W8.
 *
 * ## The rule this module exists to make safe
 *
 * D41, as Brian refined it on 2026-08-21: **template values flow into a draft
 * field by field, and only into fields nobody has touched. Approval freezes
 * everything.**
 *
 * > "If I create an event and write a custom description, and then I update the
 * > template, it would not update the description. But if I didn't change the
 * > kit — it's just the default and it's the same — then it updates that."
 *
 * Taken literally over the whole record, D41 would let a March edit to the
 * Practice template overwrite a description somebody wrote by hand on next
 * Wednesday's session. That is the same class of failure as an amendment
 * discarding people's answers: the system quietly destroying work somebody did
 * deliberately.
 *
 * ## How "untouched" is decided without a marker
 *
 * There is no `edited` column, and this module does not need one. A new event of
 * a type is created with exactly `templateDefaults(template)`, so a draft field
 * still holding the value the *old* template gave it is a field nobody has
 * touched, and one holding anything else was edited. The comparison is against
 * the template as it was a moment ago, inside the same transaction that replaces
 * it, so there is no window in which the two disagree.
 *
 * The one imprecision is worth naming rather than hiding: an operator who types
 * a value that happens to equal the current default is indistinguishable from
 * one who left it alone, and their field will move with the next template
 * change. The cost is bounded — the value they typed was the default anyway —
 * and the alternative, a per-field provenance marker on every event, is a schema
 * change this work package does not own.
 *
 * ## Operators create, rename and delete templates — LAN-265
 *
 * This module used to say the opposite, and the reversal is Brian's, with Stu
 * and Clint, on 2026-09-09: "A template is anything the operators want to
 * create." There were exactly seven, none created and none deleted, which was
 * why `event_templates` was granted `select, update` and nothing else — adding
 * an eighth *type* was a change to the approved domain model. It still is: what
 * LAN-265 separated is the **template**, which is an ordinary administrative
 * act, from the **behavioural class** underneath it, which remains a migration
 * and Brian's decision. Every template carries a class; nothing on any screen
 * shows or chooses one, and anything an operator creates gets
 * `DEFAULT_TEMPLATE_CLASS`.
 *
 * Three consequences run through the rest of this file. A template is read by
 * its own `id` rather than by a class, so a rename cannot break a link.
 * `createEventTemplate` writes the template, its messaging cadence and its
 * settings row in one transaction, because a template that could be picked and
 * would then refuse at approval fails in front of the wrong person.
 * `deleteEventTemplate` refuses once any event names the template, because
 * after LAN-265 the template's name is the only label an event has.
 *
 * ## And no timing of any kind
 *
 * A template holds no RSVP deadline, no chase threshold and no send timing.
 * Those live in `event_type_settings` for Mission 4 to consume. W8 removed them
 * from the template on 2026-08-21: a template is what an event arrives looking
 * like, and when somebody is chased is not part of what an event is.
 */

export {
  DEFAULT_TEMPLATE_CLASS,
  DEFAULT_TEMPLATE_COLOUR_KEY,
  describeDuration,
  endTimeFromStart,
  TEMPLATE_COLOUR_PALETTE,
  templateColourFor,
  validateEventTemplate,
  type EventTemplateInput,
  type EventTypeFormDefaults,
  type EventTemplateValidation,
  type RawEventTemplate,
  type TemplateColourSwatch,
  type TemplateFieldIssue,
} from "./event-template-input";

// ---------------------------------------------------------------------------
// What a template is
// ---------------------------------------------------------------------------

/** One template, as stored. Every value is optional — the template may not say. */
export interface EventTemplate {
  /** LAN-265. The identity, which survives a rename. */
  id: string;
  /** The club's own word for this kind of event, and the only label ever shown. */
  name: string;
  /** LAN-276 correction round 1. A key into `TEMPLATE_COLOUR_PALETTE`. */
  colourKey: string;
  /** The behavioural class underneath. Never shown to an operator. */
  eventType: string;
  defaultVenue: string | null;
  defaultDeliveryMode: EventDeliveryMode | null;
  defaultDurationMinutes: number | null;
  defaultDescription: string | null;
  defaultRequiredEquipment: string | null;
  /** Tri-state: `null` is "the template does not say". */
  defaultIsMandatory: boolean | null;
  /** D47. The default audience, as groups. Never people. */
  audienceGroups: AudienceGroupKey[];
  /** D42. Arrive with every event of this type, and are removable per event. */
  questions: EventQuestion[];
}

/** One row of the template list — W8-01, as LAN-265 reopened it. */
export interface EventTemplateSummary {
  id: string;
  name: string;
  /** LAN-276 correction round 1. A key into `TEMPLATE_COLOUR_PALETTE`. */
  colourKey: string;
  eventType: string;
  audienceGroups: AudienceGroupKey[];
  defaultVenue: string | null;
  defaultDeliveryMode: EventDeliveryMode | null;
  questionCount: number;
  /**
   * How many events were ever created from this template.
   *
   * On the list so that **Delete** can be absent rather than present-and-
   * refusing on a template the club has used: a control that is always there and
   * usually says no teaches an operator to ignore it. The number is also the
   * honest answer to "may I get rid of this one", which is the question somebody
   * looking at a list of templates is actually asking.
   */
  eventCount: number;
}

/**
 * The concrete values a new event of this type is created with.
 *
 * The single definition of "what the template gave it", used by
 * `createEventDraft` to build a draft and by the change plan to decide whether a
 * field was touched. Two copies of this would eventually disagree, and the
 * disagreement would look exactly like the destruction D41's refinement exists
 * to prevent.
 *
 * A `null` on the template is not passed through as a null: `delivery_mode` and
 * `is_mandatory` are `not null` on the event, so "the template does not say"
 * resolves to what an event with nobody's opinion on it would have been — in
 * person, and attendance not expected.
 */
export interface TemplateDefaults {
  deliveryMode: EventDeliveryMode;
  venue: string | null;
  description: string | null;
  requiredEquipment: string | null;
  isMandatory: boolean;
  durationMinutes: number | null;
}

export function templateDefaults(template: {
  defaultVenue: string | null;
  defaultDeliveryMode: EventDeliveryMode | null;
  defaultDescription: string | null;
  defaultRequiredEquipment: string | null;
  defaultIsMandatory: boolean | null;
  defaultDurationMinutes: number | null;
}): TemplateDefaults {
  return {
    deliveryMode: template.defaultDeliveryMode ?? "in_person",
    venue: template.defaultVenue,
    description: template.defaultDescription,
    requiredEquipment: template.defaultRequiredEquipment,
    isMandatory: template.defaultIsMandatory ?? false,
    durationMinutes: template.defaultDurationMinutes,
  };
}

export const TEMPLATE_NOT_FOUND_MESSAGE =
  "That template no longer exists. It may have been deleted while this page was open.";

export const TEMPLATE_TYPE_RULE = "event_template_unknown";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

interface TemplateRow {
  id: string;
  name: string;
  colour_key: string;
  event_type: string;
  default_venue: string | null;
  default_delivery_mode: EventDeliveryMode | null;
  default_duration_minutes: number | null;
  default_description: string | null;
  default_required_equipment: string | null;
  default_is_mandatory: boolean | null;
}

/**
 * One stored row in the camel-cased shape `templateDefaults` reads.
 *
 * A named function rather than a spread at each call site, because both readers
 * of `event_templates` resolve their defaults through `templateDefaults` and a
 * second hand-written mapping is a second chance to drop a column.
 */
function toTemplateShape(row: TemplateRow) {
  return {
    defaultVenue: row.default_venue,
    defaultDeliveryMode: row.default_delivery_mode,
    defaultDurationMinutes: row.default_duration_minutes,
    defaultDescription: row.default_description,
    defaultRequiredEquipment: row.default_required_equipment,
    defaultIsMandatory: row.default_is_mandatory,
  };
}

const TEMPLATE_COLUMNS = `id, name, colour_key, event_type::text as event_type, default_venue,
        default_delivery_mode::text as default_delivery_mode, default_duration_minutes,
        default_description, default_required_equipment, default_is_mandatory`;

/**
 * Every template, in the club's own alphabetical order.
 *
 * By name, and not by `public.event_type`'s declared order, since LAN-265: the
 * class is no longer the identity, several templates may share one, and an
 * operator scanning a list they wrote themselves is looking for a word. `lower()`
 * so "chalk" and "Chalk" cannot sort into two different neighbourhoods.
 */
export async function listEventTemplates(): Promise<EventTemplateSummary[]> {
  return withTransaction(async (tx) => {
    const templates = await tx.query<TemplateRow>(
      `select ${TEMPLATE_COLUMNS} from public.event_templates order by lower(name)`,
    );
    const groups = await tx.query<{ template_id: string; audience_group: AudienceGroupKey }>(
      `select template_id, audience_group::text as audience_group
         from public.event_template_audience_groups`,
    );
    const counts = await tx.query<{ template_id: string; count: string }>(
      `select template_id, count(*)::text as count
         from public.event_template_questions
        group by template_id`,
    );
    const events = await tx.query<{ template_id: string; count: string }>(
      `select template_id, count(*)::text as count from public.events group by template_id`,
    );

    return templates.rows.map((row) => ({
      id: row.id,
      name: row.name,
      colourKey: row.colour_key,
      eventType: row.event_type,
      audienceGroups: orderedGroups(
        row.event_type,
        groups.rows.filter((group) => group.template_id === row.id).map((g) => g.audience_group),
      ),
      defaultVenue: row.default_venue,
      defaultDeliveryMode: row.default_delivery_mode,
      questionCount: Number(
        counts.rows.find((count) => count.template_id === row.id)?.count ?? "0",
      ),
      eventCount: Number(events.rows.find((count) => count.template_id === row.id)?.count ?? "0"),
    }));
  });
}

/** Just enough of a template to offer it in a control — LAN-265. */
export interface EventTemplateOption {
  id: string;
  name: string;
}

/**
 * Every template as a pickable option, for the two list filters.
 *
 * Deliberately not `listEventTemplates`, which also counts questions and events
 * and resolves each template's audience groups: the operator's Type filter and
 * the public calendar's need a name and an id, and the public calendar in
 * particular is a page `REQ-public-calendar` requires to render without touching
 * anything it does not need.
 */
export async function listEventTemplateOptions(): Promise<EventTemplateOption[]> {
  return withTransaction(async (tx) => {
    const result = await tx.query<EventTemplateOption>(
      "select id, name from public.event_templates order by lower(name)",
    );
    return result.rows;
  });
}

/**
 * How many events were ever created from this template — LAN-265.
 *
 * The number **Delete** is offered or withheld on. Its own read rather than a
 * field on `EventTemplate`, because the editor is the one screen that needs it
 * and every other reader of a template would be paying for a count over
 * `public.events` it never looks at.
 */
export async function countEventsFromTemplate(templateId: string): Promise<number> {
  if (!isUuid(templateId)) return 0;
  return withTransaction(async (tx) => {
    const result = await tx.query<{ count: string }>(
      "select count(*)::text as count from public.events where template_id = $1::uuid",
      [templateId],
    );
    return Number(result.rows[0].count);
  });
}

/** One template, with its questions and its default audience. */
export async function readEventTemplate(templateId: string): Promise<EventTemplate> {
  return withTransaction(async (tx) => readEventTemplateIn(tx, templateId));
}

export async function readEventTemplateIn(tx: Tx, templateId: string): Promise<EventTemplate> {
  // Checked before the parameter reaches PostgreSQL. `template_id` is a `uuid`,
  // and a hand-typed route segment that is not one raises an invalid-input error
  // rather than returning no rows — which would surface as "the database could
  // not complete this change" instead of the sentence below.
  if (!isUuid(templateId)) {
    throw new NotFound(TEMPLATE_NOT_FOUND_MESSAGE, { rule: TEMPLATE_TYPE_RULE });
  }

  const result = await tx.query<TemplateRow>(
    `select ${TEMPLATE_COLUMNS} from public.event_templates where id = $1::uuid`,
    [templateId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFound(TEMPLATE_NOT_FOUND_MESSAGE, { rule: TEMPLATE_TYPE_RULE });

  const groups = await tx.query<{ audience_group: AudienceGroupKey }>(
    `select audience_group::text as audience_group
       from public.event_template_audience_groups
      where template_id = $1::uuid`,
    [templateId],
  );

  const questions = await tx.query<{
    id: string;
    prompt: string;
    answer_type: EventQuestion["answerType"];
    choices: string[] | null;
    is_required: boolean;
    sort_order: number;
  }>(
    `select id, prompt, answer_type::text as answer_type, choices, is_required, sort_order
       from public.event_template_questions
      where template_id = $1::uuid
      order by sort_order, prompt`,
    [templateId],
  );

  return {
    id: row.id,
    name: row.name,
    colourKey: row.colour_key,
    eventType: row.event_type,
    defaultVenue: row.default_venue,
    defaultDeliveryMode: row.default_delivery_mode,
    defaultDurationMinutes: row.default_duration_minutes,
    defaultDescription: row.default_description,
    defaultRequiredEquipment: row.default_required_equipment,
    defaultIsMandatory: row.default_is_mandatory,
    audienceGroups: orderedGroups(
      row.event_type,
      groups.rows.map((group) => group.audience_group),
    ),
    questions: questions.rows.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      answerType: question.answer_type,
      choices: question.choices,
      isRequired: question.is_required,
      sortOrder: question.sort_order,
      // A template question is not itself "from a template" — it *is* the
      // template. The flag exists on the event copy, and is set there.
      fromTemplate: false,
    })),
  };
}

/**
 * The groups in the order the builder shows them, so every surface agrees.
 *
 * Also the filter that keeps a stored group honest: `recruits` is refused on
 * anything but Recruitment by the database, and a group the vocabulary no longer
 * offers for a type is simply not shown rather than printed as a raw value.
 */
function orderedGroups(eventType: string, stored: readonly string[]): AudienceGroupKey[] {
  return groupsForEventType(eventType)
    .filter((group) => stored.includes(group.key))
    .map((group) => group.key);
}

// ---------------------------------------------------------------------------
// What a new event of this type starts as
// ---------------------------------------------------------------------------

/**
 * Everything a new draft of `eventType` inherits — the fields, the questions and
 * the default audience.
 *
 * Read inside the caller's transaction, because `createEventDraft` writes the
 * event, its questions and its audience together and a template edited between
 * the reads would produce an event assembled from two different templates.
 */
export interface NewEventInheritance {
  /** The class the event takes from its template, which it never chooses itself. */
  eventType: string;
  defaults: TemplateDefaults;
  questions: EventQuestionInput[];
  audienceGroups: AudienceGroupKey[];
}

export async function readTemplateInheritanceIn(
  tx: Tx,
  templateId: string,
): Promise<NewEventInheritance> {
  const template = await readEventTemplateIn(tx, templateId);
  return {
    eventType: template.eventType,
    defaults: templateDefaults(template),
    questions: await readTemplateQuestionsAsEventInputIn(tx, templateId),
    audienceGroups: template.audienceGroups,
  };
}

/**
 * Every template in the shape the create-and-edit form fills itself from.
 *
 * All of them at once, and not one, because the form's Template control changes
 * which template applies while the operator is typing. D41's rule then has to run
 * in the browser — a field nobody has touched takes the new template's value, a
 * field somebody wrote keeps what they wrote — and it cannot do that with a round
 * trip for every change of a select.
 *
 * Keyed by template id, and each entry carries its own `name`, because after
 * LAN-265 the key is not something a screen can print and the name is the only
 * thing it ever prints.
 */
export async function readEventFormDefaults(): Promise<Record<string, EventTypeFormDefaults>> {
  return withTransaction(async (tx) => {
    const templates = await tx.query<TemplateRow>(
      `select ${TEMPLATE_COLUMNS} from public.event_templates order by lower(name)`,
    );
    const questions = await tx.query<{
      template_id: string;
      prompt: string;
      answer_type: string;
      choices: string[] | null;
      is_required: boolean;
    }>(
      `select template_id, prompt, answer_type::text as answer_type,
              choices, is_required
         from public.event_template_questions
        order by template_id, sort_order, prompt`,
    );

    const defaults: Record<string, EventTypeFormDefaults> = {};
    for (const row of templates.rows) {
      const resolved = templateDefaults(toTemplateShape(row));
      defaults[row.id] = {
        id: row.id,
        name: row.name,
        eventType: row.event_type,
        deliveryMode: resolved.deliveryMode,
        venue: resolved.venue ?? "",
        description: resolved.description ?? "",
        requiredEquipment: resolved.requiredEquipment ?? "",
        attendance: resolved.isMandatory ? "mandatory" : "optional",
        durationMinutes: resolved.durationMinutes,
        questions: questions.rows
          .filter((question) => question.template_id === row.id)
          .map((question) => ({
            prompt: question.prompt,
            answerType: question.answer_type,
            required: question.is_required ? "required" : "optional",
            choices: joinQuestionChoices(question.choices),
            fromTemplate: "true",
          })),
      };
    }
    return defaults;
  });
}

/**
 * The selection keys a template's default audience resolves to for one event.
 *
 * D47's whole point: it arrives with the event already set, so the approver
 * checks rather than builds. It is resolved to an explicit list of people at the
 * moment the event is created, because a group is a way of selecting people and
 * not a live query that changes underneath an event.
 */
export function templateAudienceKeys(
  candidates: readonly AudienceCandidate[],
  audienceGroups: readonly AudienceGroupKey[],
): string[] {
  const keys = new Set<string>();
  for (const group of audienceGroups) {
    for (const key of groupSelectionKeys(candidates, group)) keys.add(key);
  }
  return [...keys];
}

// ---------------------------------------------------------------------------
// Changing a template, and saying what that will touch first
// ---------------------------------------------------------------------------

/** One field the operator changed, in the words the confirmation uses. */
export interface TemplateFieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

/** One question the operator added, removed or altered. */
export interface TemplateQuestionChange {
  kind: "added" | "removed" | "changed";
  prompt: string;
}

/** One draft the change will reach, and the fields it will take. */
export interface DraftTakingChange {
  id: string;
  name: string;
  scheduledOn: string | null;
  /** The labels of the fields that will move. Empty when only questions move. */
  fields: string[];
  /** True when this draft's audience will be replaced by the new default. */
  audience: boolean;
  questions: boolean;
}

/** One draft the change will not reach, and why — W8-03's second panel. */
export interface DraftHoldingItsOwn {
  id: string;
  name: string;
  scheduledOn: string | null;
  /** "Its description was edited by hand." One sentence per held field. */
  reasons: string[];
}

/**
 * What saving this template will and will not do — W8-03.
 *
 * Every count in it is derived from the same pass that performs the change, so
 * the sentence the operator reads and the rows that move cannot disagree.
 */
export interface TemplateChangePlan {
  templateId: string;
  /** The name as it stands after the change — what the confirmation calls it. */
  name: string;
  eventType: string;
  /** LAN-265. `null` unless the operator renamed it, in which case the old name. */
  renamedFrom: string | null;
  fieldChanges: TemplateFieldChange[];
  questionChanges: TemplateQuestionChange[];
  /** The default audience, before and after, as group labels. */
  audienceBefore: string[];
  audienceAfter: string[];
  taking: DraftTakingChange[];
  holding: DraftHoldingItsOwn[];
  /** What will not move whatever the change is. */
  untouched: { approved: number; past: number };
}

interface DraftRow {
  id: string;
  name: string;
  scheduled_on: Date | string | null;
  starts_at: string | null;
  ends_at: string | null;
  delivery_mode: EventDeliveryMode;
  venue: string | null;
  description: string | null;
  required_equipment: string | null;
  is_mandatory: boolean;
  season_id: string;
  status: EventStatus;
}

function asDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The fields a template gives an event, in the order the editor shows them. */
const INHERITED_FIELDS = Object.freeze([
  { field: "deliveryMode", label: "Where" },
  { field: "venue", label: "Venue" },
  { field: "requiredEquipment", label: "Required equipment" },
  { field: "description", label: "Description" },
  { field: "isMandatory", label: "Attendance" },
  { field: "endsAt", label: "End time" },
] as const);

type InheritedField = (typeof INHERITED_FIELDS)[number]["field"];

function labelOf(field: InheritedField): string {
  return INHERITED_FIELDS.find((entry) => entry.field === field)!.label;
}

/** How a value reads in the confirmation. Never a raw null, never a bare `false`. */
function readValue(field: InheritedField, value: string | boolean | null): string {
  if (field === "isMandatory") return value ? "Mandatory" : "Optional";
  if (field === "deliveryMode") return value === "online" ? "Online" : "In person";
  if (value === null || value === "") return "Not set";
  return String(value);
}

/**
 * The value a draft of this type holds for one inherited field, and the value
 * the given defaults would give it.
 *
 * `endsAt` is the one that is not a straight copy: a template holds a duration
 * rather than an end (D78), so the end a template implies depends on the start
 * the operator entered. A draft with no start inherits no end, which is why the
 * pair is `null`/`null` there and the field is skipped.
 */
function impliedValue(
  field: InheritedField,
  defaults: TemplateDefaults,
  draft: DraftRow,
): string | boolean | null {
  switch (field) {
    case "deliveryMode":
      return defaults.deliveryMode;
    case "venue":
      return defaults.venue;
    case "requiredEquipment":
      return defaults.requiredEquipment;
    case "description":
      return defaults.description;
    case "isMandatory":
      return defaults.isMandatory;
    case "endsAt":
      return draft.starts_at === null
        ? null
        : endTimeFromStart(draft.starts_at.slice(0, 5), defaults.durationMinutes);
  }
}

function heldValue(field: InheritedField, draft: DraftRow): string | boolean | null {
  switch (field) {
    case "deliveryMode":
      return draft.delivery_mode;
    case "venue":
      return draft.venue;
    case "requiredEquipment":
      return draft.required_equipment;
    case "description":
      return draft.description;
    case "isMandatory":
      return draft.is_mandatory;
    case "endsAt":
      return draft.ends_at === null ? null : draft.ends_at.slice(0, 5);
  }
}

const COLUMN_OF: Readonly<Record<InheritedField, string>> = Object.freeze({
  deliveryMode: "delivery_mode",
  venue: "venue",
  requiredEquipment: "required_equipment",
  description: "description",
  isMandatory: "is_mandatory",
  endsAt: "ends_at",
});

/**
 * Every draft of this type that a template change may reach.
 *
 * Two exclusions, both from W8 and both absolute: **no approved event ever
 * changes**, because people have been told what it is, and **no past event ever
 * changes**. A draft with no date is not past — it has not happened, so nothing
 * about it is history yet.
 *
 * Locked, because the change is decided from what is read here and written a
 * moment later. Without the lock a draft edited in between would be judged
 * untouched on a value it no longer holds, and the edit would be overwritten —
 * which is the exact destruction this rule exists to prevent.
 */
async function lockAffectedDraftsIn(tx: Tx, templateId: string, today: string) {
  const result = await tx.query<DraftRow>(
    `select id, name, scheduled_on, starts_at::text as starts_at, ends_at::text as ends_at,
            delivery_mode::text as delivery_mode, venue, description, required_equipment,
            is_mandatory, season_id, status::text as status
       from public.events
      where template_id = $1::uuid
        and status = 'draft'
        and (scheduled_on is null or scheduled_on >= $2::date)
      order by scheduled_on nulls last, name
        for update`,
    [templateId, today],
  );
  return result.rows;
}

/** The two "nothing else changes" counts W8-03 states beside the change. */
async function countUntouchedIn(tx: Tx, templateId: string, today: string) {
  const result = await tx.query<{ approved: string; past: string }>(
    `select count(*) filter (where status <> 'draft')::text as approved,
            count(*) filter (where status = 'draft'
                               and scheduled_on is not null
                               and scheduled_on < $2::date)::text as past
       from public.events
      where template_id = $1::uuid`,
    [templateId, today],
  );
  return {
    approved: Number(result.rows[0].approved),
    past: Number(result.rows[0].past),
  };
}

function questionKey(question: { prompt: string }): string {
  return question.prompt.trim().toLowerCase();
}

function sameQuestion(
  a: { answerType: string; isRequired: boolean; choices: readonly string[] | null },
  b: { answerType: string; isRequired: boolean; choices: readonly string[] | null },
): boolean {
  return (
    a.answerType === b.answerType &&
    a.isRequired === b.isRequired &&
    (a.choices ?? []).join(" ") === (b.choices ?? []).join(" ")
  );
}

/**
 * Builds the plan, and — when `apply` is a transaction — performs it.
 *
 * One function for both so that W8-03's confirmation and the write it confirms
 * are the same computation. A separate "preview" implementation would be a
 * second opinion about the blast radius, and a blast radius the operator was
 * shown but did not get is worse than not showing one.
 */
async function planOrApply(
  tx: Tx,
  templateId: string,
  input: EventTemplateInput,
  questions: readonly EventQuestionInput[],
  apply: boolean,
): Promise<TemplateChangePlan> {
  if (!isUuid(templateId)) {
    throw new NotFound(TEMPLATE_NOT_FOUND_MESSAGE, { rule: TEMPLATE_TYPE_RULE });
  }

  // The template row is locked first, so two operators saving the same template
  // at once are serialized rather than each deciding from the other's "before".
  const locked = await tx.query<{ id: string }>(
    `select id from public.event_templates where id = $1::uuid for update`,
    [templateId],
  );
  if (locked.rowCount === 0) {
    throw new NotFound(TEMPLATE_NOT_FOUND_MESSAGE, { rule: TEMPLATE_TYPE_RULE });
  }

  const before = await readEventTemplateIn(tx, templateId);
  const eventType = before.eventType;
  const beforeDefaults = templateDefaults(before);
  const afterDefaults = templateDefaults({
    defaultVenue: input.defaultVenue,
    defaultDeliveryMode: input.defaultDeliveryMode,
    defaultDescription: input.defaultDescription,
    defaultRequiredEquipment: input.defaultRequiredEquipment,
    defaultIsMandatory: input.defaultIsMandatory,
    defaultDurationMinutes: input.defaultDurationMinutes,
  });

  const audienceGroups = orderedGroups(eventType, input.audienceGroups);
  if (audienceGroups.length !== input.audienceGroups.length) {
    throw new ConstraintViolated("One of those groups is not offered for this kind of event.", {
      rule: "event_template_audience_group_not_offered",
    });
  }

  const today = todayInClubZone();
  const drafts = await lockAffectedDraftsIn(tx, templateId, today);

  // --- which scalar fields moved, and which drafts still hold the old default
  const movedFields: InheritedField[] = [];
  const fieldChanges: TemplateFieldChange[] = [];
  for (const { field } of INHERITED_FIELDS) {
    if (field === "endsAt") {
      if (beforeDefaults.durationMinutes !== afterDefaults.durationMinutes) {
        movedFields.push(field);
        fieldChanges.push({
          field,
          label: "Default length",
          from: durationText(beforeDefaults.durationMinutes),
          to: durationText(afterDefaults.durationMinutes),
        });
      }
      continue;
    }
    const from = impliedValue(field, beforeDefaults, EMPTY_DRAFT);
    const to = impliedValue(field, afterDefaults, EMPTY_DRAFT);
    if (from === to) continue;
    movedFields.push(field);
    fieldChanges.push({
      field,
      label: labelOf(field),
      from: readValue(field, from),
      to: readValue(field, to),
    });
  }

  // --- which questions moved
  const beforeQuestions = new Map(before.questions.map((q) => [questionKey(q), q] as const));
  const afterQuestions = new Map(questions.map((q) => [questionKey(q), q] as const));
  const questionChanges: TemplateQuestionChange[] = [];
  for (const [key, question] of afterQuestions) {
    const was = beforeQuestions.get(key);
    if (!was) questionChanges.push({ kind: "added", prompt: question.prompt });
    else if (!sameQuestion(was, question)) {
      questionChanges.push({ kind: "changed", prompt: question.prompt });
    }
  }
  for (const [key, question] of beforeQuestions) {
    if (!afterQuestions.has(key)) {
      questionChanges.push({ kind: "removed", prompt: question.prompt });
    }
  }

  const audienceMoved = before.audienceGroups.join(",") !== audienceGroups.join(",");

  const taking: DraftTakingChange[] = [];
  const holding: DraftHoldingItsOwn[] = [];

  for (const draft of drafts) {
    const movingHere: InheritedField[] = [];
    const reasons: string[] = [];

    for (const field of movedFields) {
      const wasGiven = impliedValue(field, beforeDefaults, draft);
      const nowGiven = impliedValue(field, afterDefaults, draft);
      // A draft with no start inherits no end, so the default-length change has
      // nothing to apply to it. Not "held" — there is simply no field to move.
      if (field === "endsAt" && draft.starts_at === null) continue;
      if (wasGiven === nowGiven) continue;
      if (heldValue(field, draft) === wasGiven) movingHere.push(field);
      else reasons.push(`Its ${labelOf(field).toLowerCase()} was edited by hand.`);
    }

    // --- questions on this draft
    const draftQuestions = await readEventQuestionsIn(tx, draft.id);
    const nextQuestions = planDraftQuestions(draftQuestions, before.questions, questions);
    const questionsMove =
      questionChanges.length > 0 && !sameQuestionList(draftQuestions, nextQuestions);

    // --- the audience on this draft
    let audienceMoves = false;
    if (audienceMoved) {
      const catalogue = await listAudienceCatalogueIn(
        tx,
        draft.season_id,
        asDate(draft.scheduled_on),
      );
      const held = await readAudiencePeopleIn(tx, draft.id);
      const wasGiven = peopleFor(catalogue.candidates, before.audienceGroups);
      if (sameSet(held, wasGiven)) audienceMoves = true;
      else reasons.push("Its audience was chosen by hand.");
    }

    if (movingHere.length > 0 || questionsMove || audienceMoves) {
      taking.push({
        id: draft.id,
        name: draft.name,
        scheduledOn: asDate(draft.scheduled_on),
        fields: movingHere.map((field) => (field === "endsAt" ? "Default length" : labelOf(field))),
        audience: audienceMoves,
        questions: questionsMove,
      });
    }
    if (reasons.length > 0) {
      holding.push({
        id: draft.id,
        name: draft.name,
        scheduledOn: asDate(draft.scheduled_on),
        reasons,
      });
    }

    if (!apply) continue;

    if (movingHere.length > 0) {
      const assignments = movingHere
        .map((field, index) => `${COLUMN_OF[field]} = $${index + 2}`)
        .join(", ");
      await tx.query(
        `update public.events
            set ${assignments}, updated_at = now()
          where id = $1 and status = 'draft'`,
        [draft.id, ...movingHere.map((field) => impliedValue(field, afterDefaults, draft))],
      );
    }
    if (questionsMove) await writeEventQuestionsIn(tx, draft.id, nextQuestions);
    if (audienceMoves) {
      const catalogue = await listAudienceCatalogueIn(
        tx,
        draft.season_id,
        asDate(draft.scheduled_on),
      );
      await replaceDraftAudienceIn(
        tx,
        draft,
        templateAudienceKeys(catalogue.candidates, audienceGroups),
        catalogue.candidates,
      );
    }
  }

  if (apply) {
    await tx.query(
      `update public.event_templates
          set name = $2,
              colour_key = $3,
              default_venue = $4,
              default_delivery_mode = $5::public.event_delivery_mode,
              default_duration_minutes = $6,
              default_description = $7,
              default_required_equipment = $8,
              default_is_mandatory = $9,
              updated_at = now()
        where id = $1::uuid`,
      [
        templateId,
        input.name,
        input.colourKey,
        input.defaultVenue,
        input.defaultDeliveryMode,
        input.defaultDurationMinutes,
        input.defaultDescription,
        input.defaultRequiredEquipment,
        input.defaultIsMandatory,
      ],
    );

    await tx.query(
      "delete from public.event_template_audience_groups where template_id = $1::uuid",
      [templateId],
    );
    for (const group of audienceGroups) {
      await tx.query(
        `insert into public.event_template_audience_groups (template_id, event_type, audience_group)
         values ($1::uuid, $2::public.event_type, $3::public.audience_group)`,
        [templateId, eventType, group],
      );
    }

    await tx.query("delete from public.event_template_questions where template_id = $1::uuid", [
      templateId,
    ]);
    for (const [index, question] of questions.entries()) {
      await tx.query(
        `insert into public.event_template_questions
           (template_id, event_type, prompt, answer_type, choices, is_required, sort_order)
         values ($1::uuid, $2::public.event_type, $3, $4::public.question_answer_type, $5::text[],
                 $6, $7::smallint)`,
        [
          templateId,
          eventType,
          question.prompt,
          question.answerType,
          question.answerType === "choice" ? question.choices : null,
          question.isRequired,
          index,
        ],
      );
    }
  }

  return {
    templateId,
    name: input.name,
    eventType,
    // Compared case-sensitively, so correcting "Chalk" to "chalk" still reads as
    // a rename on the confirmation. It is one: the club will see the new casing
    // everywhere, including on last term's sessions.
    renamedFrom: before.name === input.name ? null : before.name,
    fieldChanges,
    questionChanges,
    audienceBefore: labelsFor(eventType, before.audienceGroups),
    audienceAfter: labelsFor(eventType, audienceGroups),
    taking,
    holding,
    untouched: await countUntouchedIn(tx, templateId, today),
  };
}

/** A draft with nothing in it, for comparing two sets of defaults to each other. */
const EMPTY_DRAFT: DraftRow = Object.freeze({
  id: "",
  name: "",
  scheduled_on: null,
  starts_at: null,
  ends_at: null,
  delivery_mode: "in_person" as EventDeliveryMode,
  venue: null,
  description: null,
  required_equipment: null,
  is_mandatory: false,
  season_id: "",
  status: "draft" as EventStatus,
});

function durationText(minutes: number | null): string {
  return minutes === null ? "Not set" : `${minutes} minutes`;
}

function labelsFor(eventType: string, keys: readonly AudienceGroupKey[]): string[] {
  return groupsForEventType(eventType)
    .filter((group) => keys.includes(group.key))
    .map((group) => group.label);
}

/**
 * The questions a draft should hold after this template change.
 *
 * The delta is applied, not the whole list, and that is the difference between
 * respecting an operator's edit and undoing it. D42 lets an operator remove a
 * template question from one event; re-adding it on the next template save would
 * be the system putting back something somebody deliberately took out.
 *
 * So:
 *
 *   * a prompt **added** to the template is added to the draft;
 *   * a prompt **removed** from the template is removed from the draft, but only
 *     where the draft still carries it as a template question — one the operator
 *     retyped for themselves is theirs;
 *   * a prompt **changed** in the template is changed on the draft only where the
 *     draft's copy still matches what the template used to say.
 *
 * A question the operator wrote on the event is never touched by any of it.
 */
export function planDraftQuestions(
  held: readonly EventQuestion[],
  templateBefore: readonly {
    prompt: string;
    answerType: string;
    isRequired: boolean;
    choices: readonly string[] | null;
  }[],
  templateAfter: readonly EventQuestionInput[],
): EventQuestionInput[] {
  const beforeByKey = new Map(templateBefore.map((q) => [questionKey(q), q] as const));
  const afterByKey = new Map(templateAfter.map((q) => [questionKey(q), q] as const));

  const next: EventQuestionInput[] = [];
  for (const question of held) {
    const key = questionKey(question);
    const was = beforeByKey.get(key);
    const now = afterByKey.get(key);

    if (question.fromTemplate && was && !now) continue; // removed from the template

    if (question.fromTemplate && was && now && sameQuestion(question, was)) {
      next.push({ ...now, fromTemplate: true });
      continue;
    }

    next.push({
      prompt: question.prompt,
      answerType: question.answerType,
      isRequired: question.isRequired,
      choices: question.choices,
      fromTemplate: question.fromTemplate,
    });
  }

  const holding = new Set(next.map(questionKey));
  for (const question of templateAfter) {
    if (beforeByKey.has(questionKey(question))) continue; // not new
    if (holding.has(questionKey(question))) continue; // the operator wrote it first
    next.push({ ...question, fromTemplate: true });
  }

  return next;
}

function sameQuestionList(
  held: readonly EventQuestion[],
  next: readonly EventQuestionInput[],
): boolean {
  if (held.length !== next.length) return false;
  return held.every(
    (question, index) =>
      questionKey(question) === questionKey(next[index]) &&
      sameQuestion(question, next[index]) &&
      question.fromTemplate === next[index].fromTemplate,
  );
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((value) => b.has(value));
}

function peopleFor(
  candidates: readonly AudienceCandidate[],
  groups: readonly AudienceGroupKey[],
): ReadonlySet<string> {
  const resolution = resolveSelection(candidates, templateAudienceKeys(candidates, groups));
  return new Set(resolution.ok ? resolution.members.map((member) => member.personId) : []);
}

async function readAudiencePeopleIn(tx: Tx, eventId: string): Promise<ReadonlySet<string>> {
  const result = await tx.query<{ person_id: string }>(
    `select coalesce(a.person_id, m.person_id) as person_id
       from public.event_audience_members a
       left join public.season_memberships m on m.id = a.season_membership_id
      where a.event_id = $1`,
    [eventId],
  );
  return new Set(result.rows.map((row) => row.person_id));
}

/**
 * Replaces a draft's audience with a resolved list.
 *
 * Shares the `delete` then `insert` shape with `saveEventAudience`, and is safe
 * for the same reason: invariant P1 means no invitation can reference a draft's
 * audience rows, so nothing depends on them. The status guard is the caller's —
 * this is only ever reached for a row `lockAffectedDraftsIn` proved was a draft
 * and is still holding the lock on.
 */
async function replaceDraftAudienceIn(
  tx: Tx,
  draft: DraftRow,
  keys: readonly string[],
  candidates: readonly AudienceCandidate[],
): Promise<void> {
  const resolution = resolveSelection(candidates, keys);
  const members = resolution.ok ? resolution.members : [];

  await tx.query("delete from public.event_audience_members where event_id = $1", [draft.id]);
  if (members.length === 0) return;

  await tx.query(
    `insert into public.event_audience_members
       (event_id, season_id, capacity, season_membership_id, person_id, added_at)
     select $1, $2, member.capacity::public.invitation_capacity,
            case when member.capacity = 'player' then member.anchor_id::uuid end,
            case when member.capacity <> 'player' then member.anchor_id::uuid end,
            now()
       from unnest($3::text[], $4::text[]) as member(capacity, anchor_id)`,
    [
      draft.id,
      draft.season_id,
      members.map((member) => member.capacity),
      members.map((member) => member.anchorId),
    ],
  );
}

/**
 * What saving this template would do, without doing any of it.
 *
 * Runs the whole computation, including the locks that the write would take, and
 * writes nothing. The locks are the point: a preview that took none could report
 * a blast radius a concurrent edit had already changed. They are released when
 * the transaction ends, which is why the confirmation is only a courtesy and
 * `saveEventTemplate` recomputes everything under fresh ones.
 */
export async function planEventTemplateChange(
  templateId: string,
  input: EventTemplateInput,
  questions: readonly EventQuestionInput[],
): Promise<TemplateChangePlan> {
  return withTransaction(async (tx) => {
    const plan = await planOrApply(tx, templateId, input, questions, false);
    return plan;
  });
}

export const TEMPLATE_SAVED_ACTION = "event_template.updated";
export const TEMPLATE_CREATED_ACTION = "event_template.created";
export const TEMPLATE_DELETED_ACTION = "event_template.deleted";

export const TEMPLATE_IN_USE_RULE = "event_template_in_use";

/**
 * A name two templates cannot share is refused by the database, not here.
 *
 * `event_templates_name_unique` is a case-insensitive unique index, and
 * `src/lib/db/errors.ts` turns it into the club's own sentence, as it does for
 * every other named constraint — that module's own note is explicit that no
 * other layer should be reading constraint names. A pre-check here would be a
 * second opinion that is sometimes wrong: two operators can each be holding a
 * form that says "Kicking Clinic", and the index is the only place that is
 * decided.
 */
export const TEMPLATE_NAME_TAKEN_RULE = "event_templates_name_unique";

/**
 * Saves the template and updates every draft the rule reaches, in one
 * transaction.
 *
 * The plan is recomputed here rather than accepted from the confirmation screen.
 * A browser that posted a plan could post any plan; what the operator saw is a
 * courtesy, and what happens is derived from the rows again, under the locks,
 * at the moment of the write.
 */
export async function saveEventTemplate(
  actorPersonId: string,
  templateId: string,
  input: EventTemplateInput,
  questions: readonly EventQuestionInput[],
): Promise<TemplateChangePlan> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const plan = await planOrApply(tx, templateId, input, questions, true);

    await recordAudit(tx, {
      actorPersonId,
      action: TEMPLATE_SAVED_ACTION,
      entityTable: "event_templates",
      entityId: templateId,
      context: {
        name: plan.name,
        // LAN-265. A rename is retroactive across every event ever created from
        // this template, so the ledger records what the club used to call it —
        // otherwise the only record of the old word is in people's memories, and
        // "why does last term's chalk say Film Review" has no answer.
        renamedFrom: plan.renamedFrom,
        colourKey: input.colourKey,
        eventType: plan.eventType,
        fieldsChanged: plan.fieldChanges.map((change) => change.field),
        questionsChanged: plan.questionChanges.length,
        audienceGroups: input.audienceGroups,
        draftsUpdated: plan.taking.map((draft) => draft.id),
        draftsHoldingTheirOwn: plan.holding.length,
        approvedUntouched: plan.untouched.approved,
        pastUntouched: plan.untouched.past,
      },
    });

    return plan;
  });
}

// ---------------------------------------------------------------------------
// Creating and deleting a template — LAN-265
// ---------------------------------------------------------------------------

/**
 * Creates a template, and the messaging cadence that makes it usable.
 *
 * Brian, 2026-09-09: "Creating a template also creates its messaging cadence,
 * which starts from a default cadence and can then be edited on the Messaging
 * schedule screen like the seven existing ones."
 *
 * All three rows in one transaction, and that is the whole design. A template
 * without a `messaging_schedules` row could be picked on the create form and
 * would then refuse at approval, naming a table no operator has heard of — the
 * failure would land on whoever approved next Wednesday's session rather than on
 * whoever created the template, days later and on a different screen. The
 * primary key and the cascading foreign key added by
 * `20260916090000_event_templates.sql` make the pairing structural; this
 * function is what keeps it true at the moment of creation.
 *
 * The new template arrives empty of defaults. Nothing is copied from another
 * template: "Kicking Clinic" is not a variant of Practice, and pre-filling it
 * with Practice's venue and questions would put words in the operator's mouth on
 * a screen whose whole purpose is that they get to choose.
 */
export async function createEventTemplate(
  actorPersonId: string,
  input: EventTemplateInput,
  questions: readonly EventQuestionInput[] = [],
): Promise<EventTemplate> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const eventType = DEFAULT_TEMPLATE_CLASS;

    const inserted = await tx.query<{ id: string }>(
      `insert into public.event_templates
           (name, colour_key, event_type, default_venue, default_delivery_mode,
            default_duration_minutes, default_description, default_required_equipment,
            default_is_mandatory)
         values ($1, $2, $3::public.event_type, $4, $5::public.event_delivery_mode, $6, $7, $8, $9)
         returning id`,
      [
        input.name,
        input.colourKey,
        eventType,
        input.defaultVenue,
        input.defaultDeliveryMode,
        input.defaultDurationMinutes,
        input.defaultDescription,
        input.defaultRequiredEquipment,
        input.defaultIsMandatory,
      ],
    );

    const templateId = inserted.rows[0].id;

    const audienceGroups = orderedGroups(eventType, input.audienceGroups);
    if (audienceGroups.length !== input.audienceGroups.length) {
      throw new ConstraintViolated("One of those groups is not offered for this kind of event.", {
        rule: "event_template_audience_group_not_offered",
      });
    }
    for (const group of audienceGroups) {
      await tx.query(
        `insert into public.event_template_audience_groups (template_id, event_type, audience_group)
         values ($1::uuid, $2::public.event_type, $3::public.audience_group)`,
        [templateId, eventType, group],
      );
    }

    for (const [index, question] of questions.entries()) {
      await tx.query(
        `insert into public.event_template_questions
           (template_id, event_type, prompt, answer_type, choices, is_required, sort_order)
         values ($1::uuid, $2::public.event_type, $3, $4::public.question_answer_type, $5::text[],
                 $6, $7::smallint)`,
        [
          templateId,
          eventType,
          question.prompt,
          question.answerType,
          question.answerType === "choice" ? question.choices : null,
          question.isRequired,
          index,
        ],
      );
    }

    await createMessagingScheduleIn(tx, templateId, eventType);
    await createEventTypeSettingsIn(tx, templateId, eventType);

    await recordAudit(tx, {
      actorPersonId,
      action: TEMPLATE_CREATED_ACTION,
      entityTable: "event_templates",
      entityId: templateId,
      context: {
        name: input.name,
        colourKey: input.colourKey,
        eventType,
        audienceGroups,
        questionCount: questions.length,
        messagingSchedule: DEFAULT_MESSAGING_SCHEDULE,
        chaseThresholdDays: DEFAULT_CHASE_THRESHOLD_DAYS,
      },
    });

    return readEventTemplateIn(tx, templateId);
  });
}

/**
 * D75, D77's chase threshold for a template the club has just invented.
 *
 * Two days, which is what six of the seven shipped rows say and what the
 * migration calls "the routine events". A game's seven and a social's five are
 * decisions about a game and a social, not about an unnamed new kind of event.
 */
export const DEFAULT_CHASE_THRESHOLD_DAYS = 2;

async function createEventTypeSettingsIn(
  tx: Tx,
  templateId: string,
  eventType: string,
): Promise<void> {
  await tx.query(
    `insert into public.event_type_settings (template_id, event_type, chase_threshold_days)
     values ($1::uuid, $2::public.event_type, $3)`,
    [templateId, eventType, DEFAULT_CHASE_THRESHOLD_DAYS],
  );
}

export const TEMPLATE_DELETE_REFUSAL =
  "Events have already been created from this template, so it cannot be deleted. " +
  "Rename it instead — the new name reaches every one of them.";

/**
 * Deletes a template nothing was ever created from.
 *
 * "Delete when unused" is the whole rule, and the reason is what a name is for
 * after LAN-265: an event's label is read from its template, so a deleted
 * template would leave its events with nothing to be called. The refusal names
 * the alternative, because renaming is exactly what somebody trying to delete a
 * template they no longer use probably wants — and unlike deleting, it is free
 * and reaches everything.
 *
 * The count and the delete are one statement's apart inside one transaction, and
 * `events_template_fkey`'s `on delete restrict` is the backstop underneath: an
 * event created between the check and the delete makes the delete fail rather
 * than orphan it.
 */
export async function deleteEventTemplate(
  actorPersonId: string,
  templateId: string,
): Promise<EventTemplate> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const template = await readEventTemplateIn(tx, templateId);

    const used = await tx.query<{ count: string }>(
      "select count(*)::text as count from public.events where template_id = $1::uuid",
      [templateId],
    );
    if (Number(used.rows[0].count) > 0) {
      throw new ConstraintViolated(TEMPLATE_DELETE_REFUSAL, { rule: TEMPLATE_IN_USE_RULE });
    }

    // The questions, the default audience, the messaging schedule and the
    // settings row all carry `on delete cascade`, so this one statement takes
    // the whole template with it. Written as one delete rather than five, so
    // that a table added to the template later cannot be forgotten here.
    await tx.query("delete from public.event_templates where id = $1::uuid", [templateId]);

    await recordAudit(tx, {
      actorPersonId,
      action: TEMPLATE_DELETED_ACTION,
      entityTable: "event_templates",
      entityId: templateId,
      context: {
        name: template.name,
        eventType: template.eventType,
        questionCount: template.questions.length,
        audienceGroups: template.audienceGroups,
      },
    });

    return template;
  });
}

/**
 * Whether a route segment can be a `uuid` at all.
 *
 * The pattern is `event-input.ts`'s, not a second copy: the only job here is to
 * keep a hand-typed URL from reaching a `uuid` parameter, where PostgreSQL would
 * raise an invalid-input error that surfaces as "the database could not complete
 * this change" rather than as "that template no longer exists".
 */
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

const requireActor = actorRequirement("A template change has to name the operator who made it.");
