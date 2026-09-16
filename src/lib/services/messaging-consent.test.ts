// @vitest-environment node
/**
 * The season-scoped messaging consent gate — LAN-202, packet amendment 1.
 *
 * Against the real local database: the guarantee under test is the
 * `(person_id, season_id)` uniqueness `season_messaging_consents` enforces and
 * the upsert behaviour built on top of it, neither of which a mocked
 * transaction can prove.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction } from "@/lib/db";
import {
  CONSENT_REASON_REQUIRED_RULE,
  CONSENT_WITHDRAWN_JOB_REASON,
  grantSeasonMessagingConsentByOperatorIn,
  grantSeasonMessagingConsentIn,
  hasGrantedSeasonMessagingConsentIn,
  hasGrantedViaSignupFormIn,
  mayReceiveWelcomeContactIn,
  readSeasonMessagingConsentIn,
  requireGrantedSeasonMessagingConsent,
  requireGrantedSeasonMessagingConsentIn,
  SEASON_MESSAGING_CONSENT_REQUIRED_RULE,
  withdrawSeasonMessagingConsentByOperatorIn,
  withdrawSeasonMessagingConsentIn,
} from "./messaging-consent";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const MARKER = "LAN202ConsentSuite";

let observer: Client;
let seasonId: string;

async function insertPerson(tag: string): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [MARKER, tag],
  );
  return result.rows[0].id;
}

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
    `delete from public.season_messaging_consents where person_id in ${people}`,
    [MARKER],
  );
  // LAN-371's withdrawal cancels queued jobs, so this suite creates some.
  await observer.query(`delete from public.notification_jobs where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(
    `delete from public.audit_events where entity_id in ${people} or actor_person_id in ${people}`,
    [MARKER],
  );
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where id = $1::uuid", [seasonId]);
  await observer.end();
  await closePool();
});

describe("readSeasonMessagingConsentIn / hasGrantedSeasonMessagingConsentIn", () => {
  it("reads null and false for a person never asked", async () => {
    const personId = await insertPerson("never-asked");
    await withTransaction(async (tx) => {
      expect(await readSeasonMessagingConsentIn(tx, personId, seasonId)).toBeNull();
      expect(await hasGrantedSeasonMessagingConsentIn(tx, personId, seasonId)).toBe(false);
    });
  });
});

describe("grantSeasonMessagingConsentIn", () => {
  it("writes a granted, dated, qr_self_entry row", async () => {
    const personId = await insertPerson("grant");
    await withTransaction(async (tx) => {
      const consent = await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      expect(consent.state).toBe("granted");
      expect(consent.source).toBe("qr_self_entry");
    });
    const row = await observer.query(
      `select state::text as state, source::text as source
         from public.season_messaging_consents where person_id = $1::uuid and season_id = $2::uuid`,
      [personId, seasonId],
    );
    expect(row.rows[0]).toEqual({ state: "granted", source: "qr_self_entry" });
  });

  it("re-grants a withdrawn row for the same person and season, in place", async () => {
    const personId = await insertPerson("re-grant");
    await withTransaction(async (tx) => {
      await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      await withdrawSeasonMessagingConsentIn(tx, personId, seasonId);
      const regranted = await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      expect(regranted.state).toBe("granted");
    });
    const rows = await observer.query(
      `select count(*)::int as count from public.season_messaging_consents
        where person_id = $1::uuid and season_id = $2::uuid`,
      [personId, seasonId],
    );
    // One row per (person, season), no matter how many times its state moves.
    expect(rows.rows[0].count).toBe(1);
  });
});

describe("withdrawSeasonMessagingConsentIn", () => {
  it("moves a granted row to withdrawn", async () => {
    const personId = await insertPerson("withdraw");
    await withTransaction(async (tx) => {
      await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      const withdrawn = await withdrawSeasonMessagingConsentIn(tx, personId, seasonId);
      expect(withdrawn.state).toBe("withdrawn");
      expect(await hasGrantedSeasonMessagingConsentIn(tx, personId, seasonId)).toBe(false);
    });
  });

  it("withdraws even a person with no prior row, rather than throwing", async () => {
    const personId = await insertPerson("withdraw-cold");
    await withTransaction(async (tx) => {
      const withdrawn = await withdrawSeasonMessagingConsentIn(tx, personId, seasonId);
      expect(withdrawn.state).toBe("withdrawn");
    });
  });
});

describe("requireGrantedSeasonMessagingConsentIn — the seam LAN-203 calls", () => {
  it("passes silently when the current state is granted", async () => {
    const personId = await insertPerson("gate-pass");
    await withTransaction(async (tx) => {
      await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      await expect(
        requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId),
      ).resolves.toBeUndefined();
    });
  });

  it("refuses a person never asked", async () => {
    const personId = await insertPerson("gate-never-asked");
    await withTransaction(async (tx) => {
      await expect(
        requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId),
      ).rejects.toMatchObject({ rule: SEASON_MESSAGING_CONSENT_REQUIRED_RULE });
    });
  });

  it("refuses a withdrawn consent — the send is refused after opt-out, proved here", async () => {
    const personId = await insertPerson("gate-withdrawn");
    await withTransaction(async (tx) => {
      await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      await withdrawSeasonMessagingConsentIn(tx, personId, seasonId);
      let caught: unknown;
      try {
        await requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId);
      } catch (error) {
        caught = error;
      }
      expect(isServiceError(caught) && caught.kind).toBe("invalid_transition");
      expect((caught as { rule?: string }).rule).toBe(SEASON_MESSAGING_CONSENT_REQUIRED_RULE);
    });
  });

  it("refuses a refused consent", async () => {
    const personId = await insertPerson("gate-refused");
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1::uuid, $2::uuid, 'refused', 'operator_recorded')`,
      [personId, seasonId],
    );
    await withTransaction(async (tx) => {
      await expect(
        requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId),
      ).rejects.toMatchObject({ rule: SEASON_MESSAGING_CONSENT_REQUIRED_RULE });
    });
  });

  it("the non-transactional convenience wrapper refuses the same way", async () => {
    const personId = await insertPerson("gate-wrapper");
    await expect(requireGrantedSeasonMessagingConsent(personId, seasonId)).rejects.toMatchObject({
      rule: SEASON_MESSAGING_CONSENT_REQUIRED_RULE,
    });
  });

  it("refuses an 'asked' consent — the strict gate stays granted-only", async () => {
    const personId = await insertPerson("gate-asked");
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1::uuid, $2::uuid, 'asked', null)`,
      [personId, seasonId],
    );
    await withTransaction(async (tx) => {
      await expect(
        requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId),
      ).rejects.toMatchObject({ rule: SEASON_MESSAGING_CONSENT_REQUIRED_RULE });
    });
  });
});

/**
 * LAN-204's own consent exception — pins the exact allowed set so a later
 * edit that widens it (or narrows the strict gate above to match) fails a
 * test rather than passing quietly. See the function's own doc comment.
 */
describe("mayReceiveWelcomeContactIn — LAN-204's one consent exception", () => {
  it("allows a person never asked — no row at all", async () => {
    const personId = await insertPerson("welcome-never-asked");
    await withTransaction(async (tx) => {
      expect(await mayReceiveWelcomeContactIn(tx, personId, seasonId)).toBe(true);
    });
  });

  it("allows a person explicitly recorded as 'never_asked'", async () => {
    const personId = await insertPerson("welcome-never-asked-row");
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1::uuid, $2::uuid, 'never_asked', null)`,
      [personId, seasonId],
    );
    await withTransaction(async (tx) => {
      expect(await mayReceiveWelcomeContactIn(tx, personId, seasonId)).toBe(true);
    });
  });

  it("allows a person in 'asked'", async () => {
    const personId = await insertPerson("welcome-asked");
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1::uuid, $2::uuid, 'asked', null)`,
      [personId, seasonId],
    );
    await withTransaction(async (tx) => {
      expect(await mayReceiveWelcomeContactIn(tx, personId, seasonId)).toBe(true);
    });
  });

  it("allows a person already 'granted'", async () => {
    const personId = await insertPerson("welcome-granted");
    await withTransaction(async (tx) => {
      await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      expect(await mayReceiveWelcomeContactIn(tx, personId, seasonId)).toBe(true);
    });
  });

  it("refuses a person who explicitly 'refused'", async () => {
    const personId = await insertPerson("welcome-refused");
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1::uuid, $2::uuid, 'refused', 'operator_recorded')`,
      [personId, seasonId],
    );
    await withTransaction(async (tx) => {
      expect(await mayReceiveWelcomeContactIn(tx, personId, seasonId)).toBe(false);
    });
  });

  it("refuses a person who 'withdrawn'", async () => {
    const personId = await insertPerson("welcome-withdrawn");
    await withTransaction(async (tx) => {
      await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      await withdrawSeasonMessagingConsentIn(tx, personId, seasonId);
      expect(await mayReceiveWelcomeContactIn(tx, personId, seasonId)).toBe(false);
    });
  });
});

/**
 * `Q-read-back-authorises-how-much` (Brian, 2026-09-02, answered narrow): a
 * touchline read-back's grant authorises the welcome track alone. This is
 * the recruitment/Questionnaire-B track's own gate — narrower than a bare
 * granted check, on purpose.
 */
describe("hasGrantedViaSignupFormIn — the recruitment/interest track's own narrower gate", () => {
  it("allows a grant recorded through the sign-up form (qr_self_entry)", async () => {
    const personId = await insertPerson("signup-qr");
    await withTransaction(async (tx) => {
      await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      expect(await hasGrantedViaSignupFormIn(tx, personId, seasonId)).toBe(true);
    });
  });

  it("refuses a grant recorded at a touchline walk-up read-back", async () => {
    const personId = await insertPerson("signup-walkup");
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1::uuid, $2::uuid, 'granted', 'walk_up_read_back')`,
      [personId, seasonId],
    );
    await withTransaction(async (tx) => {
      expect(await hasGrantedViaSignupFormIn(tx, personId, seasonId)).toBe(false);
    });
  });

  it("refuses a grant an operator typed in directly", async () => {
    const personId = await insertPerson("signup-operator");
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1::uuid, $2::uuid, 'granted', 'operator_recorded')`,
      [personId, seasonId],
    );
    await withTransaction(async (tx) => {
      expect(await hasGrantedViaSignupFormIn(tx, personId, seasonId)).toBe(false);
    });
  });

  it("refuses a person never asked", async () => {
    const personId = await insertPerson("signup-never-asked");
    await withTransaction(async (tx) => {
      expect(await hasGrantedViaSignupFormIn(tx, personId, seasonId)).toBe(false);
    });
  });
});

/**
 * LAN-371, Brian 2026-09-16. A recruit who wants out and cannot make it happen
 * may complain to WhatsApp, which risks the club's sending account; Meta
 * classified a text-based "press X to stop" as marketing, so the mechanism is
 * an operator action. What that action has to be worth is here: a reason on
 * the record, the operator named in the audit, and every queued message gone
 * rather than refused one at a time at send time.
 */
describe("an operator's own withdrawal and grant", () => {
  async function queueLadderJob(personId: string, key: string): Promise<string> {
    const job = await observer.query<{ id: string }>(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, person_id, channel, scheduled_for)
       values ($1, 'other', 'pending', $2::uuid, 'whatsapp', now() + interval '1 day')
       returning id`,
      [`${MARKER}-${key}`, personId],
    );
    return job.rows[0].id;
  }

  async function jobStatus(jobId: string): Promise<{ status: string; reason: string | null }> {
    const row = await observer.query<{ status: string; cancelled_reason: string | null }>(
      `select status::text as status, cancelled_reason from public.notification_jobs where id = $1`,
      [jobId],
    );
    return { status: row.rows[0].status, reason: row.rows[0].cancelled_reason };
  }

  it("refuses a withdrawal with no reason at all, before writing anything", async () => {
    const personId = await insertPerson("NoReason");
    const operatorPersonId = await insertPerson("Operator");
    await withTransaction((tx) => grantSeasonMessagingConsentIn(tx, personId, seasonId));

    const error = await withTransaction((tx) =>
      withdrawSeasonMessagingConsentByOperatorIn(tx, {
        personId,
        seasonId,
        operatorPersonId,
        listedReason: null,
        note: "   ",
      }),
    ).catch((caught: unknown) => caught);

    expect(isServiceError(error)).toBe(true);
    expect((error as { rule: string }).rule).toBe(CONSENT_REASON_REQUIRED_RULE);

    const consent = await withTransaction((tx) =>
      readSeasonMessagingConsentIn(tx, personId, seasonId),
    );
    expect(consent?.state).toBe("granted");
  });

  it("withdraws with a reason, names the operator, and cancels every queued message", async () => {
    const personId = await insertPerson("Withdrawn");
    const operatorPersonId = await insertPerson("Operator");
    await withTransaction((tx) => grantSeasonMessagingConsentIn(tx, personId, seasonId));
    const queued = await queueLadderJob(personId, "queued");

    const result = await withTransaction((tx) =>
      withdrawSeasonMessagingConsentByOperatorIn(tx, {
        personId,
        seasonId,
        operatorPersonId,
        listedReason: "complaint",
        note: "Said on the pitch they want nothing more",
      }),
    );

    expect(result.consent.state).toBe("withdrawn");
    expect(result.consent.recordedByPersonId).toBe(operatorPersonId);
    expect(result.consent.reason).toContain("They complained");
    expect(result.consent.reason).toContain("Said on the pitch");
    expect(result.cancelledJobs).toBe(1);

    const job = await jobStatus(queued);
    expect(job.status).toBe("cancelled");
    expect(job.reason).toBe(CONSENT_WITHDRAWN_JOB_REASON);

    // The audit names the operator and the reason, and nothing about the
    // recruit beyond which person it was about.
    const audit = await observer.query<{
      action: string;
      actor_person_id: string;
      reason: string | null;
    }>(
      `select action, actor_person_id, reason from public.audit_events
        where entity_table = 'season_messaging_consents' and entity_id = $1::uuid
        order by occurred_at desc limit 1`,
      [personId],
    );
    expect(audit.rows[0].action).toBe("messaging_consent.withdrawn_by_operator");
    expect(audit.rows[0].actor_person_id).toBe(operatorPersonId);
    expect(audit.rows[0].reason).toContain("They complained");
  });

  it("leaves a job that has already completed alone", async () => {
    const personId = await insertPerson("AlreadySent");
    const operatorPersonId = await insertPerson("Operator");
    const sent = await queueLadderJob(personId, "completed");
    await observer.query("update public.notification_jobs set status = 'completed' where id = $1", [
      sent,
    ]);

    const result = await withTransaction((tx) =>
      withdrawSeasonMessagingConsentByOperatorIn(tx, {
        personId,
        seasonId,
        operatorPersonId,
        listedReason: "asked_in_person",
      }),
    );

    expect(result.cancelledJobs).toBe(0);
    expect((await jobStatus(sent)).status).toBe("completed");
  });

  it("refuses every further send until consent is recorded again", async () => {
    const personId = await insertPerson("ReEnabled");
    const operatorPersonId = await insertPerson("Operator");
    await withTransaction((tx) => grantSeasonMessagingConsentIn(tx, personId, seasonId));
    await withTransaction((tx) =>
      withdrawSeasonMessagingConsentByOperatorIn(tx, {
        personId,
        seasonId,
        operatorPersonId,
        listedReason: "asked_by_message",
      }),
    );

    await expect(
      withTransaction((tx) => requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId)),
    ).rejects.toMatchObject({ rule: SEASON_MESSAGING_CONSENT_REQUIRED_RULE });

    const granted = await withTransaction((tx) =>
      grantSeasonMessagingConsentByOperatorIn(tx, {
        personId,
        seasonId,
        operatorPersonId,
        note: "Asked again at the taster session and they said yes",
      }),
    );
    expect(granted.state).toBe("granted");
    expect(granted.recordedByPersonId).toBe(operatorPersonId);

    await expect(
      withTransaction((tx) => requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId)),
    ).resolves.toBeUndefined();
  });

  it("clears the operator's own mark when the person acts for themselves afterwards", async () => {
    const personId = await insertPerson("ThenThemselves");
    const operatorPersonId = await insertPerson("Operator");
    await withTransaction((tx) =>
      grantSeasonMessagingConsentByOperatorIn(tx, {
        personId,
        seasonId,
        operatorPersonId,
        note: "Told me at the stall",
      }),
    );

    // Their own Stop link still works, and the record stops saying "by operator".
    await withTransaction((tx) => withdrawSeasonMessagingConsentIn(tx, personId, seasonId));
    const consent = await withTransaction((tx) =>
      readSeasonMessagingConsentIn(tx, personId, seasonId),
    );
    expect(consent?.state).toBe("withdrawn");
    expect(consent?.recordedByPersonId).toBeNull();
    expect(consent?.reason).toBeNull();
  });
});
