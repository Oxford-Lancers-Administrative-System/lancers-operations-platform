// @vitest-environment node
/**
 * `/operate/recruitment`'s own read — `W1`, LAN-204. Against the real local
 * database: the board joins across `people`, `recruitment_prospects`,
 * `season_messaging_consents`, `recruitment_questionnaire_responses`,
 * `notification_jobs`/`delivery_attempts` and the recruit-capacity
 * `invitations`/`attendance_records` rows, none of which a mocked
 * transaction could prove wrong.
 *
 * This suite writes into the **real, currently-open season** — never a
 * season of its own — on the same reasoning `roster-board.test.ts` already
 * establishes: `listRecruitmentBoard()` resolves "the open season" itself
 * with no override, and this mission's own local stack is shared with
 * `WP-attendance-walk-up`'s worker, so minting a competing `open` season
 * with a later `starts_on` would race whichever of the two calls
 * `readCurrentSeasonIn` next. Every row this suite writes is marked and
 * asserted on by that mark alone.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { withTransaction, closePool } from "@/lib/db";
import { grantSeasonMessagingConsentIn } from "./messaging-consent";
import { listRecruitmentBoard } from "./recruitment-board";
import { readCurrentSeasonIn } from "./seasons";
import { openObserver } from "../../../tests/helpers/service-layer";

const MARKER = "LAN204BoardSuite";

let observer: Client;
let seasonId: string;

beforeAll(async () => {
  observer = await openObserver();
  const season = await withTransaction((tx) => readCurrentSeasonIn(tx));
  seasonId = season.id;
});

afterEach(async () => {
  const people = "(select id from public.people where given_name = $1)";
  await observer.query(
    `delete from public.recruitment_questionnaire_responses
      where prospect_id in (select id from public.recruitment_prospects where person_id in ${people})`,
    [MARKER],
  );
  await observer.query(
    `delete from public.delivery_attempts
      where notification_job_id in (select id from public.notification_jobs where person_id in ${people})`,
    [MARKER],
  );
  await observer.query(`delete from public.notification_jobs where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.recruitment_prospects where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(
    `delete from public.season_messaging_consents where person_id in ${people}`,
    [MARKER],
  );
  await observer.query(`delete from public.contact_points where person_id in ${people}`, [MARKER]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

async function newProspect(
  familyName: string,
  status: string = "identified",
): Promise<{ personId: string; prospectId: string }> {
  const person = await withTransaction((tx) =>
    tx.query<{ id: string }>(
      "insert into public.people (given_name, family_name) values ($1, $2) returning id",
      [MARKER, familyName],
    ),
  );
  const personId = person.rows[0].id;
  const prospect = await withTransaction((tx) =>
    tx.query<{ id: string }>(
      `insert into public.recruitment_prospects (person_id, season_id, status, source, first_contact_on)
       values ($1::uuid, $2::uuid, $3::public.prospect_status, 'walk_up', current_date)
       returning id`,
      [personId, seasonId, status],
    ),
  );
  return { personId, prospectId: prospect.rows[0].id };
}

describe("listRecruitmentBoard", () => {
  it("reads every recruit in the open season, whatever their status", async () => {
    await newProspect("Alpha", "identified");
    await newProspect("Beta", "declined");
    const data = await listRecruitmentBoard();
    const rows = data.rows.filter((row) => row.displayName.startsWith(MARKER));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.status).sort()).toEqual(["declined", "identified"]);
  });

  it("reads consent, and defaults to never_asked with no row at all", async () => {
    const { personId } = await newProspect("Gamma", "identified");
    await withTransaction((tx) => grantSeasonMessagingConsentIn(tx, personId, seasonId));
    const data = await listRecruitmentBoard();
    const row = data.rows.find((r) => r.personId === personId);
    expect(row?.consent).toBe("granted");

    const { personId: unaskedId } = await newProspect("Delta", "identified");
    const data2 = await listRecruitmentBoard();
    const unasked = data2.rows.find((r) => r.personId === unaskedId);
    expect(unasked?.consent).toBe("never_asked");
  });

  it("reads the six football-background answers by this package's own B1-B6 codebook", async () => {
    const { prospectId, personId } = await newProspect("Epsilon", "identified");
    await withTransaction((tx) =>
      tx.query(
        `insert into public.recruitment_questionnaire_responses
           (prospect_id, questionnaire, question_code, answer_boolean)
         values ($1::uuid, 'football_background', 'B1', true)`,
        [prospectId],
      ),
    );
    await withTransaction((tx) =>
      tx.query(
        `insert into public.recruitment_questionnaire_responses
           (prospect_id, questionnaire, question_code, answer_choice)
         values ($1::uuid, 'football_background', 'B3', 'Wide receiver')`,
        [prospectId],
      ),
    );
    const data = await listRecruitmentBoard();
    const row = data.rows.find((r) => r.personId === personId);
    expect(row?.playedBefore).toBe("yes");
    expect(row?.positionInterest).toBe("Wide receiver");
    expect(row?.watchedBefore).toBeNull();
  });

  it("reads personalSent as false until a welcome/details_reminder job is actually accepted", async () => {
    const { personId } = await newProspect("Zeta", "identified");
    const before = (await listRecruitmentBoard()).rows.find((r) => r.personId === personId);
    expect(before?.personalSent).toBe(false);

    const job = await withTransaction((tx) =>
      tx.query<{ id: string }>(
        `insert into public.notification_jobs
           (idempotency_key, job_type, status, person_id, channel, scheduled_for, template_variables)
         values ($1, 'other', 'pending', $2::uuid, 'whatsapp', now(), '{}'::jsonb)
         returning id`,
        [`recruit-cycle:welcome:${personId}:${seasonId}`, personId],
      ),
    );
    // Not yet accepted — still not "sent".
    const stillNotSent = (await listRecruitmentBoard()).rows.find((r) => r.personId === personId);
    expect(stillNotSent?.personalSent).toBe(false);

    await withTransaction((tx) =>
      tx.query(
        `insert into public.delivery_attempts
           (notification_job_id, attempt_number, channel, provider, accepted_at, provider_message_id)
         values ($1::uuid, 1, 'whatsapp', 'meta', now(), $2)`,
        [job.rows[0].id, `wamid.${MARKER}`],
      ),
    );
    const after = (await listRecruitmentBoard()).rows.find((r) => r.personId === personId);
    expect(after?.personalSent).toBe(true);
    expect(after?.recruitmentSent).toBe(false);
  });
});
