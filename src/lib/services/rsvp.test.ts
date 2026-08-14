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
  recordSignedLinkResponse,
  INVITATION_WITHDRAWN_RULE,
  NO_REQUIRES_A_REASON_RULE,
  RESPONSE_WINDOW_CLOSED_RULE,
} from "./rsvp";
import { openObserver } from "../../../tests/helpers/service-layer";

const MARKER = "LAN79RsvpSuite";

let observer: Client;
let seasonId: string;

beforeAll(async () => {
  observer = await openObserver();

  // A seeded person, stamped with the seed's fixed timestamp, so that this
  // suite never adopts another suite's fixture as its season opener.
  const anchor = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id limit 1",
    ["2025-06-01T09:00:00Z"],
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
          solicits_response, audience_confirmed_at, audience_confirmed_by_person_id,
          approved_at, approved_by_person_id)
       select $1, $2, 'practice', $4::public.event_status,
              (select local::date from target), (select local::time from target),
              (select (local + interval '150 minutes')::time from target),
              $6,
              true, now(), $5::uuid, now(), $5::uuid
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
         (event_id, event_status, solicits_response, season_id, capacity,
          season_membership_id, status, audience_member_id, expires_at)
       values ($1, $2::public.event_status, true, $3, 'player', $4, 'pending', $5,
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
              starts_at = ((now() - interval '1 minute') at time zone 'Europe/London')::time
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
         (event_id, event_status, solicits_response, season_id, capacity,
          season_membership_id, status, audience_member_id, expires_at)
       values ($1, 'approved', true, $2, 'player', $3, 'pending', $4, now() + interval '47 hours')
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
