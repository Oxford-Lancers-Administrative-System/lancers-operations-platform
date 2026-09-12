import "server-only";

import { ConstraintViolated, NotFound, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "../audit";
import { todayInClubZone } from "@/lib/club-time";
import { type EventDeliveryMode, type EventStatus } from "../event-input";
import { endTimeFromStart, type EventTemplateInput } from "../event-template-input";
import {
  groupsForEventType,
  resolveSelection,
  type AudienceCandidate,
  type AudienceGroupKey,
} from "../audience-selection";
import { listAudienceCatalogueIn } from "../event-audience";
import {
  readEventQuestionsIn,
  writeEventQuestionsIn,
  type EventQuestion,
  type EventQuestionInput,
} from "../event-questions";
import {
  isUuid,
  orderedGroups,
  readEventTemplateIn,
  requireActor,
  TEMPLATE_NOT_FOUND_MESSAGE,
  TEMPLATE_TYPE_RULE,
  templateDefaults,
  type TemplateDefaults,
} from "./shared";
import { templateAudienceKeys } from "./read";

/**
 * What saving a template will touch, and applying it — W8-03. One function
 * builds the confirmation and performs the write, so they cannot disagree.
 * LAN-300 split of `event-templates.ts`; see `./index`.
 */

/** One field the operator changed, in the words the confirmation uses. */
interface TemplateFieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

/** One question the operator added, removed or altered. */
interface TemplateQuestionChange {
  kind: "added" | "removed" | "changed";
  prompt: string;
}

/** One draft the change will reach, and the fields it will take. */
interface DraftTakingChange {
  id: string;
  name: string;
  scheduledOn: string | null;
  fields: string[]; // labels of the fields that will move; empty when only questions move
  audience: boolean; // true when this draft's audience will be replaced by the new default
  questions: boolean;
}

/** One draft the change will not reach, and why — W8-03's second panel. */
interface DraftHoldingItsOwn {
  id: string;
  name: string;
  scheduledOn: string | null;
  reasons: string[]; // "Its description was edited by hand." — one sentence per held field
}

// What saving this template will and will not do — W8-03. Every count is derived from the same
// pass that performs the change, so the confirmation and the write cannot disagree.
export interface TemplateChangePlan {
  templateId: string;
  name: string; // the name after the change — what the confirmation calls it
  eventType: string;
  renamedFrom: string | null; // LAN-265: null unless renamed, else the old name
  fieldChanges: TemplateFieldChange[];
  questionChanges: TemplateQuestionChange[];
  audienceBefore: string[]; // the default audience, before and after, as group labels
  audienceAfter: string[];
  taking: DraftTakingChange[];
  holding: DraftHoldingItsOwn[];
  untouched: { approved: number; past: number }; // what will not move whatever the change is
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

// endsAt is not a straight copy: a template holds a duration, not an end (D78), so the implied end
// depends on the draft's own start. A draft with no start implies no end and the field is skipped.
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

// Every draft of this type a template change may reach — W8's two absolute exclusions: no approved
// event ever changes, no past event ever changes (a dateless draft is not past). Locked here since
// the change is decided from this read and written moments later — see relocations.md.
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
    (a.choices ?? []).join(" ") === (b.choices ?? []).join(" ")
  );
}

// Builds the plan, and — when apply is true — performs it. One function for both, so W8-03's
// confirmation and the write it confirms are the same computation, never a second opinion.
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

  const locked = await tx.query<{ id: string }>( // locked first, so two operators saving at once serialise
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

  // which scalar fields moved, and which drafts still hold the old default
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

  // which questions moved
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
      if (field === "endsAt" && draft.starts_at === null) continue; // nothing to move — not "held"
      if (wasGiven === nowGiven) continue;
      if (heldValue(field, draft) === wasGiven) movingHere.push(field);
      else reasons.push(`Its ${labelOf(field).toLowerCase()} was edited by hand.`);
    }

    const draftQuestions = await readEventQuestionsIn(tx, draft.id);
    const nextQuestions = planDraftQuestions(draftQuestions, before.questions, questions);
    const questionsMove =
      questionChanges.length > 0 && !sameQuestionList(draftQuestions, nextQuestions);

    let audienceMoves = false;
    if (audienceMoved) {
      const catalogue = await listAudienceCatalogueIn(
        tx,
        draft.season_id,
        asDate(draft.scheduled_on),
        eventType,
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
        eventType,
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
    renamedFrom: before.name === input.name ? null : before.name, // case-sensitive: "Chalk"->"chalk" still reads as a rename
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

// The questions a draft should hold after this change: the delta is applied, not the whole list, so
// an operator's per-event removal (D42) is never undone by the next template save. Added prompts
// join the draft; removed ones leave it only where the draft's copy is still the template's own
// (untouched); changed ones update only where the draft's copy still matches the old template text.
// A question the operator wrote on the event itself is never touched.
function planDraftQuestions(
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
      id: null, // a plan rewrites the draft's whole set (D41); ids are the approved path's (LAN-318)
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

// Shares the delete-then-insert shape with saveEventAudience, safe for the same reason: invariant
// P1 means no invitation can reference a draft's audience rows. Status guard is the caller's —
// only ever reached for a row lockAffectedDraftsIn proved was a draft and still holds the lock on.
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
    // invitee_person_id denormalised so one row per person per event is a unique index (P9, LAN-294).
    `insert into public.event_audience_members
       (event_id, season_id, capacity, season_membership_id, person_id,
        invitee_person_id, added_at)
     select $1, $2, member.capacity::public.invitation_capacity,
            case when member.capacity = 'player' then member.anchor_id::uuid end,
            case when member.capacity <> 'player' then member.anchor_id::uuid end,
            member.person_id::uuid,
            now()
       from unnest($3::text[], $4::text[], $5::text[])
              as member(capacity, anchor_id, person_id)`,
    [
      draft.id,
      draft.season_id,
      members.map((member) => member.capacity),
      members.map((member) => member.anchorId),
      members.map((member) => member.personId),
    ],
  );
}

// Runs the whole computation, including the locks the write would take, and writes nothing —
// released when the transaction ends, so saveEventTemplate recomputes everything under fresh ones.
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

const TEMPLATE_SAVED_ACTION = "event_template.updated";

// Saves the template and updates every draft the rule reaches, in one transaction. The plan is
// recomputed here, not accepted from the confirmation screen — a browser could post any plan.
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
        renamedFrom: plan.renamedFrom, // LAN-265: retroactive across every event ever created from this template
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
