// @vitest-environment node
/**
 * The approval transaction — LAN-77.
 *
 * Against the **real** local database, and it has to be. Everything this suite
 * asserts is a property of PostgreSQL doing what the schema says: five tables
 * written or none of them, a status guard in a `where` clause winning a race, a
 * unique index turning a retry into a refusal, a composite foreign key refusing
 * an invitation against a draft. A mocked transaction commits because the mock
 * says so and can demonstrate none of it.
 *
 * Every row this suite writes hangs off an event whose name carries
 * `NAME_MARKER`, and `afterEach` deletes exactly those, in dependency order.
 * The marker is unique to this file: Vitest runs suites in parallel against one
 * database, and a shared marker means one suite deleting another's fixtures.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { COACH_ROLE_CODES } from "@/lib/auth/capabilities";
import { closePool, isServiceError, withTransaction, type ServiceError } from "@/lib/db";
import {
  approveEvent,
  readApprovalPreview,
  readEventAudience,
  saveEventAudience,
} from "./event-approval";
import {
  EMPTY_AUDIENCE_MESSAGE,
  EMPTY_AUDIENCE_RULE,
  listAudienceCatalogueIn,
  resolveSelection,
  selectionKey,
  type AudienceCatalogue,
} from "./event-audience";
import { createEventDraft, readEvent, updateEventDraft, type EventDraftInput } from "./events";
import { responseDeadlineRule, RESPONSE_DEADLINE_RULES } from "./response-deadline";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const NAME_MARKER = "LAN77ApprovalSuite";

let observer: Client;
let actorPersonId: string;
let seededPeople: Set<string>;

beforeAll(async () => {
  observer = await openObserver();
  const people = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id",
    [await seededIdentityCreatedAt(observer)],
  );
  seededPeople = new Set(people.rows.map((row) => row.id));

  // A pass produced by an empty cohort is not a pass — and if the seed's
  // timestamp ever changes, this is where it says so rather than silently
  // narrowing every audience in this file to nobody.
  expect(seededPeople.size).toBeGreaterThan(20);

  actorPersonId = people.rows[0].id;
});

/**
 * Dependency order, and every step matters: jobs reference invitations
 * `on delete restrict`, invitations reference the audience through the composite
 * key that binds them to it, and the audience references the event.
 */
afterEach(async () => {
  const scope = `${NAME_MARKER}%`;
  const events = "(select id from public.events where name like $1)";
  await observer.query(`delete from public.notification_jobs where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.invitations where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.event_audience_members where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.audit_events where entity_table = 'events' and entity_id in ${events}`,
    [scope],
  );
  await observer.query("delete from public.events where name like $1", [scope]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

function draft(overrides: Partial<EventDraftInput> = {}): EventDraftInput {
  return {
    name: `${NAME_MARKER} Sunday practice`,
    eventType: "practice",
    scheduledOn: "2026-10-18",
    startsAt: "10:00",
    endsAt: "13:00",
    venue: "University Parks",
    isMandatory: true,
    solicitsResponse: true,
    ...overrides,
  };
}

async function newDraft(overrides: Partial<EventDraftInput> = {}) {
  return createEventDraft(actorPersonId, draft(overrides));
}

/**
 * A draft of an event type LAN-76's form cannot produce.
 *
 * `DRAFTABLE_EVENT_TYPES` is narrower than `public.event_type` on purpose — the
 * form has no opponent or headcount field — but the approval path and the
 * deadline configuration cover every type in the enum, so proving those needs a
 * row the form would refuse to make.
 */
async function insertDraftDirectly(input: {
  name: string;
  eventType: string;
  scheduledOn: string;
  /** `null` for the confirmed-date-but-no-kick-off case, which is legal. */
  startsAt?: string | null;
}): Promise<{ id: string; seasonId: string; scheduledOn: string }> {
  const season = await observer.query<{ id: string }>(
    "select id from public.seasons where status = 'active' order by starts_on desc limit 1",
  );
  const inserted = await observer.query<{ id: string }>(
    `insert into public.events
       (season_id, name, event_type, origin, status, scheduled_on, starts_at,
        is_mandatory, solicits_response, owner_person_id)
     values ($1, $2, $3::public.event_type, 'club_controlled', 'draft', $4, $6::time,
             true, true, $5)
     returning id`,
    [
      season.rows[0].id,
      input.name,
      input.eventType,
      input.scheduledOn,
      actorPersonId,
      input.startsAt === undefined ? "19:00" : input.startsAt,
    ],
  );
  return {
    id: inserted.rows[0].id,
    seasonId: season.rows[0].id,
    scheduledOn: input.scheduledOn,
  };
}

/**
 * The catalogue an operator would be offered for this event, narrowed to the
 * seeded cohort — see `seededIdentityCreatedAt`.
 *
 * The narrowing is this suite's isolation, not a property of the code under
 * test: `listAudienceCatalogueIn` is called exactly as the application calls it,
 * and only the rows this file is willing to *invite* are filtered afterwards.
 */
async function catalogueFor(event: {
  seasonId: string;
  scheduledOn: string | null;
}): Promise<AudienceCatalogue> {
  const full = await withTransaction((tx) =>
    listAudienceCatalogueIn(tx, event.seasonId, event.scheduledOn),
  );
  const candidates = full.candidates.filter((candidate) => seededPeople.has(candidate.personId));
  return {
    candidates,
    counts: {
      player: candidates.filter((candidate) => candidate.capacity === "player").length,
      coach: candidates.filter((candidate) => candidate.capacity === "coach").length,
      committee: candidates.filter((candidate) => candidate.capacity === "committee").length,
    },
  };
}

async function keysFor(
  event: { seasonId: string; scheduledOn: string | null },
  capacity: "player" | "coach" | "committee",
  limit = 3,
): Promise<string[]> {
  const catalogue = await catalogueFor(event);
  return catalogue.candidates
    .filter((candidate) => candidate.capacity === capacity)
    .slice(0, limit)
    .map((candidate) => candidate.key);
}

/**
 * Propose an audience and approve it — the two steps the screen performs.
 *
 * They are separate service calls now that the audience is stored against the
 * draft, and almost every test here cares about the pair rather than about the
 * seam between them. The tests that *do* care about the seam call the two
 * functions directly.
 */
async function approve(eventId: string, keys: readonly string[]) {
  await saveEventAudience(actorPersonId, eventId, keys);
  return approveEvent(actorPersonId, eventId);
}

async function countsFor(eventId: string) {
  const row = await observer.query<{
    audience: string;
    invitations: string;
    jobs: string;
    uninvited: string;
  }>(
    `select
       (select count(*) from public.event_audience_members where event_id = $1) as audience,
       (select count(*) from public.invitations where event_id = $1) as invitations,
       (select count(*) from public.notification_jobs where event_id = $1) as jobs,
       (select count(*) from public.uninvited_audience_members where event_id = $1) as uninvited`,
    [eventId],
  );
  const { audience, invitations, jobs, uninvited } = row.rows[0];
  return {
    audience: Number(audience),
    invitations: Number(invitations),
    jobs: Number(jobs),
    uninvited: Number(uninvited),
  };
}

async function caught(run: () => Promise<unknown>): Promise<ServiceError> {
  try {
    await run();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return error;
  }
  throw new Error("Expected the call to be refused, and it was not.");
}

// ---------------------------------------------------------------------------
// Invariant E1b — the refusal that has to happen above the database
// ---------------------------------------------------------------------------

describe("an empty audience is refused by the service layer", () => {
  it("refuses to approve, and the database would not have", async () => {
    const event = await newDraft();

    const error = await caught(() => approve(event.id, []));

    expect(error.kind).toBe("constraint_violated");
    expect(error.rule).toBe(EMPTY_AUDIENCE_RULE);
    expect(error.message).toMatch(/Choose who this event is for/);

    // The point of E1b: nothing below this refusal would have stopped it.
    // `tests/schema-event-audience.test.ts` asserts the database accepts an
    // approved event with no audience rows at all, which is why the sentence
    // above is the only thing standing between an approver and a silent
    // no-recipient approval.
    const after = await readEvent(event.id);
    expect(after.status).toBe("draft");
    expect(await countsFor(event.id)).toEqual({
      audience: 0,
      invitations: 0,
      jobs: 0,
      uninvited: 0,
    });
  });

  it("reports the same refusal to the browser as the service does", () => {
    const catalogue: AudienceCatalogue = {
      candidates: [],
      counts: { player: 0, coach: 0, committee: 0 },
    };

    // The builder reads the result form, so it can count people without a round
    // trip; the service throws. Both have to carry the same sentence, or the
    // operator gets one message on screen and another in the log.
    const pure = resolveSelection(catalogue.candidates, []);
    expect(pure.ok).toBe(false);
    expect(pure.ok === false && pure.failure).toBe("empty");
    expect(pure.ok === false && pure.message).toBe(EMPTY_AUDIENCE_MESSAGE);
  });

  it("saves an empty audience on a draft, and refuses to approve it", async () => {
    const event = await newDraft();

    // Clearing a selection is a thing an operator has to be able to do, so the
    // proposal accepts nothing. Invariant E1b is about *approving*, and that is
    // where it bites.
    await expect(saveEventAudience(actorPersonId, event.id, [])).resolves.toEqual([]);

    const error = await caught(() => approveEvent(actorPersonId, event.id));
    expect(error.rule).toBe(EMPTY_AUDIENCE_RULE);
    expect((await readEvent(event.id)).status).toBe("draft");
  });

  it("refuses to change the audience once the event is approved", async () => {
    const event = await newDraft();
    const keys = await keysFor(event, "player", 2);
    await approve(event.id, keys);

    // The freeze, as a refusal rather than as an absent button. Both write
    // paths guard on `status = 'draft'`.
    const error = await caught(() => saveEventAudience(actorPersonId, event.id, keys));
    expect(error.kind).toBe("invalid_transition");
    expect(error.message).toMatch(/Only a draft's audience can be changed/);
  });

  it("keeps a proposed audience when the draft is edited", async () => {
    const event = await newDraft();
    const keys = await keysFor(event, "player", 3);
    await saveEventAudience(actorPersonId, event.id, keys);

    // The whole point of storing it: editing the event must not lose forty
    // people because somebody fixed a typo in the venue.
    await updateEventDraft(actorPersonId, event.id, draft({ venue: "A different pitch" }));

    const audience = await readEventAudience(event.id);
    expect(audience).toHaveLength(3);
    expect((await readEvent(event.id)).venue).toBe("A different pitch");
  });
});

// ---------------------------------------------------------------------------
// The successful approval, and everything it has to produce at once
// ---------------------------------------------------------------------------

describe("a successful approval", () => {
  it("writes the audience, the approval, the invitations, the jobs and the audit", async () => {
    const event = await newDraft();
    const keys = await keysFor(event, "player", 4);

    const outcome = await approve(event.id, keys);

    expect(outcome.members).toHaveLength(4);
    expect(outcome.invitationCount).toBe(4);
    expect(outcome.notificationJobCount).toBe(4);

    const stored = await observer.query<{
      status: string;
      approved_at: Date | null;
      approved_by_person_id: string | null;
      audience_confirmed_at: Date | null;
      audience_confirmed_by_person_id: string | null;
    }>(
      `select status::text as status, approved_at, approved_by_person_id,
              audience_confirmed_at, audience_confirmed_by_person_id
         from public.events where id = $1`,
      [event.id],
    );
    const row = stored.rows[0];
    expect(row.status).toBe("approved");
    expect(row.approved_at).not.toBeNull();
    expect(row.approved_by_person_id).toBe(actorPersonId);
    expect(row.audience_confirmed_at).not.toBeNull();
    expect(row.audience_confirmed_by_person_id).toBe(actorPersonId);

    expect(await countsFor(event.id)).toEqual({
      audience: 4,
      invitations: 4,
      jobs: 4,
      // Invariant P7's approval defect. Empty is the whole point: everyone the
      // approver confirmed was actually asked.
      uninvited: 0,
    });
  });

  it("anchors a player invitation to the membership and never to the person — invariant P8", async () => {
    const event = await newDraft();
    const keys = await keysFor(event, "player", 2);

    await approve(event.id, keys);

    const rows = await observer.query<{
      capacity: string;
      season_membership_id: string | null;
      person_id: string | null;
    }>(
      `select capacity::text as capacity, season_membership_id, person_id
         from public.invitations where event_id = $1`,
      [event.id],
    );
    expect(rows.rows).toHaveLength(2);
    for (const invitation of rows.rows) {
      expect(invitation.capacity).toBe("player");
      expect(invitation.season_membership_id).not.toBeNull();
      expect(invitation.person_id).toBeNull();
    }
  });

  it("anchors a committee invitation to the person and never to a membership", async () => {
    const event = await newDraft();
    const keys = await keysFor(event, "committee", 2);
    expect(keys.length).toBeGreaterThan(0);

    await approve(event.id, keys);

    const rows = await observer.query<{
      capacity: string;
      season_membership_id: string | null;
      person_id: string | null;
    }>(
      `select capacity::text as capacity, season_membership_id, person_id
         from public.invitations where event_id = $1`,
      [event.id],
    );
    for (const invitation of rows.rows) {
      expect(invitation.capacity).toBe("committee");
      expect(invitation.person_id).not.toBeNull();
      expect(invitation.season_membership_id).toBeNull();
    }
  });

  it("gives every notification job a distinct idempotency key on an automated channel", async () => {
    const event = await newDraft();
    const keys = await keysFor(event, "player", 5);

    await approve(event.id, keys);

    const jobs = await observer.query<{
      idempotency_key: string;
      job_type: string;
      status: string;
      channel: string | null;
      invitation_id: string | null;
      person_id: string | null;
    }>(
      `select idempotency_key, job_type::text as job_type, status::text as status,
              channel::text as channel, invitation_id, person_id
         from public.notification_jobs where event_id = $1`,
      [event.id],
    );

    expect(jobs.rows).toHaveLength(5);
    expect(new Set(jobs.rows.map((job) => job.idempotency_key)).size).toBe(5);

    // The exact shape, asserted rather than left implicit. Invariant M1 wants a
    // key derived from facts that do not change, and this is the derivation:
    // `event:<event>:invitation:<capacity>:<participant>`. The LAN-77 pilot
    // scenario plants a colliding key in this format to make rollback
    // observable by hand, and `tests/pilot-scenario-lan-77.test.ts` asserts the
    // same shape from the other side, so a change here fails in both places.
    const members = await observer.query<{ capacity: string; participant_id: string }>(
      `select capacity::text as capacity, participant_id
         from public.event_audience_members where event_id = $1`,
      [event.id],
    );
    const expected = members.rows.map(
      (member) => `event:${event.id}:invitation:${member.capacity}:${member.participant_id}`,
    );
    expect(jobs.rows.map((job) => job.idempotency_key).sort()).toEqual(expected.sort());
    for (const job of jobs.rows) {
      expect(job.job_type).toBe("invitation");
      expect(job.status).toBe("pending");
      // Provider-neutral and automated. `manual` here would encode copy-and-post
      // as this slice's delivery path, which LAN-77 explicitly forbids.
      expect(job.channel).toBe("whatsapp");
      expect(job.invitation_id).not.toBeNull();
      expect(job.person_id).not.toBeNull();
    }
  });

  it("records who approved it, and what they approved, in the audit trail", async () => {
    const event = await newDraft();
    const keys = await keysFor(event, "player", 3);

    await approve(event.id, keys);

    const audit = await observer.query<{
      action: string;
      actor_person_id: string | null;
      from_state: string | null;
      to_state: string | null;
      context: Record<string, unknown>;
    }>(
      `select action, actor_person_id, from_state, to_state, context
         from public.audit_events
        where entity_table = 'events' and entity_id = $1
        order by occurred_at, action`,
      [event.id],
    );

    const actions = audit.rows.map((entry) => entry.action);
    expect(actions).toContain("event.audience_confirmed");
    expect(actions).toContain("event.approved");

    const approved = audit.rows.find((entry) => entry.action === "event.approved");
    expect(approved?.actor_person_id).toBe(actorPersonId);
    expect(approved?.from_state).toBe("draft");
    expect(approved?.to_state).toBe("approved");
    expect(approved?.context).toMatchObject({
      audienceSize: 3,
      invitationsCreated: 3,
      notificationJobsCreated: 3,
    });
  });
});

// ---------------------------------------------------------------------------
// Atomicity — the failure case is the one that matters
// ---------------------------------------------------------------------------

describe("a failure inside the transaction leaves the event untouched", () => {
  it("rolls back the approval and the invitations when the jobs collide", async () => {
    const event = await newDraft();
    const keys = await keysFor(event, "player", 3);

    // Pre-claim the idempotency key the approval is about to generate for one
    // invitee. This is a genuine mid-transaction failure at the *last* write —
    // by the time it fires, the event has been flipped to approved, the audience
    // is in and the invitations are in, so it proves rollback rather than
    // proving an early refusal.
    const catalogue = await catalogueFor(event);
    const first = catalogue.candidates.find((candidate) => candidate.key === keys[0]);
    const collidingKey = `event:${event.id}:invitation:player:${first?.anchorId}`;
    await observer.query(
      `insert into public.notification_jobs (idempotency_key, job_type, status, event_id)
       values ($1, 'invitation', 'pending', $2)`,
      [collidingKey, event.id],
    );

    const error = await caught(() => approve(event.id, keys));
    expect(error.kind).toBe("conflict");

    const after = await readEvent(event.id);
    expect(after.status).toBe("draft");

    const counts = await countsFor(event.id);
    // The audience survives, and should: it was committed as a *proposal* in an
    // earlier transaction, and the operator has not lost the forty people they
    // picked because the approval failed. What rolled back is the approval.
    expect(counts.audience).toBe(3);
    expect(counts.invitations).toBe(0);
    // Only the row this test planted; the approval created none.
    expect(counts.jobs).toBe(1);

    const audit = await observer.query<{ action: string }>(
      `select action from public.audit_events where entity_table = 'events' and entity_id = $1`,
      [event.id],
    );
    expect(audit.rows.map((entry) => entry.action)).not.toContain("event.approved");
  });
});

// ---------------------------------------------------------------------------
// Double submission
// ---------------------------------------------------------------------------

describe("approving twice", () => {
  it("refuses the second attempt and creates no duplicate jobs", async () => {
    const event = await newDraft();
    const keys = await keysFor(event, "player", 3);

    await approve(event.id, keys);
    const before = await countsFor(event.id);

    // The second press approves again; it does not re-propose. Re-proposing is
    // separately refused — an approved event's audience is frozen — and that is
    // asserted in its own test below.
    const error = await caught(() => approveEvent(actorPersonId, event.id));
    expect(error.kind).toBe("invalid_transition");
    expect(error.message).toMatch(/Only a draft can be approved/);
    expect(error.message).toMatch(/already approved/);

    expect(await countsFor(event.id)).toEqual(before);
  });

  it("survives two simultaneous approvals, committing exactly one", async () => {
    const event = await newDraft();
    const keys = await keysFor(event, "player", 3);

    await saveEventAudience(actorPersonId, event.id, keys);

    const results = await Promise.allSettled([
      approveEvent(actorPersonId, event.id),
      approveEvent(actorPersonId, event.id),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    expect(await countsFor(event.id)).toEqual({
      audience: 3,
      invitations: 3,
      jobs: 3,
      uninvited: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Invariant E6 — solicitation decides whether an obligation exists at all
// ---------------------------------------------------------------------------

describe("invariant E6 — deadlines exist only where a response was asked for", () => {
  it("gives a response-soliciting event's invitations the configured deadline", async () => {
    const event = await newDraft({ eventType: "practice", scheduledOn: "2026-10-18" });
    const keys = await keysFor(event, "player", 2);

    const outcome = await approve(event.id, keys);
    expect(outcome.deadline).not.toBeNull();
    expect(outcome.deadline?.clamped).toBe(false);
    expect(outcome.deadline?.rule).toEqual(RESPONSE_DEADLINE_RULES.practice);

    const rows = await observer.query<{ expires_at: Date | null; deadline: Date | null }>(
      `select i.expires_at, e.response_deadline_at as deadline
         from public.invitations i join public.events e on e.id = i.event_id
        where i.event_id = $1`,
      [event.id],
    );
    for (const row of rows.rows) {
      expect(row.expires_at).not.toBeNull();
      expect(row.expires_at?.toISOString()).toBe(row.deadline?.toISOString());
    }

    // Brian's rule for a practice: two days before, at 18:00 Europe/London.
    // 18 October 2026 is inside British Summer Time, so 18:00 local is 17:00Z —
    // which is exactly the case a fixed offset would get wrong.
    expect(rows.rows[0].expires_at?.toISOString()).toBe("2026-10-16T17:00:00.000Z");
  });

  it("gives a non-soliciting event no deadline anywhere, so nothing can expire", async () => {
    const event = await newDraft({ solicitsResponse: false });
    const keys = await keysFor(event, "player", 2);

    const outcome = await approve(event.id, keys);
    expect(outcome.deadline).toBeNull();

    const rows = await observer.query<{ expires_at: Date | null; deadline: Date | null }>(
      `select i.expires_at, e.response_deadline_at as deadline
         from public.invitations i join public.events e on e.id = i.event_id
        where i.event_id = $1`,
      [event.id],
    );
    for (const row of rows.rows) {
      expect(row.expires_at).toBeNull();
      expect(row.deadline).toBeNull();
    }

    // The other half of E6, proved against the database rather than asserted:
    // such an invitation can never reach `expired`, so it can never enter the
    // nonresponse escalation stream.
    const invitationId = (
      await observer.query<{ id: string }>(
        "select id from public.invitations where event_id = $1 limit 1",
        [event.id],
      )
    ).rows[0].id;

    await expect(
      observer.query("update public.invitations set status = 'expired' where id = $1", [
        invitationId,
      ]),
    ).rejects.toThrow(/invitations_expire_only_when_asked/);
  });
});

// ---------------------------------------------------------------------------
// The deadline rules themselves — Brian's decision of 13 August 2026
// ---------------------------------------------------------------------------

describe("the configured response deadlines", () => {
  it("gives a fixture seven days rather than a practice's two", async () => {
    // Inserted rather than drafted: LAN-76's form deliberately cannot create a
    // fixture, because it has no opponent, side or competition field. The event
    // type is real, the schema carries it, later issues create it — and the
    // seven-day rule has to be proved against it rather than assumed from the
    // configuration table.
    const event = await insertDraftDirectly({
      name: `${NAME_MARKER} Away fixture`,
      eventType: "fixture",
      scheduledOn: "2026-10-18",
    });
    const keys = await keysFor(event, "player", 1);

    const outcome = await approve(event.id, keys);

    expect(outcome.deadline?.rule.daysBefore).toBe(7);
    expect(outcome.deadline?.at.toISOString()).toBe("2026-10-11T17:00:00.000Z");
  });

  it("clamps a deadline that has already passed to the approval moment", async () => {
    // Approving a practice for tomorrow: the rule puts the deadline yesterday.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const event = await newDraft({ scheduledOn: tomorrow });
    const keys = await keysFor(event, "player", 1);

    const outcome = await approve(event.id, keys);

    expect(outcome.deadline?.clamped).toBe(true);
    expect(outcome.deadline?.configuredAt.getTime()).toBeLessThan(outcome.deadline!.at.getTime());

    // Responses are due immediately, not at some invented future moment, and not
    // in the past either — approval is never refused for being late.
    const stored = await observer.query<{ expires_at: Date }>(
      "select expires_at from public.invitations where event_id = $1 limit 1",
      [event.id],
    );
    expect(stored.rows[0].expires_at.toISOString()).toBe(outcome.deadline?.at.toISOString());
  });
});

// ---------------------------------------------------------------------------
// De-duplication
// ---------------------------------------------------------------------------

describe("overlapping selections", () => {
  it("collapses the same key listed twice into one audience member", async () => {
    const event = await newDraft();
    const keys = await keysFor(event, "player", 2);

    const outcome = await approve(event.id, [...keys, ...keys]);

    expect(outcome.members).toHaveLength(2);
    expect(await countsFor(event.id)).toMatchObject({ audience: 2, invitations: 2, jobs: 2 });
  });

  it("gives one person qualifying in two capacities a single invitation", async () => {
    const event = await newDraft();
    const catalogue = await catalogueFor(event);

    // Someone on the roster who also holds a committee seat — the frozen model's
    // "the President is also a player", which the seeded club really contains.
    const players = new Map(
      catalogue.candidates
        .filter((candidate) => candidate.capacity === "player")
        .map((candidate) => [candidate.personId, candidate]),
    );
    const overlap = catalogue.candidates.find(
      (candidate) => candidate.capacity !== "player" && players.has(candidate.personId),
    );
    expect(overlap, "the seeded club should contain a player who also holds a role").toBeDefined();

    const playerKey = players.get(overlap!.personId)!.key;
    const outcome = await approve(event.id, [playerKey, overlap!.key]);

    expect(outcome.members).toHaveLength(1);
    // Player wins, per CAPACITY_PRECEDENCE, and the anchor follows the capacity.
    expect(outcome.members[0].capacity).toBe("player");
    expect(await countsFor(event.id)).toMatchObject({ audience: 1, invitations: 1, jobs: 1 });
  });
});

// ---------------------------------------------------------------------------
// A selection that no longer resolves
// ---------------------------------------------------------------------------

describe("a stale or forged selection", () => {
  it("refuses a player key naming a person rather than a membership", async () => {
    const event = await newDraft();
    const catalogue = await catalogueFor(event);
    const committee = catalogue.candidates.find((candidate) => candidate.capacity === "committee");

    // Invariant P8 as an attack rather than an accident: the browser posts a
    // player-capacity key whose anchor is a person id. It matches no candidate,
    // so it never reaches the database's anchor check.
    const forged = selectionKey("player", committee!.anchorId);

    const error = await caught(() => approve(event.id, [forged]));
    expect(error.kind).toBe("constraint_violated");
    expect(error.message).toMatch(/no longer selectable/);

    expect((await readEvent(event.id)).status).toBe("draft");
  });

  it("refuses rather than silently shrinking the confirmed list", async () => {
    const event = await newDraft();
    const keys = await keysFor(event, "player", 2);

    const error = await caught(() =>
      approve(event.id, [...keys, "player:00000000-0000-0000-0000-000000000000"]),
    );

    expect(error.message).toMatch(/no longer selectable/);
    expect(await countsFor(event.id)).toMatchObject({ audience: 0, invitations: 0 });
  });
});

// ---------------------------------------------------------------------------
// The preview the approver actually reads
// ---------------------------------------------------------------------------

describe("the approval preview", () => {
  it("offers coaches for an event inside the season, not an empty coaching list", async () => {
    const event = await newDraft({ scheduledOn: "2026-10-18" });

    const preview = await readApprovalPreview(event.id);

    // The season's coaches are appointed from 1 September 2026, which is after
    // "today" in this dataset — a catalogue resolved as of now would show none.
    expect(preview.catalogue.counts.coach).toBeGreaterThan(0);
    expect(preview.catalogue.counts.player).toBeGreaterThan(0);
    expect(preview.deadline?.at.toISOString()).toBe("2026-10-16T17:00:00.000Z");
  });

  it("shows no deadline for an event that solicits no response", async () => {
    const event = await newDraft({ solicitsResponse: false });
    const preview = await readApprovalPreview(event.id);
    expect(preview.deadline).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Every configured event type, and the two anchoring cases
// ---------------------------------------------------------------------------

describe("every event type in the enum gets the deadline Brian configured", () => {
  /**
   * The whole table, not a sample. `RESPONSE_DEADLINE_RULES` is complete over
   * `public.event_type` on purpose — there is no default arm — so proving it
   * type by type is what stops a future enum value being added with no rule and
   * silently inheriting two days from somebody's `??`.
   *
   * The event date is fixed at 18 October 2026, inside British Summer Time, so
   * every expectation below is 17:00Z for an 18:00 local deadline. A rule that
   * subtracted a fixed offset instead of resolving the wall clock would pass a
   * winter test and fail all ten of these.
   */
  const EXPECTED: ReadonlyArray<readonly [type: string, expiresAt: string]> = [
    ["practice", "2026-10-16T17:00:00.000Z"],
    ["strength_and_conditioning", "2026-10-16T17:00:00.000Z"],
    ["chalk", "2026-10-16T17:00:00.000Z"],
    ["fixture", "2026-10-11T17:00:00.000Z"],
    ["social", "2026-10-13T17:00:00.000Z"],
    ["recruitment", "2026-10-16T17:00:00.000Z"],
    ["camp", "2026-10-11T17:00:00.000Z"],
    ["varsity", "2026-10-11T17:00:00.000Z"],
    ["meeting", "2026-10-16T17:00:00.000Z"],
    ["other", "2026-10-16T17:00:00.000Z"],
  ];

  it("covers the enum exactly, with no type left untested", async () => {
    const declared = await observer.query<{ value: string }>(
      `select unnest(enum_range(null::public.event_type))::text as value order by 1`,
    );
    expect(declared.rows.map((row) => row.value).sort()).toEqual(
      EXPECTED.map(([type]) => type).sort(),
    );
    expect(Object.keys(RESPONSE_DEADLINE_RULES).sort()).toEqual(
      EXPECTED.map(([type]) => type).sort(),
    );
  });

  it.each(EXPECTED)("a %s deadline lands at %s", async (eventType, expiresAt) => {
    const event = await insertDraftDirectly({
      name: `${NAME_MARKER} ${eventType}`,
      eventType,
      scheduledOn: "2026-10-18",
    });
    const keys = await keysFor(event, "player", 1);

    const outcome = await approve(event.id, keys);

    expect(outcome.deadline?.at.toISOString()).toBe(expiresAt);
    expect(outcome.deadline?.clamped).toBe(false);

    const stored = await observer.query<{ expires_at: Date }>(
      "select expires_at from public.invitations where event_id = $1",
      [event.id],
    );
    expect(stored.rows[0].expires_at.toISOString()).toBe(expiresAt);
  });

  it("anchors to the date alone, so an event with no start time still gets one", async () => {
    // `events.starts_at` is nullable and the club relies on it: a confirmed
    // fixture date routinely arrives long before a kick-off time. A deadline
    // rule expressed relative to the start would have nothing to subtract from
    // here; this one never reads `starts_at` at all.
    const event = await insertDraftDirectly({
      name: `${NAME_MARKER} Dateless kickoff`,
      eventType: "practice",
      scheduledOn: "2026-10-18",
      startsAt: null,
    });
    const keys = await keysFor(event, "player", 1);

    const outcome = await approve(event.id, keys);

    expect(outcome.deadline?.at.toISOString()).toBe("2026-10-16T17:00:00.000Z");

    const stored = await observer.query<{ starts_at: string | null; expires_at: Date }>(
      `select e.starts_at::text as starts_at, i.expires_at
         from public.events e join public.invitations i on i.event_id = e.id
        where e.id = $1`,
      [event.id],
    );
    expect(stored.rows[0].starts_at).toBeNull();
    expect(stored.rows[0].expires_at.toISOString()).toBe("2026-10-16T17:00:00.000Z");
  });

  it("resolves the wall clock either side of a British Summer Time change", async () => {
    // 18:00 local is 17:00Z in October and 18:00Z in January. One rule, two
    // offsets — which is why the arithmetic is PostgreSQL's and not a constant.
    const summer = await insertDraftDirectly({
      name: `${NAME_MARKER} Summer time`,
      eventType: "practice",
      scheduledOn: "2026-10-18",
    });
    const winter = await insertDraftDirectly({
      name: `${NAME_MARKER} Winter time`,
      eventType: "practice",
      scheduledOn: "2027-01-20",
    });

    const summerOutcome = await approve(summer.id, await keysFor(summer, "player", 1));
    const winterOutcome = await approve(winter.id, await keysFor(winter, "player", 1));

    expect(summerOutcome.deadline?.at.toISOString()).toBe("2026-10-16T17:00:00.000Z");
    expect(winterOutcome.deadline?.at.toISOString()).toBe("2027-01-18T18:00:00.000Z");
  });

  it("refuses an event type nobody has agreed a deadline for", () => {
    // The absence of a default arm, as a behaviour rather than as a code
    // reading. Widening `public.event_type` without deciding its deadline makes
    // approval fail loudly here instead of inheriting two days.
    expect(() => responseDeadlineRule("kit_collection")).toThrowError(
      /No response deadline has been agreed/,
    );
  });
});

// ---------------------------------------------------------------------------
// A proposed audience must not look like a defect
// ---------------------------------------------------------------------------

describe("an audience proposed against a draft", () => {
  it("does not appear as an approval defect or in the nonresponse queue", async () => {
    const event = await newDraft();
    const keys = await keysFor(event, "player", 3);

    await saveEventAudience(actorPersonId, event.id, keys);

    // Storing an audience before approval is new, and the two operational views
    // read `event_audience_members`. If a draft's proposal leaked into either,
    // every unapproved event would show up as people the club failed to invite —
    // which is exactly the defect `uninvited_audience_members` exists to report.
    const leaked = await observer.query<{ uninvited: string; queued: string; partition: string }>(
      `select
         (select count(*) from public.uninvited_audience_members where event_id = $1) as uninvited,
         (select count(*) from public.nonresponse_queue where event_id = $1) as queued,
         (select count(*) from public.invitation_response_state
           where event_id = $1 and response_state = 'never_invited') as partition`,
      [event.id],
    );
    expect(Number(leaked.rows[0].uninvited)).toBe(0);
    expect(Number(leaked.rows[0].queued)).toBe(0);

    // And the honest other half, pinned rather than glossed: the raw P7
    // partition *does* include a draft's proposal, because it spans every
    // response-soliciting event whatever its status. That is literally true and
    // operationally meaningless, nothing in the slice reads the view directly,
    // and whether it should exclude drafts is a schema question for Brian —
    // see docs/adr/0022-audience-proposed-then-frozen.md.
    expect(Number(leaked.rows[0].partition)).toBe(3);

    // And invariant P1 still holds: a draft carries no invitations at all.
    expect(await countsFor(event.id)).toMatchObject({ audience: 3, invitations: 0, jobs: 0 });
  });

  it("becomes reportable the moment it is approved, and reports nothing wrong", async () => {
    const event = await newDraft();
    const keys = await keysFor(event, "player", 3);

    await approve(event.id, keys);

    expect(await countsFor(event.id)).toMatchObject({ audience: 3, invitations: 3, uninvited: 0 });

    // Every audience member is now an invitee awaiting a response — P7's
    // five-way partition, with nobody in `never_invited`.
    const states = await observer.query<{ response_state: string; count: string }>(
      `select response_state, count(*)::text as count
         from public.invitation_response_state where event_id = $1
        group by 1`,
      [event.id],
    );
    expect(states.rows).toEqual([{ response_state: "awaiting_response", count: "3" }]);
  });
});

// ---------------------------------------------------------------------------
// The interleaving independent review proved, and the lock that closes it
// ---------------------------------------------------------------------------

describe("a concurrent audience change cannot undermine an approval in flight", () => {
  /**
   * `withTransaction` opens a plain `begin`, so isolation is READ COMMITTED.
   * That is not enough on its own for a read-then-write spanning several tables:
   * before `lockEventIn`, `approveEvent` read the audience and *then* flipped the
   * status, while `saveEventAudience` checked the status with a plain `select`
   * that does not block on an uncommitted `update` — so it deleted the audience
   * rows out from under an approval that had already decided to invite them.
   *
   * The committed result was an approved event with no audience and no
   * invitations: the exact state invariant E1b exists to prevent, and one
   * `uninvited_audience_members` cannot report, because there are no audience
   * rows left to report on.
   *
   * These two tests run the interleaving for real. They are deliberately not
   * `Promise.all` races — a race that happens to pass proves nothing. Each drives
   * the two transactions to the precise point where they used to interfere.
   */

  it("does not rewrite the audience of an event that was approved while it waited", async () => {
    // The mirror of the test above, and the direction that was still uncovered.
    //
    // `saveEventAudience` checks the status with a plain `select`, which does
    // **not** block on another transaction's uncommitted `update`. Without the
    // row lock it therefore reads `draft`, proceeds, and deletes the audience of
    // an event that is being approved at that very moment — leaving an approved
    // event whose audience no longer matches the invitations it just created.
    //
    // Locking first makes it wait, see `approved`, and refuse.
    const event = await newDraft();
    const keys = await keysFor(event, "player", 3);
    await saveEventAudience(actorPersonId, event.id, keys);

    const rival = await openObserver();
    try {
      await rival.query("begin");
      // FOR KEY SHARE, deliberately, and not FOR UPDATE.
      //
      // The rival is standing in for a second service call, so the lock it holds
      // decides what this test can detect. A rival holding FOR UPDATE blocks any
      // lock mode the service might take — including FOR SHARE, which conflicts
      // with FOR UPDATE but *not with itself*, and which therefore would not fix
      // the defect at all: two real service calls would both acquire it and
      // interleave exactly as before.
      //
      // FOR KEY SHARE conflicts with FOR UPDATE and with nothing weaker, so this
      // test now fails if the service takes anything less than an exclusive lock.
      // Independent review found the earlier version could not tell the two apart.
      await rival.query("select id from public.events where id = $1 for key share", [event.id]);

      const save = saveEventAudience(actorPersonId, event.id, []).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );

      // Long enough that an implementation which does not lock first has read
      // the status, deleted the rows and committed.
      await new Promise((resolve) => setTimeout(resolve, 300));

      // The rival's approval commits while the save is waiting.
      await rival.query(
        `update public.events
            set status = 'approved', approved_at = now(), approved_by_person_id = $2,
                audience_confirmed_at = now(), audience_confirmed_by_person_id = $2
          where id = $1`,
        [event.id, actorPersonId],
      );
      await rival.query("commit");

      const settled = await save;

      expect(settled.ok, "the audience was rewritten under an approved event").toBe(false);
      if (!settled.ok) {
        const error = settled.error as ServiceError;
        expect(error.kind).toBe("invalid_transition");
        expect(error.message).toMatch(/Only a draft's audience can be changed/);
      }
    } finally {
      await rival.end();
    }

    // The audience the approval was based on is intact.
    expect(await countsFor(event.id)).toMatchObject({ audience: 3 });
  });

  it("does not approve an audience that was deleted while it waited", async () => {
    // The interleaving itself, driven deterministically rather than raced.
    //
    // A rival connection takes the event's row lock and holds it. The approval
    // then starts. Whether it blocks *before* or *after* reading the audience is
    // the entire question, and this is what makes the two implementations
    // produce different committed states:
    //
    //   * locking first  -> it is still waiting when the rival deletes the
    //                       audience, so it reads zero members afterwards and
    //                       refuses under invariant E1b. The event stays a draft.
    //   * reading first  -> it has already read three members. The rival deletes
    //                       them, the guarded update then unblocks and succeeds,
    //                       and the invitations are selected from an audience
    //                       table that is now empty. Committed result: an
    //                       APPROVED event with zero invitations.
    //
    // The second is the state independent review reproduced against the merged
    // code, and it is unreportable — `uninvited_audience_members` reads the
    // audience, and there is no audience left.
    const event = await newDraft();
    const keys = await keysFor(event, "player", 3);
    await saveEventAudience(actorPersonId, event.id, keys);

    const rival = await openObserver();
    try {
      await rival.query("begin");
      // FOR KEY SHARE, deliberately, and not FOR UPDATE.
      //
      // The rival is standing in for a second service call, so the lock it holds
      // decides what this test can detect. A rival holding FOR UPDATE blocks any
      // lock mode the service might take — including FOR SHARE, which conflicts
      // with FOR UPDATE but *not with itself*, and which therefore would not fix
      // the defect at all: two real service calls would both acquire it and
      // interleave exactly as before.
      //
      // FOR KEY SHARE conflicts with FOR UPDATE and with nothing weaker, so this
      // test now fails if the service takes anything less than an exclusive lock.
      // Independent review found the earlier version could not tell the two apart.
      await rival.query("select id from public.events where id = $1 for key share", [event.id]);

      const approval = approveEvent(actorPersonId, event.id).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );

      // Long enough that an implementation which does not lock first has read
      // the audience and is sitting on the guarded update.
      await new Promise((resolve) => setTimeout(resolve, 300));

      await rival.query("delete from public.event_audience_members where event_id = $1", [
        event.id,
      ]);
      await rival.query("commit");

      const settled = await approval;

      expect(settled.ok, "approval succeeded against an audience that no longer existed").toBe(
        false,
      );
      if (!settled.ok) {
        const error = settled.error as ServiceError;
        expect(error.rule).toBe(EMPTY_AUDIENCE_RULE);
      }
    } finally {
      await rival.end();
    }

    // The event is untouched, which is the whole point: nothing was approved,
    // and nobody was invited to something nobody confirmed.
    expect((await readEvent(event.id)).status).toBe("draft");
    expect(await countsFor(event.id)).toMatchObject({ invitations: 0, jobs: 0 });
  });
});

// ---------------------------------------------------------------------------
// LAN-120 — three things that were correct only because nobody had added a row
// ---------------------------------------------------------------------------

describe("an event outside the operating season", () => {
  /**
   * `readEventIn` reads by id alone, so a draft left behind in a closed season
   * used to be approvable — and approving it would have resolved an audience
   * from that season's memberships and queued real messages to a roster the
   * club has moved on from. No such draft exists in the seed, so this creates
   * one.
   */
  async function draftInArchivedSeason(): Promise<string> {
    const archived = await observer.query<{ id: string }>(
      `select id from public.seasons
        where status not in ('open', 'active', 'closing')
        order by starts_on desc limit 1`,
    );
    expect(archived.rows[0], "the seeded dataset has no non-operating season").toBeDefined();

    const inserted = await observer.query<{ id: string }>(
      `insert into public.events
         (season_id, name, event_type, origin, status, scheduled_on, is_mandatory,
          solicits_response, owner_person_id)
       values ($1, $2, 'practice', 'club_controlled', 'draft', '2026-05-20', true, true, $3)
       returning id`,
      [archived.rows[0].id, `${NAME_MARKER} Last season's leftover`, actorPersonId],
    );
    return inserted.rows[0].id;
  }

  it("cannot have an audience proposed against it", async () => {
    const eventId = await draftInArchivedSeason();

    const error = await caught(() => saveEventAudience(actorPersonId, eventId, []));

    expect(error.kind).toBe("invalid_transition");
    expect(error.message).toMatch(/season the club is no longer operating/);
  });

  it("cannot be approved, even carrying an audience", async () => {
    const eventId = await draftInArchivedSeason();

    // Planted directly, because the service refuses to put one there — which is
    // the point: the only way to reach approval with an audience is to have
    // built one while the season was still open.
    const season = await observer.query<{ season_id: string }>(
      "select season_id from public.events where id = $1",
      [eventId],
    );
    const membership = await observer.query<{ id: string }>(
      "select id from public.season_memberships where season_id = $1 limit 1",
      [season.rows[0].season_id],
    );
    expect(membership.rows[0], "the archived season has no memberships").toBeDefined();
    await observer.query(
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id)
       values ($1, $2, 'player', $3)`,
      [eventId, season.rows[0].season_id, membership.rows[0].id],
    );

    const error = await caught(() => approveEvent(actorPersonId, eventId));

    expect(error.kind).toBe("invalid_transition");
    expect(error.message).toMatch(/season the club is no longer operating/);

    const after = await observer.query<{ status: string }>(
      "select status::text as status from public.events where id = $1",
      [eventId],
    );
    expect(after.rows[0].status).toBe("draft");
    expect(await countsFor(eventId)).toMatchObject({ invitations: 0, jobs: 0 });
  });

  it("still approves an event in the season the club is operating", async () => {
    // The other half, so the guard cannot pass by refusing everything.
    const event = await newDraft();
    const keys = await keysFor(event, "player", 2);

    const outcome = await approve(event.id, keys);

    expect(outcome.invitationCount).toBe(2);
  });
});

describe("a season-scoped role that is not a coaching seat", () => {
  /**
   * Capacity used to be derived from a role's *scope*: season-scoped meant
   * coach. Exhaustive while the only season-scoped roles were the three
   * coaching seats, and wrong on the first addition — a team manager would have
   * appeared under "All active coaches" and been invited as one.
   */
  const MANAGER_CODE = "lan120_team_manager";

  afterEach(async () => {
    await observer.query(
      `delete from public.role_assignments
        where role_id in (select id from public.roles where code = $1)`,
      [MANAGER_CODE],
    );
    await observer.query("delete from public.roles where code = $1", [MANAGER_CODE]);
  });

  it("is not offered as a coach, and not offered at all", async () => {
    const event = await newDraft();
    const before = await catalogueFor(event);

    const season = await observer.query<{ id: string }>(
      "select id from public.seasons where status = 'active' order by starts_on desc limit 1",
    );
    const role = await observer.query<{ id: string }>(
      `insert into public.roles (code, name, scope, role_group_id, sort_order)
       select $1, 'Team Manager', 'season', id, 902
         from public.role_groups where code = 'coaching_staff'
       returning id`,
      [MANAGER_CODE],
    );
    const person = await observer.query<{ id: string }>(
      "select id from public.people order by id limit 1",
    );
    await observer.query(
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, season_id, effective_from)
       values ($1, $2, 'season', false, $3, '2026-09-01')`,
      [person.rows[0].id, role.rows[0].id, season.rows[0].id],
    );

    const after = await withTransaction((tx) =>
      listAudienceCatalogueIn(tx, event.seasonId, event.scheduledOn),
    );

    // The manager appears nowhere: not as a coach, and not under any other
    // capacity either. Fail closed — an uninvitable role is a smaller problem
    // than one invited under a capacity nobody chose for it.
    expect(after.counts.coach).toBe(before.counts.coach);
    expect(
      after.candidates.some((candidate) => candidate.standing === "Team Manager"),
      "a season-scoped non-coaching role was offered in the audience",
    ).toBe(false);
  });

  it("still offers the real coaching seats", async () => {
    // The other half again: the narrowing must not have emptied the group.
    const event = await newDraft();
    const catalogue = await withTransaction((tx) =>
      listAudienceCatalogueIn(tx, event.seasonId, event.scheduledOn),
    );

    expect(catalogue.counts.coach).toBeGreaterThan(0);
    // Read from the catalogue rather than retyped: since LAN-128 the club calls
    // two of the seats "Offensive Coordinator" and "Defensive Coordinator", so a
    // `/Coach/` pattern would have quietly stopped matching them, and since
    // LAN-129 there are ten of them rather than three.
    const coachingSeatNames = await observer.query<{ name: string }>(
      "select name from public.roles where code = any($1::text[])",
      [[...COACH_ROLE_CODES]],
    );
    const permitted = coachingSeatNames.rows.map((row) => row.name);
    expect(permitted).toHaveLength(10);
    for (const coach of catalogue.candidates.filter((entry) => entry.capacity === "coach")) {
      expect(permitted).toContain(coach.standing);
    }
  });
});

/**
 * LAN-129, Q-5 — every fixed coaching seat is invitable, not just the three that
 * carried the attendance grant first.
 *
 * Brian, 19 August 2026: "Every coach needs to be invited to coaching sessions.
 * Coaches should be an audience that's included, which includes all the
 * coaches." Until that answer, `COACH_ROLE_CODES` held three seats while the
 * catalogue held ten, so a Quarterbacks Coach could take a register at a session
 * they were never invited to.
 *
 * Asserted against a real assignment rather than against the constant, because
 * the constant is only half the mechanism — it is passed into the audience
 * query as a parameter, and a query that stopped consuming it would still pass
 * a test that only read the constant.
 */
describe("a coaching seat the catalogue added", () => {
  const SEAT_CODE = "quarterbacks_coach";

  afterEach(async () => {
    await observer.query(
      `delete from public.role_assignments
        where note = 'LAN-129 audience check'
          and role_id in (select id from public.roles where code = $1)`,
      [SEAT_CODE],
    );
  });

  it("is offered under Active coaches once somebody holds it", async () => {
    const event = await newDraft();
    const before = await catalogueFor(event);

    const season = await observer.query<{ id: string }>(
      "select id from public.seasons where status = 'active' order by starts_on desc limit 1",
    );
    const role = await observer.query<{ id: string }>(
      "select id, name from public.roles where code = $1",
      [SEAT_CODE],
    );
    // Somebody who is not already in the catalogue under another capacity, so
    // that the count moving is unambiguous.
    const person = await observer.query<{ id: string }>(
      `select p.id from public.people p
        where not exists (select 1 from public.role_assignments ra where ra.person_id = p.id)
        order by p.id desc limit 1`,
    );
    await observer.query(
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, season_id, effective_from, note)
       values ($1, $2, 'season', false, $3, '2026-09-01', 'LAN-129 audience check')`,
      [person.rows[0].id, role.rows[0].id, season.rows[0].id],
    );

    const after = await withTransaction((tx) =>
      listAudienceCatalogueIn(tx, event.seasonId, event.scheduledOn),
    );

    expect(after.counts.coach).toBe(before.counts.coach + 1);
    expect(
      after.candidates.some(
        (candidate) =>
          candidate.capacity === "coach" && candidate.standing === "Quarterbacks Coach",
      ),
      "a fixed coaching seat was not offered under Active coaches",
    ).toBe(true);
  });
});

describe("the seeded identity records", () => {
  it("are dated in the past, so 'earliest person' means the club's own", async () => {
    // The trap LAN-119 spent a long time diagnosing: these were stamped two days
    // in the FUTURE, so every seeded person sorted after anything created at
    // `now()`. Nothing in the application read it; two test suites did.
    //
    // Asserted about the SEEDED COHORT — the *earliest* group of people sharing
    // one `created_at` — rather than about `public.people` as a whole. The
    // original form required exactly one distinct stamp in the table, which is
    // a property of an idle database rather than of the seed: any suite that
    // commits a person adds a second stamp, and any suite holding fixtures adds
    // a third, so it failed whenever the files ran in parallel.
    //
    // LAN-121 and this branch reached the same conclusion independently and
    // fixed it two ways; this is LAN-121's, kept because it is on `main` and
    // because "earliest" is the property the lookups actually depend on.
    const stamps = await observer.query<{ created_at: Date; count: string }>(
      `select created_at, count(*)::text as count
         from public.people
        group by created_at
        order by created_at
        limit 1`,
    );

    expect(stamps.rows).toHaveLength(1);
    expect(stamps.rows[0].created_at.getTime()).toBeLessThan(Date.now());
    expect(Number(stamps.rows[0].count)).toBeGreaterThan(20);
  });
});
