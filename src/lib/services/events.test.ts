// @vitest-environment node
/**
 * The event aggregate — LAN-76, matrix rows 1 to 10.
 *
 * Against the **real** local database, for the reason the service-layer suites
 * already establish: what is under test is a transaction, a set of check
 * constraints and a status guard written into a `where` clause. A mocked
 * transaction commits because the mock says so, cannot be rejected by
 * `events_negative_decisions_are_explained`, and cannot lose a race with a
 * concurrent submission.
 *
 * Every row this suite writes carries `NAME_MARKER` in `events.name`, and
 * `afterEach` deletes exactly those rows and their audit trail. Nothing here
 * touches the seeded dataset, and the marker is unique to this file so a
 * parallel suite cannot delete its fixtures.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, type ServiceError } from "@/lib/db";
import {
  abandonEventDraft,
  createEventDraft,
  listCurrentSeasonEvents,
  readEvent,
  submitEventForApproval,
  updateEventDraft,
  validateEventDraft,
  withdrawEventSubmission,
  type EventDraftInput,
} from "./events";
import { readCurrentSeason } from "./seasons";
import { openObserver } from "../../../tests/helpers/service-layer";

/** Unique to this file. Two suites sharing one marker delete each other's rows. */
const NAME_MARKER = "LAN76EventsSuite";

let observer: Client;
let actorPersonId: string;

beforeAll(async () => {
  observer = await openObserver();
  const person = await observer.query<{ id: string }>("select id from public.people limit 1");
  actorPersonId = person.rows[0].id;
});

afterEach(async () => {
  // Audit rows first — they name the event, and the delete below removes it.
  await observer.query(
    `delete from public.audit_events
      where entity_table = 'events'
        and entity_id in (select id from public.events where name like $1)`,
    [`${NAME_MARKER}%`],
  );
  await observer.query("delete from public.events where name like $1", [`${NAME_MARKER}%`]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

function draft(overrides: Partial<EventDraftInput> = {}): EventDraftInput {
  return {
    name: `${NAME_MARKER} Wednesday practice`,
    eventType: "practice",
    origin: "club_controlled",
    scheduledOn: "2026-10-14",
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    termId: null,
    weekNumber: 2,
    isMandatory: true,
    solicitsResponse: true,
    ...overrides,
  };
}

/** Every audit row written about one event, oldest first. */
async function auditFor(eventId: string) {
  const result = await observer.query<{
    action: string;
    from_state: string | null;
    to_state: string | null;
    actor_person_id: string | null;
    reason: string | null;
  }>(
    `select action, from_state, to_state, actor_person_id, reason
       from public.audit_events
      where entity_table = 'events' and entity_id = $1
      order by occurred_at asc, id asc`,
    [eventId],
  );
  return result.rows;
}

/** How many "an event was drafted" records exist right now. */
async function countDraftedAudits(): Promise<number> {
  const result = await observer.query<{ count: string }>(
    `select count(*)::text as count from public.audit_events
      where entity_table = 'events' and action = 'event.drafted'`,
  );
  return Number(result.rows[0].count);
}

async function statusOf(eventId: string): Promise<string> {
  const result = await observer.query<{ status: string }>(
    "select status::text as status from public.events where id = $1",
    [eventId],
  );
  return result.rows[0]?.status ?? "(gone)";
}

/** Runs `attempt`, and returns the `ServiceError` it was supposed to throw. */
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
// Row 1 and 2 — creating a draft, and its audit row
// ---------------------------------------------------------------------------

describe("row 1 — an operator creates the Wednesday practice as a draft", () => {
  it("stores the status, the flags, the season and the owner", async () => {
    const season = await readCurrentSeason();
    const event = await createEventDraft(actorPersonId, draft());

    expect(event.status).toBe("draft");
    expect(event.eventType).toBe("practice");
    expect(event.origin).toBe("club_controlled");
    expect(event.scheduledOn).toBe("2026-10-14");
    expect(event.startsAt).toBe("20:00");
    expect(event.endsAt).toBe("22:00");
    expect(event.venue).toBe("Iffley Road Astro");
    expect(event.weekNumber).toBe(2);
    expect(event.isMandatory).toBe(true);
    expect(event.solicitsResponse).toBe(true);
    expect(event.seasonId).toBe(season.id);
  });

  it("records the operator as the owner, not the request", async () => {
    const event = await createEventDraft(actorPersonId, draft());

    const stored = await observer.query<{ owner_person_id: string | null }>(
      "select owner_person_id from public.events where id = $1",
      [event.id],
    );
    expect(stored.rows[0].owner_person_id).toBe(actorPersonId);
  });

  it("carries no invitations, and cannot — invariant P1", async () => {
    const event = await createEventDraft(actorPersonId, draft());

    expect(event.invitationCount).toBe(0);
    expect(event.audienceCount).toBe(0);

    // Not an assumption: the database itself refuses the row. An audience
    // member is allowed against a draft — resolving one is what LAN-77 does
    // before approval — and the invitation that would follow is not.
    const member = await observer.query<{ id: string }>(
      `insert into public.event_audience_members (event_id, season_id, capacity, person_id)
       values ($1, $2, 'coach', $3) returning id`,
      [event.id, event.seasonId, actorPersonId],
    );

    await expect(
      observer.query(
        `insert into public.invitations
           (event_id, event_status, solicits_response, season_id, capacity, person_id,
            audience_member_id)
         values ($1, 'draft', true, $2, 'coach', $3, $4)`,
        [event.id, event.seasonId, actorPersonId, member.rows[0].id],
      ),
    ).rejects.toThrow(/invitations_require_an_approved_event/);

    // The audience member goes with the event when the suite cleans up:
    // `event_audience_members.event_id` cascades.
  });

  it("records a non-soliciting event without a deadline — invariant E6", async () => {
    const event = await createEventDraft(
      actorPersonId,
      draft({ solicitsResponse: false, isMandatory: false }),
    );

    expect(event.solicitsResponse).toBe(false);

    const stored = await observer.query<{
      response_deadline_at: Date | null;
      reminder_offsets_hours: number[];
    }>("select response_deadline_at, reminder_offsets_hours from public.events where id = $1", [
      event.id,
    ]);
    expect(stored.rows[0].response_deadline_at).toBeNull();
    expect(stored.rows[0].reminder_offsets_hours).toEqual([]);
  });

  it("accepts a draft with no date, no time and no venue — invariant E1a", async () => {
    const event = await createEventDraft(
      actorPersonId,
      draft({ scheduledOn: null, startsAt: null, endsAt: null, venue: null, weekNumber: null }),
    );

    expect(event.status).toBe("draft");
    expect(event.scheduledOn).toBeNull();
  });

  it("refuses an end that is not after the start", async () => {
    const error = await refusalFrom(() =>
      createEventDraft(actorPersonId, draft({ startsAt: "20:00", endsAt: "19:00" })),
    );

    expect(error.kind).toBe("constraint_violated");
    expect(error.message).toMatch(/end after it starts/i);
  });

  it("refuses a type this form cannot fully describe", async () => {
    const error = await refusalFrom(() =>
      createEventDraft(actorPersonId, draft({ eventType: "fixture" })),
    );

    expect(error.rule).toBe("event_type_not_draftable");
  });

  it("refuses a change that names nobody", async () => {
    const error = await refusalFrom(() => createEventDraft("", draft()));

    expect(error.rule).toBe("audit_events_has_an_actor");
  });
});

describe("row 2 — the audit row and the change commit together", () => {
  it("writes one row naming the operator and the resulting state", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    const audit = await auditFor(event.id);

    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("event.drafted");
    expect(audit[0].to_state).toBe("draft");
    expect(audit[0].actor_person_id).toBe(actorPersonId);
  });

  it("writes no audit row when the change itself is refused", async () => {
    const before = await countDraftedAudits();

    // A term that does not exist. The insert reaches the database and is
    // rejected by the foreign key, which is the case that matters: the audit
    // row is written in the same transaction, so a broken rollback would leave
    // a record asserting an event was drafted when none was.
    await refusalFrom(() =>
      createEventDraft(actorPersonId, draft({ termId: "00000000-0000-4000-8000-0000000000ff" })),
    );

    expect(await countDraftedAudits()).toBe(before);

    const orphans = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.audit_events
        where entity_table = 'events'
          and entity_id not in (select id from public.events)`,
    );
    expect(Number(orphans.rows[0].count)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Row 3 — editing
// ---------------------------------------------------------------------------

describe("row 3 — a draft can be edited, and only while it is a draft", () => {
  it("updates the fields and audits the edit", async () => {
    const event = await createEventDraft(actorPersonId, draft());

    const edited = await updateEventDraft(
      actorPersonId,
      event.id,
      draft({
        name: `${NAME_MARKER} Wednesday practice, moved`,
        venue: "University Parks",
        startsAt: "19:00",
        endsAt: "21:00",
        solicitsResponse: false,
        isMandatory: false,
      }),
    );

    expect(edited.name).toBe(`${NAME_MARKER} Wednesday practice, moved`);
    expect(edited.venue).toBe("University Parks");
    expect(edited.startsAt).toBe("19:00");
    expect(edited.solicitsResponse).toBe(false);
    expect(edited.isMandatory).toBe(false);
    expect(edited.status).toBe("draft");

    const audit = await auditFor(event.id);
    expect(audit.map((row) => row.action)).toEqual(["event.drafted", "event.draft_updated"]);
  });

  it("clears an optional field that is emptied", async () => {
    const event = await createEventDraft(actorPersonId, draft());

    const edited = await updateEventDraft(
      actorPersonId,
      event.id,
      draft({ venue: null, weekNumber: null, endsAt: null }),
    );

    expect(edited.venue).toBeNull();
    expect(edited.weekNumber).toBeNull();
    expect(edited.endsAt).toBeNull();
  });

  it("refuses to edit an event that is no longer a draft", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    await submitEventForApproval(actorPersonId, event.id);

    const error = await refusalFrom(() => updateEventDraft(actorPersonId, event.id, draft()));

    expect(error.kind).toBe("invalid_transition");
    expect(error.message).toMatch(/Only a draft can be edited/);
    expect(error.message).toMatch(/awaiting approval/);
  });

  it("writes no audit row for a refused edit", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    await submitEventForApproval(actorPersonId, event.id);

    await refusalFrom(() => updateEventDraft(actorPersonId, event.id, draft()));

    const audit = await auditFor(event.id);
    expect(audit.map((row) => row.action)).toEqual([
      "event.drafted",
      "event.submitted_for_approval",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Rows 4, 5, 6 — the three transitions
// ---------------------------------------------------------------------------

describe("row 4 — submitting a draft for approval", () => {
  it("moves draft to pending_approval and audits it in the same transaction", async () => {
    const event = await createEventDraft(actorPersonId, draft());

    const submitted = await submitEventForApproval(actorPersonId, event.id);

    expect(submitted.status).toBe("pending_approval");
    expect(await statusOf(event.id)).toBe("pending_approval");

    const audit = await auditFor(event.id);
    expect(audit[1]).toMatchObject({
      action: "event.submitted_for_approval",
      from_state: "draft",
      to_state: "pending_approval",
      actor_person_id: actorPersonId,
    });
  });

  it("submits a draft that has no date — approval is where E1a bites", async () => {
    const event = await createEventDraft(actorPersonId, draft({ scheduledOn: null }));

    const submitted = await submitEventForApproval(actorPersonId, event.id);

    expect(submitted.status).toBe("pending_approval");
    expect(submitted.scheduledOn).toBeNull();
  });

  it("still carries no invitations once pending", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    const submitted = await submitEventForApproval(actorPersonId, event.id);

    expect(submitted.invitationCount).toBe(0);
    expect(submitted.audienceCount).toBe(0);
  });

  it("refuses to submit an event that is already awaiting approval", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    await submitEventForApproval(actorPersonId, event.id);

    const error = await refusalFrom(() => submitEventForApproval(actorPersonId, event.id));

    expect(error.kind).toBe("invalid_transition");
    expect(error.rule).toBe("event_transition:submit");
    expect(error.message).toMatch(/Only a draft can be submitted for approval/);
    expect(error.message).toMatch(/awaiting approval/);
  });

  it("refuses to submit an event that is already approved", async () => {
    // An approved event, built the way approval will build one: date, approver
    // and a confirmed audience, because E1a refuses anything less.
    const event = await createEventDraft(actorPersonId, draft());
    await observer.query(
      `update public.events
          set status = 'approved', approved_at = now(), approved_by_person_id = $2,
              audience_confirmed_at = now(), audience_confirmed_by_person_id = $2
        where id = $1`,
      [event.id, actorPersonId],
    );

    const error = await refusalFrom(() => submitEventForApproval(actorPersonId, event.id));

    expect(error.kind).toBe("invalid_transition");
    expect(error.message).toMatch(/This event is approved/);
    expect(await statusOf(event.id)).toBe("approved");
  });

  it("refuses to submit an event that does not exist", async () => {
    const error = await refusalFrom(() =>
      submitEventForApproval(actorPersonId, "00000000-0000-4000-8000-000000000000"),
    );

    expect(error.kind).toBe("not_found");
  });
});

describe("row 5 — withdrawing a submission returns the event to draft", () => {
  it("moves pending_approval back to draft and audits it", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    await submitEventForApproval(actorPersonId, event.id);

    const withdrawn = await withdrawEventSubmission(actorPersonId, event.id);

    expect(withdrawn.status).toBe("draft");

    const audit = await auditFor(event.id);
    expect(audit[2]).toMatchObject({
      action: "event.submission_withdrawn",
      from_state: "pending_approval",
      to_state: "draft",
    });
  });

  it("leaves the event editable again", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    await submitEventForApproval(actorPersonId, event.id);
    await withdrawEventSubmission(actorPersonId, event.id);

    const edited = await updateEventDraft(
      actorPersonId,
      event.id,
      draft({ venue: "University Parks" }),
    );
    expect(edited.venue).toBe("University Parks");
  });

  it("refuses to withdraw a submission that was never made", async () => {
    const event = await createEventDraft(actorPersonId, draft());

    const error = await refusalFrom(() => withdrawEventSubmission(actorPersonId, event.id));

    expect(error.kind).toBe("invalid_transition");
    expect(error.message).toMatch(/awaiting approval can have its submission withdrawn/);
  });
});

describe("row 6 — abandoning a draft ends it, and says why", () => {
  it("moves draft to withdrawn, stores the reason and audits it", async () => {
    const event = await createEventDraft(actorPersonId, draft());

    const abandoned = await abandonEventDraft(actorPersonId, event.id, "Pitch unavailable");

    expect(abandoned.status).toBe("withdrawn");
    expect(abandoned.decisionReason).toBe("Pitch unavailable");

    const audit = await auditFor(event.id);
    expect(audit[1]).toMatchObject({
      action: "event.draft_abandoned",
      from_state: "draft",
      to_state: "withdrawn",
      reason: "Pitch unavailable",
    });
  });

  it("refuses a blank reason before the database has to", async () => {
    const event = await createEventDraft(actorPersonId, draft());

    const error = await refusalFrom(() => abandonEventDraft(actorPersonId, event.id, "   "));

    expect(error.rule).toBe("events_negative_decisions_are_explained");
    expect(await statusOf(event.id)).toBe("draft");
  });

  it("refuses to abandon an event that is awaiting approval", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    await submitEventForApproval(actorPersonId, event.id);

    const error = await refusalFrom(() =>
      abandonEventDraft(actorPersonId, event.id, "Changed our minds"),
    );

    expect(error.kind).toBe("invalid_transition");
    expect(error.message).toMatch(/Only a draft can be abandoned/);
    expect(await statusOf(event.id)).toBe("pending_approval");
  });
});

// ---------------------------------------------------------------------------
// Row 7 — invariant E4
// ---------------------------------------------------------------------------

describe("row 7 — two events on one date are both accepted (invariant E4)", () => {
  it("accepts a second event at the same date, time and venue", async () => {
    const first = await createEventDraft(actorPersonId, draft({ name: `${NAME_MARKER} First` }));
    const second = await createEventDraft(actorPersonId, draft({ name: `${NAME_MARKER} Second` }));

    expect(first.id).not.toBe(second.id);
    expect(first.scheduledOn).toBe(second.scheduledOn);
    expect(first.startsAt).toBe(second.startsAt);
    expect(await statusOf(first.id)).toBe("draft");
    expect(await statusOf(second.id)).toBe("draft");
  });

  it("accepts both when one of them is already approved", async () => {
    const approved = await createEventDraft(actorPersonId, draft({ name: `${NAME_MARKER} A` }));
    await observer.query(
      `update public.events
          set status = 'approved', approved_at = now(), approved_by_person_id = $2,
              audience_confirmed_at = now(), audience_confirmed_by_person_id = $2
        where id = $1`,
      [approved.id, actorPersonId],
    );

    const alongside = await createEventDraft(actorPersonId, draft({ name: `${NAME_MARKER} B` }));

    expect(alongside.status).toBe("draft");
    expect(alongside.scheduledOn).toBe("2026-10-14");
  });
});

// ---------------------------------------------------------------------------
// Row 8 — validation
// ---------------------------------------------------------------------------

describe("row 8 — the form's rules, checked without a database", () => {
  const complete = {
    name: "Wednesday practice",
    eventType: "practice",
    origin: "club_controlled",
    scheduledOn: "2026-10-14",
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    termId: "",
    weekNumber: "2",
    attendance: "mandatory",
    solicitsResponse: "yes",
  };

  it("accepts a complete practice", () => {
    const result = validateEventDraft(complete);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isMandatory).toBe(true);
    expect(result.value.solicitsResponse).toBe(true);
    expect(result.value.weekNumber).toBe(2);
    expect(result.value.termId).toBeNull();
  });

  it("refuses an unanswered response-solicited choice — no silent default", () => {
    const result = validateEventDraft({ ...complete, solicitsResponse: "" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      field: "solicitsResponse",
      message: "Say whether this event asks its audience to respond.",
    });
  });

  it("refuses an unanswered attendance choice", () => {
    const result = validateEventDraft({ ...complete, attendance: "" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field)).toContain("attendance");
  });

  it("reports every problem at once, not just the first", () => {
    const result = validateEventDraft({
      ...complete,
      name: "  ",
      endsAt: "19:00",
      weekNumber: "9",
      solicitsResponse: "",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field)).toEqual([
      "name",
      "endsAt",
      "weekNumber",
      "solicitsResponse",
    ]);
  });

  it("keeps an empty date, time, venue, term and week — a draft may be incomplete", () => {
    const result = validateEventDraft({
      ...complete,
      scheduledOn: "",
      startsAt: "",
      endsAt: "",
      venue: "",
      weekNumber: "",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scheduledOn).toBeNull();
    expect(result.value.startsAt).toBeNull();
    expect(result.value.venue).toBeNull();
    expect(result.value.weekNumber).toBeNull();
  });

  it("accepts week −1, the first Michaelmas week", () => {
    const result = validateEventDraft({ ...complete, weekNumber: "-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.weekNumber).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Row 10 — reading
// ---------------------------------------------------------------------------

describe("row 10 — the list is the current season's, and refuses to guess", () => {
  it("includes a new draft, scoped to the current season", async () => {
    const season = await readCurrentSeason();
    const event = await createEventDraft(actorPersonId, draft());

    const list = await listCurrentSeasonEvents();

    expect(list.season.id).toBe(season.id);
    expect(list.events.map((row) => row.id)).toContain(event.id);
    expect(list.totalInSeason).toBeGreaterThan(0);
  });

  it("filters by status without changing the season total", async () => {
    const event = await createEventDraft(actorPersonId, draft());

    const drafts = await listCurrentSeasonEvents({ status: "draft" });

    expect(drafts.events.every((row) => row.status === "draft")).toBe(true);
    expect(drafts.events.map((row) => row.id)).toContain(event.id);
    expect(drafts.totalInSeason).toBeGreaterThan(drafts.events.length - 1);
  });

  it("filters by free text over the name", async () => {
    const event = await createEventDraft(
      actorPersonId,
      draft({ name: `${NAME_MARKER} Distinctive name` }),
    );

    const found = await listCurrentSeasonEvents({ search: "Distinctive name" });

    expect(found.events.map((row) => row.id)).toEqual([event.id]);
  });

  it("returns no events for a filter nothing matches, and still counts the season", async () => {
    await createEventDraft(actorPersonId, draft());

    const none = await listCurrentSeasonEvents({ search: "no event is called this" });

    expect(none.events).toEqual([]);
    expect(none.totalInSeason).toBeGreaterThan(0);
  });

  it("refuses an event id that is not an identifier at all", async () => {
    const error = await refusalFrom(() => readEvent("not-a-uuid"));

    expect(error.kind).toBe("not_found");
  });
});
