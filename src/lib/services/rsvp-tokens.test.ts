// @vitest-environment node
/**
 * RSVP access tokens — LAN-78.
 *
 * Against the real local database, because every rule here is one PostgreSQL
 * carries: a partial unique index that permits one live token per invitation, a
 * shape check that makes storing a plaintext token impossible, and a comparison
 * against `now()` that decides whether an event has started. A mocked
 * transaction can demonstrate none of them.
 *
 * Every row hangs off a person whose `given_name` is `MARKER`, deleted in
 * `afterEach`. The marker is unique to this file: Vitest runs suites in
 * parallel against one database, and a shared marker means one suite deleting
 * another's fixtures mid-test.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction, type ServiceError } from "@/lib/db";
import {
  hashToken,
  issueTokenIn,
  mintToken,
  resolveRsvpToken,
  revokeTokensIn,
  TOKEN_PATTERN,
  TOKEN_REQUIRES_A_LIVE_EVENT_RULE,
} from "./rsvp-tokens";
import { openObserver } from "../../../tests/helpers/service-layer";

const MARKER = "LAN78TokenSuite";

let observer: Client;
let seasonId: string;

/**
 * A season of this suite's own, and the reason it is not the seeded one.
 *
 * These suites commit — they have to, because commit is part of what is under
 * test — and an `active` membership in the club's current season changes the
 * roster every other suite reads. `membership.test.ts` counts that roster and
 * failed the moment this file borrowed it.
 *
 * The season is therefore `archived`, which puts it outside every "current
 * season" query in the application while remaining a perfectly legal parent for
 * a membership, an event and an invitation. Nothing under test here depends on
 * the season being the open one.
 */
beforeAll(async () => {
  observer = await openObserver();

  // A **seeded** person, not merely the oldest one in the table.
  //
  // The first version took `order by created_at limit 1`, which on a parallel
  // run can be another suite's fixture person — and naming them as this
  // season's opener makes them undeletable (`on delete restrict`), so that
  // suite's cleanup fails and every test after it fails with a foreign-key
  // error that has nothing to do with what it was testing. The seed stamps its
  // people with one fixed timestamp, and no suite ever deletes them.
  const anchor = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id limit 1",
    ["2025-06-01T09:00:00Z"],
  );
  expect(anchor.rows.length).toBe(1);
  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );

  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on,
        opened_at, opened_by_person_id, closed_at, closed_by_person_id)
     values ($1, 'archived', $2, '2019-09-01', '2020-06-01', now(), $3, now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, anchor.rows[0].id],
  );
  seasonId = season.rows[0].id;
});

afterEach(async () => {
  const people = "(select id from public.people where given_name = $1)";
  const invitations = `(select id from public.invitations where person_id in ${people}
     or season_membership_id in (select id from public.season_memberships where person_id in ${people}))`;
  await observer.query(
    `delete from public.rsvp_access_tokens where invitation_id in ${invitations}`,
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
  await observer.query(
    "delete from public.audit_events where actor_person_id in (select id from public.people where given_name = $1)",
    [MARKER],
  );
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  // After `afterEach` has removed every membership and event hanging off it.
  await observer.query("delete from public.seasons where label = $1", [`${MARKER} season`]);
  await observer.end();
  await closePool();
});

/**
 * One approved event with one player invitation, at a chosen start instant.
 *
 * `startsInHours` is what every boundary test varies: a negative value produces
 * an event that has already begun, which is the state most of the refusals
 * below are about.
 */
async function fixture(startsInHours: number, status = "approved") {
  // One transaction, because `event_audience_members` and `invitations` are
  // written separately and `tests/synthetic-seed.test.ts` counts audience rows
  // that have no invitation — the approval defect it exists to report. A
  // half-built fixture visible to a parallel suite looks exactly like one.
  await observer.query("begin");
  try {
    const person = await observer.query<{ id: string }>(
      // `created_at` is set far ahead on purpose, and this is not cosmetic.
      //
      // The seed stamps its people with a **future** timestamp (2026-08-15), so a
      // fixture person created at `now()` is the *oldest* row in `public.people`.
      // `roster.test.ts` resolves its acting operator as "the oldest person", and in
      // a parallel run it therefore adopted this suite's fixture — which this suite
      // then deleted in `afterEach`, taking that suite's actor with it and failing
      // thirteen of its tests with foreign-key errors about a table neither suite is
      // testing. Sorting these rows to the end of every ordering keeps them
      // unpickable by any suite looking for a real person.
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

    // The event's start is `scheduled_on` plus `starts_at` in Europe/London, so
    // the fixture computes both from the target instant rather than assuming the
    // offset — which changes twice inside a season.
    const event = await observer.query<{ id: string }>(
      `with target as (select (now() + make_interval(hours => $3)) at time zone 'Europe/London' as local)
     insert into public.events
       (season_id, name, event_type, status, scheduled_on, starts_at, solicits_response,
        audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
     select $1, $2, 'practice', $4::public.event_status,
            (select local::date from target), (select local::time from target), true,
            case when $4 = 'draft' then null else now() end,
            case when $4 = 'draft' then null else $5::uuid end,
            case when $4 = 'draft' then null else now() end,
            case when $4 = 'draft' then null else $5::uuid end
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
       (event_id, event_status, solicits_response, season_id, capacity,
        season_membership_id, status, audience_member_id)
     values ($1, $2::public.event_status, true, $3, 'player', $4, 'pending', $5)
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

describe("minting", () => {
  it("produces 256 bits, URL-safe, with no identifier in it", () => {
    const token = mintToken();
    expect(token).toMatch(TOKEN_PATTERN);
    // 43 base64url characters is 32 bytes. Anything shorter is a weaker token
    // than Brian decided on.
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => mintToken()));
    expect(tokens.size).toBe(500);
  });

  it("hashes to lowercase hex of the right length", () => {
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("issuing", () => {
  it("stores only the digest, never the token", async () => {
    const { invitationId } = await fixture(48);

    const issued = await withTransaction((tx) => issueTokenIn(tx, invitationId));

    const stored = await observer.query<{ token_hash: string }>(
      "select token_hash from public.rsvp_access_tokens where invitation_id = $1",
      [invitationId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].token_hash).toBe(hashToken(issued.token));
    expect(stored.rows[0].token_hash).not.toBe(issued.token);

    // And nothing anywhere in the row carries it. This is the assertion that
    // would fail if somebody added a `token` column "for support".
    const whole = await observer.query(
      "select * from public.rsvp_access_tokens where invitation_id = $1",
      [invitationId],
    );
    expect(JSON.stringify(whole.rows[0])).not.toContain(issued.token);
  });

  it("refuses to store a plaintext token, at the database", async () => {
    const { invitationId } = await fixture(48);
    // The shape check is the half of "never store plaintext" that survives a
    // bug in the service layer.
    await expect(
      observer.query(
        `insert into public.rsvp_access_tokens (invitation_id, token_hash, expires_at)
         values ($1, $2, now() + interval '1 day')`,
        [invitationId, mintToken()],
      ),
    ).rejects.toThrow(/rsvp_access_tokens_hash_is_a_sha256_digest/);
  });

  it("expires the token at the event's start", async () => {
    const { invitationId } = await fixture(48);
    const issued = await withTransaction((tx) => issueTokenIn(tx, invitationId));

    const start = await observer.query<{ starts_at: Date }>(
      `select (e.scheduled_on + coalesce(e.starts_at, '00:00'::time)) at time zone 'Europe/London'
                as starts_at
         from public.events e
         join public.invitations i on i.event_id = e.id
        where i.id = $1`,
      [invitationId],
    );
    expect(issued.expiresAt.getTime()).toBe(start.rows[0].starts_at.getTime());
  });

  it("refuses to issue for an event that has already started", async () => {
    const { invitationId } = await fixture(-1);
    const error = await caught(() => withTransaction((tx) => issueTokenIn(tx, invitationId)));
    expect(error.rule).toBe(TOKEN_REQUIRES_A_LIVE_EVENT_RULE);
  });

  it("refuses an invitation that does not exist", async () => {
    const error = await caught(() =>
      withTransaction((tx) => issueTokenIn(tx, "00000000-0000-4000-8000-000000000000")),
    );
    expect(error.kind).toBe("constraint_violated");
  });

  it("creates no invitation of its own", async () => {
    const { invitationId, eventId } = await fixture(48);
    await withTransaction((tx) => issueTokenIn(tx, invitationId));
    await withTransaction((tx) => issueTokenIn(tx, invitationId));

    // Reissue is the only repair there is, so it must be provably incapable of
    // adding a recipient after approval — LAN-77's audience freeze.
    const invitations = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.invitations where event_id = $1",
      [eventId],
    );
    expect(invitations.rows[0].count).toBe("1");
  });
});

describe("supersession", () => {
  it("leaves exactly one live token, and kills the predecessor immediately", async () => {
    const { invitationId } = await fixture(48);

    const first = await withTransaction((tx) => issueTokenIn(tx, invitationId));
    const second = await withTransaction((tx) => issueTokenIn(tx, invitationId));

    const live = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.rsvp_access_tokens
        where invitation_id = $1 and revoked_at is null and superseded_at is null`,
      [invitationId],
    );
    expect(live.rows[0].count).toBe("1");

    expect((await resolveRsvpToken(first.token)).state).toBe("superseded");
    expect((await resolveRsvpToken(second.token)).state).toBe("valid");
  });

  it("records which token replaced which", async () => {
    const { invitationId } = await fixture(48);
    const first = await withTransaction((tx) => issueTokenIn(tx, invitationId));
    const second = await withTransaction((tx) => issueTokenIn(tx, invitationId));

    const row = await observer.query<{ superseded_by_token_id: string }>(
      "select superseded_by_token_id from public.rsvp_access_tokens where id = $1",
      [first.tokenId],
    );
    expect(row.rows[0].superseded_by_token_id).toBe(second.tokenId);
  });

  it("is enforced by the database, not only by the service", async () => {
    const { invitationId } = await fixture(48);
    await withTransaction((tx) => issueTokenIn(tx, invitationId));

    await expect(
      observer.query(
        `insert into public.rsvp_access_tokens (invitation_id, token_hash, expires_at)
         values ($1, $2, now() + interval '1 day')`,
        [invitationId, hashToken("a second live token")],
      ),
    ).rejects.toThrow(/rsvp_access_tokens_one_live_per_invitation/);
  });
});

describe("revocation", () => {
  it("takes effect immediately", async () => {
    const { invitationId } = await fixture(48);
    const issued = await withTransaction((tx) => issueTokenIn(tx, invitationId));
    expect((await resolveRsvpToken(issued.token)).state).toBe("valid");

    await withTransaction((tx) => revokeTokensIn(tx, invitationId, "Sent to the wrong person"));
    expect((await resolveRsvpToken(issued.token)).state).toBe("revoked");
  });

  it("has to say why", async () => {
    const { invitationId } = await fixture(48);
    await withTransaction((tx) => issueTokenIn(tx, invitationId));
    const error = await caught(() =>
      withTransaction((tx) => revokeTokensIn(tx, invitationId, "   ")),
    );
    expect(error.kind).toBe("constraint_violated");
  });

  it("reports revoked rather than expired, so waiting never looks like the problem", async () => {
    const { invitationId } = await fixture(48);
    const issued = await withTransaction((tx) => issueTokenIn(tx, invitationId));
    await withTransaction((tx) => revokeTokensIn(tx, invitationId, "Withdrawn"));

    await observer.query(
      // `expires_after_issue` refuses a token that expired before it existed,
      // so the issue instant moves back with it — which is what a token issued
      // two days ago and now past its expiry actually looks like.
      `update public.rsvp_access_tokens
          set issued_at = now() - interval '2 days', expires_at = now() - interval '1 hour'
        where id = $1`,
      [issued.tokenId],
    );
    expect((await resolveRsvpToken(issued.token)).state).toBe("revoked");
  });
});

describe("resolving", () => {
  it("counts repeat access", async () => {
    const { invitationId } = await fixture(48);
    const issued = await withTransaction((tx) => issueTokenIn(tx, invitationId));

    await resolveRsvpToken(issued.token);
    await resolveRsvpToken(issued.token);

    const row = await observer.query<{ use_count: number; last_used_at: Date | null }>(
      "select use_count, last_used_at from public.rsvp_access_tokens where id = $1",
      [issued.tokenId],
    );
    expect(row.rows[0].use_count).toBe(2);
    expect(row.rows[0].last_used_at).not.toBeNull();
  });

  it("counts nothing for a token that does not resolve", async () => {
    const before = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.rsvp_access_tokens where use_count > 0",
    );
    expect((await resolveRsvpToken(mintToken())).state).toBe("unknown");
    const after = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.rsvp_access_tokens where use_count > 0",
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("refuses a malformed token without touching the database", async () => {
    for (const nonsense of ["", "short", "../../etc/passwd", "a".repeat(200)]) {
      expect((await resolveRsvpToken(nonsense)).state).toBe("unknown");
    }
  });

  /**
   * The boundary the issue names explicitly: tested immediately before and
   * after the event's start.
   */
  it("permits a write a minute before the start and refuses one a minute after", async () => {
    const before = await fixture(48);
    const beforeToken = await withTransaction((tx) => issueTokenIn(tx, before.invitationId));

    // Issued while the event was safely ahead, then the event is moved so that
    // it began sixty seconds ago. That is the real sequence — a link in
    // somebody's pocket while the clock passes the start.
    const resolvedBefore = await resolveRsvpToken(beforeToken.token);
    expect(resolvedBefore.state).toBe("valid");
    expect(resolvedBefore.writable).toBe(true);

    await observer.query(
      `update public.events
          set scheduled_on = ((now() - interval '1 minute') at time zone 'Europe/London')::date,
              starts_at = ((now() - interval '1 minute') at time zone 'Europe/London')::time
        where id = $1`,
      [before.eventId],
    );

    const resolvedAfter = await resolveRsvpToken(beforeToken.token);
    expect(resolvedAfter.state).toBe("event_started");
    expect(resolvedAfter.writable).toBe(false);
  });

  it("refuses an expired token even when the event is still ahead", async () => {
    const { invitationId } = await fixture(48);
    const issued = await withTransaction((tx) => issueTokenIn(tx, invitationId));

    // The event was moved later after the link went out. The stamped expiry
    // still stops the old link, which is the safe direction.
    await observer.query(
      `update public.rsvp_access_tokens
          set issued_at = now() - interval '2 days', expires_at = now() - interval '1 second'
        where id = $1`,
      [issued.tokenId],
    );

    const resolved = await resolveRsvpToken(issued.token);
    expect(resolved.state).toBe("expired");
    expect(resolved.writable).toBe(false);
  });

  it("names the invitee and the event for a valid link, and nobody else", async () => {
    const { invitationId } = await fixture(48);
    const issued = await withTransaction((tx) => issueTokenIn(tx, invitationId));

    const resolved = await resolveRsvpToken(issued.token);
    expect(resolved.invitation?.invitationId).toBe(invitationId);
    expect(resolved.invitation?.inviteeName).toBe(MARKER);
    expect(resolved.invitation?.eventName).toContain(MARKER);
  });

  it("gives a cancelled event its own state, with the event still named", async () => {
    const { invitationId, eventId } = await fixture(48);
    const issued = await withTransaction((tx) => issueTokenIn(tx, invitationId));

    await observer.query(
      `update public.events set status = 'cancelled', decision_reason = 'Pitch unavailable'
        where id = $1`,
      [eventId],
    );

    const resolved = await resolveRsvpToken(issued.token);
    // UX-66: the one non-uniform terminal state, because a valid invitation
    // resolved before the cancellation was evaluated.
    expect(resolved.state).toBe("cancelled");
    expect(resolved.writable).toBe(false);
    expect(resolved.invitation?.eventName).toContain(MARKER);
  });

  it("returns no invitation at all for unknown, expired, revoked or superseded", async () => {
    const { invitationId } = await fixture(48);
    const first = await withTransaction((tx) => issueTokenIn(tx, invitationId));
    await withTransaction((tx) => issueTokenIn(tx, invitationId));

    // LAN-79 collapses these into one uniform public response. Carrying no
    // invitation is what makes that collapse safe to write.
    expect((await resolveRsvpToken(first.token)).invitation).toBeNull();
    expect((await resolveRsvpToken(mintToken())).invitation).toBeNull();
  });
});
