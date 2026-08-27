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

// OWNER-LAN173-06. Independent scouting found `scripts/seed-local.mjs`
// hardcoding `person_id: null` on the one held reminder the seed carries,
// unlike every real job-creation path (`messaging-scheduler.ts`,
// `event-amendment.ts`), which derives it as
// `coalesce(invitation.person_id, membership.person_id)`. A held job with no
// person on it cannot be attributed to anyone the participation table reads
// per person, which is exactly what made it invisible to an operator.
describe.runIf(seeded)("the held reminder OWNER-LAN173-06 fixed", () => {
  it("carries the invitation's own person, not a null the fixture invented", async () => {
    const held = await client.query<{
      invitation_id: string;
      person_id: string | null;
      resolved_person_id: string | null;
    }>(
      `select j.invitation_id, j.person_id,
              coalesce(i.person_id, m.person_id) as resolved_person_id
         from public.notification_jobs j
         join public.invitations i on i.id = j.invitation_id
         left join public.season_memberships m on m.id = i.season_membership_id
        where j.held_at is not null`,
    );

    expect(held.rows.length, "the seed's one held job").toBeGreaterThan(0);
    for (const row of held.rows) {
      expect(row.person_id, `held job on invitation ${row.invitation_id}`).not.toBeNull();
      expect(row.person_id, `held job on invitation ${row.invitation_id}`).toBe(
        row.resolved_person_id,
      );
    }
  });
});
