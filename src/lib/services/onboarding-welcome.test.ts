// @vitest-environment node
/**
 * The `onboarding-opened` welcome emitter — LAN-214, `REQ-one-welcome` and
 * `REQ-transport`. Against the real local database: what is under test is the
 * idempotent job insert, the activity-log write in the same transaction, and
 * that the welcome's own gate really does allow what a follow-up's gate
 * refuses — none of which a mocked transaction can prove.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction } from "@/lib/db";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import { requireGrantedSeasonMessagingConsentIn } from "./messaging-consent";
import { readOnboardingActivityLogIn } from "./onboarding-activity-log";
import {
  emitOnboardingOpenedWelcomeIn,
  onboardingWelcomeAlreadyQueuedIn,
} from "./onboarding-welcome";

const MARKER = "LAN214Welcome";

let observer: Client;
let seasonId: string;

async function insertPerson(tag: string): Promise<string> {
  const result = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [MARKER, tag],
  );
  return result.rows[0].id;
}

async function insertMembership(personId: string): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
     values ($1::uuid, $2::uuid, 'onboarding', 'new', current_date) returning id`,
    [personId, seasonId],
  );
  return result.rows[0].id;
}

beforeAll(async () => {
  observer = await openObserver();
  const anchor = await seededActorPersonId(observer);
  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );
  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on, opened_at, opened_by_person_id)
     values ($1, 'open', $2, '2019-09-01', '2020-06-01', now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, anchor],
  );
  seasonId = season.rows[0].id;
});

afterEach(async () => {
  await observer.query(
    `delete from public.notification_jobs where person_id in (select id from public.people where given_name = $1)`,
    [MARKER],
  );
  await observer.query(
    `delete from public.onboarding_activity_log where season_membership_id in
       (select id from public.season_memberships where person_id in
         (select id from public.people where given_name = $1))`,
    [MARKER],
  );
  await observer.query(
    `delete from public.season_messaging_consents where person_id in (select id from public.people where given_name = $1)`,
    [MARKER],
  );
  await observer.query(
    `delete from public.season_memberships where person_id in (select id from public.people where given_name = $1)`,
    [MARKER],
  );
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where id = $1::uuid", [seasonId]);
  await observer.end();
  await closePool();
});

describe("emitOnboardingOpenedWelcomeIn", () => {
  it("queues one job and logs one ask, for a person with no recorded consent yet", async () => {
    const personId = await insertPerson("never-asked");
    const membershipId = await insertMembership(personId);

    const result = await withTransaction((tx) =>
      emitOnboardingOpenedWelcomeIn(tx, { membershipId, personId, seasonId }),
    );
    expect(result.queued).toBe(true);

    const job = await observer.query(
      "select job_type, status, channel from public.notification_jobs where person_id = $1",
      [personId],
    );
    expect(job.rows[0]).toMatchObject({
      job_type: "other",
      status: "pending",
      channel: "whatsapp",
    });

    const log = await withTransaction((tx) => readOnboardingActivityLogIn(tx, membershipId));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ section: "welcome", kind: "ask" });
  });

  it("fires once per membership regardless of how many times it is called — one door, or three", async () => {
    const personId = await insertPerson("multi-door");
    const membershipId = await insertMembership(personId);

    const first = await withTransaction((tx) =>
      emitOnboardingOpenedWelcomeIn(tx, { membershipId, personId, seasonId }),
    );
    const second = await withTransaction((tx) =>
      emitOnboardingOpenedWelcomeIn(tx, { membershipId, personId, seasonId }),
    );

    expect(first.queued).toBe(true);
    expect(second).toEqual({ queued: false, reason: "already_queued" });

    const jobs = await observer.query(
      "select id from public.notification_jobs where person_id = $1",
      [personId],
    );
    expect(jobs.rows).toHaveLength(1);

    const alreadyQueued = await withTransaction((tx) =>
      onboardingWelcomeAlreadyQueuedIn(tx, membershipId),
    );
    expect(alreadyQueued).toBe(true);
  });

  it("refuses only for a person who explicitly withdrew or refused consent", async () => {
    const personId = await insertPerson("withdrawn");
    const membershipId = await insertMembership(personId);
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source, changed_at)
       values ($1::uuid, $2::uuid, 'withdrawn', 'operator_recorded', now())`,
      [personId, seasonId],
    );

    const failure = await withTransaction((tx) =>
      emitOnboardingOpenedWelcomeIn(tx, { membershipId, personId, seasonId }),
    ).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.rule).toBe("onboarding_welcome_requires_a_basis");
  });

  /**
   * `REQ-transport`'s own acceptance criterion: "Prove that a follow-up is
   * refused in that state and the welcome is not." A person who has neither
   * granted nor refused anything yet is exactly that state.
   */
  it("is the one message permitted before a basis exists — a follow-up's own gate still refuses", async () => {
    const personId = await insertPerson("no-basis-yet");
    const membershipId = await insertMembership(personId);

    const welcome = await withTransaction((tx) =>
      emitOnboardingOpenedWelcomeIn(tx, { membershipId, personId, seasonId }),
    );
    expect(welcome.queued).toBe(true);

    const followUpFailure = await withTransaction((tx) =>
      requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId),
    ).catch((error: unknown) => error);
    expect(isServiceError(followUpFailure) && followUpFailure.rule).toBe(
      "season_messaging_consent_required",
    );
  });
});
