import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";
import { listAudienceCatalogueIn, resolveSelection } from "../event-audience";
import {
  readTemplateInheritanceIn,
  templateAudienceKeys,
  type NewEventInheritance,
} from "../event-templates";
import { writeEventQuestionsIn, type EventQuestionInput } from "../event-questions";
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

/**
 * Drafting, editing and deleting an event — model §2.3, D29, D47. LAN-300
 * split of `events.ts`; see `./index`.
 */

/**
 * Creates the draft, in the current season, owned by the operator who created
 * it — model §2.3, "created as `draft` by the event owner".
 *
 * The status is a literal `'draft'` rather than a defaulted column, so that
 * reading this function tells you what state the row is in without knowing the
 * schema's default.
 */
export async function createEventDraft(
  actorPersonId: string,
  input: EventDraftInput,
  questions?: readonly EventQuestionInput[],
): Promise<EventDetail> {
  requireActor(actorPersonId);
  requireValid(input);

  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    // Read before the event exists, so the questions and the default audience a
    // new draft inherits come from one template rather than from whatever it
    // said between three separate reads.
    //
    // It is also where `event_type` comes from, since LAN-265. The form posts a
    // template and never a class: the class is the template's, read here inside
    // the transaction, so a submission that named one and implied the other
    // cannot exist. `events_template_fkey` is composite and would refuse the
    // pairing anyway; this is what stops it ever being attempted.
    const inherited = await readTemplateInheritanceIn(tx, input.templateId);
    // Derived, not chosen: the date the operator entered decides both.
    const term = deriveTermCoordinate(input.scheduledOn, await listTermWindows(tx));

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

    // D42, amendment W4-A1. The form posts the questions it is showing, which
    // already include the template's; a caller with nothing to say about them
    // gets the template's, which is what "they arrive with any event created
    // from that template" means.
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
        // D47. Recorded because the audience arriving from the template is a
        // decision the club made once, and the audit should say when it was the
        // template speaking rather than an approver choosing.
        templateAudienceGroups: inherited.audienceGroups,
        templateAudienceSize: audienceSize,
      },
    });

    return readEventIn(tx, id);
  });
}

/**
 * D47 — the type's template supplies a default audience, which arrives with the
 * event already set, visible and editable.
 *
 * This reverses LAN-77's shipped "the audience begins empty", and the reversal
 * is narrow and worth stating precisely: what the *system* still never does is
 * imply an audience nobody chose. A default audience is a choice the club made
 * once, deliberately, on the template — so the approver checks it rather than
 * rebuilding the same thirty-two names every Wednesday. ADR 0012's rule that the
 * stored audience is an explicit resolved list is untouched, and is the reason
 * this resolves the groups to people here rather than storing a live query.
 *
 * Returns how many people it wrote, for the audit. Zero when the template names
 * no groups, which is the ordinary case for a type the club has not configured.
 */
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
  // A group that resolves to nobody — a Recruitment template in a season with no
  // prospects yet — is an empty audience, not an error. Approval still refuses
  // it under invariant E1b, which is the right place for that to bite.
  if (!resolution.ok) return 0;

  await tx.query(
    // `invitee_person_id` is the human, denormalised so that one row per person
    // per event is a unique index (invariant P9, LAN-294). See the same insert
    // in `saveEventAudience`.
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

/**
 * Edits a draft.
 *
 * The `where … and status = 'draft'` is the guard, not a preceding read: a read
 * followed by an update is two decisions with a gap between them, and the gap
 * is where a concurrent submission gets overwritten. Zero rows updated means
 * the event was not a draft when the statement ran, and that is reported as an
 * `InvalidTransition` naming the state it is actually in.
 */
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

    // `origin` is deliberately absent from this statement. An event that came
    // from somewhere else — a BUCS fixture, a negotiated slot — keeps the
    // provenance it arrived with, and editing its name here must not quietly
    // reclassify it as the club's own. Nothing in this slice creates such an
    // event; the schema does, and later issues will.
    // LAN-265. The template is deliberately absent from this statement, on the
    // same reasoning `origin` already is: a different template is a different
    // kind of event, and an edit that silently changed one would reclassify an
    // event underneath the audience and the questions it already carries. The
    // form does not offer it, and neither does amendment.
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

    // Only when the caller has something to say about them. `undefined` means
    // "this edit was not about the questions" — a caller that posted no question
    // fields would otherwise silently clear the lot.
    if (questions !== undefined) await writeEventQuestionsIn(tx, eventId, questions);

    await recordAudit(tx, {
      actorPersonId,
      action: "event.draft_updated",
      entityTable: "events",
      entityId: eventId,
      fromState: "draft",
      toState: "draft",
      context: {
        // Not the template: an edit cannot change it (see the update above), so
        // recording it here would say a decision was taken that was not.
        deliveryMode: input.deliveryMode,
        isMandatory: input.isMandatory,
        weekNumber: term.weekNumber,
        ...(questions === undefined ? {} : { questionCount: questions.length }),
      },
    });

    return readEventIn(tx, eventId);
  });
}

const DELETE_REFUSAL_MESSAGE = "Only a draft can be deleted.";

const DELETE_REFUSAL_RULE = "event_delete_requires_draft";

/**
 * Deletes a draft, permanently — REQ-delete-draft, D29.
 *
 * ## Why deleting is the right verb, and the only one
 *
 * "Withdrawn" used to mean *it never became an event*, and LAN-151 removed the
 * status because that is not a state an event is in — it is an event that should
 * not exist. So an abandoned draft is removed, and a `cancelled` event is
 * something quite different: one that *was* approved, that people were told
 * about, and that was called off. They are not two flavours of one thing.
 *
 * ## Only a draft, and the refusal is where somebody meets it
 *
 * An approved event is cancelled (`W6`), never deleted, because people have been
 * told about it — and by then invitations, RSVPs and attendance hang off it, so
 * deleting it would destroy answers real people gave. The guard is the
 * `and status = 'draft'` below rather than a preceding read, for the same reason
 * every other write in this module guards that way: a read and a delete are two
 * decisions with a gap between them.
 *
 * Brian, 2026-08-21, on where the rule is stated: "That warning should pop up if
 * you try to delete an approved event ... I don't think it needs to be called out
 * there specifically." So the confirmation on a draft says what deleting *that
 * draft* does, and this sentence appears only to somebody who tried it on
 * something else.
 *
 * ## The audit row is written first, and survives
 *
 * `audit_events` is deliberately polymorphic and deliberately not a foreign key,
 * precisely so a record can outlive its subject. Writing it before the delete, in
 * the same transaction, means a rolled-back delete takes the audit row with it
 * and a committed one leaves the only remaining evidence that the event ever
 * existed.
 */
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
        // Both are structurally zero on a draft — invariant P1 — and are
        // recorded so the audit row proves it rather than asserting it.
        invitationCount: before.invitationCount,
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

/**
 * The half of the refusal that says what to do instead.
 *
 * `docs/ux/standards.md` rule 5 in its general form: a refusal names the route
 * out rather than stating a constraint and stopping. Cancellation is `W6` and is
 * not built yet, so this names the act rather than linking to a screen that does
 * not exist — which is honest, and becomes a link when that work package lands.
 */
const CANCEL_INSTEAD_MESSAGE =
  "People have been told about it, so it is cancelled rather than deleted.";

const STATE_NAMES: Readonly<Record<EventStatus, string>> = Object.freeze({
  draft: "a draft",
  approved: "approved",
  cancelled: "cancelled",
});

/** "This event is approved." — the half of a refusal that says why. */
function describeState(status: EventStatus): string {
  return `This event is ${STATE_NAMES[status] ?? status}.`;
}

/**
 * Every term, in the shape the derivation needs.
 *
 * Read inside the caller's transaction so that a create and its derived
 * coordinate see one consistent calendar — a term edited between the two would
 * otherwise produce a week number that disagrees with the term it names.
 */
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

/**
 * A defensive re-check of what `validateEventDraft` already proved.
 *
 * Not redundant: `createEventDraft` is exported, and a later caller that builds
 * an `EventDraftInput` by hand — a migration script, a test, LAN-77 — would
 * otherwise reach the database with a name of spaces or a type this slice has
 * no form for. The database catches the first and not the second.
 */
function requireValid(input: EventDraftInput): void {
  if (trimmed(input.name) === "") {
    throw new ConstraintViolated("Give the event a name.", { rule: "events_name_not_blank" });
  }
  // LAN-265. The class is no longer something a caller supplies, so there is
  // nothing to check here: `readTemplateInheritanceIn` refuses an unknown
  // template with `TEMPLATE_NOT_FOUND_MESSAGE`, and the class it returns comes
  // off the template's own row. What survives is the shape check — a caller that
  // named no template at all.
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
