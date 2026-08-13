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
  updateEventDraft,
  validateEventDraft,
  EVENT_TRANSITIONS,
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
    scheduledOn: "2026-10-14",
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
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

/**
 * Puts an event into a state this slice cannot reach, the way the schema
 * requires.
 *
 * LAN-76 no longer moves an event out of `draft` except by abandoning it —
 * Brian removed the submission step — so the tests that prove "this is refused
 * once it is not a draft" have to arrange that state directly. Approval is
 * LAN-77's, and invariant E1a requires a date, an approver and a confirmed
 * audience, all of which are set here.
 */
async function forceStatus(eventId: string, status: string): Promise<void> {
  await observer.query(
    `update public.events
        set status = $2::public.event_status,
            approved_at = case when $2 in ('approved', 'occurred', 'not_held', 'cancelled')
                               then now() end,
            approved_by_person_id = case when $2 in ('approved', 'occurred', 'not_held', 'cancelled')
                                         then $3::uuid end,
            audience_confirmed_at = case when $2 in ('approved', 'occurred', 'not_held', 'cancelled')
                                         then now() end,
            audience_confirmed_by_person_id = case
                                         when $2 in ('approved', 'occurred', 'not_held', 'cancelled')
                                         then $3::uuid end,
            decision_reason = case when $2 in ('rejected', 'cancelled', 'withdrawn')
                                   then 'Arranged by a test' else decision_reason end
      where id = $1`,
    [eventId, status, actorPersonId],
  );
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
      draft({ scheduledOn: null, startsAt: null, endsAt: null, venue: null }),
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

    // A date that looks like one and is not. It passes every check this layer
    // makes and is rejected by PostgreSQL itself, which is the case that
    // matters: the audit row is written in the same transaction as the insert,
    // so a broken rollback would leave a record asserting an event was drafted
    // when none was.
    await refusalFrom(() => createEventDraft(actorPersonId, draft({ scheduledOn: "2026-02-30" })));

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
      draft({ venue: null, endsAt: null, scheduledOn: null }),
    );

    expect(edited.venue).toBeNull();
    expect(edited.endsAt).toBeNull();
    // Cleared the date too, so the derived coordinate has to clear with it.
    expect(edited.termId).toBeNull();
    expect(edited.weekNumber).toBeNull();
  });

  it("refuses to edit an event that is no longer a draft", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    await forceStatus(event.id, "approved");

    const error = await refusalFrom(() => updateEventDraft(actorPersonId, event.id, draft()));

    expect(error.kind).toBe("invalid_transition");
    expect(error.message).toMatch(/Only a draft can be edited/);
    expect(error.message).toMatch(/approved/);
  });

  it("writes no audit row for a refused edit", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    await forceStatus(event.id, "approved");

    await refusalFrom(() => updateEventDraft(actorPersonId, event.id, draft()));

    const audit = await auditFor(event.id);
    expect(audit.map((row) => row.action)).toEqual(["event.drafted"]);
  });
});

// ---------------------------------------------------------------------------
// Rows 4, 5, 6 — the three transitions
// ---------------------------------------------------------------------------

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

  it("refuses to abandon an event that has been approved", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    await forceStatus(event.id, "approved");

    const error = await refusalFrom(() =>
      abandonEventDraft(actorPersonId, event.id, "Changed our minds"),
    );

    expect(error.kind).toBe("invalid_transition");
    expect(error.message).toMatch(/Only a draft can be abandoned/);
    expect(await statusOf(event.id)).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// Brian's clarification — the date decides the term, and the club owns the event
// ---------------------------------------------------------------------------

describe("the term and week are derived from the date, never chosen", () => {
  it("stores the Oxford coordinate the date falls in", async () => {
    // 14 October 2026 is Michaelmas week 1: term starts 27 September, which is
    // the first day of week −1, and 14 October is seventeen days later.
    const event = await createEventDraft(actorPersonId, draft());

    const term = await observer.query<{ name: string; academic_year: string }>(
      "select name::text as name, academic_year from public.terms where id = $1",
      [event.termId],
    );

    expect(term.rows[0].name).toBe("michaelmas");
    expect(term.rows[0].academic_year).toBe("2026-27");
    expect(event.weekNumber).toBe(1);
  });

  it("records no term for a date outside every term", async () => {
    const event = await createEventDraft(actorPersonId, draft({ scheduledOn: "2027-07-15" }));

    expect(event.termId).toBeNull();
    expect(event.weekNumber).toBeNull();
  });

  it("re-derives when an edit moves the date to another term", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    expect(event.weekNumber).toBe(1);

    // Into Hilary, 0th week.
    const moved = await updateEventDraft(
      actorPersonId,
      event.id,
      draft({ scheduledOn: "2027-01-10" }),
    );

    const term = await observer.query<{ name: string }>(
      "select name::text as name from public.terms where id = $1",
      [moved.termId],
    );
    expect(term.rows[0].name).toBe("hilary");
    expect(moved.weekNumber).toBe(0);
  });

  it("clears the coordinate when an edit removes the date", async () => {
    const event = await createEventDraft(actorPersonId, draft());

    const cleared = await updateEventDraft(actorPersonId, event.id, draft({ scheduledOn: null }));

    expect(cleared.termId).toBeNull();
    expect(cleared.weekNumber).toBeNull();
  });
});

describe("origin is derived on creation and preserved on edit", () => {
  it("records an operator-created event as one the club controls", async () => {
    const event = await createEventDraft(actorPersonId, draft());

    expect(event.origin).toBe("club_controlled");
  });

  it("leaves an externally scheduled event's provenance alone when it is edited", async () => {
    // The case the schema exists for, and the one an edit must not quietly
    // reclassify: a fixture whose date somebody else sets. Nothing in this
    // slice creates one, so it is arranged directly.
    const event = await createEventDraft(actorPersonId, draft());
    await observer.query("update public.events set origin = 'externally_assigned' where id = $1", [
      event.id,
    ]);

    const edited = await updateEventDraft(
      actorPersonId,
      event.id,
      draft({ name: `${NAME_MARKER} Renamed` }),
    );

    expect(edited.origin).toBe("externally_assigned");
  });
});

describe("the calendar is the club's, not its typist's", () => {
  it("lets a second operator edit, submit and withdraw a draft they did not create", async () => {
    // Brian's clarification: the calendar is managed by four roles and is not
    // personally owned by its creator. Who *may* do this is decided by the
    // capability map at the action; the service records the actor and applies
    // no ownership rule of its own, and this is what says so.
    const second = await observer.query<{ id: string }>(
      "select id from public.people where id <> $1 limit 1",
      [actorPersonId],
    );
    const other = second.rows[0].id;

    const event = await createEventDraft(actorPersonId, draft());

    const edited = await updateEventDraft(other, event.id, draft({ venue: "University Parks" }));
    expect(edited.venue).toBe("University Parks");

    const abandoned = await abandonEventDraft(other, event.id, "Superseded");
    expect(abandoned.status).toBe("withdrawn");

    // And every one of those names whoever actually did it.
    const audit = await auditFor(event.id);
    expect(audit.map((row) => row.actor_person_id)).toEqual([actorPersonId, other, other]);
  });
});

describe("the list can be sorted, and only by columns it knows", () => {
  it("sorts by date, oldest first, when asked", async () => {
    await createEventDraft(
      actorPersonId,
      draft({ name: `${NAME_MARKER} Later`, scheduledOn: "2026-11-04" }),
    );
    await createEventDraft(
      actorPersonId,
      draft({ name: `${NAME_MARKER} Earlier`, scheduledOn: "2026-10-07" }),
    );

    const list = await listCurrentSeasonEvents({
      search: NAME_MARKER,
      sort: "date",
      direction: "asc",
    });
    const dates = list.events.map((row) => row.scheduledOn);

    expect(dates).toEqual([...dates].sort());
  });

  it("sorts by venue and by name", async () => {
    await createEventDraft(
      actorPersonId,
      draft({ name: `${NAME_MARKER} Beta`, venue: "Zulu field" }),
    );
    await createEventDraft(
      actorPersonId,
      draft({ name: `${NAME_MARKER} Alpha`, venue: "Alpha field" }),
    );

    const byVenue = await listCurrentSeasonEvents({
      search: NAME_MARKER,
      sort: "venue",
      direction: "asc",
    });
    expect(byVenue.events[0].venue).toBe("Alpha field");

    const byName = await listCurrentSeasonEvents({
      search: NAME_MARKER,
      sort: "name",
      direction: "asc",
    });
    expect(byName.events[0].name).toBe(`${NAME_MARKER} Alpha`);
  });

  it("falls back to the date for a sort column it does not recognise", async () => {
    await createEventDraft(actorPersonId, draft());

    // The parameter arrives from a query string, so this is the shape of an
    // attack as much as of a typo. Neither is interpolated into the statement.
    const injected = await listCurrentSeasonEvents({
      search: NAME_MARKER,
      sort: "name; drop table public.events --",
      direction: "sideways",
    });
    const byDate = await listCurrentSeasonEvents({ search: NAME_MARKER });

    expect(injected.events.map((row) => row.id)).toEqual(byDate.events.map((row) => row.id));

    const survived = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.events",
    );
    expect(Number(survived.rows[0].count)).toBeGreaterThan(0);
  });

  it("puts an event with no date last, whichever way it is sorted", async () => {
    await createEventDraft(actorPersonId, draft({ name: `${NAME_MARKER} Dated` }));
    await createEventDraft(
      actorPersonId,
      draft({ name: `${NAME_MARKER} Undated`, scheduledOn: null }),
    );

    for (const direction of ["asc", "desc"]) {
      const list = await listCurrentSeasonEvents({ search: NAME_MARKER, sort: "date", direction });
      expect(list.events.at(-1)?.scheduledOn, `sorted ${direction}`).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Row 7 — invariant E4
// ---------------------------------------------------------------------------

describe("there is no submission step, and nothing can create one", () => {
  it("names only the abandon transition", async () => {
    // Brian removed `draft → pending_approval` on 12 August 2026: only calendar
    // operators create events, so there is nobody to submit one to. This is
    // what stops it coming back by accident.
    expect(Object.keys(EVENT_TRANSITIONS)).toEqual(["abandon"]);
  });

  it("leaves a saved event as a draft, and nothing else", async () => {
    const event = await createEventDraft(actorPersonId, draft());

    expect(event.status).toBe("draft");
    expect(await statusOf(event.id)).toBe("draft");

    const audit = await auditFor(event.id);
    expect(audit.map((row) => row.action)).toEqual(["event.drafted"]);
  });

  it("keeps reading an event that is already awaiting approval", async () => {
    // The status stays in the enum and seeded rows use it, so the screens still
    // have to render one. Nothing in the application produces it.
    const event = await createEventDraft(actorPersonId, draft());
    await forceStatus(event.id, "pending_approval");

    const read = await readEvent(event.id);
    expect(read.status).toBe("pending_approval");
    expect(read.invitationCount).toBe(0);
  });
});

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
    scheduledOn: "2026-10-14",
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    attendance: "mandatory",
    solicitsResponse: "yes",
  };

  it("accepts a complete practice", () => {
    const result = validateEventDraft(complete);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isMandatory).toBe(true);
    expect(result.value.solicitsResponse).toBe(true);
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
      attendance: "",
      solicitsResponse: "",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.field)).toEqual([
      "name",
      "endsAt",
      "attendance",
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
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scheduledOn).toBeNull();
    expect(result.value.startsAt).toBeNull();
    expect(result.value.venue).toBeNull();
  });

  it("has no field for the term, the week or the origin", () => {
    // All three are derived. A form that posted them would be ignored rather
    // than believed, and this is what says so — Brian's LAN-76 clarification:
    // "Do not allow operators to independently choose date, term and week."
    const result = validateEventDraft({
      ...complete,
      termId: "not-a-uuid",
      weekNumber: "9",
      origin: "externally_assigned",
    } as Parameters<typeof validateEventDraft>[0]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toHaveProperty("termId");
    expect(result.value).not.toHaveProperty("weekNumber");
    expect(result.value).not.toHaveProperty("origin");
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

  it("excludes an event belonging to a season the club is not operating", async () => {
    // The one assertion that fails if `and e.season_id = $1` is deleted from
    // the query. Every other assertion in this block is containment- or
    // filter-shaped and stays green without it, which independent review
    // demonstrated by removing the predicate and watching them all pass.
    const other = await observer.query<{ id: string }>(
      `select id from public.seasons
        where status not in ('open', 'active', 'closing')
        order by starts_on desc limit 1`,
    );
    // The seeded dataset carries an archived season. Without one this assertion
    // would prove nothing, so it says so rather than passing vacuously.
    expect(other.rows[0], "the seeded dataset has no non-operating season").toBeDefined();

    const foreign = await observer.query<{ id: string }>(
      `insert into public.events (season_id, name, event_type, status, scheduled_on)
       values ($1, $2, 'practice', 'draft', '2026-10-14')
       returning id`,
      [other.rows[0].id, `${NAME_MARKER} Last season's practice`],
    );
    const mine = await createEventDraft(actorPersonId, draft());

    const list = await listCurrentSeasonEvents();
    const unfilteredTotal = list.totalInSeason;

    expect(list.events.map((row) => row.id)).toContain(mine.id);
    expect(list.events.map((row) => row.id)).not.toContain(foreign.rows[0].id);

    // And the season total is the season's, not the database's.
    const inSeason = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.events where season_id = $1",
      [mine.seasonId],
    );
    expect(unfilteredTotal).toBe(Number(inSeason.rows[0].count));

    const everything = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.events",
    );
    expect(unfilteredTotal).toBeLessThan(Number(everything.rows[0].count));
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
