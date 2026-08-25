// @vitest-environment node
/**
 * The participation table and its three tiers — LAN-157, W7.
 *
 * Against the **real** local database, because every claim this file makes is a
 * claim about what a query selects. "The club-link payload carries no delivery
 * column" is only worth anything if the query that built it really ran against
 * rows that have a delivery state — and a mocked transaction returns whatever
 * the mock was told to.
 *
 * Every negative assertion here is paired with a **positive control** on the
 * operator payload. "No delivery in the club-link payload" passes on an empty
 * object, on a payload that failed to build, and on a matcher that cannot fail;
 * "and the operator payload has one" is what proves the test can tell.
 *
 * Every row hangs off an event whose name carries `NAME_MARKER`, unique to this
 * file, and `afterEach` deletes exactly those in dependency order.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import { approveEvent, saveEventAudience } from "./event-approval";
import { listAudienceCatalogueIn, type AudienceCatalogue } from "./event-audience";
import { createEventDraft, type EventDraftInput } from "./events";
import { readEventAttendanceSummary } from "./attendance";
import {
  buildClubLinkParticipationIn,
  buildOperatorParticipationIn,
  readClubLinkParticipation,
} from "./participation";
import { issueClubLinkIn, deriveClubLinkToken } from "./club-link";
import { summariseQuestion } from "./participation-view";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const NAME_MARKER = "LAN157ParticipationSuite";
const SECRET = { CLUB_LINK_SECRET: "participation-suite-signing-key-0123456789" };

const JOINING_URL = "https://teams.example.invalid/l/meetup-join/lan157";

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
  expect(seededPeople.size).toBeGreaterThan(20);
  actorPersonId = people.rows[0].id;
});

afterEach(async () => {
  const scope = `${NAME_MARKER}%`;
  const events = "(select id from public.events where name like $1)";
  await observer.query(`delete from public.club_link_tokens where event_id in ${events}`, [scope]);
  await observer.query(
    `delete from public.delivery_results where notification_job_id in
     (select id from public.notification_jobs where event_id in ${events})`,
    [scope],
  );
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
  await observer.query(`delete from public.attendance_records where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(`delete from public.question_responses where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(`delete from public.event_questions where event_id in ${events}`, [scope]);
  await observer.query(
    `delete from public.rsvp_responses where invitation_id in
       (select id from public.invitations where event_id in ${events})`,
    [scope],
  );
  await observer.query(
    `delete from public.rsvp_access_tokens where invitation_id in
       (select id from public.invitations where event_id in ${events})`,
    [scope],
  );
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

// ---------------------------------------------------------------------------
// One event, fully populated: answers, reasons, attendance, questions, delivery
// ---------------------------------------------------------------------------

function draft(overrides: Partial<EventDraftInput> = {}): EventDraftInput {
  return {
    name: `${NAME_MARKER} practice`,
    eventType: "practice",
    // Yesterday: the event has happened, so the register is open and the
    // discrepancy cases are reachable.
    scheduledOn: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    startsAt: "19:00",
    endsAt: "21:00",
    venue: "Iffley Road Astro",
    isMandatory: true,
    deliveryMode: "in_person",
    description: "Full contact.",
    requiredEquipment: "Gumshield, boots",
    joiningUrl: null,
    ...overrides,
  };
}

async function catalogueFor(event: { seasonId: string; scheduledOn: string | null }) {
  const full: AudienceCatalogue = await withTransaction((tx) =>
    listAudienceCatalogueIn(tx, event.seasonId, event.scheduledOn),
  );
  return full.candidates.filter((candidate) => seededPeople.has(candidate.personId));
}

interface Scenario {
  eventId: string;
  /** `invitations.id`, in the order they were created, by display name. */
  invitations: { id: string; personId: string | null; membershipId: string | null; name: string }[];
  questionIds: string[];
}

/**
 * An approved event with five invitees, one walk-up, two questions, answers,
 * attendance and one delivery job.
 *
 * Built through the real approval path — `saveEventAudience` then
 * `approveEvent` — rather than by inserting invitations, because invariant P1's
 * composite foreign keys are the reason those rows are shaped as they are.
 */
async function scenario(overrides: Partial<EventDraftInput> = {}): Promise<Scenario> {
  const event = await createEventDraft(actorPersonId, draft(overrides));
  const candidates = await catalogueFor(event);
  const players = candidates.filter((one) => one.capacity === "player").slice(0, 4);
  const coach = candidates.filter((one) => one.capacity === "coach").slice(0, 1);
  const chosen = [...players, ...coach];
  expect(chosen.length).toBe(5);

  await saveEventAudience(
    actorPersonId,
    event.id,
    chosen.map((one) => one.key),
  );
  await approveEvent(actorPersonId, event.id);

  const invitations = await observer.query<{
    id: string;
    person_id: string | null;
    season_membership_id: string | null;
    display_name: string;
  }>(
    `select i.id, i.person_id, i.season_membership_id,
            coalesce(p.known_as, p.given_name) || ' ' || coalesce(p.family_name, '') as display_name
       from public.invitations i
       left join public.season_memberships m on m.id = i.season_membership_id
       left join public.people p on p.id = coalesce(i.person_id, m.person_id)
      where i.event_id = $1
      order by i.id`,
    [event.id],
  );
  expect(invitations.rows).toHaveLength(5);

  const rows = invitations.rows.map((row) => ({
    id: row.id,
    personId: row.person_id,
    membershipId: row.season_membership_id,
    name: row.display_name,
  }));

  // Two per-event questions, exactly as W4 authors them (D68).
  const questions = await observer.query<{ id: string }>(
    `insert into public.event_questions (event_id, prompt, answer_type, sort_order)
     values ($1, 'Lift?', 'boolean', 0), ($1, 'Shirt size', 'text', 1)
     returning id`,
    [event.id],
  );
  const questionIds = questions.rows.map((row) => row.id);

  // Answers: yes, yes, no (with a reason), no answer, yes.
  const answer = async (index: number, response: "yes" | "no", reason: string | null) => {
    await observer.query(
      `insert into public.rsvp_responses (invitation_id, response, reason, source, responded_at)
       values ($1, $2::public.rsvp_value, $3, 'signed_link', now())`,
      [rows[index].id, response, reason],
    );
  };
  await answer(0, "yes", null);
  await answer(1, "yes", null);
  await answer(2, "no", "Away with the course all week");
  await answer(4, "yes", null);

  // Question answers for the first two invitees only, so an unanswered cell is
  // in the payload as well as an answered one.
  await observer.query(
    `insert into public.question_responses
       (invitation_id, event_id, event_question_id, answer_boolean)
     values ($1, $2, $3, true)`,
    [rows[0].id, event.id, questionIds[0]],
  );
  await observer.query(
    `insert into public.question_responses
       (invitation_id, event_id, event_question_id, answer_text)
     values ($1, $2, $3, 'L')`,
    [rows[0].id, event.id, questionIds[1]],
  );

  // Attendance: [0] present (agrees), [1] absent (said yes — a discrepancy),
  // [3] present (never answered — a discrepancy), [4] nothing recorded.
  const record = async (index: number, presence: string) => {
    const row = rows[index];
    await observer.query(
      `insert into public.attendance_records
         (event_id, event_status, season_id, capacity, season_membership_id, person_id,
          presence, recorded_by_person_id)
       select $1, 'approved', e.season_id, i.capacity, i.season_membership_id, i.person_id,
              $3::public.attendance_presence, $4
         from public.invitations i join public.events e on e.id = i.event_id
        where i.id = $2`,
      [event.id, row.id, presence, actorPersonId],
    );
  };
  await record(0, "present");
  await record(1, "absent");
  await record(3, "present");

  // One delivery job, so the operator tier has a state to print and the
  // club-link tier has one to *not* print.
  await observer.query(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, invitation_id, event_id, channel)
     values ($1, 'invitation', 'completed', $2, $3, 'whatsapp')`,
    [`${NAME_MARKER}:${rows[0].id}`, rows[0].id, event.id],
  );

  return { eventId: event.id, invitations: rows, questionIds };
}

// ---------------------------------------------------------------------------
// REQ-participation-table
// ---------------------------------------------------------------------------

describe("the participation table", () => {
  it("carries one row per person, with everything W7's table names", async () => {
    const staged = await scenario();
    const view = await withTransaction((tx) => buildOperatorParticipationIn(tx, staged.eventId));

    expect(view.people).toHaveLength(5);
    const byName = new Map(view.people.map((one) => [one.key, one]));
    const first = byName.get(
      view.people.find((one) => one.answers[staged.questionIds[0]] !== undefined)!.key,
    )!;

    expect(first.displayName).not.toBe("");
    expect(first.capacity).toBeTruthy();
    expect(first.answer).toBe("yes");
    expect(first.presence).toBe("present");
    expect(first.answers[staged.questionIds[0]]).toBe("Yes");
    expect(first.answers[staged.questionIds[1]]).toBe("L");
    expect(first.delivery).toBe("delivered");
  });

  it("reads Invitation sent as the moment it went, and as nothing until it has", async () => {
    // W7: "When it went, or that it has not." `invitations.issued_at` is the
    // column that means exactly that, and **nothing in the application writes
    // it today** — `approveEvent` creates the invitation and the delivery path
    // has never stamped it. The seeded dataset does, which is why the review
    // environment shows real times, so this pins both halves rather than
    // asserting the one the current write path happens to produce.
    const staged = await scenario();

    const before = await withTransaction((tx) => buildOperatorParticipationIn(tx, staged.eventId));
    expect(before.people.every((one) => one.invitedAt === null)).toBe(true);

    await observer.query("update public.invitations set issued_at = $2 where id = $1", [
      staged.invitations[0].id,
      "2027-02-15T18:00:00.000Z",
    ]);

    const after = await withTransaction((tx) => buildOperatorParticipationIn(tx, staged.eventId));
    const stamped = after.people.filter((one) => one.invitedAt !== null);
    expect(stamped).toHaveLength(1);
    expect(stamped[0].invitedAt).toBe("2027-02-15T18:00:00.000Z");
  });

  it("reads one column per question, in sort order", async () => {
    const staged = await scenario();
    const view = await withTransaction((tx) => buildOperatorParticipationIn(tx, staged.eventId));
    expect(view.questions.map((one) => one.prompt)).toEqual(["Lift?", "Shirt size"]);
    // A boolean answer reads as the club's word, not as the storage.
    const answered = view.people.filter((one) => Object.keys(one.answers).length > 0);
    expect(answered).toHaveLength(1);
    expect(Object.values(answered[0].answers).sort()).toEqual(["L", "Yes"]);
  });

  it("reads which capacities each question applies to, so the counts can exclude the rest", async () => {
    // D68's collapsed Questions section counts only the people a question
    // applies to. A null from somebody it does not apply to means "not
    // applicable", never "no answer", and the column that says which is which
    // has to be selected for `summariseQuestion` to honour it.
    const staged = await scenario();
    await observer.query(
      `update public.event_questions
          set applies_to_capacities = '{coach}'::public.invitation_capacity[]
        where id = $1`,
      [staged.questionIds[0]],
    );

    const view = await withTransaction((tx) => buildOperatorParticipationIn(tx, staged.eventId));
    const lift = view.questions.find((one) => one.id === staged.questionIds[0])!;
    expect(lift.appliesToCapacities).toEqual(["coach"]);
    // And the other question is untouched, so this is not a blanket answer.
    const shirt = view.questions.find((one) => one.id === staged.questionIds[1])!;
    expect(shirt.appliesToCapacities.length).toBeGreaterThan(1);

    expect(summariseQuestion(view.people, lift).applicable).toBe(1);
    expect(summariseQuestion(view.people, shirt).applicable).toBe(5);
  });

  it("shows a decline reason against a no, and against nothing else", async () => {
    const staged = await scenario();
    const view = await withTransaction((tx) => buildOperatorParticipationIn(tx, staged.eventId));
    const declined = view.people.filter((one) => one.answer === "no");
    expect(declined).toHaveLength(1);
    expect(declined[0].reason).toBe("Away with the course all week");
    for (const person of view.people.filter((one) => one.answer !== "no")) {
      expect(person.reason).toBeNull();
    }
  });

  it("includes a walk-up, with no invitation and no answer — invariant P6", async () => {
    const staged = await scenario();
    const stranger = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, 'Danecroft') returning id`,
      [`${NAME_MARKER}Wilfrid`],
    );
    await observer.query(
      `insert into public.attendance_records
         (event_id, event_status, season_id, capacity, person_id, presence, recorded_by_person_id)
       select $1, 'approved', e.season_id, 'guest', $2, 'present', $3
         from public.events e where e.id = $1`,
      [staged.eventId, stranger.rows[0].id, actorPersonId],
    );

    try {
      const view = await withTransaction((tx) => buildOperatorParticipationIn(tx, staged.eventId));
      const walkUp = view.people.find((one) => one.isWalkUp);
      expect(walkUp).toBeDefined();
      expect(walkUp!.invitedAt).toBeNull();
      expect(walkUp!.answer).toBeNull();
      expect(walkUp!.presence).toBe("present");
      // The mockup leaves the walk-up unmarked: the row already says it twice.
      expect(walkUp!.discrepancy).toBeNull();
    } finally {
      await observer.query("delete from public.attendance_records where person_id = $1", [
        stranger.rows[0].id,
      ]);
      await observer.query("delete from public.people where id = $1", [stranger.rows[0].id]);
    }
  });

  it("does not multiply a row when an invitee has two delivery jobs", async () => {
    // `notification_jobs` has no unique constraint on `invitation_id`, so a
    // reissue or a second channel would duplicate the person if the delivery
    // column were a plain join rather than a lateral over the latest job.
    const staged = await scenario();
    await observer.query(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, invitation_id, event_id, channel)
       values ($1, 'invitation', 'failed', $2, $3, 'whatsapp')`,
      [
        `${NAME_MARKER}:second:${staged.invitations[0].id}`,
        staged.invitations[0].id,
        staged.eventId,
      ],
    );
    const view = await withTransaction((tx) => buildOperatorParticipationIn(tx, staged.eventId));
    expect(view.people).toHaveLength(5);
  });

  it("reads nothing queued as nothing queued, never as a failure", async () => {
    // `DELIVERY_STATE_EXPRESSION` ends in `else 'failed'`, which is right for a
    // job and very wrong for the absence of one: without the `j.id is null`
    // guard, an invitee nobody has queued anything for reads **Failed**.
    //
    // Approval queues a job for every invitee, so the case has to be staged by
    // taking one away — which is also the real shape of it: a delivery job
    // cancelled, or an invitation created before the delivery path existed.
    const staged = await scenario();
    await observer.query("delete from public.notification_jobs where invitation_id = $1", [
      staged.invitations[1].id,
    ]);

    const view = await withTransaction((tx) => buildOperatorParticipationIn(tx, staged.eventId));
    const states = view.people.map((one) => one.delivery);
    expect(states.filter((state) => state === null)).toHaveLength(1);
    // The positive controls: the completed job reads Delivered and the rest
    // read Queued, so "not failed" is not passing on an empty column.
    expect(states.filter((state) => state === "delivered")).toHaveLength(1);
    expect(states.filter((state) => state === "queued")).toHaveLength(3);
    expect(states).not.toContain("failed");
  });

  it("is readable long before the register opens", async () => {
    // The board answers "may this be opened?" and returns no participants for
    // an event a fortnight away. This table answers "who is coming?", which is
    // the question a fortnight out.
    const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const staged = await scenario({ scheduledOn: future });
    const view = await withTransaction((tx) => buildOperatorParticipationIn(tx, staged.eventId));
    expect(view.people).toHaveLength(5);
    expect(view.headline.invited).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// D64 — marked, and never auto-reconciled
// ---------------------------------------------------------------------------

describe("the discrepancy marker", () => {
  it("marks the two records that disagree, and no one else", async () => {
    const staged = await scenario();
    const view = await withTransaction((tx) => buildOperatorParticipationIn(tx, staged.eventId));

    const marked = view.people.filter((one) => one.discrepancy !== null);
    expect(marked.map((one) => one.discrepancy).sort()).toEqual([
      "never_answered_attended",
      "said_yes_marked_absent",
    ]);

    // The positive control the negative one needs: the person who said yes and
    // was marked present is in the same payload and is not marked.
    const agreeing = view.people.find((one) => one.answer === "yes" && one.presence === "present");
    expect(agreeing).toBeDefined();
    expect(agreeing!.discrepancy).toBeNull();
  });

  it("marks during the session, when the stored view flags nothing", async () => {
    // The finding carried into this package. `rsvp_attendance_mismatches`
    // restricts to events whose date has passed, so on the evening itself it
    // emits no row — including for somebody who said no and is standing on the
    // pitch, which is what a coach notices first.
    // Europe/London, not `new Date().toISOString()`: that reads in UTC, and
    // during British Summer Time the last hour before UTC midnight is already
    // tomorrow in Oxford. `rsvp_attendance_mismatches` compares against
    // `(now() at time zone 'Europe/London')::date` (Q-25) — an event this test
    // schedules for "today" in UTC during that hour reads as yesterday to the
    // view, which then reports it occurred and this assertion fails on a
    // defect in the test, not in the view.
    const today = todayInClubZone();
    const staged = await scenario({ scheduledOn: today });

    const stored = await observer.query(
      "select 1 from public.rsvp_attendance_mismatches where event_id = $1",
      [staged.eventId],
    );
    expect(stored.rowCount).toBe(0);

    const view = await withTransaction((tx) => buildOperatorParticipationIn(tx, staged.eventId));
    expect(view.people.filter((one) => one.discrepancy !== null).length).toBeGreaterThan(0);
  });

  it("does not accuse the people a half-filled register has not reached", async () => {
    // Recording three people out of five must not turn the other two into
    // exceptions. One invitee said yes and has nothing recorded.
    const staged = await scenario();
    const view = await withTransaction((tx) => buildOperatorParticipationIn(tx, staged.eventId));
    const awaited = view.people.filter((one) => one.answer === "yes" && one.presence === null);
    expect(awaited).toHaveLength(1);
    expect(awaited[0].discrepancy).toBeNull();
  });

  it("writes nothing — the marker is derived and cannot be reconciled", async () => {
    const staged = await scenario();
    const before = await observer.query<{ rsvp: string; attendance: string }>(
      `select (select count(*)::text from public.rsvp_responses r
                 join public.invitations i on i.id = r.invitation_id
                where i.event_id = $1) as rsvp,
              (select count(*)::text from public.attendance_records
                where event_id = $1) as attendance`,
      [staged.eventId],
    );

    await withTransaction((tx) => buildOperatorParticipationIn(tx, staged.eventId));
    await withTransaction((tx) => buildClubLinkParticipationIn(tx, staged.eventId));

    const after = await observer.query<{ rsvp: string; attendance: string }>(
      `select (select count(*)::text from public.rsvp_responses r
                 join public.invitations i on i.id = r.invitation_id
                where i.event_id = $1) as rsvp,
              (select count(*)::text from public.attendance_records
                where event_id = $1) as attendance`,
      [staged.eventId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});

// ---------------------------------------------------------------------------
// REQ-club-link and REQ-three-tiers — asserted on the payload
// ---------------------------------------------------------------------------

describe("the club-link tier", () => {
  it("carries no delivery column, while the operator payload does", async () => {
    const staged = await scenario();

    const [operator, club] = await withTransaction(async (tx) => [
      await buildOperatorParticipationIn(tx, staged.eventId),
      await buildClubLinkParticipationIn(tx, staged.eventId),
    ]);

    // The positive control first: without it, everything below passes on an
    // empty payload and on a matcher that cannot fail.
    expect(operator.people.some((one) => one.delivery === "delivered")).toBe(true);
    expect(JSON.stringify(operator)).toContain('"delivery":');

    // And the assertion itself, on the payload rather than on the rendering.
    // The key, with its colon: `deliveryMode` is the in-person-or-online
    // property (D20) and is on both tiers, so a bare substring match would
    // fail on it and prove nothing about the telemetry column.
    expect(JSON.stringify(club)).not.toContain('"delivery":');
    for (const person of club.people) {
      expect(Object.keys(person)).not.toContain("delivery");
    }
    // Nor any of the five delivery states, anywhere in the payload.
    for (const state of ["queued", "attempted", "delivered", "retryable"]) {
      expect(JSON.stringify(club), state).not.toContain(`"${state}"`);
    }
  });

  it("carries no joining URL for an online event, while the operator payload does", async () => {
    const staged = await scenario({
      deliveryMode: "online",
      venue: "Microsoft Teams",
      joiningUrl: JOINING_URL,
    });

    const [operator, club] = await withTransaction(async (tx) => [
      await buildOperatorParticipationIn(tx, staged.eventId),
      await buildClubLinkParticipationIn(tx, staged.eventId),
    ]);

    expect(operator.event.joiningUrl).toBe(JOINING_URL);
    expect(JSON.stringify(operator)).toContain(JOINING_URL);

    expect(JSON.stringify(club)).not.toContain(JOINING_URL);
    expect(JSON.stringify(club)).not.toContain("joiningUrl");
    expect(Object.keys(club.event)).not.toContain("joiningUrl");
  });

  it("carries the same people, answers and attendance as the operator tier", async () => {
    // D3: delivery is the only operator-locked element. A club-link reader who
    // saw fewer people would not be reading the participation table.
    const staged = await scenario();
    const [operator, club] = await withTransaction(async (tx) => [
      await buildOperatorParticipationIn(tx, staged.eventId),
      await buildClubLinkParticipationIn(tx, staged.eventId),
    ]);

    expect(club.people.map((one) => one.key)).toEqual(operator.people.map((one) => one.key));
    expect(club.people.map((one) => one.answer)).toEqual(operator.people.map((one) => one.answer));
    expect(club.people.map((one) => one.presence)).toEqual(
      operator.people.map((one) => one.presence),
    );
    expect(club.people.map((one) => one.discrepancy)).toEqual(
      operator.people.map((one) => one.discrepancy),
    );
    expect(club.people.map((one) => one.reason)).toEqual(operator.people.map((one) => one.reason));
    expect(club.headline).toEqual(operator.headline);
  });
});

describe("reaching the club-link tier", () => {
  it("opens with a live token and names people", async () => {
    const staged = await scenario();
    const issued = await withTransaction((tx) =>
      issueClubLinkIn(tx, staged.eventId, { actorPersonId, env: SECRET }),
    );

    const page = await readClubLinkParticipation(issued.token, { env: SECRET });
    expect(page.state).toBe("live");
    if (page.state !== "live") return;
    expect(page.participation.people).toHaveLength(5);
    expect(page.participation.tier).toBe("club_link");
  });

  it("refuses an unknown token, and reaches no person, answer or attendance", async () => {
    const staged = await scenario();
    // A well-formed token for the right event, signed with a different key —
    // the shape of a forgery, not of a typo.
    const forged = deriveClubLinkToken(staged.eventId, staged.invitations[0].id, {
      CLUB_LINK_SECRET: "a-completely-different-signing-key-000000",
    });

    for (const token of ["not-a-token", forged]) {
      const page = await readClubLinkParticipation(token, { env: SECRET });
      expect(page.state).toBe("unavailable");
      expect(JSON.stringify(page)).not.toContain("people");
      for (const invitee of staged.invitations) {
        expect(JSON.stringify(page)).not.toContain(invitee.name.trim());
      }
    }
  });

  it("refuses a revoked token", async () => {
    const staged = await scenario();
    const issued = await withTransaction((tx) =>
      issueClubLinkIn(tx, staged.eventId, { actorPersonId, env: SECRET }),
    );
    await observer.query(
      "update public.club_link_tokens set revoked_at = now(), revoked_reason = 'suite' where id = $1",
      [issued.linkId],
    );
    expect((await readClubLinkParticipation(issued.token, { env: SECRET })).state).toBe(
      "unavailable",
    );
  });

  it("refuses a link whose event has gone back to being a draft", async () => {
    const staged = await scenario();
    const issued = await withTransaction((tx) =>
      issueClubLinkIn(tx, staged.eventId, { actorPersonId, env: SECRET }),
    );
    // Everything that hangs off the approval has to go first — the composite
    // foreign keys are what invariant P1 is made of.
    await observer.query(`delete from public.attendance_records where event_id = $1`, [
      staged.eventId,
    ]);
    await observer.query(`delete from public.question_responses where event_id = $1`, [
      staged.eventId,
    ]);
    await observer.query(
      `delete from public.rsvp_responses where invitation_id in
         (select id from public.invitations where event_id = $1)`,
      [staged.eventId],
    );
    await observer.query(`delete from public.notification_jobs where event_id = $1`, [
      staged.eventId,
    ]);
    await observer.query("delete from public.invitations where event_id = $1", [staged.eventId]);
    await observer.query("update public.events set status = 'draft' where id = $1", [
      staged.eventId,
    ]);

    expect((await readClubLinkParticipation(issued.token, { env: SECRET })).state).toBe(
      "unavailable",
    );
  });
});

// ---------------------------------------------------------------------------
// UX standard 7 — the headline agrees with the surface that owns it
// ---------------------------------------------------------------------------

describe("the headline numbers", () => {
  it("agree with `readEventAttendanceSummary`, which owns them", async () => {
    const staged = await scenario();
    const summary = await readEventAttendanceSummary(staged.eventId);
    const view = await withTransaction((tx) => buildOperatorParticipationIn(tx, staged.eventId));

    expect(view.headline.invited).toBe(summary.invited);
    expect(view.headline.saidYes).toBe(summary.saidYes);
    expect(view.headline.showed).toBe(summary.showed);
    expect(view.headline.registerSaved).toBe(summary.registerSaved);
    // And the numbers are the ones this scenario staged, so an agreement of two
    // zeroes cannot pass for agreement.
    expect(summary.invited).toBe(5);
    expect(summary.saidYes).toBe(3);
    expect(summary.showed).toBe(2);
  });

  it("reads an unsaved register as unsaved, not as nobody coming — D74", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    const candidates = await catalogueFor(event);
    await saveEventAudience(
      actorPersonId,
      event.id,
      candidates.slice(0, 3).map((one) => one.key),
    );
    await approveEvent(actorPersonId, event.id);

    const view = await withTransaction((tx) => buildOperatorParticipationIn(tx, event.id));
    expect(view.headline.registerSaved).toBe(false);
    expect(view.headline.showed).toBe(0);
  });
});
