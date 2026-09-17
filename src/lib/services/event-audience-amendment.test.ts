// @vitest-environment node
/**
 * Adding a named person to an approved event's audience — LAN-393.
 *
 * Against the real local database. The two things worth proving are both
 * database facts: that the picker's candidate list is filtered by *human* so
 * invariant P9 is never the thing that surprises an operator, and that the
 * refusals are the amend screen's own rather than a second vocabulary.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction, type ServiceError } from "@/lib/db";
import { approveEvent, saveEventAudience } from "./event-approval";
import { listAudienceCatalogueIn, selectionKey } from "./event-audience";
import {
  ADD_AUDIENCE_REQUIRES_APPROVED_RULE,
  ADD_AUDIENCE_REQUIRES_FUTURE_RULE,
  addEventAudienceMembers,
  readAddableAudience,
} from "./event-audience-amendment";
import { EVENT_IS_CANCELLED_RULE } from "./event-amendment";
import { cancelEvent } from "./event-amendment";
import { createEventDraft, type EventDraftInput } from "./events";
import { openObserver } from "../../../tests/helpers/service-layer";

const NAME_MARKER = "LAN393AddAudienceSuite";
const PRACTICE_TEMPLATE_ID = "7e34a764-7ed1-535e-8cef-73e00a62eafc";

let observer: Client;
let actorPersonId: string;

beforeAll(async () => {
  observer = await openObserver();
  const people = await observer.query<{ id: string }>(
    `select p.id from public.people p
       join public.role_assignments ra on ra.person_id = p.id
      order by p.id limit 1`,
  );
  actorPersonId = people.rows[0].id;
});

afterEach(async () => {
  const scope = `${NAME_MARKER}%`;
  const events = "(select id from public.events where name like $1)";
  await observer.query(
    `delete from public.nonresponse_flags where invitation_id in
       (select id from public.invitations where event_id in ${events})`,
    [scope],
  );
  await observer.query(`delete from public.event_messaging_plans where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in
       (select id from public.notification_jobs where event_id in ${events})`,
    [scope],
  );
  await observer.query(`delete from public.notification_jobs where event_id in ${events}`, [scope]);
  await observer.query(
    `delete from public.rsvp_access_tokens where invitation_id in
       (select id from public.invitations where event_id in ${events})`,
    [scope],
  );
  await observer.query(`delete from public.invitations where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.event_audience_members where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(`delete from public.event_audience_exclusions where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(`delete from public.event_audience_groups where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.audit_events where entity_table = 'events' and entity_id in ${events}`,
    [scope],
  );
  await observer.query(`delete from public.schedule_changes where event_id in ${events}`, [scope]);
  await observer.query("delete from public.events where name like $1", [scope]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

function inDays(days: number): string {
  const day = new Date();
  day.setDate(day.getDate() + days);
  return day.toISOString().slice(0, 10);
}

function draft(overrides: Partial<EventDraftInput> = {}): EventDraftInput {
  return {
    name: `${NAME_MARKER} Sunday practice`,
    templateId: PRACTICE_TEMPLATE_ID,
    scheduledOn: inDays(10),
    startsAt: "10:00",
    endsAt: "13:00",
    venue: "University Parks",
    isMandatory: true,
    deliveryMode: "in_person",
    description: null,
    requiredEquipment: null,
    joiningUrl: null,
    ...overrides,
  };
}

/** An approved event whose audience is exactly the first `take` candidates, hand-picked. */
async function approvedWithFirst(take: number, overrides: Partial<EventDraftInput> = {}) {
  const event = await createEventDraft(actorPersonId, draft(overrides));
  const chosen = await withTransaction(async (tx) => {
    const catalogue = await listAudienceCatalogueIn(
      tx,
      event.seasonId,
      event.scheduledOn,
      event.eventType,
    );
    return catalogue.candidates
      .filter((candidate) => candidate.capacity === "player")
      .slice(0, take);
  });
  await saveEventAudience(
    actorPersonId,
    event.id,
    chosen.map((candidate) => candidate.key),
    [],
  );
  await approveEvent(actorPersonId, event.id);
  return { eventId: event.id, chosen };
}

async function refusalFrom(work: Promise<unknown>): Promise<ServiceError> {
  try {
    await work;
  } catch (error) {
    if (isServiceError(error)) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("an operator adds a named person to an approved event", () => {
  it("gives them one audience row, one invitation and one message", async () => {
    const { eventId } = await approvedWithFirst(2);
    const addable = await readAddableAudience(eventId);
    const newcomer = addable.candidates.find((candidate) => candidate.capacity === "player");
    expect(newcomer).toBeDefined();

    const result = await addEventAudienceMembers(actorPersonId, eventId, [newcomer!.key]);
    expect(result.added).toHaveLength(1);

    const rows = await observer.query<{
      added_by_group: string | null;
      added_by_person_id: string;
    }>(
      `select added_by_group::text as added_by_group, added_by_person_id
         from public.event_audience_members
        where event_id = $1::uuid and invitee_person_id = $2::uuid`,
      [eventId, newcomer!.personId],
    );
    expect(rows.rowCount).toBe(1);
    // An operator did this, not a rule — and the pair of columns says which.
    expect(rows.rows[0].added_by_group).toBeNull();
    expect(rows.rows[0].added_by_person_id).toBe(actorPersonId);

    const invitations = await observer.query(
      `select 1 from public.invitations i
         join public.event_audience_members a on a.id = i.audience_member_id
        where i.event_id = $1::uuid and a.invitee_person_id = $2::uuid`,
      [eventId, newcomer!.personId],
    );
    expect(invitations.rowCount).toBe(1);

    const jobs = await observer.query<{ ladder_rung: number | null; scheduled_for: Date | null }>(
      `select ladder_rung, scheduled_for from public.notification_jobs
        where event_id = $1::uuid and person_id = $2::uuid and job_type = 'invitation'`,
      [eventId, newcomer!.personId],
    );
    expect(jobs.rowCount).toBe(1);
    expect(jobs.rows[0].ladder_rung).toBe(0);
    // No grace delay: the operator has already decided.
    expect(jobs.rows[0].scheduled_for!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("does not offer somebody already on the event, whatever capacity they hold it under", async () => {
    const { eventId, chosen } = await approvedWithFirst(3);
    const addable = await readAddableAudience(eventId);
    const offeredPeople = new Set(addable.candidates.map((candidate) => candidate.personId));
    for (const candidate of chosen) {
      expect(offeredPeople.has(candidate.personId)).toBe(false);
    }
    expect(addable.alreadyOnEvent).toBe(chosen.length);
  });

  it("is a no-op, not a refusal, if a person slips on to the event between the read and the save", async () => {
    const { eventId, chosen } = await approvedWithFirst(2);
    // The key the picker would not have offered — the race, forced.
    const result = await addEventAudienceMembers(actorPersonId, eventId, [
      selectionKey(chosen[0].capacity, chosen[0].anchorId),
    ]);
    expect(result.added).toHaveLength(0);
    expect(result.alreadyPresent).toBe(1);

    const rows = await observer.query(
      `select 1 from public.event_audience_members
        where event_id = $1::uuid and invitee_person_id = $2::uuid`,
      [eventId, chosen[0].personId],
    );
    expect(rows.rowCount).toBe(1);
  });

  it("refuses a draft, in the words the amend screen already uses", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    const error = await refusalFrom(addEventAudienceMembers(actorPersonId, event.id, []));
    expect(error.rule).toBe(ADD_AUDIENCE_REQUIRES_APPROVED_RULE);
  });

  it("refuses an event that has already started", async () => {
    const { eventId } = await approvedWithFirst(2);
    const addable = await readAddableAudience(eventId);
    await observer.query("update public.events set scheduled_on = $2::date where id = $1::uuid", [
      eventId,
      inDays(-1),
    ]);
    const error = await refusalFrom(
      addEventAudienceMembers(actorPersonId, eventId, [addable.candidates[0].key]),
    );
    expect(error.rule).toBe(ADD_AUDIENCE_REQUIRES_FUTURE_RULE);
  });

  it("refuses a cancelled event with `assertNotTerminal`'s own rule", async () => {
    const { eventId } = await approvedWithFirst(2);
    const addable = await readAddableAudience(eventId);
    await cancelEvent(actorPersonId, eventId, {
      reason: "Pitch unavailable.",
      notify: false,
      silenceConfirmed: true,
    });
    const error = await refusalFrom(
      addEventAudienceMembers(actorPersonId, eventId, [addable.candidates[0].key]),
    );
    expect(error.rule).toBe(EVENT_IS_CANCELLED_RULE);
  });

  /**
   * LAN-392's decision 5 has one exception and this is it: an operator naming
   * somebody specifically outranks the earlier decision to leave them out of a
   * group. Proved here rather than in the rule's own suite, because clearing
   * the exclusion is this service's behaviour.
   */
  it("clears a LAN-392 exclusion for the person it adds", async () => {
    const { eventId } = await approvedWithFirst(2);
    const addable = await readAddableAudience(eventId);
    const newcomer = addable.candidates[0];

    await observer.query(
      `insert into public.event_audience_exclusions (event_id, person_id, excluded_by_person_id)
       values ($1::uuid, $2::uuid, $3::uuid)`,
      [eventId, newcomer.personId, actorPersonId],
    );

    await addEventAudienceMembers(actorPersonId, eventId, [newcomer.key]);

    const remaining = await observer.query(
      `select 1 from public.event_audience_exclusions
        where event_id = $1::uuid and person_id = $2::uuid`,
      [eventId, newcomer.personId],
    );
    expect(remaining.rowCount).toBe(0);
  });

  it("records the operator and the people added, by id and nothing else", async () => {
    const { eventId } = await approvedWithFirst(2);
    const addable = await readAddableAudience(eventId);
    const newcomer = addable.candidates[0];
    await addEventAudienceMembers(actorPersonId, eventId, [newcomer.key]);

    const audit = await observer.query<{
      actor_person_id: string;
      context: Record<string, unknown>;
    }>(
      `select actor_person_id, context from public.audit_events
        where entity_table = 'events' and entity_id = $1::uuid
          and action = 'event.audience_added_by_operator'`,
      [eventId],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].actor_person_id).toBe(actorPersonId);
    expect(audit.rows[0].context.personIds).toEqual([newcomer.personId]);
    // No contact details, ever.
    expect(JSON.stringify(audit.rows[0].context)).not.toContain("@");
  });
});
