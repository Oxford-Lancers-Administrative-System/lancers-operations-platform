// @vitest-environment node
/**
 * The publication-safety assertion for the synthetic seed stays in the hot
 * database lane. Messiness/property coverage runs at the gate, but a plausible
 * real contact value must stop every ordinary verification run immediately.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

// `@/lib/services/delivery` imports `"server-only"`, whose real package
// throws unconditionally outside a Next.js server-component bundle — see
// `src/lib/services/delivery.test.ts`'s own identical mock.
vi.mock("server-only", () => ({}));

import { NO_USABLE_EMAIL_REASON } from "@/lib/delivery/email";
import { NO_USABLE_NUMBER_REASON } from "@/lib/delivery/phone";
import {
  DELIVERY_LATEST_RESULT_JOIN,
  DELIVERY_STATE_EXPRESSION,
  EMAIL_FALLBACK_SUFFIX,
  NOTIFICATION_JOB_RECENCY_ORDER,
} from "@/lib/services/delivery";
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

// Correction round 3. The base fixture built a world where every delivery
// ultimately succeeded, so three states W5/W6/W4 exist to show — a held
// reminder that survives a later rung, the two named delivery exceptions, and
// a populated per-attempt diagnostics table — had never once been seeded.
// Each assertion below reads the row the same way the real reader does,
// against `NOTIFICATION_JOB_RECENCY_ORDER`'s own "most recent job" pick where
// that is what an invitee-level surface reads, so a regression here is a
// regression an operator would actually see rather than a fact only true of
// one row in isolation.
describe.runIf(seeded)("correction round 3: the delivery states an operator can now see", () => {
  it("holds a later rung too, so the held state survives NOTIFICATION_JOB_RECENCY_ORDER's pick", async () => {
    const heldInvitations = await client.query<{ invitation_id: string }>(
      `select distinct invitation_id from public.notification_jobs where held_at is not null`,
    );
    expect(heldInvitations.rows.length, "an invitation with a held rung").toBeGreaterThan(0);

    for (const { invitation_id: invitationId } of heldInvitations.rows) {
      const selected = await one<{ state: string }>(
        client,
        `select ${DELIVERY_STATE_EXPRESSION} as state
           from public.notification_jobs j
           ${DELIVERY_LATEST_RESULT_JOIN}
          where j.invitation_id = $1
            and j.idempotency_key not like '%${EMAIL_FALLBACK_SUFFIX}'
          ${NOTIFICATION_JOB_RECENCY_ORDER}
          limit 1`,
        [invitationId],
      );
      expect(selected.state, `the job READERS actually select for ${invitationId}`).toBe("held");
    }
  });

  it("carries at least one invitee whose selected job reads Not dispatched — no channel", async () => {
    // `invitation_id is not null`: `noUsableRoute` is an invitee-level fact.
    // An escalation job carries no `invitation_id` and can independently earn
    // this same failure reason from the real messaging scheduler sweeping a
    // dev server against this dataset — a true fact about a different job,
    // not a state `NOTIFICATION_JOB_RECENCY_ORDER` could ever select for an
    // invitee.
    const candidates = await client.query<{ invitation_id: string }>(
      `select distinct invitation_id
         from public.notification_jobs
        where last_error in ($1, $2) and invitation_id is not null`,
      [NO_USABLE_NUMBER_REASON, NO_USABLE_EMAIL_REASON],
    );
    expect(candidates.rows.length, "an invitation with a no-channel rung").toBeGreaterThan(0);

    let sawException = false;
    for (const { invitation_id: invitationId } of candidates.rows) {
      const selected = await one<{ state: string; last_error: string | null }>(
        client,
        `select ${DELIVERY_STATE_EXPRESSION} as state, j.last_error
           from public.notification_jobs j
           ${DELIVERY_LATEST_RESULT_JOIN}
          where j.invitation_id = $1
            and j.idempotency_key not like '%${EMAIL_FALLBACK_SUFFIX}'
          ${NOTIFICATION_JOB_RECENCY_ORDER}
          limit 1`,
        [invitationId],
      );
      if (
        selected.state === "failed" &&
        (selected.last_error === NO_USABLE_NUMBER_REASON ||
          selected.last_error === NO_USABLE_EMAIL_REASON)
      ) {
        sawException = true;
      }
    }
    expect(sawException, "an invitee whose selected job reads Not dispatched — no channel").toBe(
      true,
    );
  });

  it("carries at least one invitee whose selected job reads WhatsApp unresponsive", async () => {
    const candidates = await client.query<{ invitation_id: string }>(
      `select distinct invitation_id
         from public.notification_jobs
        where idempotency_key like '%${EMAIL_FALLBACK_SUFFIX}'`,
    );
    expect(
      candidates.rows.length,
      "an invitation with an automatic email fallback",
    ).toBeGreaterThan(0);

    let sawException = false;
    for (const { invitation_id: invitationId } of candidates.rows) {
      const selected = await one<{ channel: string | null; state: string }>(
        client,
        `select j.channel::text as channel, ${DELIVERY_STATE_EXPRESSION} as state
           from public.notification_jobs j
           ${DELIVERY_LATEST_RESULT_JOIN}
          where j.invitation_id = $1
            and j.idempotency_key not like '%${EMAIL_FALLBACK_SUFFIX}'
          ${NOTIFICATION_JOB_RECENCY_ORDER}
          limit 1`,
        [invitationId],
      );
      const fallback = await one<{ status: string | null }>(
        client,
        `select status::text as status
           from public.notification_jobs
          where invitation_id = $1 and idempotency_key like '%${EMAIL_FALLBACK_SUFFIX}'
          limit 1`,
        [invitationId],
      );
      if (
        selected.channel === "whatsapp" &&
        selected.state === "failed" &&
        fallback.status === "completed"
      ) {
        sawException = true;
      }
    }
    expect(sawException, "an invitee whose selected job reads WhatsApp unresponsive").toBe(true);
  });

  it("populates delivery_attempts, and never for a job the diagnostics table's own join would drop", async () => {
    const total = await count("select count(*) as count from public.delivery_attempts");
    expect(total, "delivery_attempts rows").toBeGreaterThan(0);

    // `readEventDeliveryDiagnostics` joins to `people` on `notification_jobs.person_id` —
    // an attempt on a job with no person is invisible to that table, not an error.
    const orphaned = await count(
      `select count(*) as count
         from public.delivery_attempts a
         join public.notification_jobs j on j.id = a.notification_job_id
        where j.person_id is null`,
    );
    expect(orphaned, "a delivery_attempts row on a job with no person").toBe(0);
  });

  // LAN-181, F-B2. The assertion above is satisfiable by a single stray row —
  // it was, before this correction: `delivery_results` held 839 rows and
  // `delivery_attempts` held 14, so every seeded event's diagnostics page but
  // one read "Nothing has been attempted for this event yet" while its own
  // Overview showed dozens of Delivered and Failed rows. This is the bound
  // that catches that specific shape of regression: every automated result
  // this fixture repair is responsible for (a manual send has no provider
  // attempt to show, and is excluded on purpose) has to have left at least
  // one matching attempt behind.
  //
  // Scoped to the seed's own two hardcoded provider strings
  // (`whatsapp-business`/`resend`, `scripts/seed-local.mjs`'s own literals) —
  // never to `meta_whatsapp_cloud`, `whatsapp-cloud.ts`'s real constant.
  // Genuinely live-dispatched jobs pass through this same shared local
  // database (`--no-file-parallelism` is not how `npm run test` runs), and an
  // escalation with no usable recipient — F-B1/LAN-180, out of this ticket's
  // scope and file ownership — writes a `delivery_results` row with no
  // matching attempt by the *application's own* design, not the seed's.
  // Narrowing to the seed's provider strings is what keeps this a check on
  // `scripts/seed-local.mjs`, not an accidental, wrongly-scoped assertion
  // about `messaging-scheduler.ts` this ticket does not own.
  it("F-B2: every automated delivery_results row the seed itself wrote has a matching delivery_attempts row", async () => {
    const missing = await count(
      `select count(*) as count
         from public.delivery_results r
        where r.outcome <> 'manual'
          and r.provider in ('whatsapp-business', 'resend')
          and not exists (
            select 1 from public.delivery_attempts a
             where a.notification_job_id = r.notification_job_id
          )`,
    );
    expect(
      missing,
      "an automated delivery_results row written with the seed's own provider string " +
        "(not a manual send, not a live-dispatched job) with no matching delivery_attempts " +
        "row for its job",
    ).toBe(0);
  });

  // LAN-181, F-B2. `notification_jobs.person_id` used to be hardcoded `null`
  // outside the three named exceptions this file already pins — every other
  // job in the bulk historical loop and its ladder, roughly a thousand rows.
  it("F-B2: no notification job carries a null person_id", async () => {
    const withoutPerson = await count(
      "select count(*) as count from public.notification_jobs where person_id is null",
    );
    expect(withoutPerson, "a notification_jobs row with no person_id").toBe(0);
  });

  // Fixture repair, mission M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY. Two
  // named exceptions the assertions above never pinned on their own: a
  // terminally-exhausted retry history (distinct from the no-channel
  // exception, which also fails but never retries) and the one reminder a
  // real answer cancels. Both are seeded on `jobEvents`' `genuine_failure`
  // and `mid_chase` invitees respectively and neither moved when the live
  // ladder below was added.
  it("still carries a genuinely failed job with retry history, distinct from the no-channel exception", async () => {
    // `job_type = 'reminder'` is what keeps this distinct from the two other
    // failure exceptions above: `noUsableRoute` and the WhatsApp-carried-by-
    // email story both rewrite the invitee's *invitation* (rung 0) job, never
    // a reminder rung, so a regression that quietly deleted this exception in
    // favour of one of the other two would still leave this query at zero.
    const retried = await count(
      `select count(*) as count
         from public.notification_jobs
        where job_type = 'reminder'
          and status = 'failed'
          and attempt_count > 1
          and last_error is not null
          and last_error not in ($1, $2)`,
      [NO_USABLE_NUMBER_REASON, NO_USABLE_EMAIL_REASON],
    );
    expect(
      retried,
      "a failed reminder rung with more than one attempt and a reason other than the " +
        "no-channel exceptions",
    ).toBeGreaterThan(0);
  });

  it("still carries a cancelled reminder, called off by an answer that arrived", async () => {
    const cancelled = await count(
      `select count(*) as count
         from public.notification_jobs
        where status = 'cancelled' and cancelled_reason is not null`,
    );
    expect(cancelled, "a cancelled notification job with its reason recorded").toBeGreaterThan(0);
  });

  it("still carries an event past its escalation threshold, with a flag raised", async () => {
    const escalations = await count(
      `select count(*) as count from public.notification_jobs where job_type = 'escalation'`,
    );
    expect(escalations, "an escalation job").toBeGreaterThan(0);

    const flags = await count("select count(*) as count from public.nonresponse_flags");
    expect(flags, "a nonresponse flag raised against the escalation threshold").toBeGreaterThan(0);
  });
});

// Fixture repair, mission M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY.
// `scripts/seed-local.mjs` used to give a real ladder to exactly six
// historical events (`jobEvents`), all of them already started — and
// `readDueJobs` deliberately excludes a job whose event has already started,
// so every one of those jobs was permanently undispatchable. A freshly
// seeded database therefore never created `.lancers-runtime/delivery-sink/`
// and carried no genuine answer link at all: W2 was unwalkable from a fresh
// seed. This reads the seed's notification_jobs the same way
// `messaging-scheduler.ts`'s own `readDueJobs` does — held_at is null, an
// invitation or reminder rung, due now, on an event that is still approved
// and still ahead — so a regression here is the exact fact the ticker would
// discover on its first tick, not a fact only true of the fixture in
// isolation.
describe.runIf(seeded)("fixture repair: a live ladder exists to dispatch", () => {
  it("carries at least one invitation or reminder job genuinely due right now", async () => {
    // LAN-181, F-W1/F-A1: not scoped to `status in ('pending', 'ready')` —
    // `npm run test` runs the `database` project with file parallelism, and
    // `messaging-scheduler.test.ts`'s own tests genuinely dispatch (or
    // refuse) real ambient due jobs from this same live ladder as a
    // consequence of proving their own fixtures get claimed. A job this
    // seed scheduled due and a concurrent test has since claimed for real is
    // *stronger* evidence the seed produced a genuinely dispatchable job than
    // one still sitting untouched — the claim itself is the proof — so the
    // status is deliberately not part of what this asserts. `cancelled` is
    // the one status excluded: an answer arriving is a legitimate reason
    // nothing remains to dispatch, not evidence the seed failed to schedule
    // anything.
    const due = await count(
      `select count(*) as count
         from public.notification_jobs j
         join public.events e on e.id = j.event_id
        where j.held_at is null
          and j.job_type in ('invitation', 'reminder')
          and j.status <> 'cancelled'
          and coalesce(j.scheduled_for, j.created_at) <= now()
          and e.status = 'approved'
          and (e.scheduled_on + coalesce(e.starts_at, '00:00'::time))
                at time zone 'Europe/London' > now()`,
    );
    expect(
      due,
      "a notification job this seed scheduled due on a future approved event — without one, " +
        "the messaging ticker's very next tick has nothing to send and the delivery sink is " +
        "never created",
    ).toBeGreaterThan(0);
  });

  // LAN-181, F-B2. Walk B found no invitee anywhere in the seed who was
  // mid-ladder, unanswered and not yet past the escalation threshold — every
  // candidate had either finished its ladder (the six historical stories, all
  // on already-started events whose response deadline has therefore also
  // passed) or already crossed the threshold. `chasePositionLabel` needs
  // exactly this state to render a numbered chase position, and nobody had
  // watched one render on screen.
  it("carries an unanswered, mid-ladder invitee whose escalation threshold has not passed", async () => {
    const midChase = await count(
      `select count(*) as count from (
         select i.id
           from public.invitations i
           join public.notification_jobs j on j.invitation_id = i.id
           join public.events e on e.id = i.event_id
          where e.status = 'approved'
            and (e.scheduled_on + coalesce(e.starts_at, '00:00'::time))
                  at time zone 'Europe/London' > now()
            and not exists (
              select 1 from public.rsvp_responses r where r.invitation_id = i.id
            )
            and not exists (
              select 1 from public.nonresponse_flags f
               where f.invitation_id = i.id and f.resolved_at is null
            )
          group by i.id
         having count(*) filter (
                  where j.job_type in ('invitation', 'reminder') and j.status = 'completed'
                ) > 0
            and count(*) filter (
                  where j.job_type in ('invitation', 'reminder')
                    and j.status in ('pending', 'ready')
                ) > 0
       ) candidates`,
    );
    expect(
      midChase,
      "an unanswered invitee with at least one completed rung and at least one still-pending " +
        "rung, on a future approved event with no open escalation flag",
    ).toBeGreaterThan(0);
  });
});
