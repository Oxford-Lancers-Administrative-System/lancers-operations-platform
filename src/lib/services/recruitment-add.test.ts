// @vitest-environment node
/**
 * `W6` — add a recruit by hand. LAN-206. Against the real local database,
 * on `recruitment-cycle-dispatch.test.ts`'s own reasoning: consent gating
 * and the capture-time cycle declaration are exactly the kind of behaviour a
 * mocked transaction cannot prove.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";
import { closePool, withTransaction } from "@/lib/db";
import { createPerson } from "./person-create";
import {
  finishRecruitmentAddIn,
  refuseIfAlreadyAMemberIn,
  requireMobileProvided,
} from "./recruitment-add";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const MARKER = "LAN206AddRecruitSuite";

let observer: Client;
let seasonId: string;
let operatorPersonId: string;

beforeAll(async () => {
  observer = await openObserver();
  const anchor = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id limit 1",
    [await seededIdentityCreatedAt(observer)],
  );
  operatorPersonId = anchor.rows[0].id;
  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );
  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on, opened_at, opened_by_person_id)
     values ($1, 'open', $2, '2019-09-01', '2020-06-01', now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, operatorPersonId],
  );
  seasonId = season.rows[0].id;
});

afterEach(async () => {
  const people = "(select id from public.people where given_name = $1)";
  await observer.query(`delete from public.notification_jobs where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(
    `delete from public.season_messaging_consents where person_id in ${people}`,
    [MARKER],
  );
  await observer.query(`delete from public.recruitment_prospects where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.season_memberships where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.audit_events where entity_id in ${people}`, [MARKER]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where id = $1::uuid", [seasonId]);
  await observer.end();
  await closePool();
});

function uniquePhone(): string {
  return `0770090${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

async function newPerson(givenName = "Fixture"): Promise<string> {
  const person = await withTransaction((tx) =>
    tx.query<{ id: string }>(
      "insert into public.people (given_name, family_name) values ($1, $2) returning id",
      [MARKER, givenName],
    ),
  );
  return person.rows[0].id;
}

describe("requireMobileProvided", () => {
  it("refuses a blank or missing mobile", () => {
    expect(() => requireMobileProvided(null)).toThrow(/mobile/i);
    expect(() => requireMobileProvided("")).toThrow(/mobile/i);
    expect(() => requireMobileProvided("   ")).toThrow(/mobile/i);
  });

  it("accepts a non-blank mobile", () => {
    expect(() => requireMobileProvided("07700 900123")).not.toThrow();
  });
});

describe("refuseIfAlreadyAMemberIn", () => {
  it("refuses linking onto a person who already holds a membership this season", async () => {
    const personId = await newPerson();
    await withTransaction((tx) =>
      tx.query(
        `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
         values ($1::uuid, $2::uuid, 'onboarding', 'new', current_date)`,
        [personId, seasonId],
      ),
    );

    await expect(
      withTransaction((tx) => refuseIfAlreadyAMemberIn(tx, personId, seasonId)),
    ).rejects.toThrow(/already holds a membership/i);
  });

  it("passes for a person with no membership this season", async () => {
    const personId = await newPerson();
    await expect(
      withTransaction((tx) => refuseIfAlreadyAMemberIn(tx, personId, seasonId)),
    ).resolves.toBeUndefined();
  });
});

describe("finishRecruitmentAddIn", () => {
  it("with no opt-in evidence: creates the prospect and declares no cycle jobs at all", async () => {
    const created = await createPerson({
      actorPersonId: operatorPersonId,
      input: { givenName: MARKER, familyName: "NoEvidence", mobile: uniquePhone() },
      decision: { kind: "create_new" },
    });

    const result = await withTransaction((tx) =>
      finishRecruitmentAddIn(tx, {
        actorPersonId: operatorPersonId,
        personId: created.personId,
        seasonId,
        academic: {},
      }),
    );

    expect(result.prospectCreated).toBe(true);
    expect(result.cycleDeclared).toBe(false);

    const consent = await observer.query(
      "select 1 from public.season_messaging_consents where person_id = $1::uuid",
      [created.personId],
    );
    expect(consent.rows).toHaveLength(0);
    const jobs = await observer.query(
      "select 1 from public.notification_jobs where person_id = $1::uuid",
      [created.personId],
    );
    expect(jobs.rows).toHaveLength(0);
  });

  it("with opt-in evidence: grants operator_recorded consent and declares the welcome track", async () => {
    const created = await createPerson({
      actorPersonId: operatorPersonId,
      input: { givenName: MARKER, familyName: "WithEvidence", mobile: uniquePhone() },
      decision: { kind: "create_new" },
    });

    const result = await withTransaction((tx) =>
      finishRecruitmentAddIn(tx, {
        actorPersonId: operatorPersonId,
        personId: created.personId,
        seasonId,
        academic: {
          optInEvidence: "freshers_fair",
          college: "Kestrelhall",
          matriculationYear: "2026",
        },
      }),
    );

    expect(result.cycleDeclared).toBe(true);

    const consent = await observer.query<{ state: string; source: string }>(
      "select state::text as state, source::text as source from public.season_messaging_consents where person_id = $1::uuid",
      [created.personId],
    );
    expect(consent.rows[0]).toEqual({ state: "granted", source: "operator_recorded" });

    const jobs = await observer.query<{ idempotency_key: string }>(
      "select idempotency_key from public.notification_jobs where person_id = $1::uuid order by idempotency_key",
      [created.personId],
    );
    expect(jobs.rows.map((r) => r.idempotency_key)).toEqual([
      `recruit-cycle:details_reminder:${created.personId}:${seasonId}`,
      `recruit-cycle:welcome:${created.personId}:${seasonId}`,
    ]);

    const person = await observer.query<{ college: string; matriculation_year: number }>(
      "select college, matriculation_year from public.people where id = $1::uuid",
      [created.personId],
    );
    expect(person.rows[0].college).toBe("Kestrelhall");
    expect(person.rows[0].matriculation_year).toBe(2026);
  });

  it("already a recruit this season: offers the existing prospect rather than erroring", async () => {
    const created = await createPerson({
      actorPersonId: operatorPersonId,
      input: { givenName: MARKER, familyName: "AlreadyRecruit", mobile: uniquePhone() },
      decision: { kind: "create_new" },
    });

    const first = await withTransaction((tx) =>
      finishRecruitmentAddIn(tx, {
        actorPersonId: operatorPersonId,
        personId: created.personId,
        seasonId,
        academic: {},
      }),
    );
    const second = await withTransaction((tx) =>
      finishRecruitmentAddIn(tx, {
        actorPersonId: operatorPersonId,
        personId: created.personId,
        seasonId,
        academic: {},
      }),
    );

    expect(second.prospectId).toBe(first.prospectId);
    expect(second.prospectCreated).toBe(false);
  });
});
