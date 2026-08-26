// @vitest-environment node
/**
 * The answer-specific landing content and the player's durable page —
 * LAN-172.
 *
 * Against the real local database: the aggregate Yes count, the
 * cross-person-isolation of the durable page's own writes, and the
 * approved-means-visible query all depend on real joins across invitations,
 * events and `current_rsvp` that a mocked transaction cannot exercise.
 *
 * Every row hangs off a person whose `given_name` is `MARKER`, deleted in
 * `afterEach`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction, type ServiceError } from "@/lib/db";
import {
  answerEventQuestionsIn,
  INVITATION_NOT_OWNED_RULE,
  readPlayerAnswerLandingIn,
  readPlayerHomeIn,
  recordPlayerHomeAnswerIn,
} from "./player-home";
import { NO_REASON_GIVEN_DEFAULT } from "./player-answer-tokens";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const MARKER = "LAN172HomeSuite";

let observer: Client;
let seasonId: string;
let anchorPersonId: string;

beforeAll(async () => {
  observer = await openObserver();

  const anchor = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id limit 1",
    [await seededIdentityCreatedAt(observer)],
  );
  expect(anchor.rows.length).toBe(1);
  anchorPersonId = anchor.rows[0].id;
  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );

  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on,
        opened_at, opened_by_person_id)
     values ($1, 'open', $2, '2019-09-01', '2020-06-01', now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, anchorPersonId],
  );
  seasonId = season.rows[0].id;
});

afterEach(async () => {
  const people = "(select id from public.people where given_name = $1)";
  const invitations = `(select id from public.invitations where person_id in ${people}
     or season_membership_id in (select id from public.season_memberships where person_id in ${people}))`;
  await observer.query(`delete from public.rsvp_responses where invitation_id in ${invitations}`, [
    MARKER,
  ]);
  await observer.query(
    `delete from public.question_responses where invitation_id in ${invitations}`,
    [MARKER],
  );
  await observer.query(
    `delete from public.event_questions where event_id in (select id from public.events where name like $1)`,
    [`${MARKER}%`],
  );
  await observer.query(
    `delete from public.notification_jobs where invitation_id in ${invitations}`,
    [MARKER],
  );
  await observer.query(`delete from public.person_access_tokens where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(
    `delete from public.audit_events where entity_id in ${invitations} or entity_id in ${people}`,
    [MARKER],
  );
  await observer.query(`delete from public.invitations where id in ${invitations}`, [MARKER]);
  await observer.query(
    `delete from public.event_audience_members where event_id in (select id from public.events where name like $1)`,
    [`${MARKER}%`],
  );
  await observer.query("delete from public.events where name like $1", [`${MARKER}%`]);
  await observer.query(`delete from public.season_memberships where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where label = $1", [`${MARKER} season`]);
  await observer.end();
  await closePool();
});

/** One approved event, and one player invitation for a fresh MARKER person. */
async function fixture(startsInHours: number, eventNameSuffix = "") {
  await observer.query("begin");
  try {
    const person = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name, created_at)
       values ($1, 'Invitee', now() + interval '100 years') returning id`,
      [MARKER],
    );
    const personId = person.rows[0].id;

    const membership = await observer.query<{ id: string }>(
      `insert into public.season_memberships
       (person_id, season_id, status, entry, confirmed_on, activated_on)
     values ($1, $2, 'active', 'returning', current_date, current_date) returning id`,
      [personId, seasonId],
    );

    const event = await observer.query<{ id: string }>(
      `with target as (select (now() + make_interval(hours => $3)) at time zone 'Europe/London' as local)
     insert into public.events
       (season_id, name, event_type, status, scheduled_on, starts_at,
        audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
     select $1, $2, 'practice', 'approved',
            (select local::date from target), (select local::time from target),
            now(), $4::uuid, now(), $4::uuid
     returning id`,
      [seasonId, `${MARKER} practice${eventNameSuffix}`, startsInHours, personId],
    );
    const eventId = event.rows[0].id;

    const audience = await observer.query<{ id: string }>(
      `insert into public.event_audience_members
       (event_id, season_id, capacity, season_membership_id, added_by_person_id)
     values ($1, $2, 'player', $3, $4) returning id`,
      [eventId, seasonId, membership.rows[0].id, personId],
    );

    const invitation = await observer.query<{ id: string }>(
      `insert into public.invitations
       (event_id, event_status, season_id, capacity,
        season_membership_id, status, audience_member_id)
     values ($1, 'approved', $2, 'player', $3, 'pending', $4)
     returning id`,
      [eventId, seasonId, membership.rows[0].id, audience.rows[0].id],
    );

    await observer.query("commit");
    return { personId, eventId, invitationId: invitation.rows[0].id };
  } catch (error) {
    await observer.query("rollback");
    throw error;
  }
}

/**
 * A second invitation, to a second event, for a person who already has one.
 *
 * Deliberately a new event with its own audience row rather than "point the
 * first invitation's `event_id` at something else" — the composite FK
 * `invitations_belong_to_the_resolved_audience` ties `audience_member_id` to
 * the exact event, capacity and resolved participant, so a second invitation
 * needs its own audience row from the start.
 */
async function secondInvitationFor(
  personId: string,
  startsInHours: number,
  suffix: string,
): Promise<string> {
  const membership = await observer.query<{ id: string }>(
    "select id from public.season_memberships where person_id = $1",
    [personId],
  );
  const event = await observer.query<{ id: string }>(
    `with target as (select (now() + make_interval(hours => $3)) at time zone 'Europe/London' as local)
     insert into public.events
       (season_id, name, event_type, status, scheduled_on, starts_at,
        audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
     select $1, $2, 'practice', 'approved',
            (select local::date from target), (select local::time from target),
            now(), $4::uuid, now(), $4::uuid
     returning id`,
    [seasonId, `${MARKER} practice${suffix}`, startsInHours, personId],
  );
  const audience = await observer.query<{ id: string }>(
    `insert into public.event_audience_members (event_id, season_id, capacity, season_membership_id, added_by_person_id)
     values ($1, $2, 'player', $3, $4) returning id`,
    [event.rows[0].id, seasonId, membership.rows[0].id, personId],
  );
  const invitation = await observer.query<{ id: string }>(
    `insert into public.invitations
       (event_id, event_status, season_id, capacity, season_membership_id, status, audience_member_id)
     values ($1, 'approved', $2, 'player', $3, 'pending', $4)
     returning id`,
    [event.rows[0].id, seasonId, membership.rows[0].id, audience.rows[0].id],
  );
  return invitation.rows[0].id;
}

/**
 * A second (or third) invitee of an *already existing* event.
 *
 * Deliberately not "create a fixture, then rewrite its `event_id`" — the
 * composite FK `invitations_belong_to_the_resolved_audience` ties
 * `(audience_member_id, event_id, capacity, participant_id)` together, so an
 * invitation's event can only change by building a new audience row for the
 * event it is actually joining.
 */
async function additionalInvitee(eventId: string): Promise<string> {
  const person = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name, created_at)
     values ($1, 'Invitee', now() + interval '100 years') returning id`,
    [MARKER],
  );
  const membership = await observer.query<{ id: string }>(
    `insert into public.season_memberships
       (person_id, season_id, status, entry, confirmed_on, activated_on)
     values ($1, $2, 'active', 'returning', current_date, current_date) returning id`,
    [person.rows[0].id, seasonId],
  );
  const audience = await observer.query<{ id: string }>(
    `insert into public.event_audience_members (event_id, season_id, capacity, season_membership_id, added_by_person_id)
     values ($1, $2, 'player', $3, $4) returning id`,
    [eventId, seasonId, membership.rows[0].id, person.rows[0].id],
  );
  const invitation = await observer.query<{ id: string }>(
    `insert into public.invitations
       (event_id, event_status, season_id, capacity, season_membership_id, status, audience_member_id)
     values ($1, 'approved', $2, 'player', $3, 'pending', $4)
     returning id`,
    [eventId, seasonId, membership.rows[0].id, audience.rows[0].id],
  );
  return invitation.rows[0].id;
}

async function answer(invitationId: string, response: "yes" | "no", reason: string | null = null) {
  await observer.query(
    `insert into public.rsvp_responses (invitation_id, response, reason, source, responded_at)
     values ($1, $2::public.rsvp_value, $3, 'signed_link', now())`,
    [invitationId, response, reason],
  );
  await observer.query("update public.invitations set status = 'responded' where id = $1", [
    invitationId,
  ]);
}

/**
 * Records a completed reminder rung against an invitation — the fact
 * `readPlayerHomeIn` now reads to tell `New invitations` apart from `Still
 * need your answer` (LAN-172 correction round 2, Q-22/Q-23).
 */
async function markReminderSent(invitationId: string, eventId: string | null, personId: string) {
  await observer.query(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, invitation_id, event_id, person_id, ladder_rung)
     values ($1, 'reminder', 'completed', $2, $3, $4, 1)`,
    [`${MARKER}-reminder-${invitationId}`, invitationId, eventId, personId],
  );
}

async function caught(run: () => Promise<unknown>): Promise<ServiceError> {
  try {
    await run();
  } catch (error) {
    if (isServiceError(error)) return error;
    throw error;
  }
  throw new Error("Expected this to be refused, and it was not.");
}

describe("the answer-specific landing content", () => {
  it("counts every current Yes for the event, and none that changed their mind", async () => {
    const { invitationId, eventId } = await fixture(48, "-agg");
    // A second invitee of the same event, answering Yes.
    const secondInvitationId = await additionalInvitee(eventId);
    await answer(secondInvitationId, "yes");
    // A third who said yes and then changed to no — must not be counted.
    const thirdInvitationId = await additionalInvitee(eventId);
    await answer(thirdInvitationId, "yes");
    await answer(thirdInvitationId, "no", "Changed my mind");

    const landing = await withTransaction((tx) => readPlayerAnswerLandingIn(tx, invitationId));
    expect(landing.attendingCount).toBe(1);
  });

  it("counts this player's other outstanding invitations, and excludes the one asked about", async () => {
    const { invitationId, personId } = await fixture(48, "-out-1");
    const otherEvent = await observer.query<{ id: string }>(
      `insert into public.events
         (season_id, name, event_type, status, scheduled_on, starts_at,
          audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
       values ($1, $2, 'practice', 'approved', current_date + 2, '18:00',
               now(), $3, now(), $3)
       returning id`,
      [seasonId, `${MARKER} practice-out-2`, personId],
    );
    const membership = await observer.query<{ id: string }>(
      "select id from public.season_memberships where person_id = $1",
      [personId],
    );
    const audience = await observer.query<{ id: string }>(
      `insert into public.event_audience_members (event_id, season_id, capacity, season_membership_id, added_by_person_id)
       values ($1, $2, 'player', $3, $4) returning id`,
      [otherEvent.rows[0].id, seasonId, membership.rows[0].id, personId],
    );
    await observer.query(
      `insert into public.invitations
         (event_id, event_status, season_id, capacity, season_membership_id, status, audience_member_id)
       values ($1, 'approved', $2, 'player', $3, 'pending', $4)`,
      [otherEvent.rows[0].id, seasonId, membership.rows[0].id, audience.rows[0].id],
    );

    const landing = await withTransaction((tx) => readPlayerAnswerLandingIn(tx, invitationId));
    expect(landing.otherOutstandingCount).toBe(1);
  });

  it("returns the event's questions filtered by capacity, with current answers", async () => {
    const { invitationId, eventId } = await fixture(48, "-q");
    const applicable = await observer.query<{ id: string }>(
      `insert into public.event_questions (event_id, prompt, answer_type, is_required, applies_to_capacities)
       values ($1, 'Can you drive?', 'boolean', true, '{player}') returning id`,
      [eventId],
    );
    await observer.query(
      `insert into public.event_questions (event_id, prompt, answer_type, is_required, applies_to_capacities)
       values ($1, 'Coach-only question', 'text', false, '{coach}')`,
      [eventId],
    );
    await observer.query(
      `insert into public.question_responses (invitation_id, event_id, event_question_id, answer_boolean)
       values ($1, $2, $3, true)`,
      [invitationId, eventId, applicable.rows[0].id],
    );

    const landing = await withTransaction((tx) => readPlayerAnswerLandingIn(tx, invitationId));
    expect(landing.questions).toHaveLength(1);
    expect(landing.questions[0].prompt).toBe("Can you drive?");
    expect(landing.questions[0].currentAnswer).toEqual({ text: null, boolean: true, choice: null });
    expect(landing.outstandingRequiredQuestions).toBe(0);
  });

  it("counts an unanswered required question as outstanding", async () => {
    const { invitationId, eventId } = await fixture(48, "-q2");
    await observer.query(
      `insert into public.event_questions (event_id, prompt, answer_type, is_required, applies_to_capacities)
       values ($1, 'Transport needed?', 'boolean', true, '{player}')`,
      [eventId],
    );

    const landing = await withTransaction((tx) => readPlayerAnswerLandingIn(tx, invitationId));
    expect(landing.outstandingRequiredQuestions).toBe(1);
  });
});

describe("saving event questions", () => {
  it("saves a text, a boolean and a choice answer together", async () => {
    const { personId, invitationId, eventId } = await fixture(48, "-save");
    const text = await observer.query<{ id: string }>(
      `insert into public.event_questions (event_id, prompt, answer_type, applies_to_capacities)
       values ($1, 'Dietary needs?', 'text', '{player}') returning id`,
      [eventId],
    );
    const boolean = await observer.query<{ id: string }>(
      `insert into public.event_questions (event_id, prompt, answer_type, applies_to_capacities)
       values ($1, 'Can you drive?', 'boolean', '{player}') returning id`,
      [eventId],
    );
    const choice = await observer.query<{ id: string }>(
      `insert into public.event_questions (event_id, prompt, answer_type, choices, applies_to_capacities)
       values ($1, 'Kit size?', 'choice', '{S,M,L}', '{player}') returning id`,
      [eventId],
    );

    await withTransaction((tx) =>
      answerEventQuestionsIn(tx, personId, invitationId, [
        { questionId: text.rows[0].id, text: "Vegetarian" },
        { questionId: boolean.rows[0].id, boolean: true },
        { questionId: choice.rows[0].id, choice: "M" },
      ]),
    );

    const saved = await observer.query<{
      answer_text: string | null;
      answer_boolean: boolean | null;
      answer_choice: string | null;
    }>(
      "select answer_text, answer_boolean, answer_choice from public.question_responses where invitation_id = $1 order by event_question_id",
      [invitationId],
    );
    expect(saved.rows).toHaveLength(3);
  });

  it("updates an existing answer rather than duplicating it", async () => {
    const { personId, invitationId, eventId } = await fixture(48, "-update");
    const question = await observer.query<{ id: string }>(
      `insert into public.event_questions (event_id, prompt, answer_type, applies_to_capacities)
       values ($1, 'Dietary needs?', 'text', '{player}') returning id`,
      [eventId],
    );

    await withTransaction((tx) =>
      answerEventQuestionsIn(tx, personId, invitationId, [
        { questionId: question.rows[0].id, text: "Vegetarian" },
      ]),
    );
    await withTransaction((tx) =>
      answerEventQuestionsIn(tx, personId, invitationId, [
        { questionId: question.rows[0].id, text: "Vegan" },
      ]),
    );

    const saved = await observer.query<{ answer_text: string }>(
      "select answer_text from public.question_responses where invitation_id = $1",
      [invitationId],
    );
    expect(saved.rows).toHaveLength(1);
    expect(saved.rows[0].answer_text).toBe("Vegan");
  });

  it("refuses to save another person's answers even though the form names their invitation — REQ-cross-person-isolation", async () => {
    const personA = await fixture(48, "-cross-a");
    const personB = await fixture(48, "-cross-b");
    const question = await observer.query<{ id: string }>(
      `insert into public.event_questions (event_id, prompt, answer_type, applies_to_capacities)
       values ($1, 'Dietary needs?', 'text', '{player}') returning id`,
      [personB.eventId],
    );

    // Person A's durable token has resolved to personA.personId; the form
    // nonetheless carries person B's invitationId — exactly what a player
    // editing the hidden field, or calling the action directly, can do.
    const error = await caught(() =>
      withTransaction((tx) =>
        answerEventQuestionsIn(tx, personA.personId, personB.invitationId, [
          { questionId: question.rows[0].id, text: "Overwritten by a stranger" },
        ]),
      ),
    );
    expect(error.rule).toBe(INVITATION_NOT_OWNED_RULE);

    // Refused, and nothing was written to person B's answers.
    const saved = await observer.query(
      "select count(*) as count from public.question_responses where invitation_id = $1",
      [personB.invitationId],
    );
    expect(Number(saved.rows[0].count)).toBe(0);
  });
});

describe("the durable page's own view", () => {
  it("puts a fresh, unanswered invitation in New invitations, and already-answered work below", async () => {
    const unanswered = await fixture(48, "-home-1");
    const answeredInvitationId = await secondInvitationFor(unanswered.personId, 72, "-home-2");
    await answer(answeredInvitationId, "yes");

    const home = await withTransaction((tx) => readPlayerHomeIn(tx, unanswered.personId));
    expect(home.newInvitations.map((e) => e.invitationId)).toEqual([unanswered.invitationId]);
    expect(home.stillNeedAnswer).toHaveLength(0);
    expect(home.answeredUpcoming.map((e) => e.invitationId)).toEqual([answeredInvitationId]);
  });

  it("moves an unanswered invitation to Still need your answer once the club has chased it — Q-22", async () => {
    const chased = await fixture(48, "-chased");
    await markReminderSent(chased.invitationId, chased.eventId, chased.personId);

    const home = await withTransaction((tx) => readPlayerHomeIn(tx, chased.personId));
    expect(home.newInvitations).toHaveLength(0);
    expect(home.stillNeedAnswer.map((e) => e.invitationId)).toEqual([chased.invitationId]);
  });

  it("moves a standing No's unreplaced default reason to Follow-up needed, not the answered archive", async () => {
    const { invitationId, personId } = await fixture(48, "-default");
    await answer(invitationId, "no", NO_REASON_GIVEN_DEFAULT);

    const home = await withTransaction((tx) => readPlayerHomeIn(tx, personId));
    expect(home.answeredUpcoming).toHaveLength(0);
    expect(home.followUpNeeded).toHaveLength(1);
    expect(home.followUpNeeded[0].reasonIsDefault).toBe(true);
  });

  it("moves a standing Yes with an outstanding required question to Follow-up needed", async () => {
    const { invitationId, personId, eventId } = await fixture(48, "-yes-outstanding");
    await observer.query(
      `insert into public.event_questions (event_id, prompt, answer_type, is_required, applies_to_capacities)
       values ($1, 'Transport needed?', 'boolean', true, '{player}')`,
      [eventId],
    );
    await answer(invitationId, "yes");

    const home = await withTransaction((tx) => readPlayerHomeIn(tx, personId));
    expect(home.answeredUpcoming).toHaveLength(0);
    expect(home.followUpNeeded).toHaveLength(1);
    expect(home.followUpNeeded[0].outstandingRequiredQuestions).toBe(1);
  });

  it("does not flag a No that already carries a real reason, and keeps it in the answered archive", async () => {
    const { invitationId, personId } = await fixture(48, "-real-reason");
    await answer(invitationId, "no", "Academic conflict");

    const home = await withTransaction((tx) => readPlayerHomeIn(tx, personId));
    expect(home.followUpNeeded).toHaveLength(0);
    expect(home.answeredUpcoming[0].reasonIsDefault).toBe(false);
    expect(home.answeredUpcoming[0].reason).toBe("Academic conflict");
  });

  it("moves anything beyond the 21-day horizon into furtherOut, whatever its answer state — Q-20", async () => {
    const near = await fixture(48, "-near");
    const farUnanswered = await secondInvitationFor(near.personId, 24 * 30, "-far-unanswered");
    const farAnswered = await secondInvitationFor(near.personId, 24 * 35, "-far-answered");
    await answer(farAnswered, "yes");

    const home = await withTransaction((tx) => readPlayerHomeIn(tx, near.personId));
    const nearIds = [...home.newInvitations, ...home.stillNeedAnswer, ...home.answeredUpcoming].map(
      (e) => e.invitationId,
    );
    expect(nearIds).toEqual([near.invitationId]);
    const furtherIds = home.furtherOut.map((e) => e.invitationId).sort();
    expect(furtherIds).toEqual([farAnswered, farUnanswered].sort());
  });

  it("scopes outstandingCount to the 21-day horizon, excluding further-out unanswered work — Q-26", async () => {
    const near = await fixture(48, "-count-near");
    await secondInvitationFor(near.personId, 24 * 30, "-count-far");

    const home = await withTransaction((tx) => readPlayerHomeIn(tx, near.personId));
    expect(home.outstandingCount).toBe(1);
  });

  it("counts nothing outstanding when the only unanswered work is beyond the horizon — Q-26", async () => {
    const far = await fixture(24 * 30, "-count-only-far");

    const home = await withTransaction((tx) => readPlayerHomeIn(tx, far.personId));
    expect(home.outstandingCount).toBe(0);
    expect(home.furtherOut.map((e) => e.invitationId)).toEqual([far.invitationId]);
  });

  it("keeps outstandingCount identical to the size of the rendered near-term unanswered lists — Q-26 pin", async () => {
    const near = await fixture(48, "-count-agree-near");
    await secondInvitationFor(near.personId, 24 * 30, "-count-agree-far");
    const chased = await secondInvitationFor(near.personId, 72, "-count-agree-chased");
    await markReminderSent(chased, null, near.personId);

    const home = await withTransaction((tx) => readPlayerHomeIn(tx, near.personId));
    const renderedUnanswered = home.newInvitations.length + home.stillNeedAnswer.length;
    expect(home.outstandingCount).toBe(renderedUnanswered);
  });

  it("names the single soonest unanswered invitation across New and Still-need-your-answer", async () => {
    const soonest = await fixture(24, "-dominant-soonest");
    const laterUnanswered = await secondInvitationFor(
      soonest.personId,
      48,
      "-dominant-later-unanswered",
    );
    await markReminderSent(laterUnanswered, null, soonest.personId);

    const home = await withTransaction((tx) => readPlayerHomeIn(tx, soonest.personId));
    expect(home.nextInvitationId).toBe(soonest.invitationId);
  });

  it("leaves nextInvitationId null once nothing needs an answer", async () => {
    const { invitationId, personId } = await fixture(48, "-dominant-none");
    await answer(invitationId, "yes");

    const home = await withTransaction((tx) => readPlayerHomeIn(tx, personId));
    expect(home.nextInvitationId).toBeNull();
  });

  it("returns the player's own display name", async () => {
    const { personId } = await fixture(48, "-name");

    const home = await withTransaction((tx) => readPlayerHomeIn(tx, personId));
    expect(home.playerName).toContain(MARKER);
  });

  it("excludes an event whose start has already passed", async () => {
    const { personId } = await fixture(-2, "-past");

    const home = await withTransaction((tx) => readPlayerHomeIn(tx, personId));
    expect(home.newInvitations).toHaveLength(0);
    expect(home.stillNeedAnswer).toHaveLength(0);
    expect(home.followUpNeeded).toHaveLength(0);
    expect(home.answeredUpcoming).toHaveLength(0);
    expect(home.furtherOut).toHaveLength(0);
    expect(home.outstandingCount).toBe(0);
  });

  it("returns nothing for a person with no invitations — the empty state", async () => {
    const lonely = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name, created_at)
       values ($1, 'Nobody', now() + interval '100 years') returning id`,
      [MARKER],
    );
    const home = await withTransaction((tx) => readPlayerHomeIn(tx, lonely.rows[0].id));
    expect(home.newInvitations).toHaveLength(0);
    expect(home.answeredUpcoming).toHaveLength(0);
    expect(home.outstandingCount).toBe(0);
  });

  it("returns only this person's own work — REQ-cross-person-isolation", async () => {
    const mine = await fixture(48, "-mine");
    const somebodyElse = await fixture(48, "-else");

    const home = await withTransaction((tx) => readPlayerHomeIn(tx, mine.personId));
    const ids = home.newInvitations.map((e) => e.invitationId);
    expect(ids).toContain(mine.invitationId);
    expect(ids).not.toContain(somebodyElse.invitationId);
  });
});

describe("writing from the durable page", () => {
  it("records a change of answer through the same transactional path as the answer link", async () => {
    const { invitationId, personId } = await fixture(48, "-write");

    await withTransaction((tx) =>
      recordPlayerHomeAnswerIn(tx, personId, invitationId, { response: "yes" }),
    );

    const status = await observer.query<{ status: string }>(
      "select status::text as status from public.invitations where id = $1",
      [invitationId],
    );
    expect(status.rows[0].status).toBe("responded");
  });

  it("refuses to write an invitation that does not belong to this person", async () => {
    const owner = await fixture(48, "-owner");
    const stranger = await fixture(48, "-stranger");

    const error = await caught(() =>
      withTransaction((tx) =>
        recordPlayerHomeAnswerIn(tx, stranger.personId, owner.invitationId, { response: "yes" }),
      ),
    );
    expect(error.rule).toBe("player_home_invitation_not_owned");

    // Refused, and nothing was written.
    const responses = await observer.query(
      "select count(*) as count from public.rsvp_responses where invitation_id = $1",
      [owner.invitationId],
    );
    expect(Number(responses.rows[0].count)).toBe(0);
  });

  it("refuses to write once the event has started", async () => {
    const { invitationId, personId, eventId } = await fixture(48, "-closed");
    await observer.query(
      `update public.events set starts_at = (now() at time zone 'Europe/London' - interval '1 minute')::time,
              scheduled_on = (now() at time zone 'Europe/London')::date
        where id = $1`,
      [eventId],
    );

    const error = await caught(() =>
      withTransaction((tx) =>
        recordPlayerHomeAnswerIn(tx, personId, invitationId, { response: "yes" }),
      ),
    );
    expect(error.rule).toBe("player_home_write_window_closed");
  });
});
