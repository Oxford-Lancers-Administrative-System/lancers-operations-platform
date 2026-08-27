// @vitest-environment node
/**
 * The publication-safety assertion for the synthetic seed stays in the hot
 * database lane. Messiness/property coverage runs at the gate, but a plausible
 * real contact value must stop every ordinary verification run immediately.
 */
import { afterAll, describe, expect, it } from "vitest";
import { one, openLocalClient, type Client } from "./helpers/domain-fixture";

const client: Client = await openLocalClient();
const seeded =
  Number(
    (await client.query<{ count: string }>("select count(*) as count from public.people")).rows[0]
      .count,
  ) > 0;

if (!seeded && process.env.REQUIRE_SUPABASE_TESTS === "1") {
  throw new Error(
    "REQUIRE_SUPABASE_TESTS=1 but the synthetic seed is not loaded. Run `npm run db:seed`.",
  );
}

afterAll(async () => {
  await client.end();
});

const count = async (sql: string, params: unknown[] = []) =>
  Number((await one<{ count: string }>(client, sql, params)).count);

describe.runIf(seeded)("synthetic dataset privacy", () => {
  it("contains no value that looks like a real contact detail", async () => {
    const realistic = Number(
      (
        await one<{ count: string }>(
          client,
          `select count(*) as count from public.contact_points
            where (kind = 'email' and raw_value not like '%.example%')
               or (kind = 'phone' and raw_value not like '%07700 90%'
                   and raw_value not like '%7700900%' and raw_value not like '+1 555 01%')`,
        )
      ).count,
    );
    expect(realistic, "the synthetic dataset contains a plausibly real contact detail").toBe(0);
  });

  /**
   * OWNER-LAN172-21. `public.current_rsvp` picks the standing answer by
   * `order by responded_at desc`, so a seeded response timestamped in the
   * future permanently outranks every honest, real `now()` click a later
   * test or a real player ever makes on the same invitation — no matter how
   * many real answers get appended afterward. `scripts/seed-local.mjs` used
   * to time an answer relative to its event's own (possibly future)
   * deadline rather than to the seed's own clock, so roughly half of every
   * already-answered upcoming invitation in the seeded roster was pinned
   * this way. This assertion is the one this bug hides from: every other
   * test in the suite mints its own fresh, `now()`-stamped fixtures, which
   * are immune by construction — only a freshly seeded, unmodified roster
   * exercises the defective path.
   */
  it("times no seeded response in the future", async () => {
    const future = Number(
      (
        await one<{ count: string }>(
          client,
          `select count(*) as count from public.rsvp_responses where responded_at > now()`,
        )
      ).count,
    );
    expect(
      future,
      "a seeded rsvp_responses row is timestamped after now() — it will permanently outrank a real click in current_rsvp's order by responded_at desc",
    ).toBe(0);
  });

  /**
   * OWNER-LAN172-21's own blind spot, closed directly rather than inferred
   * from the timestamp check above. A fresh, `now()`-stamped fixture is
   * immune to this bug by construction — every other test in the suite uses
   * one, which is exactly why four correction rounds each looked clean.
   * This picks a real, already-answered, upcoming invitation from whatever
   * this run's own seeded roster produced and proves the property the bug
   * actually broke: a real answer recorded now supersedes the seeded one,
   * exactly as `current_rsvp`'s `order by responded_at desc` promises.
   * Wrapped in a transaction that is always rolled back — the seeded
   * dataset is unmutated by this test either way.
   */
  it("lets a real answer recorded now supersede the seeded one on a seeded, already-answered invitation", async () => {
    // Prefers a row this bug would actually have poisoned (its own
    // `responded_at` already in the future) when one exists, so this test
    // deterministically reproduces the defect rather than depending on
    // which row an unordered `limit 1` happens to land on; once the seed
    // fix holds, no such row exists and this simply falls back to any
    // already-answered upcoming invitation, which the property holds for
    // trivially.
    const target = await one<{ invitation_id: string; response: string } | undefined>(
      client,
      `select r.invitation_id, r.response::text as response
         from public.current_rsvp r
         join public.invitations i on i.id = r.invitation_id
         join public.events e on e.id = i.event_id
        where e.status = 'approved'
          and (e.scheduled_on + coalesce(e.starts_at, '00:00'::time)) at time zone 'Europe/London' > now()
        order by (r.responded_at > now()) desc
        limit 1`,
    );
    if (!target) {
      throw new Error(
        "No seeded, already-answered, upcoming invitation found to test supersession against — is the seed loaded?",
      );
    }
    const flipped = target.response === "yes" ? "no" : "yes";

    await client.query("begin");
    try {
      await client.query(
        `insert into public.rsvp_responses (invitation_id, response, reason, source, responded_at)
         values ($1, $2::public.rsvp_value, $3, 'operator'::public.rsvp_source, now())`,
        [target.invitation_id, flipped, flipped === "no" ? "Test-only supersession check" : null],
      );
      const after = await one<{ response: string }>(
        client,
        `select response::text as response from public.current_rsvp where invitation_id = $1`,
        [target.invitation_id],
      );
      expect(
        after.response,
        "a real, now()-timestamped answer did not become the standing response on a seeded invitation — the seed's own timestamp is still winning",
      ).toBe(flipped);
    } finally {
      await client.query("rollback");
    }
  });
});

// OWNER-LAN170-01 (Brian's owner walkthrough, round 2): the seed clamped
// `approved_at`/`audience_confirmed_at` to "12 days before the event" with no
// ceiling, so an event scheduled more than 12 days past the frame's `now()`
// landed its approval — and therefore its invitations' `issued_at`, and every
// notification job scheduled from that invitation — in the future. An
// invitation issued in the future is exactly why the operator's "record an
// answer given in person" surface (LAN-170) could not be exercised at all:
// its default "responded at" of now is refused for being before the
// invitation. This pins the seed's own timeline sanity independent of that
// surface's validation, which stays exactly as built.
describe.runIf(seeded)("synthetic dataset timeline coherence relative to now()", () => {
  it("never approves an event, or issues an invitation, in the future", async () => {
    const futureApprovals = await count(
      "select count(*) as count from public.events where approved_at > now()",
    );
    expect(futureApprovals, "an event was approved in the future").toBe(0);

    const futureConfirmations = await count(
      "select count(*) as count from public.events where audience_confirmed_at > now()",
    );
    expect(futureConfirmations, "an event's audience was confirmed in the future").toBe(0);

    const futureInvitations = await count(
      "select count(*) as count from public.invitations where issued_at > now()",
    );
    expect(futureInvitations, "an invitation was issued in the future").toBe(0);
  });

  it("never schedules a notification job before the invitation it belongs to was issued", async () => {
    const backwards = await count(
      `select count(*) as count
         from public.notification_jobs j
         join public.invitations i on i.id = j.invitation_id
        where j.scheduled_for is not null
          and j.scheduled_for < i.issued_at`,
    );
    expect(backwards, "a notification job is scheduled before its own invitation was issued").toBe(
      0,
    );
  });
});
