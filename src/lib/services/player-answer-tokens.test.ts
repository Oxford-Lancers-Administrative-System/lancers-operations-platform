// @vitest-environment node
/**
 * The player's answer tokens and durable credential — LAN-172.
 *
 * Against the real local database, for the same reason `rsvp-tokens.test.ts`
 * is: the guarantees under test are PostgreSQL's — the shape check that makes
 * storing anything but a digest impossible, the partial unique index that
 * permits one live durable credential per person per season, and the
 * comparison against `now()` that decides whether an event has started.
 *
 * Every row hangs off a person whose `given_name` is `MARKER`, deleted in
 * `afterEach`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction, type ServiceError } from "@/lib/db";
import {
  consumeAnswerTokenIn,
  issueAnswerTokenIn,
  issuePersonTokenIn,
  NO_REASON_GIVEN_DEFAULT,
  resolveAnswerToken,
  resolvePersonToken,
  revokePersonTokenIn,
} from "./player-answer-tokens";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const MARKER = "LAN172AnswerTokenSuite";

let observer: Client;
let seasonId: string;

beforeAll(async () => {
  observer = await openObserver();

  const anchor = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id limit 1",
    [await seededIdentityCreatedAt(observer)],
  );
  expect(anchor.rows.length).toBe(1);
  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );

  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on,
        opened_at, opened_by_person_id)
     values ($1, 'open', $2, '2019-09-01', '2020-06-01', now(), $3)
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

/** One approved event with one player invitation, at a chosen start instant. */
async function fixture(startsInHours: number, status = "approved") {
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
        audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id,
        decision_reason)
     select $1, $2, 'practice', $4::public.event_status,
            (select local::date from target), (select local::time from target),
            now(), $5::uuid, now(), $5::uuid,
            case when $4 = 'cancelled' then 'Test fixture cancellation.' else null end
     returning id`,
      [seasonId, `${MARKER} practice`, startsInHours, status, personId],
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
     values ($1, $2::public.event_status, $3, 'player', $4, 'pending', $5)
     returning id`,
      [eventId, status, seasonId, membership.rows[0].id, audience.rows[0].id],
    );

    await observer.query("commit");
    return { personId, eventId, invitationId: invitation.rows[0].id };
  } catch (error) {
    await observer.query("rollback");
    throw error;
  }
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

describe("issuing an answer token", () => {
  it("stores only the digest, keyed to the person and the season", async () => {
    const { invitationId, personId } = await fixture(48);
    const issued = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes"));

    const stored = await observer.query<{
      person_id: string;
      season_id: string;
      single_use: boolean;
      single_use_at: Date | null;
    }>(
      `select person_id, season_id, single_use, single_use_at
         from public.person_access_tokens where id = $1`,
      [issued.tokenId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].person_id).toBe(personId);
    expect(stored.rows[0].season_id).toBe(seasonId);
    expect(stored.rows[0].single_use).toBe(true);
    expect(stored.rows[0].single_use_at).toBeNull();

    // The plaintext token embeds the invitation and the answer, but the
    // database never sees either as their own column — only inside the hash.
    const raw = await observer.query("select * from public.person_access_tokens where id = $1", [
      issued.tokenId,
    ]);
    expect(JSON.stringify(raw.rows[0])).not.toContain(issued.token);
  });

  it("mints two independent tokens for the same invitation, one per button", async () => {
    const { invitationId, personId } = await fixture(48);
    const yes = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes"));
    const no = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "no"));

    expect(yes.token).not.toBe(no.token);

    const rows = await observer.query(
      "select count(*) as count from public.person_access_tokens where person_id = $1",
      [personId],
    );
    expect(Number(rows.rows[0].count)).toBe(2);
  });

  it("refuses an event that has already started", async () => {
    const { invitationId } = await fixture(-1);
    const error = await caught(() =>
      withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes")),
    );
    expect(error.rule).toBe("player_answer_token_requires_a_live_event");
  });

  it("refuses a cancelled event", async () => {
    const { invitationId } = await fixture(48, "cancelled");
    const error = await caught(() =>
      withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes")),
    );
    expect(error.rule).toBe("player_answer_token_requires_a_live_event");
  });
});

describe("resolving an answer token", () => {
  it("resolves a fresh token as valid and writable, and identifies its answer", async () => {
    const { invitationId } = await fixture(48);
    const yes = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes"));

    const resolution = await resolveAnswerToken(yes.token);
    expect(resolution.state).toBe("valid");
    expect(resolution.writable).toBe(true);
    expect(resolution.consumed).toBe(false);
    expect(resolution.answer).toBe("yes");
    expect(resolution.invitation?.invitationId).toBe(invitationId);
  });

  it("treats garbage as unknown without touching the database", async () => {
    const resolution = await resolveAnswerToken("not-a-real-token");
    expect(resolution.state).toBe("unknown");
    expect(resolution.invitation).toBeNull();
  });

  it("treats an unminted, well-formed token as unknown", async () => {
    const { invitationId } = await fixture(48);
    const guess = `y.${invitationId}.${"a".repeat(43)}`;
    const resolution = await resolveAnswerToken(guess);
    expect(resolution.state).toBe("unknown");
  });

  /**
   * `REQ-no-false-rsvp`'s tamper-resistance property: the invitation id and
   * the answer are hashed as part of the token, so swapping either without
   * knowing the original nonce produces a string whose hash matches nothing.
   */
  it("treats a tampered answer as unknown, not as the original answer", async () => {
    const { invitationId } = await fixture(48);
    const yes = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes"));
    const tampered = yes.token.replace(/^y\./, "n.");

    const resolution = await resolveAnswerToken(tampered);
    expect(resolution.state).toBe("unknown");
  });

  it("treats a token pointed at somebody else's invitation as unknown", async () => {
    const first = await fixture(48);
    const second = await fixture(48);
    const yes = await withTransaction((tx) => issueAnswerTokenIn(tx, first.invitationId, "yes"));
    // Splice the digest lookup for `first` onto `second`'s invitation id — this
    // can only be produced by an attacker who does not know the nonce, and it
    // must not resolve to either invitation.
    const spliced = yes.token.replace(first.invitationId, second.invitationId);

    const resolution = await resolveAnswerToken(spliced);
    expect(resolution.state).toBe("unknown");
  });

  it("resolves to revoked once revoked, and writes nothing on the read", async () => {
    const { invitationId } = await fixture(48);
    const yes = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes"));
    await observer.query(
      "update public.person_access_tokens set revoked_at = now(), revoked_reason = 'test' where id = $1",
      [yes.tokenId],
    );

    const resolution = await resolveAnswerToken(yes.token);
    expect(resolution.state).toBe("revoked");
    expect(resolution.writable).toBe(false);
  });

  it("resolves to event_started once the event begins, uniformly with LAN-79", async () => {
    const { invitationId } = await fixture(1);
    const yes = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes"));

    await observer.query(
      `update public.events set starts_at = (now() at time zone 'Europe/London' - interval '1 minute')::time,
              scheduled_on = (now() at time zone 'Europe/London')::date
        where id in (select event_id from public.invitations where id = $1)`,
      [invitationId],
    );

    const resolution = await resolveAnswerToken(yes.token);
    expect(resolution.state).toBe("event_started");
    expect(resolution.writable).toBe(false);
  });

  it("resolves the one non-uniform state — a valid token to a cancelled event", async () => {
    const { invitationId, eventId } = await fixture(48);
    const yes = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes"));
    await observer.query(
      "update public.events set status = 'cancelled', decision_reason = 'test' where id = $1",
      [eventId],
    );

    const resolution = await resolveAnswerToken(yes.token);
    expect(resolution.state).toBe("cancelled");
    expect(resolution.writable).toBe(false);
  });

  it("makes no write at all on a valid read — REQ-no-false-rsvp's GET half", async () => {
    const { invitationId } = await fixture(48);
    const yes = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes"));

    await resolveAnswerToken(yes.token);
    await resolveAnswerToken(yes.token);
    await resolveAnswerToken(yes.token);

    const row = await observer.query<{ single_use_at: Date | null; use_count: number }>(
      "select single_use_at, use_count from public.person_access_tokens where id = $1",
      [yes.tokenId],
    );
    expect(row.rows[0].single_use_at).toBeNull();
    expect(row.rows[0].use_count).toBe(0);

    const responses = await observer.query(
      "select count(*) as count from public.rsvp_responses where invitation_id = $1",
      [invitationId],
    );
    expect(Number(responses.rows[0].count)).toBe(0);
  });
});

describe("consuming an answer token", () => {
  it("records Yes and stands the invitation, in one transaction with everything else", async () => {
    const { invitationId } = await fixture(48);
    const yes = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes"));

    const recorded = await withTransaction((tx) => consumeAnswerTokenIn(tx, yes.token));
    expect(recorded.recorded).toBe(true);
    expect(recorded.answer).toBe("yes");

    const status = await observer.query<{ status: string }>(
      "select status::text as status from public.invitations where id = $1",
      [invitationId],
    );
    expect(status.rows[0].status).toBe("responded");

    const response = await observer.query<{ response: string; reason: string | null }>(
      "select response::text as response, reason from public.rsvp_responses where invitation_id = $1",
      [invitationId],
    );
    expect(response.rows[0].response).toBe("yes");
    expect(response.rows[0].reason).toBeNull();
  });

  it("records No with the honest default, never claiming the player supplied it", async () => {
    const { invitationId } = await fixture(48);
    const no = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "no"));

    await withTransaction((tx) => consumeAnswerTokenIn(tx, no.token));

    const response = await observer.query<{ response: string; reason: string | null }>(
      "select response::text as response, reason from public.rsvp_responses where invitation_id = $1",
      [invitationId],
    );
    expect(response.rows[0].response).toBe("no");
    expect(response.rows[0].reason).toBe(NO_REASON_GIVEN_DEFAULT);
  });

  it("cancels a pending reminder and clears an un-actioned flag in the same write", async () => {
    const { invitationId } = await fixture(48);
    const yes = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes"));
    await observer.query(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, invitation_id, channel, scheduled_for)
       values ($1, 'reminder', 'pending', $2, 'whatsapp', now() + interval '1 day')`,
      [`${MARKER}-reminder`, invitationId],
    );

    await withTransaction((tx) => consumeAnswerTokenIn(tx, yes.token));

    const job = await observer.query<{ status: string }>(
      "select status::text as status from public.notification_jobs where idempotency_key = $1",
      [`${MARKER}-reminder`],
    );
    expect(job.rows[0].status).toBe("cancelled");
  });

  it("is idempotent — a double-tap of the same button records nothing twice", async () => {
    const { invitationId } = await fixture(48);
    const yes = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes"));

    const first = await withTransaction((tx) => consumeAnswerTokenIn(tx, yes.token));
    const second = await withTransaction((tx) => consumeAnswerTokenIn(tx, yes.token));

    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(false);

    const responses = await observer.query(
      "select count(*) as count from public.rsvp_responses where invitation_id = $1",
      [invitationId],
    );
    expect(Number(responses.rows[0].count)).toBe(1);
  });

  it("refuses a revoked token, uniformly with every other closed reason", async () => {
    const { invitationId } = await fixture(48);
    const yes = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes"));
    await observer.query(
      "update public.person_access_tokens set revoked_at = now(), revoked_reason = 'test' where id = $1",
      [yes.tokenId],
    );

    const error = await caught(() => withTransaction((tx) => consumeAnswerTokenIn(tx, yes.token)));
    expect(error.rule).toBe("player_answer_token_closed");
  });

  it("refuses once the event has started, so a false RSVP cannot slip in after kickoff", async () => {
    const { invitationId } = await fixture(48);
    const yes = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "yes"));
    await observer.query(
      `update public.events set starts_at = (now() at time zone 'Europe/London' - interval '1 minute')::time,
              scheduled_on = (now() at time zone 'Europe/London')::date
        where id in (select event_id from public.invitations where id = $1)`,
      [invitationId],
    );

    const error = await caught(() => withTransaction((tx) => consumeAnswerTokenIn(tx, yes.token)));
    expect(error.rule).toBe("player_answer_token_closed");
    const responses = await observer.query(
      "select count(*) as count from public.rsvp_responses where invitation_id = $1",
      [invitationId],
    );
    expect(Number(responses.rows[0].count)).toBe(0);
  });

  it("records the opposite of what the token itself encodes when `options.response` overrides it — OWNER-LAN172-13's 'Change to Yes'", async () => {
    // The No page's own "Change to Yes" and the Yes page's own "Plans
    // changed?" both submit through this exact one-time token, asking for
    // the opposite answer. The token's identity proof (whose hash matched,
    // which invitation) is untouched — only what gets recorded changes.
    const { invitationId } = await fixture(48);
    const no = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "no"));

    const recorded = await withTransaction((tx) =>
      consumeAnswerTokenIn(tx, no.token, { response: "yes" }),
    );
    expect(recorded.answer).toBe("yes");

    const response = await observer.query<{ response: string; reason: string | null }>(
      "select response::text as response, reason from public.rsvp_responses where invitation_id = $1",
      [invitationId],
    );
    expect(response.rows[0].response).toBe("yes");
    expect(response.rows[0].reason).toBeNull();
  });

  it("records the player's own typed reason instead of the default when the landing page's own reason field carried one — OWNER-LAN172-13", async () => {
    const { invitationId } = await fixture(48);
    const no = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "no"));

    await withTransaction((tx) =>
      consumeAnswerTokenIn(tx, no.token, { reason: "Family commitment" }),
    );

    const response = await observer.query<{ reason: string | null }>(
      "select reason from public.rsvp_responses where invitation_id = $1",
      [invitationId],
    );
    expect(response.rows[0].reason).toBe("Family commitment");
  });

  it("still defaults to the honest 'No reason given' when the reason field was left blank", async () => {
    const { invitationId } = await fixture(48);
    const no = await withTransaction((tx) => issueAnswerTokenIn(tx, invitationId, "no"));

    await withTransaction((tx) => consumeAnswerTokenIn(tx, no.token, { reason: "" }));

    const response = await observer.query<{ reason: string | null }>(
      "select reason from public.rsvp_responses where invitation_id = $1",
      [invitationId],
    );
    expect(response.rows[0].reason).toBe(NO_REASON_GIVEN_DEFAULT);
  });
});

describe("the durable person credential", () => {
  it("stores only the digest and resolves back to the person and season", async () => {
    const { personId } = await fixture(48);
    const issued = await withTransaction((tx) => issuePersonTokenIn(tx, personId, seasonId));

    const resolution = await resolvePersonToken(issued.token);
    expect(resolution.state).toBe("valid");
    expect(resolution.resolved).toEqual({ personId, seasonId });

    const raw = await observer.query("select * from public.person_access_tokens where id = $1", [
      issued.tokenId,
    ]);
    expect(JSON.stringify(raw.rows[0])).not.toContain(issued.token);
  });

  it("reissuing supersedes the previous durable token — it cannot be recovered, only replaced", async () => {
    const { personId } = await fixture(48);
    const first = await withTransaction((tx) => issuePersonTokenIn(tx, personId, seasonId));
    const second = await withTransaction((tx) => issuePersonTokenIn(tx, personId, seasonId));

    expect((await resolvePersonToken(first.token)).state).toBe("unknown");
    expect((await resolvePersonToken(second.token)).state).toBe("valid");

    // Never two live durable credentials for the same person and season at once.
    const live = await observer.query(
      `select count(*) as count from public.person_access_tokens
        where person_id = $1 and season_id = $2 and not single_use and revoked_at is null`,
      [personId, seasonId],
    );
    expect(Number(live.rows[0].count)).toBe(1);
  });

  it("is revocable per person without waiting for a season close", async () => {
    const { personId } = await fixture(48);
    const issued = await withTransaction((tx) => issuePersonTokenIn(tx, personId, seasonId));

    const revokedCount = await withTransaction((tx) =>
      revokePersonTokenIn(tx, personId, seasonId, "Reported lost."),
    );
    expect(revokedCount).toBe(1);
    expect((await resolvePersonToken(issued.token)).state).toBe("unknown");
  });

  it("refuses a revocation with no reason, so the decision stays reviewable", async () => {
    const { personId } = await fixture(48);
    await withTransaction((tx) => issuePersonTokenIn(tx, personId, seasonId));

    const error = await caught(() =>
      withTransaction((tx) => revokePersonTokenIn(tx, personId, seasonId, "  ")),
    );
    expect(error.rule).toBe("person_token_revocation_needs_a_reason");
  });

  it("stops resolving the moment its season closes", async () => {
    const { personId } = await fixture(48);
    const issued = await withTransaction((tx) => issuePersonTokenIn(tx, personId, seasonId));
    expect((await resolvePersonToken(issued.token)).state).toBe("valid");

    await observer.query("update public.seasons set closed_at = now() where id = $1", [seasonId]);
    try {
      expect((await resolvePersonToken(issued.token)).state).toBe("unknown");
    } finally {
      await observer.query("update public.seasons set closed_at = null where id = $1", [seasonId]);
    }
  });

  it("makes no write on a valid read", async () => {
    const { personId } = await fixture(48);
    const issued = await withTransaction((tx) => issuePersonTokenIn(tx, personId, seasonId));

    await resolvePersonToken(issued.token);
    await resolvePersonToken(issued.token);

    const row = await observer.query<{ last_used_at: Date | null; use_count: number }>(
      "select last_used_at, use_count from public.person_access_tokens where id = $1",
      [issued.tokenId],
    );
    expect(row.rows[0].last_used_at).toBeNull();
    expect(row.rows[0].use_count).toBe(0);
  });
});
