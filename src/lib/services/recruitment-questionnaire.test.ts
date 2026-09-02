// @vitest-environment node
/**
 * Questionnaire B's own write — `W4`, LAN-206. Against the real local
 * database: the superseded-row idiom and the identified→engaged transition
 * are exactly what a mocked transaction cannot prove.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";
import { closePool, withTransaction } from "@/lib/db";
import { submitQuestionnaireBAnswersIn } from "./recruitment-questionnaire";
import { readRecruitmentProspectIn } from "./recruitment-prospect";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const MARKER = "LAN206QuestionnaireBSuite";

let observer: Client;
let seasonId: string;

beforeAll(async () => {
  observer = await openObserver();
  const anchor = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id limit 1",
    [await seededIdentityCreatedAt(observer)],
  );
  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );
  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on, opened_at, opened_by_person_id)
     values ($1, 'open', $2, '2019-09-01', '2020-06-01', now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, anchor.rows[0].id],
  );
  seasonId = season.rows[0].id;
});

afterEach(async () => {
  const people = "(select id from public.people where given_name = $1)";
  await observer.query(
    `delete from public.recruitment_questionnaire_responses
      where prospect_id in (select id from public.recruitment_prospects where person_id in ${people})`,
    [MARKER],
  );
  await observer.query(
    `delete from public.recruitment_prospect_status_events
      where prospect_id in (select id from public.recruitment_prospects where person_id in ${people})`,
    [MARKER],
  );
  await observer.query(`delete from public.recruitment_prospects where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where id = $1::uuid", [seasonId]);
  await observer.end();
  await closePool();
});

async function newProspect(
  status: string = "identified",
): Promise<{ personId: string; prospectId: string }> {
  const person = await withTransaction((tx) =>
    tx.query<{ id: string }>(
      "insert into public.people (given_name, family_name) values ($1, $2) returning id",
      [MARKER, "Fixture"],
    ),
  );
  const personId = person.rows[0].id;
  const prospect = await withTransaction((tx) =>
    tx.query<{ id: string }>(
      `insert into public.recruitment_prospects (person_id, season_id, status, source)
       values ($1::uuid, $2::uuid, $3::public.prospect_status, 'other') returning id`,
      [personId, seasonId, status],
    ),
  );
  return { personId, prospectId: prospect.rows[0].id };
}

describe("submitQuestionnaireBAnswersIn", () => {
  it("writes every supplied answer and moves identified to engaged", async () => {
    const { prospectId } = await newProspect("identified");

    await withTransaction((tx) =>
      submitQuestionnaireBAnswersIn(tx, prospectId, {
        playedBefore: "yes",
        watchedBefore: "no",
        positionInterest: "Quarterback",
        gearOwned: "Boots only",
        howTheyHeard: "Freshers' Fair",
        anythingElse: "Looking forward to it",
      }),
    );

    const record = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
    expect(record?.answers).toEqual({
      playedBefore: "yes",
      watchedBefore: "no",
      positionInterest: "Quarterback",
      gearOwned: "Boots only",
      howTheyHeard: "Freshers' Fair",
      anythingElse: "Looking forward to it",
    });
    expect(record?.status).toBe("engaged");
  });

  it("a later answer supersedes the earlier one, which is kept in history", async () => {
    const { prospectId } = await newProspect("identified");

    await withTransaction((tx) =>
      submitQuestionnaireBAnswersIn(tx, prospectId, { playedBefore: "yes" }),
    );
    await withTransaction((tx) =>
      submitQuestionnaireBAnswersIn(tx, prospectId, { playedBefore: "no" }),
    );

    const record = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
    expect(record?.answers.playedBefore).toBe("no");

    const history = await observer.query(
      `select answer_boolean, superseded_at is not null as superseded
         from public.recruitment_questionnaire_responses
        where prospect_id = $1::uuid and question_code = 'B1'
        order by created_at`,
      [prospectId],
    );
    expect(history.rows).toEqual([
      { answer_boolean: true, superseded: true },
      { answer_boolean: false, superseded: false },
    ]);
  });

  it("a blank field never erases an existing answer", async () => {
    const { prospectId } = await newProspect("identified");

    await withTransaction((tx) =>
      submitQuestionnaireBAnswersIn(tx, prospectId, { anythingElse: "Something real" }),
    );
    await withTransaction((tx) =>
      submitQuestionnaireBAnswersIn(tx, prospectId, { anythingElse: "" }),
    );

    const record = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
    expect(record?.answers.anythingElse).toBe("Something real");
  });

  it("never moves a recruit backwards off engaged or an exit status", async () => {
    const { prospectId } = await newProspect("engaged");

    await withTransaction((tx) =>
      submitQuestionnaireBAnswersIn(tx, prospectId, { playedBefore: "yes" }),
    );

    const record = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
    expect(record?.status).toBe("engaged");
  });

  it("an entirely blank submission writes nothing and never moves the status", async () => {
    const { prospectId } = await newProspect("identified");

    await withTransaction((tx) => submitQuestionnaireBAnswersIn(tx, prospectId, {}));

    const record = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
    expect(record?.status).toBe("identified");
    expect(record?.answers).toEqual({
      playedBefore: null,
      watchedBefore: null,
      positionInterest: null,
      gearOwned: null,
      howTheyHeard: null,
      anythingElse: null,
    });
  });
});
