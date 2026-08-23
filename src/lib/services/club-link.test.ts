// @vitest-environment node
/**
 * The club link's token — D2, D81, LAN-157.
 *
 * Against the **real** local database, because the properties under test are
 * properties of the table: the digest-shape check refuses a stored plaintext,
 * the partial unique index refuses a second live link, and the paired
 * use-count constraint refuses a half-recorded use. A mock demonstrates none of
 * them.
 *
 * Every row hangs off an event whose name carries `NAME_MARKER`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction } from "@/lib/db";
import {
  CLUB_LINK_NEEDS_AN_AUDIENCE_RULE,
  CLUB_LINK_TOKEN_PATTERN,
  CLUB_LINK_UNCONFIGURED_RULE,
  clubLinkIsConfigured,
  clubLinkSecret,
  clubLinkUrl,
  deriveClubLinkToken,
  hashClubLinkToken,
  issueClubLinkIn,
  resolveClubLinkIn,
} from "./club-link";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const NAME_MARKER = "LAN157ClubLinkSuite";
const SECRET = { CLUB_LINK_SECRET: "club-link-suite-signing-key-0123456789abc" };
const OTHER_SECRET = { CLUB_LINK_SECRET: "a-different-club-link-signing-key-000000" };

let observer: Client;
let actorPersonId: string;

beforeAll(async () => {
  observer = await openObserver();
  const people = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id",
    [await seededIdentityCreatedAt(observer)],
  );
  expect(people.rows.length).toBeGreaterThan(0);
  actorPersonId = people.rows[0].id;
});

afterEach(async () => {
  const events = "(select id from public.events where name like $1)";
  await observer.query(`delete from public.club_link_tokens where event_id in ${events}`, [
    `${NAME_MARKER}%`,
  ]);
  await observer.query("delete from public.events where name like $1", [`${NAME_MARKER}%`]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

/**
 * A bare event row. This suite is about the token, not about the audience.
 *
 * Invariant E1 — `events_approval_requires_date_and_audience` — means anything
 * past `draft` has to carry the four approval columns, so they are set for the
 * two statuses that need them and left null for the draft.
 */
async function anEvent(status: "draft" | "approved" | "cancelled" = "approved"): Promise<string> {
  const season = await observer.query<{ id: string }>(
    "select id from public.seasons where status = 'active' order by starts_on desc limit 1",
  );
  const approved = status !== "draft";
  const inserted = await observer.query<{ id: string }>(
    `insert into public.events
       (season_id, name, event_type, origin, status, scheduled_on, starts_at,
        is_mandatory, owner_person_id,
        approved_at, approved_by_person_id,
        audience_confirmed_at, audience_confirmed_by_person_id,
        decision_reason)
     values ($1, $2, 'practice', 'club_controlled', $3::public.event_status,
             current_date, '19:00', true, $4,
             case when $5 then now() end, case when $5 then $4::uuid end,
             case when $5 then now() end, case when $5 then $4::uuid end,
             case when $3 = 'cancelled' then 'Pitch flooded' end)
     returning id`,
    [season.rows[0].id, `${NAME_MARKER} ${status}`, status, actorPersonId, approved],
  );
  return inserted.rows[0].id;
}

// ---------------------------------------------------------------------------
// The token itself
// ---------------------------------------------------------------------------

describe("the signing key", () => {
  it("refuses to sign without one, naming the setting and never a value", () => {
    expect(clubLinkIsConfigured({})).toBe(false);
    try {
      clubLinkSecret({});
      expect.unreachable("an unconfigured deployment must refuse");
    } catch (error) {
      expect(isServiceError(error)).toBe(true);
      expect((error as { rule?: string }).rule).toBe(CLUB_LINK_UNCONFIGURED_RULE);
      expect((error as Error).message).toContain("CLUB_LINK_SECRET");
    }
  });

  it("refuses a value too short to be one", () => {
    expect(clubLinkIsConfigured({ CLUB_LINK_SECRET: "secret" })).toBe(false);
    expect(clubLinkIsConfigured(SECRET)).toBe(true);
  });

  it("never returns the value from anything a caller renders", () => {
    // The secret is reachable only through `clubLinkSecret`. Nothing derived
    // from it — the token, the digest, the URL — contains it.
    const token = deriveClubLinkToken("e", "l", SECRET);
    expect(token).not.toContain(SECRET.CLUB_LINK_SECRET);
    expect(hashClubLinkToken(token)).not.toContain(SECRET.CLUB_LINK_SECRET);
    expect(clubLinkUrl("https://club.example", token)).not.toContain(SECRET.CLUB_LINK_SECRET);
  });
});

describe("deriveClubLinkToken", () => {
  it("is 256 bits of base64url, and stable for the same event and row", () => {
    const first = deriveClubLinkToken("event-1", "link-1", SECRET);
    expect(first).toMatch(CLUB_LINK_TOKEN_PATTERN);
    expect(deriveClubLinkToken("event-1", "link-1", SECRET)).toBe(first);
  });

  it("differs for a different event, a different row, and a different key", () => {
    const base = deriveClubLinkToken("event-1", "link-1", SECRET);
    expect(deriveClubLinkToken("event-2", "link-1", SECRET)).not.toBe(base);
    // Rotation later is a second row, which is why the row id is in the input.
    expect(deriveClubLinkToken("event-1", "link-2", SECRET)).not.toBe(base);
    expect(deriveClubLinkToken("event-1", "link-1", OTHER_SECRET)).not.toBe(base);
  });

  it("cannot be confused across the separator", () => {
    // Domain separation, and the shape of a length-extension mix-up: `a:bc`
    // and `ab:c` must not sign to the same thing.
    expect(deriveClubLinkToken("a", "bc", SECRET)).not.toBe(deriveClubLinkToken("ab", "c", SECRET));
  });
});

describe("clubLinkUrl", () => {
  it("points at /e and trims a trailing slash", () => {
    expect(clubLinkUrl("https://club.example/", "abc")).toBe("https://club.example/e/abc");
  });
});

// ---------------------------------------------------------------------------
// Issuing
// ---------------------------------------------------------------------------

describe("issuing a club link", () => {
  it("stores the digest and never the token", async () => {
    const eventId = await anEvent();
    const issued = await withTransaction((tx) =>
      issueClubLinkIn(tx, eventId, { actorPersonId, env: SECRET }),
    );

    const row = await observer.query<{ token_hash: string; issued_by_person_id: string }>(
      "select token_hash, issued_by_person_id from public.club_link_tokens where id = $1",
      [issued.linkId],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].token_hash).toBe(hashClubLinkToken(issued.token));
    expect(row.rows[0].token_hash).not.toBe(issued.token);
    expect(row.rows[0].issued_by_person_id).toBe(actorPersonId);

    // And nothing anywhere in the row is the plaintext.
    const whole = await observer.query(
      "select to_jsonb(t)::text as row from public.club_link_tokens t where t.id = $1",
      [issued.linkId],
    );
    expect((whole.rows[0] as { row: string }).row).not.toContain(issued.token);
  });

  it("returns the same link the second time, and creates no second row", async () => {
    // The property the whole derivation exists for: an operator who pressed
    // Share on Monday and presses it again on Wednesday must be shown the link
    // that is already in the squad's WhatsApp thread.
    const eventId = await anEvent();
    const first = await withTransaction((tx) =>
      issueClubLinkIn(tx, eventId, { actorPersonId, env: SECRET }),
    );
    const second = await withTransaction((tx) =>
      issueClubLinkIn(tx, eventId, { actorPersonId, env: SECRET }),
    );

    expect(second.token).toBe(first.token);
    expect(second.linkId).toBe(first.linkId);
    expect(second.reused).toBe(true);
    expect(first.reused).toBe(false);

    const count = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.club_link_tokens where event_id = $1",
      [eventId],
    );
    expect(count.rows[0].count).toBe("1");
  });

  it("refuses a draft, which has no participation table to share", async () => {
    const eventId = await anEvent("draft");
    await expect(
      withTransaction((tx) => issueClubLinkIn(tx, eventId, { actorPersonId, env: SECRET })),
    ).rejects.toMatchObject({ rule: CLUB_LINK_NEEDS_AN_AUDIENCE_RULE });
    const count = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.club_link_tokens where event_id = $1",
      [eventId],
    );
    expect(count.rows[0].count).toBe("0");
  });

  it("issues for a cancelled event, whose table survives with its answers", async () => {
    const eventId = await anEvent("cancelled");
    const issued = await withTransaction((tx) =>
      issueClubLinkIn(tx, eventId, { actorPersonId, env: SECRET }),
    );
    expect(issued.token).toMatch(CLUB_LINK_TOKEN_PATTERN);
  });

  it("leaves no row behind when the deployment cannot sign", async () => {
    const eventId = await anEvent();
    await expect(
      withTransaction((tx) => issueClubLinkIn(tx, eventId, { actorPersonId, env: {} })),
    ).rejects.toMatchObject({ rule: CLUB_LINK_UNCONFIGURED_RULE });
    const count = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.club_link_tokens where event_id = $1",
      [eventId],
    );
    expect(count.rows[0].count).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// Resolving
// ---------------------------------------------------------------------------

describe("resolving a club link", () => {
  it("opens the event it was issued for, and records the use", async () => {
    const eventId = await anEvent();
    const issued = await withTransaction((tx) =>
      issueClubLinkIn(tx, eventId, { actorPersonId, env: SECRET }),
    );

    const resolved = await withTransaction((tx) =>
      resolveClubLinkIn(tx, issued.token, { env: SECRET }),
    );
    expect(resolved).toEqual({ state: "live", linkId: issued.linkId, eventId });

    const used = await observer.query<{ use_count: number; last_used_at: Date | null }>(
      "select use_count, last_used_at from public.club_link_tokens where id = $1",
      [issued.linkId],
    );
    expect(used.rows[0].use_count).toBe(1);
    expect(used.rows[0].last_used_at).not.toBeNull();
  });

  it("refuses a malformed token without reaching the database", async () => {
    for (const token of ["", "short", "a".repeat(44), "not a token at all"]) {
      expect(await withTransaction((tx) => resolveClubLinkIn(tx, token, { env: SECRET }))).toEqual({
        state: "unknown",
      });
    }
  });

  it("refuses a well-formed token this deployment did not sign", async () => {
    const eventId = await anEvent();
    const issued = await withTransaction((tx) =>
      issueClubLinkIn(tx, eventId, { actorPersonId, env: SECRET }),
    );
    // The forgery: the right shape, for the right row, signed with the wrong key.
    const forged = deriveClubLinkToken(eventId, issued.linkId, OTHER_SECRET);
    expect(forged).toMatch(CLUB_LINK_TOKEN_PATTERN);
    expect(forged).not.toBe(issued.token);
    expect(await withTransaction((tx) => resolveClubLinkIn(tx, forged, { env: SECRET }))).toEqual({
      state: "unknown",
    });
  });

  it("refuses the deployment's own token once the key has changed", async () => {
    // The consequence of rotating `CLUB_LINK_SECRET`, stated as a test so it is
    // not discovered by a coach: every issued link stops opening.
    const eventId = await anEvent();
    const issued = await withTransaction((tx) =>
      issueClubLinkIn(tx, eventId, { actorPersonId, env: SECRET }),
    );
    expect(
      await withTransaction((tx) => resolveClubLinkIn(tx, issued.token, { env: OTHER_SECRET })),
    ).toEqual({ state: "unknown" });
  });

  it("reports a revoked token as revoked, and records no use for it", async () => {
    const eventId = await anEvent();
    const issued = await withTransaction((tx) =>
      issueClubLinkIn(tx, eventId, { actorPersonId, env: SECRET }),
    );
    await observer.query(
      "update public.club_link_tokens set revoked_at = now(), revoked_reason = 'suite' where id = $1",
      [issued.linkId],
    );

    expect(
      await withTransaction((tx) => resolveClubLinkIn(tx, issued.token, { env: SECRET })),
    ).toEqual({ state: "revoked" });

    const used = await observer.query<{ use_count: number }>(
      "select use_count from public.club_link_tokens where id = $1",
      [issued.linkId],
    );
    expect(used.rows[0].use_count).toBe(0);
  });

  it("lets a revoked event take a fresh link, which is a different token", async () => {
    // Q2 is deferred and this ships without revocation. The path is proved
    // anyway, because "adding it later is additive" is only true if it is.
    const eventId = await anEvent();
    const first = await withTransaction((tx) =>
      issueClubLinkIn(tx, eventId, { actorPersonId, env: SECRET }),
    );
    await observer.query(
      "update public.club_link_tokens set revoked_at = now(), revoked_reason = 'suite' where id = $1",
      [first.linkId],
    );

    const second = await withTransaction((tx) =>
      issueClubLinkIn(tx, eventId, { actorPersonId, env: SECRET }),
    );
    expect(second.linkId).not.toBe(first.linkId);
    expect(second.token).not.toBe(first.token);
    expect(second.reused).toBe(false);

    expect(
      await withTransaction((tx) => resolveClubLinkIn(tx, first.token, { env: SECRET })),
    ).toEqual({ state: "revoked" });
    expect(
      (await withTransaction((tx) => resolveClubLinkIn(tx, second.token, { env: SECRET }))).state,
    ).toBe("live");
  });
});

// ---------------------------------------------------------------------------
// The database's own refusals
// ---------------------------------------------------------------------------

describe("the table refuses what the module must never do", () => {
  it("refuses a stored plaintext token", async () => {
    const eventId = await anEvent();
    const token = deriveClubLinkToken(eventId, "row", SECRET);
    await expect(
      observer.query("insert into public.club_link_tokens (event_id, token_hash) values ($1, $2)", [
        eventId,
        token,
      ]),
    ).rejects.toThrow(/club_link_tokens_hash_is_a_sha256_digest/);
  });

  it("refuses a second live link for one event", async () => {
    const eventId = await anEvent();
    await withTransaction((tx) => issueClubLinkIn(tx, eventId, { actorPersonId, env: SECRET }));
    await expect(
      observer.query("insert into public.club_link_tokens (event_id, token_hash) values ($1, $2)", [
        eventId,
        hashClubLinkToken("something else entirely"),
      ]),
    ).rejects.toThrow(/club_link_tokens_one_live_per_event/);
  });
});
