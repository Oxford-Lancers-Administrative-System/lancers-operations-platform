// @vitest-environment node
/**
 * The signed-link RSVP write path — LAN-79.
 *
 * Against the real local database, for the same reason LAN-78's token suite is:
 * every rule that matters here is one PostgreSQL carries. The reason check on
 * `rsvp_responses`, the `select, insert` grant that makes the table append-only,
 * `current_rsvp`'s definition of "the standing answer", and the comparison
 * against `now()` that closes the write window are all database facts, and a
 * mocked transaction would demonstrate none of them.
 *
 * Fixtures hang off a person whose `given_name` is this suite's own `MARKER`,
 * deleted in `afterEach`. The marker is unique to this file: Vitest runs suites
 * in parallel against one database.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction, type ServiceError } from "@/lib/db";
import { issueTokenIn, mintToken, resolveRsvpToken, revokeTokensIn } from "./rsvp-tokens";
import {
  composeReason,
  readSignedRsvpPageIn,
  recordOperatorRsvpResponse,
  recordSignedLinkResponse,
  INVITATION_WITHDRAWN_RULE,
  NO_REQUIRES_A_REASON_RULE,
  OPERATOR_CANNOT_SUPERSEDE_PLAYER_RULE,
  RESPONDED_AT_BEFORE_INVITATION_RULE,
  RESPONDED_AT_INVALID_RULE,
  RESPONDED_AT_NOT_FUTURE_RULE,
  RESPONSE_WINDOW_CLOSED_RULE,
} from "./rsvp";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const MARKER = "LAN79RsvpSuite";

let observer: Client;
let seasonId: string;

beforeAll(async () => {
  observer = await openObserver();

  // A seeded person, stamped with the seed's fixed timestamp, so that this
  // suite never adopts another suite's fixture as its season opener.
  const anchor = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id limit 1",
    [await seededIdentityCreatedAt(observer)],
  );
  expect(anchor.rows.length).toBe(1);
  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );

  // Archived, so an `active` membership created here stays outside every
  // "current season" query the rest of the suite set depends on.
  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on,
        opened_at, opened_by_person_id, closed_at, closed_by_person_id)
     values ($1, 'archived', $2, '2018-09-01', '2019-06-01', now(), $3, now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, anchor.rows[0].id],
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
  // LAN-170: `question_responses` has no `on delete cascade` from
  // `invitations` (only `on update cascade`), so a row left behind here would
  // block the invitation delete below for every suite that runs after this
  // one adds a question answer.
  await observer.query(
    `delete from public.question_responses where invitation_id in ${invitations}`,
    [MARKER],
  );
  await observer.query(
    `delete from public.notification_jobs where invitation_id in ${invitations}`,
    [MARKER],
  );
  await observer.query(
    `delete from public.rsvp_access_tokens where invitation_id in ${invitations}`,
    [MARKER],
  );
  await observer.query(
    `delete from public.audit_events where entity_id in ${invitations}
       or entity_id in ${people}`,
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

interface Fixture {
  personId: string;
  eventId: string;
  invitationId: string;
  membershipId: string;
}

/**
 * One approved event with one player invitation, starting `startsInHours` from
 * now. Negative values produce an event that has already begun.
 */
async function fixture(
  startsInHours: number,
  options: { status?: string; familyName?: string | null; deadlineHours?: number } = {},
): Promise<Fixture> {
  const status = options.status ?? "approved";
  await observer.query("begin");
  try {
    const person = await observer.query<{ id: string }>(
      // Far-future `created_at` keeps these rows unpickable by any suite that
      // resolves an actor as "the oldest person".
      `insert into public.people (given_name, family_name, created_at)
       values ($1, $2, now() + interval '100 years') returning id`,
      [MARKER, options.familyName === null ? null : (options.familyName ?? "Invitee")],
    );
    const personId = person.rows[0].id;

    const membership = await observer.query<{ id: string }>(
      `insert into public.season_memberships
         (person_id, season_id, status, entry, confirmed_on, activated_on)
       values ($1, $2, 'active', 'returning', current_date, current_date) returning id`,
      [personId, seasonId],
    );
    const membershipId = membership.rows[0].id;

    const event = await observer.query<{ id: string }>(
      `with target as (select (now() + make_interval(hours => $3)) at time zone 'Europe/London' as local)
       insert into public.events
         (season_id, name, event_type, status, scheduled_on, starts_at, ends_at, venue,
          audience_confirmed_at, audience_confirmed_by_person_id,
          approved_at, approved_by_person_id)
       select $1, $2, 'practice', $4::public.event_status,
              (select local::date from target),
              -- Truncated to the minute, so it can never fall inside the last
              -- second of the day and collide with the cap below.
              (select date_trunc('minute', local)::time from target),
              -- Kept on the same day. ends_at is a time on scheduled_on, and
              -- events_times_ordered requires it to be after starts_at, so a
              -- 150-minute practice starting at 22:10 produced ends_at = 00:40
              -- and violated the constraint -- which made this whole suite fail
              -- between about half past nine and midnight, London, and pass
              -- every other hour of the day. CI runs on UTC, so the window was
              -- real there too, and the failure looked like whatever had last
              -- been committed. Nothing here depends on the duration; what
              -- these tests need is a well-formed event that starts when they
              -- asked for it.
              (select case
                        when (local + interval '150 minutes')::date > local::date
                          then time '23:59:59'
                        else (local + interval '150 minutes')::time
                      end from target),
              $6,
              now(), $5::uuid, now(), $5::uuid
       returning id`,
      [seasonId, `${MARKER} practice`, startsInHours, status, personId, "Iffley Road Astro"],
    );
    const eventId = event.rows[0].id;

    const audience = await observer.query<{ id: string }>(
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id, added_by_person_id)
       values ($1, $2, 'player', $3, $4) returning id`,
      [eventId, seasonId, membershipId, personId],
    );

    const invitation = await observer.query<{ id: string }>(
      `insert into public.invitations
         (event_id, event_status, season_id, capacity,
          season_membership_id, status, audience_member_id, expires_at)
       values ($1, $2::public.event_status, $3, 'player', $4, 'pending', $5,
               now() + make_interval(hours => $6))
       returning id`,
      [
        eventId,
        status,
        seasonId,
        membershipId,
        audience.rows[0].id,
        options.deadlineHours ?? Math.max(startsInHours - 1, -1),
      ],
    );

    await observer.query("commit");
    return { personId, eventId, membershipId, invitationId: invitation.rows[0].id };
  } catch (error) {
    await observer.query("rollback");
    throw error;
  }
}

async function tokenFor(invitationId: string): Promise<string> {
  const issued = await withTransaction((tx) => issueTokenIn(tx, invitationId));
  return issued.token;
}

async function caught(run: () => Promise<unknown>): Promise<ServiceError> {
  try {
    await run();
  } catch (error) {
    if (isServiceError(error)) return error;
    throw error;
  }
  throw new Error("Expected the call to be refused, but it succeeded.");
}

async function statusOf(invitationId: string): Promise<string> {
  const result = await observer.query<{ status: string }>(
    "select status::text as status from public.invitations where id = $1",
    [invitationId],
  );
  return result.rows[0].status;
}

async function responsesFor(invitationId: string) {
  const result = await observer.query<{
    id: string;
    response: string;
    reason: string | null;
    source: string;
    responded_at: Date;
    recorded_by_person_id: string | null;
  }>(
    `select id, response::text as response, reason, source::text as source, responded_at,
            recorded_by_person_id
       from public.rsvp_responses where invitation_id = $1 order by responded_at asc`,
    [invitationId],
  );
  return result.rows;
}

/** A second person, distinct from the invitee, to act as the recording operator. */
async function operatorPersonId(): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name, created_at)
     values ($1, 'Operator', now() + interval '100 years') returning id`,
    [MARKER],
  );
  return result.rows[0].id;
}

async function pendingJob(invitationId: string, key: string): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, invitation_id, channel, scheduled_for)
     values ($1, 'reminder', 'pending', $2, 'whatsapp', now() + interval '1 day')
     returning id`,
    [`${MARKER}-${key}`, invitationId],
  );
  return result.rows[0].id;
}

/**
 * "Now", in the club's own zone, as the two fields
 * `recordOperatorRsvpResponse` takes rather than an instant this process
 * already resolved. Every fixture's invitation is created moments before a
 * test calls this, so real "now" is always safely after it and never in the
 * future — the two bounds the function itself enforces.
 */
function clubNow(): { respondedAtDate: string; respondedAtTime: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    respondedAtDate: `${value("year")}-${value("month")}-${value("day")}`,
    respondedAtTime: `${value("hour")}:${value("minute")}`,
  };
}

async function questionResponsesFor(invitationId: string) {
  const result = await observer.query<{
    event_question_id: string;
    answer_text: string | null;
    answer_boolean: boolean | null;
    answer_choice: string | null;
  }>(
    `select event_question_id, answer_text, answer_boolean, answer_choice
       from public.question_responses where invitation_id = $1`,
    [invitationId],
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Composing the reason
// ---------------------------------------------------------------------------

describe("composeReason", () => {
  it("keeps what the player typed", () => {
    expect(composeReason("Academic conflict")).toBe("Academic conflict");
  });

  it("trims, so that whitespace cannot pass for a reason", () => {
    // `required` in the browser is satisfied by three spaces. The domain rule
    // is not, and this is where the two are reconciled.
    expect(composeReason("  Academic conflict  ")).toBe("Academic conflict");
    expect(composeReason("   ")).toBe("");
    expect(composeReason("\t\n")).toBe("");
  });

  it("treats a missing reason as absent rather than as a string", () => {
    expect(composeReason("")).toBe("");
    expect(composeReason(null)).toBe("");
    expect(composeReason(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Recording an answer
// ---------------------------------------------------------------------------

describe("recordSignedLinkResponse", () => {
  it("records Attending in one tap, as a signed_link response, and moves the invitation", async () => {
    const { invitationId } = await fixture(48);
    const token = await tokenFor(invitationId);

    const recorded = await recordSignedLinkResponse(token, { response: "yes" });

    expect(recorded.response).toBe("yes");
    const rows = await responsesFor(invitationId);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("signed_link");
    expect(rows[0].reason).toBeNull();
    // The player is not an operator: nobody recorded this on their behalf.
    expect(rows[0].recorded_by_person_id).toBeNull();
    expect(await statusOf(invitationId)).toBe("responded");
  });

  it("records Not attending with its reason", async () => {
    const { invitationId } = await fixture(48);
    const token = await tokenFor(invitationId);

    await recordSignedLinkResponse(token, {
      response: "no",
      reason: "  Academic conflict  ",
    });

    const rows = await responsesFor(invitationId);
    expect(rows[0].response).toBe("no");
    // Stored exactly as typed, minus the whitespace.
    expect(rows[0].reason).toBe("Academic conflict");
    expect(await statusOf(invitationId)).toBe("responded");
  });

  it("refuses Not attending with no reason, and writes nothing", async () => {
    const { invitationId } = await fixture(48);
    const token = await tokenFor(invitationId);

    const error = await caught(() => recordSignedLinkResponse(token, { response: "no" }));
    expect(error.rule).toBe(NO_REQUIRES_A_REASON_RULE);

    expect(await responsesFor(invitationId)).toHaveLength(0);
    expect(await statusOf(invitationId)).toBe("pending");
  });

  it("refuses a whitespace-only reason — the server checks the string, not the field", async () => {
    const { invitationId } = await fixture(48);
    const token = await tokenFor(invitationId);

    for (const reason of ["   ", "\t", "\n  \n"]) {
      const error = await caught(() => recordSignedLinkResponse(token, { response: "no", reason }));
      expect(error.rule).toBe(NO_REQUIRES_A_REASON_RULE);
    }
    expect(await responsesFor(invitationId)).toHaveLength(0);
  });

  it("ignores a reason sent with Attending, rather than storing one", async () => {
    // Nothing in the screen sends this, but the service is the boundary and a
    // future caller might. A `yes` carries no reason by definition.
    const { invitationId } = await fixture(48);
    const token = await tokenFor(invitationId);

    await recordSignedLinkResponse(token, { response: "yes", reason: "Academic conflict" });

    const rows = await responsesFor(invitationId);
    expect(rows[0].response).toBe("yes");
    expect(rows[0].reason).toBeNull();
  });

  it("appends a changed answer and leaves the previous row untouched", async () => {
    const { invitationId } = await fixture(48);
    const token = await tokenFor(invitationId);

    const first = await recordSignedLinkResponse(token, { response: "yes" });
    const second = await recordSignedLinkResponse(token, {
      response: "no",
      reason: "Injury",
    });

    const rows = await responsesFor(invitationId);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(first.responseId);
    expect(rows[0].response).toBe("yes");
    expect(rows[1].id).toBe(second.responseId);

    // `current_rsvp` is the standing answer, and it is the later one.
    const current = await observer.query<{ response: string; reason: string | null }>(
      "select response::text as response, reason from public.current_rsvp where invitation_id = $1",
      [invitationId],
    );
    expect(current.rows).toHaveLength(1);
    expect(current.rows[0].response).toBe("no");
    expect(current.rows[0].reason).toBe("Injury");
  });

  it("accepts a late answer after the response deadline and moves expired to responded", async () => {
    // The deadline has passed and the invitation has already been swept into
    // the nonresponse stream. The event is still ahead, so the answer stands.
    const { invitationId } = await fixture(48, { deadlineHours: -2 });
    const token = await tokenFor(invitationId);
    await observer.query("update public.invitations set status = 'expired' where id = $1", [
      invitationId,
    ]);

    await recordSignedLinkResponse(token, { response: "yes" });

    expect(await statusOf(invitationId)).toBe("responded");
    expect(await responsesFor(invitationId)).toHaveLength(1);
  });

  it("accepts a response one minute before the start, not merely two days before", async () => {
    // The accept half of the boundary, at the boundary.
    //
    // Independent review moved the cutoff two hours early — closing the window
    // while every event was still ahead — and every test passed, because the
    // accepting test answered 48 hours out. A window that shuts early is a
    // player told their link is dead on the afternoon of the match.
    const { invitationId, eventId } = await fixture(48);
    const token = await tokenFor(invitationId);

    await observer.query(
      `update public.events
          set scheduled_on = ((now() + interval '1 minute') at time zone 'Europe/London')::date,
              starts_at = ((now() + interval '1 minute') at time zone 'Europe/London')::time,
              -- ends_at is a bare time with no date. fixture()'s own ends_at
              -- was computed from a different now() read (this test's own
              -- setup, moments earlier) and never adjusted to match this
              -- override, so its time-of-day can fall on either side of the
              -- new starts_at depending on where in the clock this test
              -- happens to run — nulling it out (permitted:
              -- events_times_ordered) removes the comparison entirely rather
              -- than leaving a flake nobody is watching for at night.
              ends_at = null
        where id = $1`,
      [eventId],
    );

    await recordSignedLinkResponse(token, { response: "yes" });
    expect(await responsesFor(invitationId)).toHaveLength(1);
    expect(await statusOf(invitationId)).toBe("responded");
  });

  it("accepts an answer to an event with no deadline of its own", async () => {
    // This replaced "refuses an event that solicits no response at all".
    //
    // Invariant E6 meant an informational event resolved an audience for
    // visibility only, and a signed link to one had to be refused. D23 removed
    // the flag: mandatory or optional already carries whether the club expects
    // somebody to be there, and everyone sent an event is expected to answer.
    // So there is no event a link can reach that has nothing to answer, and the
    // case that is left — an invitation carrying no deadline — is answerable
    // like any other, because a deadline was never a cutoff.
    const { invitationId, eventId } = await fixture(48);
    const token = await tokenFor(invitationId);
    await observer.query("update public.events set response_deadline_at = null where id = $1", [
      eventId,
    ]);
    await observer.query("update public.invitations set expires_at = null where id = $1", [
      invitationId,
    ]);

    await recordSignedLinkResponse(token, { response: "yes" });
    expect(await responsesFor(invitationId)).toHaveLength(1);
    expect(await statusOf(invitationId)).toBe("responded");
  });

  it("rolls the whole answer back when the last of its four writes fails", async () => {
    // Restored, and by the route independent review demonstrated.
    //
    // Two earlier attempts sabotaged `audit_events` with a constraint and then
    // a trigger; both need an ACCESS EXCLUSIVE lock on a table every other
    // suite writes to, and the second deadlocked a full parallel run. I removed
    // the test and argued the transaction helper's own suite covered it. That
    // was half right: the helper is proved, but this function's *use* of it was
    // not, and an edit moving `recordAudit` outside the callback would have
    // been caught by nothing.
    //
    // Making the audit write fail from inside the service needs no DDL at all —
    // a blank actor is refused by `recordAudit` before it reaches the database,
    // after the other three writes have already happened.
    const { invitationId } = await fixture(48);
    const token = await tokenFor(invitationId);
    await observer.query(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, invitation_id, channel, scheduled_for)
       values ($1, 'reminder', 'pending', $2, 'whatsapp', now() + interval '1 day')`,
      [`${MARKER}-rollback`, invitationId],
    );

    const audit = await import("./audit");
    const spy = vi.spyOn(audit, "recordAudit").mockRejectedValueOnce(new Error("audit refused"));
    try {
      await expect(recordSignedLinkResponse(token, { response: "yes" })).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }

    // All three earlier writes are gone with it.
    expect(await responsesFor(invitationId)).toHaveLength(0);
    expect(await statusOf(invitationId)).toBe("pending");
    const job = await observer.query<{ status: string }>(
      "select status::text as status from public.notification_jobs where idempotency_key = $1",
      [`${MARKER}-rollback`],
    );
    expect(job.rows[0].status).toBe("pending");
  });

  it("accepts a response a minute before the start and refuses one a minute after", async () => {
    const { invitationId, eventId } = await fixture(48);
    const token = await tokenFor(invitationId);

    // Issued while the event was safely ahead, then the clock passes the start
    // with the link already in somebody's pocket.
    await recordSignedLinkResponse(token, { response: "yes" });
    expect(await responsesFor(invitationId)).toHaveLength(1);

    await observer.query(
      `update public.events
          set scheduled_on = ((now() - interval '1 minute') at time zone 'Europe/London')::date,
              starts_at = ((now() - interval '1 minute') at time zone 'Europe/London')::time,
              -- Same reasoning as the accepting test above: ends_at is a bare
              -- time left over from fixture()'s own now(), and comparing it
              -- against this override's time-of-day flakes near midnight.
              -- Nulled out rather than raced against the clock.
              ends_at = null
        where id = $1`,
      [eventId],
    );

    const error = await caught(() =>
      recordSignedLinkResponse(token, { response: "no", reason: "Injury" }),
    );
    expect(error.rule).toBe(RESPONSE_WINDOW_CLOSED_RULE);

    // The answer given before the start survives; nothing was appended after it.
    const rows = await responsesFor(invitationId);
    expect(rows).toHaveLength(1);
    expect(rows[0].response).toBe("yes");
  });

  it("refuses a revoked link, an unknown link and a cancelled event alike", async () => {
    const revoked = await fixture(48);
    const revokedToken = await tokenFor(revoked.invitationId);
    await withTransaction((tx) => revokeTokensIn(tx, revoked.invitationId, "Reissued"));

    const revokedError = await caught(() =>
      recordSignedLinkResponse(revokedToken, { response: "yes" }),
    );
    expect(revokedError.rule).toBe(RESPONSE_WINDOW_CLOSED_RULE);
    expect(await responsesFor(revoked.invitationId)).toHaveLength(0);

    const unknownError = await caught(() =>
      recordSignedLinkResponse(mintToken(), { response: "yes" }),
    );
    expect(unknownError.rule).toBe(RESPONSE_WINDOW_CLOSED_RULE);

    const cancelled = await fixture(48);
    const cancelledToken = await tokenFor(cancelled.invitationId);
    await observer.query(
      `update public.events
          set status = 'cancelled', decision_reason = 'Astro double-booked'
        where id = $1`,
      [cancelled.eventId],
    );
    const cancelledError = await caught(() =>
      recordSignedLinkResponse(cancelledToken, { response: "yes" }),
    );
    expect(cancelledError.rule).toBe(RESPONSE_WINDOW_CLOSED_RULE);
    expect(await responsesFor(cancelled.invitationId)).toHaveLength(0);
  });

  it("refuses a withdrawn invitation whose event is still live", async () => {
    const { invitationId } = await fixture(48);
    const token = await tokenFor(invitationId);
    await observer.query(
      "update public.invitations set status = 'cancelled', cancelled_at = now() where id = $1",
      [invitationId],
    );

    const error = await caught(() => recordSignedLinkResponse(token, { response: "yes" }));
    expect(error.rule).toBe(INVITATION_WITHDRAWN_RULE);
    expect(await responsesFor(invitationId)).toHaveLength(0);
  });

  it("cancels that invitation's pending reminders, and nothing else's", async () => {
    const mine = await fixture(48);
    const other = await fixture(48);
    const token = await tokenFor(mine.invitationId);

    const job = async (invitationId: string, status: string, key: string) => {
      const result = await observer.query<{ id: string }>(
        `insert into public.notification_jobs
           (idempotency_key, job_type, status, invitation_id, channel, scheduled_for, attempt_count,
            claimed_at, claimed_by)
         values ($1, 'reminder', $2::public.notification_job_status, $3, 'whatsapp',
                 now() + interval '1 day', 0,
                 case when $2 = 'processing' then now() end,
                 case when $2 = 'processing' then 'dispatcher' end)
         returning id`,
        [`${MARKER}-${key}`, status, invitationId],
      );
      return result.rows[0].id;
    };

    const pending = await job(mine.invitationId, "pending", "pending");
    const ready = await job(mine.invitationId, "ready", "ready");
    const completed = await job(mine.invitationId, "completed", "completed");
    const failed = await job(mine.invitationId, "failed", "failed");
    const processing = await job(mine.invitationId, "processing", "processing");
    const foreign = await job(other.invitationId, "pending", "foreign");

    const recorded = await recordSignedLinkResponse(token, { response: "yes" });
    expect(recorded.cancelledJobs).toBe(2);

    const statuses = await observer.query<{
      id: string;
      status: string;
      cancelled_reason: string | null;
    }>(
      "select id, status::text as status, cancelled_reason from public.notification_jobs where id = any($1::uuid[])",
      [[pending, ready, completed, failed, processing, foreign]],
    );
    const byId = new Map(statuses.rows.map((row) => [row.id, row]));

    expect(byId.get(pending)?.status).toBe("cancelled");
    expect(byId.get(pending)?.cancelled_reason).toBeTruthy();
    expect(byId.get(ready)?.status).toBe("cancelled");
    // Terminal jobs are history, and an in-flight one belongs to the dispatcher.
    expect(byId.get(completed)?.status).toBe("completed");
    expect(byId.get(failed)?.status).toBe("failed");
    expect(byId.get(processing)?.status).toBe("processing");
    // Another invitee's reminder is untouched — this answer is not theirs.
    expect(byId.get(foreign)?.status).toBe("pending");
  });

  it("writes one audit row naming the mechanism rather than a person, and no reason text", async () => {
    const { invitationId } = await fixture(48);
    const token = await tokenFor(invitationId);

    await recordSignedLinkResponse(token, {
      response: "no",
      reason: "Academic conflict",
    });

    const audit = await observer.query<{
      actor_person_id: string | null;
      actor_label: string | null;
      action: string;
      from_state: string | null;
      to_state: string | null;
      reason: string | null;
      context: Record<string, unknown>;
    }>(
      `select actor_person_id, actor_label, action, from_state, to_state, reason, context
         from public.audit_events where entity_id = $1 and entity_table = 'invitations'`,
      [invitationId],
    );

    expect(audit.rows).toHaveLength(1);
    const row = audit.rows[0];
    // A token holder is not a verified person, and the audit trail says so.
    expect(row.actor_person_id).toBeNull();
    expect(row.actor_label).toContain("signed RSVP link");
    expect(row.from_state).toBe("pending");
    expect(row.to_state).toBe("responded");
    expect(row.context.response).toBe("no");
    expect(row.context.source).toBe("signed_link");
    // The absence reason stays in `rsvp_responses`, where it is private.
    expect(JSON.stringify(row)).not.toContain("Academic conflict");
  });

  /**
   * There is deliberately no test here that sabotages the audit insert to prove
   * the four writes share one transaction.
   *
   * Two versions were written and both were withdrawn. A `check (false)` on
   * `audit_events` and a trigger on it both need an ACCESS EXCLUSIVE lock on a
   * table every other suite writes to, and these files run in parallel against
   * one database: the first version failed three unrelated suites, and the
   * second deadlocked against them under a full run. A test that makes the rest
   * of the suite flaky is not paying for itself.
   *
   * What covers it instead: `withTransaction` has its own suite in
   * `tests/service-layer-transactions.test.ts`, which proves a throw anywhere
   * inside rolls the whole callback back and that a nested call joins rather
   * than nests. `recordSignedLinkResponse` does all four writes inside one such
   * callback and catches nothing, so it inherits that guarantee rather than
   * re-proving it. The refusal paths above additionally assert that a rejected
   * answer leaves no response row and no changed invitation status.
   */
});

// ---------------------------------------------------------------------------
// Reading the page
// ---------------------------------------------------------------------------

describe("readSignedRsvpPageIn", () => {
  it("returns the event, the player and their own standing answer", async () => {
    const { invitationId } = await fixture(48, { familyName: "Fielding" });
    const token = await tokenFor(invitationId);
    await recordSignedLinkResponse(token, { response: "no", reason: "Injury" });

    const page = await withTransaction((tx) => readSignedRsvpPageIn(tx, invitationId));

    expect(page.eventName).toContain(MARKER);
    expect(page.playerName).toBe(`${MARKER} Fielding`);
    expect(page.venue).toBe("Iffley Road Astro");
    expect(page.startsAt).toMatch(/^\d{2}:\d{2}$/);
    expect(page.endsAt).toMatch(/^\d{2}:\d{2}$/);
    expect(page.responseDeadline).toBeInstanceOf(Date);
    expect(page.currentResponse?.response).toBe("no");
    expect(page.currentResponse?.reason).toBe("Injury");
  });

  it("names a player who has no family name, rather than rendering nothing", async () => {
    // `people.family_name` is nullable and the seed contains such a person. The
    // first version concatenated with `||`, so one null made the whole name
    // null and the page showed an invitee no name at all.
    const { invitationId } = await fixture(48, { familyName: null });

    const page = await withTransaction((tx) => readSignedRsvpPageIn(tx, invitationId));
    expect(page.playerName).toBe(MARKER);
  });

  it("reports no standing answer before one is given", async () => {
    const { invitationId } = await fixture(48);
    const page = await withTransaction((tx) => readSignedRsvpPageIn(tx, invitationId));
    expect(page.currentResponse).toBeNull();
  });

  it("shows one invitee nothing about another on the same event", async () => {
    // Two invitations on ONE event, both answered, which is the shape the
    // privacy rule is about: peer data exists and must not surface.
    const mine = await fixture(48, { familyName: "Fielding" });
    const peerPerson = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name, created_at)
       values ($1, 'Peerson', now() + interval '100 years') returning id`,
      [MARKER],
    );
    const peerMembership = await observer.query<{ id: string }>(
      `insert into public.season_memberships
         (person_id, season_id, status, entry, confirmed_on, activated_on)
       values ($1, $2, 'active', 'returning', current_date, current_date) returning id`,
      [peerPerson.rows[0].id, seasonId],
    );
    const peerAudience = await observer.query<{ id: string }>(
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id, added_by_person_id)
       values ($1, $2, 'player', $3, $4) returning id`,
      [mine.eventId, seasonId, peerMembership.rows[0].id, peerPerson.rows[0].id],
    );
    const peerInvitation = await observer.query<{ id: string }>(
      `insert into public.invitations
         (event_id, event_status, season_id, capacity,
          season_membership_id, status, audience_member_id, expires_at)
       values ($1, 'approved', $2, 'player', $3, 'pending', $4, now() + interval '47 hours')
       returning id`,
      [mine.eventId, seasonId, peerMembership.rows[0].id, peerAudience.rows[0].id],
    );

    const peerToken = await tokenFor(peerInvitation.rows[0].id);
    await recordSignedLinkResponse(peerToken, { response: "no", reason: "Rowing fixture" });
    const myToken = await tokenFor(mine.invitationId);
    await recordSignedLinkResponse(myToken, { response: "yes" });

    const page = await withTransaction((tx) => readSignedRsvpPageIn(tx, mine.invitationId));
    const rendered = JSON.stringify(page);

    expect(page.playerName).toBe(`${MARKER} Fielding`);
    expect(page.currentResponse?.response).toBe("yes");
    // Not the peer's name, not their reason, and no count of anything.
    expect(rendered).not.toContain("Peerson");
    expect(rendered).not.toContain("Rowing fixture");
  });

  it("resolves a token only to its own invitation", async () => {
    const first = await fixture(48, { familyName: "First" });
    const second = await fixture(48, { familyName: "Second" });
    const secondToken = await tokenFor(second.invitationId);

    const resolved = await resolveRsvpToken(secondToken);
    expect(resolved.invitation?.invitationId).toBe(second.invitationId);
    expect(resolved.invitation?.invitationId).not.toBe(first.invitationId);

    const page = await withTransaction((tx) =>
      readSignedRsvpPageIn(tx, resolved.invitation!.invitationId),
    );
    expect(page.playerName).toBe(`${MARKER} Second`);
  });
});

// ---------------------------------------------------------------------------
// The operator's own write — W3, LAN-170
// ---------------------------------------------------------------------------

describe("recordOperatorRsvpResponse", () => {
  it("records a Yes with source operator and the recording operator's own id", async () => {
    const { invitationId, eventId } = await fixture(48);
    const operator = await operatorPersonId();

    const recorded = await recordOperatorRsvpResponse(operator, eventId, invitationId, {
      response: "yes",
      ...clubNow(),
    });

    expect(recorded.response).toBe("yes");
    const rows = await responsesFor(invitationId);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("operator");
    expect(rows[0].recorded_by_person_id).toBe(operator);
    expect(rows[0].reason).toBeNull();
    expect(await statusOf(invitationId)).toBe("responded");
  });

  it("requires a real reason for a No, in the operator's own words, not W2's default", async () => {
    const { invitationId, eventId } = await fixture(48);
    const operator = await operatorPersonId();

    const blank = await caught(() =>
      recordOperatorRsvpResponse(operator, eventId, invitationId, {
        response: "no",
        ...clubNow(),
      }),
    );
    expect(blank.rule).toBe(NO_REQUIRES_A_REASON_RULE);

    const whitespace = await caught(() =>
      recordOperatorRsvpResponse(operator, eventId, invitationId, {
        response: "no",
        reason: "   ",
        ...clubNow(),
      }),
    );
    expect(whitespace.rule).toBe(NO_REQUIRES_A_REASON_RULE);
    expect(await responsesFor(invitationId)).toHaveLength(0);

    const recorded = await recordOperatorRsvpResponse(operator, eventId, invitationId, {
      response: "no",
      reason: "Told the coach at training on Tuesday",
      ...clubNow(),
    });
    expect(recorded.response).toBe("no");
    const rows = await responsesFor(invitationId);
    expect(rows[0].reason).toBe("Told the coach at training on Tuesday");
  });

  it("refuses a responded time in the future, and never wrote the failed attempt", async () => {
    const { invitationId, eventId } = await fixture(48);
    const operator = await operatorPersonId();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const error = await caught(() =>
      recordOperatorRsvpResponse(operator, eventId, invitationId, {
        response: "yes",
        respondedAtDate: future.toISOString().slice(0, 10),
        respondedAtTime: "10:00",
      }),
    );
    expect(error.rule).toBe(RESPONDED_AT_NOT_FUTURE_RULE);
    expect(await responsesFor(invitationId)).toHaveLength(0);
  });

  it("refuses a responded time before the invitation existed", async () => {
    const { invitationId, eventId } = await fixture(48);
    const operator = await operatorPersonId();

    const error = await caught(() =>
      recordOperatorRsvpResponse(operator, eventId, invitationId, {
        response: "yes",
        // The invitation was created moments ago by `fixture()`; 2000 is
        // unambiguously before it, whenever this suite happens to run.
        respondedAtDate: "2000-01-01",
        respondedAtTime: "09:00",
      }),
    );
    expect(error.rule).toBe(RESPONDED_AT_BEFORE_INVITATION_RULE);
    expect(await responsesFor(invitationId)).toHaveLength(0);
  });

  it("refuses a date or time that is not the shape the picker produces", async () => {
    const { invitationId, eventId } = await fixture(48);
    const operator = await operatorPersonId();

    const badDate = await caught(() =>
      recordOperatorRsvpResponse(operator, eventId, invitationId, {
        response: "yes",
        respondedAtDate: "",
        respondedAtTime: "10:00",
      }),
    );
    expect(badDate.rule).toBe(RESPONDED_AT_INVALID_RULE);

    const badTime = await caught(() =>
      recordOperatorRsvpResponse(operator, eventId, invitationId, {
        response: "yes",
        respondedAtDate: "2020-06-01",
        respondedAtTime: "not-a-time",
      }),
    );
    expect(badTime.rule).toBe(RESPONDED_AT_INVALID_RULE);
  });

  it("refuses a withdrawn invitation", async () => {
    const { invitationId, eventId } = await fixture(48);
    const operator = await operatorPersonId();
    await observer.query(
      "update public.invitations set status = 'cancelled', cancelled_at = now() where id = $1",
      [invitationId],
    );

    const error = await caught(() =>
      recordOperatorRsvpResponse(operator, eventId, invitationId, {
        response: "yes",
        ...clubNow(),
      }),
    );
    expect(error.rule).toBe(INVITATION_WITHDRAWN_RULE);
    expect(await responsesFor(invitationId)).toHaveLength(0);
  });

  it("refuses an invitation that does not belong to the named event", async () => {
    const mine = await fixture(48);
    const other = await fixture(48);
    const operator = await operatorPersonId();

    const error = await caught(() =>
      // The invitation is real, but not this event's.
      recordOperatorRsvpResponse(operator, other.eventId, mine.invitationId, {
        response: "yes",
        ...clubNow(),
      }),
    );
    expect(error.kind).toBe("not_found");
    expect(await responsesFor(mine.invitationId)).toHaveLength(0);
  });

  it("permits recording after the event has started, and schedules nothing", async () => {
    // Negative: the event started two hours ago. `resolveRsvpTokenIn` would
    // hard-cut the signed-link path here; this one is the named correction
    // path (`T03-gap-operator-correction`) and is not asked to.
    const { invitationId, eventId } = await fixture(-2);
    const operator = await operatorPersonId();

    const before = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.notification_jobs where invitation_id = $1",
      [invitationId],
    );

    const recorded = await recordOperatorRsvpResponse(operator, eventId, invitationId, {
      response: "yes",
      ...clubNow(),
    });
    expect(recorded.response).toBe("yes");
    expect(await statusOf(invitationId)).toBe("responded");

    // Nothing in this function schedules a job, so the count a post-start
    // correction leaves behind is exactly the count it found.
    const after = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.notification_jobs where invitation_id = $1",
      [invitationId],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("cancels that person's pending reminders in the same transaction, and nobody else's", async () => {
    const mine = await fixture(48);
    const other = await fixture(48);
    const operator = await operatorPersonId();

    const pending = await pendingJob(mine.invitationId, "pending");
    const foreign = await pendingJob(other.invitationId, "foreign");

    const recorded = await recordOperatorRsvpResponse(operator, mine.eventId, mine.invitationId, {
      response: "yes",
      ...clubNow(),
    });
    expect(recorded.cancelledJobs).toBe(1);

    const statuses = await observer.query<{ id: string; status: string }>(
      "select id, status::text as status from public.notification_jobs where id = any($1::uuid[])",
      [[pending, foreign]],
    );
    const byId = new Map(statuses.rows.map((row) => [row.id, row.status]));
    expect(byId.get(pending)).toBe("cancelled");
    expect(byId.get(foreign)).toBe("pending");
  });

  it("writes an audit row naming the operator as the actor, with source operator", async () => {
    const { invitationId, eventId } = await fixture(48);
    const operator = await operatorPersonId();

    await recordOperatorRsvpResponse(operator, eventId, invitationId, {
      response: "no",
      reason: "Away with the course all week",
      ...clubNow(),
    });

    const audit = await observer.query<{
      actor_person_id: string | null;
      actor_label: string | null;
      context: { response: string; source: string };
    }>(
      `select actor_person_id, actor_label, context
         from public.audit_events
        where entity_id = $1 and action = 'invitation.response_recorded'`,
      [invitationId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_person_id).toBe(operator);
    // A person, not a mechanism label — unlike the signed-link path's own row.
    expect(audit.rows[0].actor_label).toBeNull();
    expect(audit.rows[0].context.source).toBe("operator");
    // The reason is a player's personal data and is not duplicated into the
    // audit trail, exactly as the signed-link path already keeps it out.
    expect(JSON.stringify(audit.rows[0].context)).not.toContain("course");
  });

  it("writes the event's own questions, accepts a partial set, and stores each answer type correctly", async () => {
    const { invitationId, eventId } = await fixture(48);
    const operator = await operatorPersonId();

    const questions = await observer.query<{ id: string }>(
      `insert into public.event_questions (event_id, prompt, answer_type, choices, sort_order)
       values ($1, 'Transport there?', 'boolean', null, 0),
              ($1, 'Shirt size', 'text', null, 1),
              ($1, 'Which car?', 'choice', $2::text[], 2)
       returning id`,
      [eventId, ["Red", "Blue"]],
    );
    const [booleanId, textId, choiceId] = questions.rows.map((row) => row.id);

    await recordOperatorRsvpResponse(operator, eventId, invitationId, {
      response: "yes",
      ...clubNow(),
      questionAnswers: {
        [booleanId]: "Yes",
        [textId]: "",
        [choiceId]: "Blue",
      },
    });

    const answers = await questionResponsesFor(invitationId);
    // The text question was left blank and stays outstanding — no row at all,
    // not a row with an empty string, which is what "partial answers accepted"
    // means at the storage layer.
    expect(answers).toHaveLength(2);
    const byQuestion = new Map(answers.map((row) => [row.event_question_id, row]));

    expect(byQuestion.get(booleanId)?.answer_boolean).toBe(true);
    expect(byQuestion.get(booleanId)?.answer_text).toBeNull();
    expect(byQuestion.get(choiceId)?.answer_choice).toBe("Blue");
    expect(byQuestion.get(choiceId)?.answer_boolean).toBeNull();
    expect(byQuestion.has(textId)).toBe(false);
  });

  it("corrects a previously recorded question answer rather than duplicating it", async () => {
    const { invitationId, eventId } = await fixture(48);
    const operator = await operatorPersonId();
    const questions = await observer.query<{ id: string }>(
      `insert into public.event_questions (event_id, prompt, answer_type, sort_order)
       values ($1, 'Transport there?', 'boolean', 0)
       returning id`,
      [eventId],
    );
    const questionId = questions.rows[0].id;

    // Pushed well before 2020 so the test can use two genuinely distinct
    // instants for the two recordings below —
    // `rsvp_responses_one_answer_per_instant` refuses two rows at the same
    // `responded_at`, and `clubNow()` called twice a few milliseconds apart
    // resolves to the same minute.
    await observer.query(
      "update public.invitations set created_at = timestamptz '2010-01-01' where id = $1",
      [invitationId],
    );

    await recordOperatorRsvpResponse(operator, eventId, invitationId, {
      response: "yes",
      respondedAtDate: "2020-06-01",
      respondedAtTime: "10:00",
      questionAnswers: { [questionId]: "Yes" },
    });

    // A post-start correction, taking the register, hears the opposite.
    await observer.query(
      `update public.events
          set scheduled_on = ((now() - interval '1 hour') at time zone 'Europe/London')::date,
              starts_at = ((now() - interval '1 hour') at time zone 'Europe/London')::time,
              -- LAN-170 correction round 1: ends_at is a bare time column
              -- with no date, and fixture()'s own ends_at was computed from a
              -- different now() read moments earlier and never adjusted to
              -- match this override. Comparing the two time-of-day values
              -- with no date to break the tie flakes whenever the two
              -- straddle midnight London — reproduced directly, on this exact
              -- test, both locally and in CI. events_times_ordered permits a
              -- null on either side, so nulling ends_at out removes the
              -- comparison rather than leaving a flake nobody is watching for
              -- at night.
              ends_at = null
        where id = $1`,
      [eventId],
    );
    await recordOperatorRsvpResponse(operator, eventId, invitationId, {
      response: "yes",
      respondedAtDate: "2020-06-02",
      respondedAtTime: "09:00",
      questionAnswers: { [questionId]: "No" },
    });

    const answers = await questionResponsesFor(invitationId);
    expect(answers).toHaveLength(1);
    expect(answers[0].answer_boolean).toBe(false);
  });

  it("ignores a question id that does not belong to this event, without failing the recording", async () => {
    const { invitationId, eventId } = await fixture(48);
    const operator = await operatorPersonId();
    const foreignEvent = await fixture(48);
    const foreignQuestion = await observer.query<{ id: string }>(
      `insert into public.event_questions (event_id, prompt, answer_type, sort_order)
       values ($1, 'Somebody else''s question', 'text', 0)
       returning id`,
      [foreignEvent.eventId],
    );

    const recorded = await recordOperatorRsvpResponse(operator, eventId, invitationId, {
      response: "yes",
      ...clubNow(),
      questionAnswers: { [foreignQuestion.rows[0].id]: "Something" },
    });

    expect(recorded.response).toBe("yes");
    expect(await questionResponsesFor(invitationId)).toHaveLength(0);
  });

  // SEC-LAN170-01 / DEC-no-supersede -- correction round 1.
  it("refuses to record over a player's own answer, and their answer stands", async () => {
    const { invitationId, eventId } = await fixture(48);
    const operator = await operatorPersonId();

    const token = await tokenFor(invitationId);
    await recordSignedLinkResponse(token, { response: "yes" });
    // Backdated so the operator's "now" is unambiguously later -- the
    // ordinary case is a player answering earlier in the day and an
    // operator recording something later, which the form's own default
    // encourages.
    await observer.query(
      "update public.rsvp_responses set responded_at = now() - interval '3 hours' where invitation_id = $1",
      [invitationId],
    );

    const error = await caught(() =>
      recordOperatorRsvpResponse(operator, eventId, invitationId, {
        response: "no",
        reason: "Misheard at training",
        ...clubNow(),
      }),
    );
    expect(error.rule).toBe(OPERATOR_CANNOT_SUPERSEDE_PLAYER_RULE);

    // Nothing was written by the refused call, and the player's own answer
    // is still what `current_rsvp` reports as standing.
    const rows = await responsesFor(invitationId);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("signed_link");
    expect(rows[0].response).toBe("yes");
    const current = await observer.query<{ response: string }>(
      "select response::text as response from public.current_rsvp where invitation_id = $1",
      [invitationId],
    );
    expect(current.rows[0].response).toBe("yes");
  });

  it("still permits a second operator to record over a first operator's answer", async () => {
    // The workflow's own named exception ("Two operators record different
    // answers -- both are kept in order; the latest stands") has no prior
    // player answer to protect, and this fix must not break it.
    const { invitationId, eventId } = await fixture(48);
    const firstOperator = await operatorPersonId();
    const secondOperator = await operatorPersonId();

    // Backdated for the same reason the question-answer correction test
    // above backdates it: two distinct `responded_at` instants are needed,
    // and `clubNow()` called twice a few milliseconds apart can resolve to
    // the same minute, which `rsvp_responses_one_answer_per_instant` refuses.
    await observer.query(
      "update public.invitations set created_at = timestamptz '2010-01-01' where id = $1",
      [invitationId],
    );

    await recordOperatorRsvpResponse(firstOperator, eventId, invitationId, {
      response: "yes",
      respondedAtDate: "2020-06-01",
      respondedAtTime: "10:00",
    });

    const recorded = await recordOperatorRsvpResponse(secondOperator, eventId, invitationId, {
      response: "no",
      reason: "Actually just heard they can't make it",
      respondedAtDate: "2020-06-02",
      respondedAtTime: "09:00",
    });

    expect(recorded.response).toBe("no");
    const rows = await responsesFor(invitationId);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.source === "operator")).toBe(true);
  });
});
