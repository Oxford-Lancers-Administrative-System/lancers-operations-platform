// @vitest-environment node
/**
 * Questions on an event, deleting a draft, and the approval completeness gate —
 * LAN-154, W4 and amendment W4-A1.
 *
 * Against the **real** local database, because all three are things a mocked
 * transaction cannot be wrong about: `event_questions_unique_per_event` and
 * `event_questions_choices_match_type` are check constraints, deletion is a
 * `delete … where status = 'draft'` that either matched a row or did not, and
 * the approval gate has to hold when the screen is bypassed and the service is
 * called directly — which is exactly what this file does.
 *
 * Every event carries `NAME_MARKER`, and `afterEach` removes those rows and
 * their audit trail. The seven `event_templates` rows are emptied of questions
 * and groups per test and restored, because they belong to the migration.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, type ServiceError } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import {
  createEventDraft,
  deleteEventDraft,
  readEventQuestions,
  updateEventDraft,
  type EventDraftInput,
} from "./events";
import {
  approveEvent,
  describeMissingForApproval,
  missingForApproval,
  readApprovalPreview,
  saveEventAudience,
} from "./event-approval";
import { listAudienceCatalogueIn } from "./event-audience";
import { withTransaction } from "@/lib/db";
import type { EventQuestionInput } from "./event-questions-input";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const NAME_MARKER = "LAN154QuestionsSuite";

let observer: Client;
let actorPersonId: string;

/**
 * Every event this suite created, by id.
 *
 * Kept because this is the one suite that **deletes** events, and a deleted
 * event's earlier audit rows — `event.drafted`, `event.audience_proposed` —
 * outlive it by design: `audit_events` is deliberately polymorphic and
 * deliberately not a foreign key, so a record can survive its subject. Cleaning
 * up by "audit rows whose event still exists" therefore misses exactly the rows
 * this suite is most likely to leave behind, and `events.test.ts` asserts
 * globally that no such orphan exists. It found this.
 */
const createdEventIds = new Set<string>();

/** `createEventDraft`, remembering the id so the cleanup can find it later. */
async function newDraft(
  actor: string,
  input: EventDraftInput,
  questions?: readonly EventQuestionInput[],
) {
  const event = await createEventDraft(actor, input, questions);
  createdEventIds.add(event.id);
  return event;
}

beforeAll(async () => {
  observer = await openObserver();
  const person = await observer.query<{ id: string }>(
    `select id from public.people
      where created_at = $1::timestamptz and merged_into_person_id is null
      order by id limit 1`,
    [await seededIdentityCreatedAt(observer)],
  );
  expect(person.rows.length).toBe(1);
  actorPersonId = person.rows[0].id;
});

afterEach(async () => {
  const scope = `${NAME_MARKER}%`;
  const events = "(select id from public.events where name like $1)";
  // Dependency order: approval creates invitations and jobs, and this suite
  // approves things deliberately.
  // LAN-169. The plan an approval freezes, and any flag its chase raised,
  // both reference their event with `on delete restrict` — so they go before
  // the event does, in the same dependency order the lines below already keep.
  await observer.query(
    `delete from public.nonresponse_flags where invitation_id in
         (select id from public.invitations where event_id in ${events})`,
    [scope],
  );
  await observer.query(`delete from public.event_messaging_plans where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(`delete from public.notification_jobs where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.invitations where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.event_audience_members where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.audit_events where entity_table = 'events' and entity_id in ${events}`,
    [scope],
  );
  // A deleted draft leaves its audit row behind on purpose, and nothing points
  // at the event any more, so it is found by what the row itself recorded.
  await observer.query(
    `delete from public.audit_events
      where entity_table = 'events' and context->>'name' like $1`,
    [scope],
  );
  await observer.query("delete from public.events where name like $1", [scope]);

  // By id, so the audit trail of an event this suite *deleted* is cleaned up
  // too. Nothing points at those rows any more, which is the point of them.
  if (createdEventIds.size > 0) {
    await observer.query(
      "delete from public.audit_events where entity_table = 'events' and entity_id = any($1::uuid[])",
      [[...createdEventIds]],
    );
    createdEventIds.clear();
  }
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

function draftInput(overrides: Partial<EventDraftInput> = {}): EventDraftInput {
  return {
    name: `${NAME_MARKER} draft`,
    eventType: "practice",
    scheduledOn: futureDate(21),
    startsAt: null,
    endsAt: null,
    venue: null,
    isMandatory: false,
    deliveryMode: "in_person",
    description: null,
    requiredEquipment: null,
    joiningUrl: null,
    ...overrides,
  };
}

function futureDate(days: number): string {
  const day = new Date(`${todayInClubZone()}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

function question(overrides: Partial<EventQuestionInput> = {}): EventQuestionInput {
  return {
    prompt: "Can you get yourself to the ground?",
    answerType: "boolean",
    isRequired: false,
    choices: null,
    fromTemplate: false,
    ...overrides,
  };
}

async function statusOf(eventId: string): Promise<string> {
  const result = await observer.query<{ status: string }>(
    "select status::text as status from public.events where id = $1",
    [eventId],
  );
  return result.rows[0]?.status ?? "(gone)";
}

/** Puts a real audience on a draft, so approval has something to confirm. */
async function giveAudience(eventId: string): Promise<number> {
  const keys = await withTransaction(async (tx) => {
    const event = await tx.query<{ season_id: string; scheduled_on: Date | null }>(
      "select season_id, scheduled_on from public.events where id = $1",
      [eventId],
    );
    const catalogue = await listAudienceCatalogueIn(
      tx,
      event.rows[0].season_id,
      event.rows[0].scheduled_on?.toISOString().slice(0, 10) ?? null,
    );
    return catalogue.candidates
      .filter((candidate) => candidate.capacity === "player")
      .slice(0, 3)
      .map((candidate) => candidate.key);
  });

  const members = await saveEventAudience(actorPersonId, eventId, keys);
  return members.length;
}

async function refusalFrom(attempt: () => Promise<unknown>): Promise<ServiceError> {
  try {
    await attempt();
  } catch (error) {
    if (isServiceError(error)) return error;
    throw error;
  }
  throw new Error("Expected the service to refuse this, but it succeeded.");
}

// ---------------------------------------------------------------------------
// Questions live on the event, and are written where the event is written
// ---------------------------------------------------------------------------

describe("questions are authored on the event (amendment W4-A1)", () => {
  it("saves the three answer types, each with its own required flag", async () => {
    const event = await newDraft(actorPersonId, draftInput(), [
      question({ prompt: "Are you fit?", answerType: "boolean", isRequired: true }),
      question({ prompt: "Anything we should know?", answerType: "text" }),
      question({
        prompt: "Which shirt size?",
        answerType: "choice",
        choices: ["S", "M", "L", "XL"],
      }),
    ]);

    const questions = await readEventQuestions(event.id);

    expect(questions.map((entry) => entry.answerType)).toEqual(["boolean", "text", "choice"]);
    expect(questions.map((entry) => entry.isRequired)).toEqual([true, false, false]);
    expect(questions[2].choices).toEqual(["S", "M", "L", "XL"]);
  });

  it("keeps the order the operator put them in, because it is the order asked", async () => {
    const event = await newDraft(actorPersonId, draftInput(), [
      question({ prompt: "First" }),
      question({ prompt: "Second" }),
      question({ prompt: "Third" }),
    ]);

    expect((await readEventQuestions(event.id)).map((entry) => entry.sortOrder)).toEqual([0, 1, 2]);
  });

  it("reorders them when the operator moves one", async () => {
    const event = await newDraft(actorPersonId, draftInput(), [
      question({ prompt: "First" }),
      question({ prompt: "Second" }),
    ]);

    await updateEventDraft(actorPersonId, event.id, draftInput(), [
      question({ prompt: "Second" }),
      question({ prompt: "First" }),
    ]);

    expect((await readEventQuestions(event.id)).map((entry) => entry.prompt)).toEqual([
      "Second",
      "First",
    ]);
  });

  it("removes one when the operator removes it", async () => {
    const event = await newDraft(actorPersonId, draftInput(), [
      question({ prompt: "Keep me" }),
      question({ prompt: "Drop me" }),
    ]);

    await updateEventDraft(actorPersonId, event.id, draftInput(), [
      question({ prompt: "Keep me" }),
    ]);

    expect((await readEventQuestions(event.id)).map((entry) => entry.prompt)).toEqual(["Keep me"]);
  });

  it("clears them all when the operator removes the last one", async () => {
    // The empty list has to be distinguishable from "this edit was not about the
    // questions", or removing the last one would silently do nothing.
    const event = await newDraft(actorPersonId, draftInput(), [question({ prompt: "Drop me" })]);

    await updateEventDraft(actorPersonId, event.id, draftInput(), []);

    expect(await readEventQuestions(event.id)).toEqual([]);
  });

  it("leaves them alone when the caller says nothing about them", async () => {
    const event = await newDraft(actorPersonId, draftInput(), [question({ prompt: "Still here" })]);

    await updateEventDraft(actorPersonId, event.id, draftInput());

    expect((await readEventQuestions(event.id)).map((entry) => entry.prompt)).toEqual([
      "Still here",
    ]);
  });

  it("marks a template-supplied question so an operator can see where it came from", async () => {
    const event = await newDraft(actorPersonId, draftInput(), [
      question({ prompt: "From the type", fromTemplate: true }),
      question({ prompt: "Mine", fromTemplate: false }),
    ]);

    expect((await readEventQuestions(event.id)).map((entry) => entry.fromTemplate)).toEqual([
      true,
      false,
    ]);
  });

  it("refuses to edit the questions of anything that is not a draft", async () => {
    // A question is part of the event, so changing one after approval is W5's
    // amendment path like any other change.
    const event = await newDraft(actorPersonId, draftInput(), []);
    await giveAudience(event.id);
    await approveEvent(actorPersonId, event.id);

    const error = await refusalFrom(() =>
      updateEventDraft(actorPersonId, event.id, draftInput(), [question({ prompt: "Too late" })]),
    );

    expect(error.kind).toBe("invalid_transition");
    expect(await readEventQuestions(event.id)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Approval — the completeness gate, above the database
// ---------------------------------------------------------------------------

describe("approval is refused with a named reason, and holds against a direct call", () => {
  it("names the missing date and leaves the event a draft", async () => {
    // The screen is bypassed entirely here: this is the service, called
    // directly, which is where W4 says the refusal has to live.
    const event = await newDraft(actorPersonId, draftInput({ scheduledOn: null }));
    await giveAudience(event.id);

    const error = await refusalFrom(() => approveEvent(actorPersonId, event.id));

    expect(error.message).toContain("date");
    expect(error.rule).toBe("event_approval_requires_complete_event");
    expect(await statusOf(event.id)).toBe("draft");
  });

  it("creates nothing at all when it refuses for a missing field", async () => {
    const event = await newDraft(actorPersonId, draftInput({ scheduledOn: null }));
    await giveAudience(event.id);

    await refusalFrom(() => approveEvent(actorPersonId, event.id));

    const invitations = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.invitations where event_id = $1",
      [event.id],
    );
    const jobs = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.notification_jobs where event_id = $1",
      [event.id],
    );
    expect(invitations.rows[0].count).toBe("0");
    expect(jobs.rows[0].count).toBe("0");
  });

  it("names the empty audience and leaves the event a draft (invariant E1b)", async () => {
    const event = await newDraft(actorPersonId, draftInput());

    const error = await refusalFrom(() => approveEvent(actorPersonId, event.id));

    expect(error.rule).toBe("event_audience_is_non_empty");
    expect(error.message).toContain("Choose who this event is for");
    expect(await statusOf(event.id)).toBe("draft");
  });

  it("reports both gaps to the screen before anybody presses anything", async () => {
    const event = await newDraft(actorPersonId, draftInput({ scheduledOn: null }));

    const preview = await readApprovalPreview(event.id);

    expect(preview.missing).toEqual(["date"]);
    expect(preview.audience).toEqual([]);
  });

  it("approves once the gap is filled", async () => {
    const event = await newDraft(actorPersonId, draftInput());
    const size = await giveAudience(event.id);

    const outcome = await approveEvent(actorPersonId, event.id);

    expect(outcome.event.status).toBe("approved");
    expect(outcome.invitationCount).toBe(size);
  });

  it("requires nothing the club legitimately leaves as TBD", async () => {
    // W4: "TBD stays a legitimate value on a draft — for venue, for time".
    // Requiring a venue would refuse a fixture whose ground is not settled,
    // which the club really does approve.
    const event = await createEventDraft(
      actorPersonId,
      draftInput({ venue: null, startsAt: null, endsAt: null, description: null }),
    );
    await giveAudience(event.id);

    const outcome = await approveEvent(actorPersonId, event.id);

    expect(outcome.event.status).toBe("approved");
  });
});

describe("what the completeness gate asks for", () => {
  it("asks for the date, and nothing the record legitimately lacks", () => {
    const complete = {
      name: "Practice",
      scheduledOn: "2027-02-24",
    } as Parameters<typeof missingForApproval>[0];

    expect(missingForApproval(complete)).toEqual([]);
    expect(missingForApproval({ ...complete, scheduledOn: null })).toEqual(["date"]);
  });

  it("names the field in a sentence somebody can act on", () => {
    expect(describeMissingForApproval(["date"])).toContain("no date yet");
    expect(describeMissingForApproval(["date", "name"])).toContain("date and name");
  });
});

// ---------------------------------------------------------------------------
// Deleting a draft — REQ-delete-draft, D29
// ---------------------------------------------------------------------------

describe("an abandoned draft is deleted, permanently (D29)", () => {
  it("removes the row, and says which event it removed", async () => {
    const event = await newDraft(actorPersonId, draftInput());

    const gone = await deleteEventDraft(actorPersonId, event.id);

    expect(gone.name).toBe(`${NAME_MARKER} draft`);
    expect(await statusOf(event.id)).toBe("(gone)");
  });

  it("takes its questions and its audience with it", async () => {
    const event = await newDraft(actorPersonId, draftInput(), [question({ prompt: "Coming?" })]);
    await giveAudience(event.id);

    await deleteEventDraft(actorPersonId, event.id);

    const questions = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.event_questions where event_id = $1",
      [event.id],
    );
    const audience = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.event_audience_members where event_id = $1",
      [event.id],
    );
    expect(questions.rows[0].count).toBe("0");
    expect(audience.rows[0].count).toBe("0");
  });

  it("leaves the audit row behind, which is the only evidence it existed", async () => {
    // `audit_events` is deliberately polymorphic and deliberately not a foreign
    // key, precisely so a record can outlive its subject.
    const event = await newDraft(actorPersonId, draftInput());

    await deleteEventDraft(actorPersonId, event.id);

    const audit = await observer.query<{ action: string; context: Record<string, unknown> }>(
      `select action, context from public.audit_events
        where entity_table = 'events' and entity_id = $1 and action = 'event.draft_deleted'`,
      [event.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].context.name).toBe(`${NAME_MARKER} draft`);
  });

  it("refuses to delete an approved event, and says what to do instead", async () => {
    // People have been told about it, so it is cancelled rather than deleted.
    const event = await newDraft(actorPersonId, draftInput());
    await giveAudience(event.id);
    await approveEvent(actorPersonId, event.id);

    const error = await refusalFrom(() => deleteEventDraft(actorPersonId, event.id));

    expect(error.kind).toBe("invalid_transition");
    expect(error.rule).toBe("event_delete_requires_draft");
    expect(error.message).toContain("cancelled rather than deleted");
    expect(await statusOf(event.id)).toBe("approved");
  });

  it("refuses to delete a cancelled event too", async () => {
    const event = await newDraft(actorPersonId, draftInput());
    await giveAudience(event.id);
    await approveEvent(actorPersonId, event.id);
    await observer.query(
      `update public.events set status = 'cancelled', decision_reason = 'Arranged by a test'
        where id = $1`,
      [event.id],
    );

    const error = await refusalFrom(() => deleteEventDraft(actorPersonId, event.id));

    expect(error.rule).toBe("event_delete_requires_draft");
    expect(await statusOf(event.id)).toBe("cancelled");
  });

  it("writes no audit row for a deletion it refused", async () => {
    const event = await newDraft(actorPersonId, draftInput());
    await giveAudience(event.id);
    await approveEvent(actorPersonId, event.id);

    await refusalFrom(() => deleteEventDraft(actorPersonId, event.id));

    const audit = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.audit_events
        where entity_table = 'events' and entity_id = $1 and action = 'event.draft_deleted'`,
      [event.id],
    );
    expect(audit.rows[0].count).toBe("0");
  });

  it("says the event is gone rather than pretending it deleted one", async () => {
    const error = await refusalFrom(() =>
      deleteEventDraft(actorPersonId, "00000000-0000-4000-8000-000000000000"),
    );

    expect(error.kind).toBe("not_found");
  });

  it("refuses a deletion that does not name who made it", async () => {
    const event = await newDraft(actorPersonId, draftInput());

    const error = await refusalFrom(() => deleteEventDraft("", event.id));

    expect(error.kind).toBe("constraint_violated");
    expect(await statusOf(event.id)).toBe("draft");
  });
});

// ---------------------------------------------------------------------------
// The approval review reads what a player will meet
// ---------------------------------------------------------------------------

describe("the approval review shows the questions as a player will be asked them", () => {
  it("returns them in order, with the template mark intact", async () => {
    const event = await newDraft(actorPersonId, draftInput(), [
      question({ prompt: "Coming by car?", fromTemplate: true }),
      question({ prompt: "Anything else?", answerType: "text" }),
    ]);
    await giveAudience(event.id);

    const preview = await readApprovalPreview(event.id);

    expect(preview.questions.map((entry) => entry.prompt)).toEqual([
      "Coming by car?",
      "Anything else?",
    ]);
    expect(preview.questions[0].fromTemplate).toBe(true);
  });

  it("names the audience by its groups before its people", async () => {
    const event = await newDraft(actorPersonId, draftInput());
    await giveAudience(event.id);

    const preview = await readApprovalPreview(event.id);

    // Three players out of the whole squad is not a whole group, so the shape
    // is honest about that rather than claiming "all active players".
    expect(preview.groupSummary.total).toBe(preview.audience.length);
    expect(preview.groupSummary.others).toBe(preview.audience.length);
    expect(preview.groupSummary.groups).toEqual([]);
  });
});
