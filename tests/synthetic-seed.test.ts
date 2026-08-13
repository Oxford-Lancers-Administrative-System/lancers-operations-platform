// @vitest-environment node
/**
 * Asserts that the synthetic dataset really exhibits the load-bearing messy
 * properties from Source Data Analysis §11 — not just that it loaded.
 *
 * §11.5 lists the properties a generator is "good enough" to have produced.
 * Those are the assertions below. If a future change to the generator quietly
 * tidies the data up, these fail, because tidy fixtures hide exactly the
 * problems this dataset exists to expose.
 *
 * Requires `npm run db:reset && npm run db:seed`.
 */
import { afterAll, describe, expect, it } from "vitest";
import { one, openLocalClient, type Client } from "./helpers/domain-fixture";

// Whether the seed is loaded has to be known at COLLECTION time for the suite
// to skip cleanly, so this is a top-level await rather than a `beforeAll`.
const client: Client = await openLocalClient();
const seeded =
  Number(
    (await client.query<{ count: string }>("select count(*) as count from public.people")).rows[0]
      .count,
  ) > 0;

// CI seeds before running tests, so an empty database there is a failure rather
// than a skip. A developer who has only run migrations still gets `npm test`.
if (!seeded && process.env.REQUIRE_SUPABASE_TESTS === "1") {
  throw new Error(
    "REQUIRE_SUPABASE_TESTS=1 but the synthetic seed is not loaded. Run `npm run db:seed`.",
  );
}

afterAll(async () => {
  await client?.end();
});

const count = async (sql: string, params: unknown[] = []) =>
  Number((await one<{ count: string }>(client, sql, params)).count);

describe.runIf(seeded)("synthetic dataset properties (SDA §11.5)", () => {
  it("has no join key between tables except an unstable display name", async () => {
    // The staging tables are the honest reproduction of this: legacy rows carry
    // a raw name and nothing else, and matching to a Person is a decision
    // somebody makes, not a foreign key the file supplied.
    const unmatched = await count(
      `select count(*) as count from staging.legacy_roster_rows where matched_person_id is null`,
    );
    expect(unmatched).toBeGreaterThan(0);
  });

  it("reproduces the first-name-only population at its measured rate", async () => {
    const total = await count("select count(*) as count from public.people");
    const mononyms = await count(
      "select count(*) as count from public.people where family_name is null",
    );
    // Measured at 26% of the squad. Allowing 15–35% keeps the test about the
    // property rather than about the exact PRNG draw.
    expect(mononyms / total).toBeGreaterThan(0.15);
    expect(mononyms / total).toBeLessThan(0.35);
  });

  it("has at least one person present under three name variants", async () => {
    const best = await count(
      `select coalesce(max(c), 0) as count from (
         select count(*) as c from public.person_aliases group by person_id) t`,
    );
    expect(best).toBeGreaterThanOrEqual(3);
  });

  it("has contact details that exist for one population and not another", async () => {
    const withEmail = await count(
      "select count(distinct person_id) as count from public.contact_points where kind = 'email'",
    );
    const withPhone = await count(
      "select count(distinct person_id) as count from public.contact_points where kind = 'phone'",
    );
    expect(withEmail).not.toBe(withPhone);
    expect(withPhone).toBeGreaterThan(0);
  });

  it("carries contact values the schema deliberately did not clean up", async () => {
    const messy = await count(
      `select count(*) as count from public.contact_points
        where raw_value <> btrim(raw_value)
           or raw_value like '%.example.ac.ox'
           or (kind = 'phone' and raw_value not like '0%' and raw_value not like '+%')`,
    );
    expect(messy).toBeGreaterThanOrEqual(3);
  });

  it("has two incompatible position vocabularies for the same sport", async () => {
    const vocabularies = await count("select count(*) as count from public.position_vocabularies");
    expect(vocabularies).toBe(2);

    // …and each season's assignments draw only from its own version (S3).
    const crossed = await count(
      `select count(*) as count
         from public.position_assignments a
         join public.seasons s on s.id = a.season_id
        where a.position_vocabulary_id <> s.position_vocabulary_id`,
    );
    expect(crossed).toBe(0);
  });

  it("has a four-value column that looks boolean and is not", async () => {
    // The onboarding item states. The club's own sheets record Yes / Yes* / No
    // / Invited / Unsure in what looks like a tickbox column.
    const distinct = await count(
      "select count(distinct status) as count from public.onboarding_items",
    );
    expect(distinct).toBeGreaterThanOrEqual(3);
  });

  it("has per-event schema drift in the extra questions", async () => {
    const distinctPrompts = await count(
      "select count(distinct prompt) as count from public.event_questions",
    );
    const events = await count(
      "select count(distinct event_id) as count from public.event_questions",
    );
    // Named after the destination and different every time.
    expect(distinctPrompts).toBeGreaterThan(events);
  });

  it("has a confirmed date with everything else unknown", async () => {
    const bare = await count(
      `select count(*) as count from public.events
        where status = 'approved' and scheduled_on is not null
          and opponent is null and venue is null and starts_at is null`,
    );
    expect(bare).toBeGreaterThanOrEqual(2);
  });

  it("has events that were proposed and never happened", async () => {
    // `pending_approval` is deliberately absent, on Brian's decision of
    // 13 August 2026. PR #18 removed the Submit step, so the application can no
    // longer put an event into that state, and LAN-77's approval accepts only a
    // draft — a seeded row was therefore an event nobody could act on, which he
    // hit on the real screen and read as polluted test data.
    //
    // The state itself remains in the enum, in the frozen model, and in the
    // historical audit rows the seed still writes with `from_state =
    // 'pending_approval'`. What went is the live row, not the vocabulary.
    for (const status of ["draft", "rejected", "withdrawn", "not_held", "cancelled"]) {
      expect(
        await count("select count(*) as count from public.events where status = $1", [status]),
        `no event in the ${status} state`,
      ).toBeGreaterThan(0);
    }
  });

  it("has two or more events on one day, several times over", async () => {
    const days = await count(
      `select count(*) as count from (
         select scheduled_on from public.events
          where scheduled_on is not null
          group by scheduled_on having count(*) > 1) t`,
    );
    expect(days).toBeGreaterThanOrEqual(4);
  });

  it("has a recurring series whose times drift by a minute per week", async () => {
    const distinctEnds = await count(
      `select count(distinct ends_at) as count from public.events e
         join public.event_series s on s.id = e.series_id
        where s.name = 'Wednesday Practice'`,
    );
    expect(distinctEnds).toBeGreaterThan(1);
  });

  it("has mutually exclusive candidates of which exactly one was approved", async () => {
    const { rows } = await client.query<{ label: string; approved: string; total: string }>(
      `select g.label,
              count(*) filter (where e.approved_at is not null) as approved,
              count(*) as total
         from public.alternative_groups g
         join public.events e on e.alternative_group_id = g.id
        group by g.label`,
    );

    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(Number(row.total), `${row.label} has no alternatives`).toBeGreaterThan(1);
      expect(Number(row.approved), `${row.label} has more than one approval`).toBe(1);
    }
  });

  it("has a fixture that moved after being scheduled", async () => {
    const changes = await count(
      "select count(*) as count from public.schedule_changes where previous_scheduled_on is distinct from new_scheduled_on",
    );
    expect(changes).toBeGreaterThan(0);
  });

  it("has attendance that stops halfway through a term for no recorded reason", async () => {
    // "That is the normal failure mode and the system's main job is preventing
    // it." The lapse has to be in the dataset for the exception views to have
    // anything to find.
    const occurredSessions = await count(
      `select count(*) as count from public.events
        where status = 'occurred' and event_type in ('practice', 'fixture', 'varsity')`,
    );
    const withAttendance = await count(
      "select count(distinct event_id) as count from public.attendance_records",
    );

    expect(withAttendance).toBeGreaterThan(0);
    expect(withAttendance).toBeLessThan(occurredSessions);
  });
});

describe.runIf(seeded)("the scenarios the schema ticket names", () => {
  it("has a confirmed audience for every event that issued invitations", async () => {
    // Correction pass: the audience is now a relation, so the seed has to build
    // one. Every invitation resolves from an audience member of the same event.
    const orphaned = await count(
      `select count(*) as count from public.invitations i
        where not exists (
          select 1 from public.event_audience_members a
           where a.id = i.audience_member_id and a.event_id = i.event_id)`,
    );
    expect(orphaned).toBe(0);

    const audience = await count("select count(*) as count from public.event_audience_members");
    const invitations = await count("select count(*) as count from public.invitations");
    expect(audience).toBeGreaterThan(invitations);
  });

  it("has audience members who were confirmed and never invited", async () => {
    // Invariant P7's `never-invited` state, present in the data rather than
    // only in the view definition.
    const neverInvited = await count(
      "select count(*) as count from public.invitation_response_state where response_state = 'never_invited'",
    );
    expect(neverInvited).toBeGreaterThan(0);

    const flagged = await count("select count(*) as count from public.uninvited_audience_members");
    expect(flagged).toBe(neverInvited);
  });

  it("reports all five P7 states from the seeded season", async () => {
    const { rows } = await client.query<{ response_state: string }>(
      "select distinct response_state from public.invitation_response_state",
    );
    const states = rows.map((r) => r.response_state).sort();

    for (const required of [
      "awaiting_response",
      "expired_without_response",
      "never_invited",
      "responded_no",
      "responded_yes",
    ]) {
      expect(states, `P7 state ${required} is not represented in the seed`).toContain(required);
    }
  });

  it("keeps uninvited audience members out of the nonresponse queue", async () => {
    const leaked = await count(
      `select count(*) as count from public.nonresponse_queue q
        where q.invitation_id is null`,
    );
    expect(leaked).toBe(0);
  });

  it("covers every RSVP outcome, including nonresponse and required decline reasons", async () => {
    expect(
      await count("select count(*) as count from public.rsvp_responses where response = 'yes'"),
    ).toBeGreaterThan(0);
    expect(
      await count("select count(*) as count from public.rsvp_responses where response = 'no'"),
    ).toBeGreaterThan(0);
    expect(
      await count(
        "select count(*) as count from public.rsvp_responses where response = 'no' and reason is null",
      ),
      "a decline was recorded without a reason",
    ).toBe(0);
    expect(
      await count("select count(*) as count from public.invitations where status = 'expired'"),
      "no nonresponse to escalate",
    ).toBeGreaterThan(0);
  });

  it("keeps the historical vocabulary as raw capture and never as a value", async () => {
    const captured = await count(
      "select count(*) as count from public.rsvp_responses where raw_capture is not null",
    );
    expect(captured).toBeGreaterThan(0);

    const distinct = await count(
      "select count(distinct response) as count from public.rsvp_responses",
    );
    expect(distinct).toBeLessThanOrEqual(2);

    // And the legacy staging area holds the three-value vocabulary it came from.
    const legacy = await count(
      "select count(*) as count from staging.legacy_rsvp_rows where raw_response ilike '%unsure%' or raw_response like '%?'",
    );
    expect(legacy).toBeGreaterThan(0);
  });

  it("has a superseded answer with its predecessor intact", async () => {
    const superseded = await count(
      `select count(*) as count from (
         select invitation_id from public.rsvp_responses group by invitation_id having count(*) > 1) t`,
    );
    expect(superseded).toBeGreaterThan(0);
  });

  it("has RSVP-versus-attendance mismatches to surface", async () => {
    expect(
      await count("select count(*) as count from public.rsvp_attendance_mismatches"),
    ).toBeGreaterThan(0);
  });

  it("has availability transitions, and every return to green names its confirmer", async () => {
    expect(
      await count("select count(*) as count from public.availability_statuses where level = 'red'"),
    ).toBeGreaterThan(0);
    expect(
      await count(
        "select count(*) as count from public.availability_statuses where level = 'orange'",
      ),
    ).toBeGreaterThan(0);
    expect(
      await count(
        "select count(*) as count from public.availability_statuses where level = 'green' and confirmed_by_person_id is null",
      ),
    ).toBe(0);
  });

  it("has notification successes, failures with retry history, and a manual recovery", async () => {
    expect(
      await count(
        "select count(*) as count from public.notification_jobs where status = 'completed'",
      ),
    ).toBeGreaterThan(0);
    expect(
      await count("select count(*) as count from public.notification_jobs where status = 'failed'"),
    ).toBeGreaterThan(0);
    expect(
      await count(
        "select count(*) as count from public.notification_jobs where status = 'cancelled'",
      ),
    ).toBeGreaterThan(0);
    expect(
      await count(
        "select count(*) as count from public.delivery_results where attempt_number >= 3",
      ),
      "no retry history",
    ).toBeGreaterThan(0);
    expect(
      await count(
        "select count(*) as count from public.delivery_results where outcome = 'manual' and actor_person_id is not null",
      ),
      "no manual recovery",
    ).toBeGreaterThan(0);
  });

  it("has a historical Monday report snapshot with an unresolved follow-up action", async () => {
    const reports = await count("select count(*) as count from public.weekly_reports");
    expect(reports).toBeGreaterThan(0);

    const open = await count(
      `select count(*) as count from public.follow_up_actions
        where status in ('open', 'in_progress') and weekly_report_id is not null`,
    );
    expect(open).toBeGreaterThan(0);
  });

  it("demonstrates rollover without duplicating a single durable Person", async () => {
    const carried = await count(
      "select count(*) as count from public.season_memberships where carried_forward_from_id is not null",
    );
    expect(carried).toBeGreaterThan(0);

    // The same human, two seasons, one Person row — and never two memberships
    // in one season (invariant I2).
    const duplicated = await count(
      `select count(*) as count from (
         select person_id, season_id from public.season_memberships
          group by person_id, season_id having count(*) > 1) t`,
    );
    expect(duplicated).toBe(0);

    const bothSeasons = await count(
      `select count(*) as count from (
         select person_id from public.season_memberships
          group by person_id having count(distinct season_id) > 1) t`,
    );
    expect(bothSeasons).toBeGreaterThan(20);
  });

  it("has people who left, whose archived season survives them", async () => {
    const past = await count(
      "select count(*) as count from public.person_standing where is_past_member",
    );
    expect(past).toBeGreaterThan(0);
  });

  it("has overlapping role assignments across cycles and seats", async () => {
    const multiSeat = await count(
      `select count(*) as count from (
         select person_id from public.role_assignments
          where effective_to is null group by person_id having count(*) > 1) t`,
    );
    expect(multiSeat).toBeGreaterThan(0);

    const seasonScoped = await count(
      "select count(*) as count from public.role_assignments where season_id is not null",
    );
    expect(seasonScoped).toBeGreaterThan(0);
  });

  it("contains no value that looks like a real contact detail", async () => {
    // The dataset must remain safe to publish. Every email is under the
    // reserved `.example` TLD, and every phone number is in a range reserved
    // for fiction.
    const realistic = await count(
      `select count(*) as count from public.contact_points
        where (kind = 'email' and raw_value not like '%.example%')
           or (kind = 'phone' and raw_value not like '%07700 90%'
               and raw_value not like '%7700900%' and raw_value not like '+1 555 01%')`,
    );
    expect(realistic, "the synthetic dataset contains a plausibly real contact detail").toBe(0);
  });
});
