import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";
import { listAudienceCatalogueIn, resolveSelection } from "../event-audience";
import {
  readTemplateInheritanceIn,
  templateAudienceKeys,
  type NewEventInheritance,
} from "../event-templates";
import {
  readEventQuestionsIn,
  upsertEventQuestionsIn,
  writeEventQuestionsIn,
  type EventQuestionInput,
} from "../event-questions";
import {
  deriveTermCoordinate,
  OPERATOR_CREATED_ORIGIN,
  trimmed,
  UUID_PATTERN,
  type EventDraftInput,
  type EventStatus,
  type TermWindow,
} from "../event-input";
import { recordAudit } from "../audit";
import { actorRequirement } from "../actor";
import { readCurrentSeasonIn } from "../seasons";
import { lockEventIn, readEventIn } from "./read";
import { asDate, type EventDetail } from "./shared";

// Drafting, editing and deleting an event — model §2.3, D29, D47. LAN-300 split of events.ts; see ./index.

// Creates the draft, in the current season, owned by the operator (model §2.3). Status is a
// literal 'draft', not a defaulted column, so reading this function tells you the row's state.
export async function createEventDraft(
  actorPersonId: string,
  input: EventDraftInput,
  questions?: readonly EventQuestionInput[],
): Promise<EventDetail> {
  requireActor(actorPersonId);
  requireValid(input);

  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    // Read before the event exists, inside the transaction, so questions/audience/event_type all
    // come from one consistent template read (LAN-265: the form posts a template, never a class).
    const inherited = await readTemplateInheritanceIn(tx, input.templateId);
    const term = deriveTermCoordinate(input.scheduledOn, await listTermWindows(tx)); // derived, not chosen

    const inserted = await tx.query<{ id: string }>(
      `insert into public.events
         (season_id, name, template_id, event_type, origin, status, scheduled_on, starts_at,
          ends_at, delivery_mode, venue, description, required_equipment, joining_url,
          term_id, week_number, is_mandatory, owner_person_id)
       values ($1, $2, $3::uuid, $4::public.event_type, $5::public.event_origin, 'draft',
               $6, $7::time, $8::time, $9::public.event_delivery_mode, $10, $11, $12, $13,
               $14, $15, $16, $17)
       returning id`,
      [
        season.id,
        input.name,
        input.templateId,
        inherited.eventType,
        OPERATOR_CREATED_ORIGIN,
        input.scheduledOn,
        input.startsAt,
        input.endsAt,
        input.deliveryMode,
        input.venue,
        input.description,
        input.requiredEquipment,
        input.joiningUrl,
        term.termId,
        term.weekNumber,
        input.isMandatory,
        actorPersonId,
      ],
    );

    const id = inserted.rows[0].id;

    // D42, amendment W4-A1: the form posts the questions it shows, which already include the
    // template's; a caller with nothing to say about them gets the template's.
    await writeEventQuestionsIn(tx, id, questions ?? inherited.questions);

    const audienceSize = await applyTemplateAudienceIn(
      tx,
      id,
      season.id,
      input,
      inherited,
      actorPersonId,
    );

    await recordAudit(tx, {
      actorPersonId,
      action: "event.drafted",
      entityTable: "events",
      entityId: id,
      toState: "draft",
      context: {
        templateId: input.templateId,
        eventType: inherited.eventType,
        deliveryMode: input.deliveryMode,
        isMandatory: input.isMandatory,
        origin: OPERATOR_CREATED_ORIGIN,
        weekNumber: term.weekNumber,
        questionCount: (questions ?? inherited.questions).length,
        templateAudienceGroups: inherited.audienceGroups, // D47: says when it was the template speaking, not an approver choosing
        templateAudienceSize: audienceSize,
      },
    });

    return readEventIn(tx, id);
  });
}

// D47: the type's template supplies a default audience, arriving with the event already set,
// visible and editable — reverses LAN-77's "audience begins empty" (see relocations.md). Resolves
// the groups to people here rather than storing a live query (ADR 0012: stored audience is explicit).
// Returns how many people it wrote, for the audit; zero when the template names no groups.
async function applyTemplateAudienceIn(
  tx: Tx,
  eventId: string,
  seasonId: string,
  input: EventDraftInput,
  inherited: NewEventInheritance,
  actorPersonId: string,
): Promise<number> {
  if (inherited.audienceGroups.length === 0) return 0;

  const catalogue = await listAudienceCatalogueIn(
    tx,
    seasonId,
    input.scheduledOn,
    inherited.eventType,
  );
  const resolution = resolveSelection(
    catalogue.candidates,
    templateAudienceKeys(catalogue.candidates, inherited.audienceGroups),
  );
  if (!resolution.ok) return 0; // resolves to nobody (e.g. Recruitment, no prospects yet) — an empty audience, not an error; approval refuses it (E1b)

  await tx.query(
    // invitee_person_id denormalised so one row per person per event is a unique index (P9, LAN-294) — same insert as saveEventAudience.
    `insert into public.event_audience_members
       (event_id, season_id, capacity, season_membership_id, person_id,
        invitee_person_id, added_at, added_by_person_id)
     select $1, $2, member.capacity::public.invitation_capacity,
            case when member.capacity = 'player' then member.anchor_id::uuid end,
            case when member.capacity <> 'player' then member.anchor_id::uuid end,
            member.person_id::uuid,
            now(), $5
       from unnest($3::text[], $4::text[], $6::text[])
              as member(capacity, anchor_id, person_id)`,
    [
      eventId,
      seasonId,
      resolution.members.map((member) => member.capacity),
      resolution.members.map((member) => member.anchorId),
      actorPersonId,
      resolution.members.map((member) => member.personId),
    ],
  );

  return resolution.members.length;
}

export const EDIT_REFUSAL_MESSAGE = "Only a draft can be edited.";

// Edits a draft. `where ... and status = 'draft'` is the guard, not a preceding read — a read then
// update is two decisions with a gap, where a concurrent submission gets overwritten.
export async function updateEventDraft(
  actorPersonId: string,
  eventId: string,
  input: EventDraftInput,
  questions?: readonly EventQuestionInput[],
): Promise<EventDetail> {
  requireActor(actorPersonId);
  requireValid(input);

  return withTransaction(async (tx) => {
    const before = await readEventIn(tx, eventId);
    const term = deriveTermCoordinate(input.scheduledOn, await listTermWindows(tx));

    // origin and template_id are deliberately absent from this statement — see relocations.md.
    const updated = await tx.query<{ id: string }>(
      `update public.events
          set name = $2,
              scheduled_on = $3, starts_at = $4::time, ends_at = $5::time,
              delivery_mode = $6::public.event_delivery_mode, venue = $7,
              description = $8, required_equipment = $9, joining_url = $10,
              term_id = $11, week_number = $12, is_mandatory = $13,
              updated_at = now()
        where id = $1 and status = 'draft'
       returning id`,
      [
        eventId,
        input.name,
        input.scheduledOn,
        input.startsAt,
        input.endsAt,
        input.deliveryMode,
        input.venue,
        input.description,
        input.requiredEquipment,
        input.joiningUrl,
        term.termId,
        term.weekNumber,
        input.isMandatory,
      ],
    );

    if (updated.rowCount === 0) {
      throw new InvalidTransition(`${EDIT_REFUSAL_MESSAGE} ${describeState(before.status)}`, {
        rule: "event_edit_requires_draft",
      });
    }

    if (questions !== undefined) await writeEventQuestionsIn(tx, eventId, questions); // undefined means "not about the questions" — do not clear them

    await recordAudit(tx, {
      actorPersonId,
      action: "event.draft_updated",
      entityTable: "events",
      entityId: eventId,
      fromState: "draft",
      toState: "draft",
      context: {
        deliveryMode: input.deliveryMode,
        isMandatory: input.isMandatory,
        weekNumber: term.weekNumber,
        ...(questions === undefined ? {} : { questionCount: questions.length }),
      },
    });

    return readEventIn(tx, eventId);
  });
}

// Not exported: nothing above the service names either of these. The screen shows what the
// refusal said, and the tests assert on `rule`, which is what actually identifies the refusal.
const QUESTIONS_EDIT_REFUSAL_MESSAGE = "Only an approved event's questions can be changed.";

const QUESTION_REMOVAL_REFUSAL_MESSAGE =
  "A question can be reworded or reordered, but not removed, once the event has been approved.";

/**
 * Changes the questions an approved event asks — LAN-318, amending D41 (Brian, 2026-09-11).
 * Approval used to freeze them; it no longer does. Add one, reword one, change how it is answered
 * or what it offers, make it required or not, put them in a different order — all in place, in one
 * transaction, against the ids the event already has.
 *
 * Two things it deliberately does not do. It removes nothing: `question_responses` points at
 * `event_questions.id`, and an answer already given must never be left pointing at a row that is
 * gone. And it sends nothing — no notification job, no queue entry, no delivery — because this is
 * the operator tidying what is asked, not the club telling anyone something new. Whoever answers
 * after the change meets the questions as they now stand; answers already given are untouched,
 * including a choice answer that is no longer among the options.
 *
 * Guarded on `approved` rather than on "not a draft": the vocabulary is exactly draft / approved /
 * cancelled (`event-input.ts`), a cancelled event is not being asked anything, and naming the one
 * status that may change means a status added later refuses until somebody decides it may.
 */
export async function updateEventQuestions(
  actorPersonId: string,
  eventId: string,
  questions: readonly EventQuestionInput[],
): Promise<EventDetail> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const before = await lockEventIn(tx, eventId);

    if (before.status !== "approved") {
      throw new InvalidTransition(
        `${QUESTIONS_EDIT_REFUSAL_MESSAGE} ${describeState(before.status)}`,
        { rule: "event_questions_edit_requires_approved" },
      );
    }

    const stored = await readEventQuestionsIn(tx, eventId);
    const storedIds = new Set(stored.map((question) => question.id));
    const submittedIds = new Set(
      questions
        .map((question) => question.id)
        .filter((id): id is string => id !== null && id !== undefined),
    );

    // The Remove control is absent on this screen, so a missing id is a crafted post or a stale
    // form, never an operator's choice — refused rather than silently obeyed.
    const dropped = stored.filter((question) => !submittedIds.has(question.id));
    if (dropped.length > 0) {
      throw new ConstraintViolated(QUESTION_REMOVAL_REFUSAL_MESSAGE, {
        rule: "event_question_removal_after_approval",
      });
    }

    // An id this event never had would otherwise update nothing and read as a success.
    for (const id of submittedIds) {
      if (!storedIds.has(id)) {
        throw new ConstraintViolated("That question does not belong to this event.", {
          rule: "event_question_belongs_to_event",
        });
      }
    }

    await upsertEventQuestionsIn(tx, eventId, questions);

    await recordAudit(tx, {
      actorPersonId,
      action: "event.questions_updated",
      entityTable: "events",
      entityId: eventId,
      fromState: before.status,
      toState: before.status,
      context: {
        questionCount: questions.length,
        addedCount: questions.length - stored.length,
        // The prompts as they now stand — the audit row is the only record that the wording
        // changed, since the question row itself keeps no history.
        prompts: questions.map((question) => question.prompt),
      },
    });

    return readEventIn(tx, eventId);
  });
}

const DELETE_REFUSAL_MESSAGE = "Only a draft can be deleted.";

const DELETE_REFUSAL_RULE = "event_delete_requires_draft";

// Deletes a draft, permanently — REQ-delete-draft, D29. Only a draft: an approved event is
// cancelled (W6), never deleted, since invitations/RSVPs/attendance may hang off it. Guarded by
// `and status = 'draft'`, not a preceding read, for the same reason every write here does. The
// audit row is written before the delete, in the same transaction, so it survives the delete
// (audit_events is deliberately not a foreign key). See relocations.md.
export async function deleteEventDraft(
  actorPersonId: string,
  eventId: string,
): Promise<{ id: string; name: string }> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const before = await lockEventIn(tx, eventId);

    if (before.status !== "draft") {
      throw new InvalidTransition(
        `${DELETE_REFUSAL_MESSAGE} ${describeState(before.status)} ${CANCEL_INSTEAD_MESSAGE}`,
        { rule: DELETE_REFUSAL_RULE },
      );
    }

    await recordAudit(tx, {
      actorPersonId,
      action: "event.draft_deleted",
      entityTable: "events",
      entityId: eventId,
      fromState: "draft",
      context: {
        name: before.name,
        eventType: before.eventType,
        scheduledOn: before.scheduledOn,
        invitationCount: before.invitationCount, // structurally zero on a draft (P1) — recorded so the row proves it
        audienceCount: before.audienceCount,
      },
    });

    const deleted = await tx.query<{ id: string }>(
      "delete from public.events where id = $1 and status = 'draft' returning id",
      [eventId],
    );

    if (deleted.rowCount === 0) {
      throw new InvalidTransition(
        `${DELETE_REFUSAL_MESSAGE} ${describeState(before.status)} ${CANCEL_INSTEAD_MESSAGE}`,
        { rule: DELETE_REFUSAL_RULE },
      );
    }

    return { id: eventId, name: before.name };
  });
}

// docs/ux/standards.md rule 5: names the route out rather than stopping at a constraint. Cancellation (W6) is not built yet, so this names the act rather than linking to a screen.
const CANCEL_INSTEAD_MESSAGE =
  "People have been told about it, so it is cancelled rather than deleted.";

const STATE_NAMES: Readonly<Record<EventStatus, string>> = Object.freeze({
  draft: "a draft",
  approved: "approved",
  cancelled: "cancelled",
});

function describeState(status: EventStatus): string {
  return `This event is ${STATE_NAMES[status] ?? status}.`;
}

// Read inside the caller's transaction so a create and its derived coordinate see one consistent calendar.
async function listTermWindows(tx: Tx): Promise<TermWindow[]> {
  const result = await tx.query<{
    id: string;
    name: string;
    academic_year: string;
    starts_on: Date | string;
    ends_on: Date | string;
    first_week: number;
    last_week: number;
  }>(
    `select id, name::text as name, academic_year, starts_on, ends_on, first_week, last_week
       from public.terms
      order by starts_on desc`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    academicYear: row.academic_year,
    startsOn: asDate(row.starts_on) ?? "",
    endsOn: asDate(row.ends_on) ?? "",
    firstWeek: row.first_week,
    lastWeek: row.last_week,
  }));
}

const requireActor = actorRequirement("An event change has to name the operator who made it.");

// A defensive re-check of what validateEventDraft already proved — createEventDraft is exported,
// and a caller that builds an EventDraftInput by hand (a script, a test) would otherwise reach the
// database unchecked.
function requireValid(input: EventDraftInput): void {
  if (trimmed(input.name) === "") {
    throw new ConstraintViolated("Give the event a name.", { rule: "events_name_not_blank" });
  }
  if (!UUID_PATTERN.test(input.templateId)) {
    throw new ConstraintViolated("Choose the kind of event this is.", {
      rule: "event_template_not_chosen",
    });
  }
  if (input.startsAt !== null && input.endsAt !== null && input.endsAt <= input.startsAt) {
    throw new ConstraintViolated("The event has to end after it starts.", {
      rule: "events_times_ordered",
    });
  }
}
