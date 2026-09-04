#!/usr/bin/env node
/**
 * LAN-218 — the onboarding chase's own review states, on the local stack only.
 *
 *   npm run db:seed              # synthetic people, committees and role assignments
 *   npm run db:seed-onboarding-chase   # <- this
 *
 * `scripts/seed-local.mjs` already seeds several `onboarding`-status
 * memberships (Jorvik Kirkbride, Kenelm Netherby, Lucian, Lysander Croft,
 * Merrick Thornbury, Odile Marchmont) with no messaging consent recorded for
 * anyone at all — a true, unremarkable state for a mission this package's
 * predecessors never needed consent to exist. This script grants consent for
 * four of them and gives each a chase history, so the missing-data queue's
 * three new columns have something real to show without inventing new
 * people: `seed-local.mjs`'s own deterministic dataset stays exactly as
 * every other suite already depends on it.
 *
 * Five states, on five people already in the fixture:
 *
 *   - **Jorvik Kirkbride** — mid-chase. Welcome, one delivered follow-up, the
 *     next due on the configured interval. Correction round 2, F-2: this
 *     state renders only with a reachable number — `seed-local.mjs`'s own
 *     recruit-sourced arrivals carry no contact points at all until one is
 *     added, so this script now gives him one (`grantPhone` below), the same
 *     way it already gives Odile a personal email for her own state.
 *   - **Kenelm Netherby** — exhausted *and* unreachable, deliberately, on
 *     both counts. `chase_count` (4) delivered follow-ups; `W9`'s escalation
 *     is derived, not stored, and shows on this membership's own activity
 *     log as the record of what was escalated. This is the exact live shape
 *     Brian's 2026-09-03 walkthrough named ("an email and no phone… his
 *     nudge reported failed") and correction round 2's F-1 fixed: the row
 *     now refuses the nudge and says "No phone number on file", never
 *     "Chase exhausted" — see `chase-presentation.ts`'s own comment on why.
 *     Giving him a number here would erase the one state this whole
 *     correction exists to prove is fixed.
 *   - **Lucian** — terminal delivery failure. One chase attempt that
 *     exhausted its own retry ceiling without ever delivering; the count is
 *     unspent (`REQ-cap-delivered`) and the person is listed for a human.
 *   - **Merrick Thornbury** — left mid-onboarding after one delivered
 *     follow-up. `OD7-depart-stops`: the membership moves to `departed`, the
 *     prior chase history is left exactly as it was, and nothing further is
 *     ever declared for it.
 *   - **Odile Marchmont** — correction round 1, `C-1` (Brian, 2026-09-03
 *     walkthrough): consent granted and a personal email on file, but no
 *     phone contact at all — `seed-local.mjs`'s own recruit-sourced arrivals
 *     carry no contact points until the club adds one, which is exactly
 *     Jorvik and Kenelm's own real shape the day Brian hit this ("an email
 *     and no phone"). Nothing is declared or attempted for her; the row's
 *     whole point is what the queue says about a person nobody has ever
 *     tried to message yet, not a chase history.
 *
 * **Lysander Croft is deliberately left untouched** — no consent, no contact
 * point of any kind — the "genuinely never asked, and also unreachable"
 * case, on the same footing as before this correction: this queue reports
 * the unreachable number ahead of the consent state (see
 * `onboarding-chase.ts`'s own comment on the two states' priority), so his
 * row reads identically to Odile's despite reaching that state by a
 * different route.
 *
 * A sixth state — `chase_count = 0`, "no automated chase at all" — is
 * deliberately **not** written here: `onboarding_chase_settings` is one row
 * shared by the whole club, and setting it to zero live would silence the
 * automated chase for the people above, erasing every other state this
 * script exists to show. It is proved instead by the Onboarding section's
 * own form on `/operate/admin/messaging`, which accepts and saves zero
 * (`onboarding-chase-validation.test.ts`, `onboarding-chase.test.ts`) — an
 * owner reviewing the queue can try it there directly.
 *
 * Idempotent: every row this script writes carries a `LAN218` idempotency
 * key or is guarded by an existence check, so a second run changes nothing.
 * Synthetic only, on the same seeded people every other suite already reads;
 * no real member data, no real send — every delivery outcome here is written
 * directly to `delivery_results`, never sent to a provider, and the one email
 * address added below is the same `@mail.example` synthetic shape
 * `seed-local.mjs` already uses throughout.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { connectLocal, resolveLocalDatabaseUrl } from "./lib/local-db.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local"), quiet: true });

function fail(message) {
  console.error(message);
  process.exit(1);
}

let databaseUrl;
try {
  databaseUrl = resolveLocalDatabaseUrl();
} catch (error) {
  fail(error.message);
}

const client = await connectLocal(databaseUrl);

/**
 * One WhatsApp send, recorded as already concluded — never offered to a
 * provider. `detail` is the provider-neutral reason a real failed attempt
 * would carry (`delivery_results.detail`, `C-5`'s own read) — `null` for a
 * delivered attempt, which has none.
 */
async function recordAttempt(client, jobId, attemptNumber, outcome, occurredAt, detail) {
  const attempt = await client.query(
    `insert into public.delivery_attempts
       (notification_job_id, attempt_number, channel, provider, requested_at, accepted_at,
        concluded_at, provider_message_id, failure_reason)
     values ($1, $2, 'whatsapp', 'meta_whatsapp_cloud', $3::timestamptz, $3::timestamptz,
             $3::timestamptz, $4, $5)
     on conflict (notification_job_id, attempt_number) do nothing
     returning id`,
    [jobId, attemptNumber, occurredAt, `LAN218-seed-${jobId}-${attemptNumber}`, detail],
  );
  await client.query(
    `insert into public.delivery_results
       (notification_job_id, attempt_number, outcome, channel, provider, detail, occurred_at)
     values ($1, $2, $3::public.delivery_outcome, 'whatsapp', 'meta_whatsapp_cloud', $4, $5::timestamptz)
     on conflict (notification_job_id, attempt_number) do nothing`,
    [jobId, attemptNumber, outcome, detail, occurredAt],
  );
  if (detail !== null) {
    await client.query(`update public.notification_jobs set last_error = $2 where id = $1`, [
      jobId,
      detail,
    ]);
  }
  return attempt.rows[0]?.id ?? null;
}

/** One chase (or welcome) job, its one recorded attempt, and its activity-log entry. */
async function seedChase(
  client,
  {
    membershipId,
    personId,
    seasonId,
    key,
    section,
    channel,
    actorLabel,
    occurredAt,
    outcome,
    attemptCount,
    failureDetail = null,
  },
) {
  const job = await client.query(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, person_id, channel, scheduled_for, attempt_count,
        template_variables, created_at, updated_at)
     values ($1, 'other', $2::public.notification_job_status, $3::uuid, 'whatsapp', $4::timestamptz,
             $5, '{}'::jsonb, $4::timestamptz, $4::timestamptz)
     on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
     returning id`,
    [key, outcome === "delivered" ? "completed" : "failed", personId, occurredAt, attemptCount],
  );
  const jobId = job.rows[0].id;
  await recordAttempt(client, jobId, attemptCount, outcome, occurredAt, failureDetail);

  await client.query(
    `insert into public.onboarding_activity_log
       (season_membership_id, season_id, section, kind, channel, actor_label, occurred_at)
     select $1::uuid, $2::uuid, $3, 'ask', $4, $5, $6::timestamptz
      where not exists (
        select 1 from public.onboarding_activity_log
         where season_membership_id = $1::uuid and section = $3 and channel = $4
           and occurred_at = $6::timestamptz
      )`,
    [membershipId, seasonId, section, channel, actorLabel, occurredAt],
  );
  return jobId;
}

async function personByGivenName(client, givenName) {
  const result = await client.query(
    `select m.id as membership_id, m.person_id, m.season_id, m.status::text as status
       from public.season_memberships m
       join public.people p on p.id = m.person_id
      where p.given_name = $1 and m.status <> 'archived'
      order by m.created_at desc
      limit 1`,
    [givenName],
  );
  if (!result.rows[0])
    fail(`Expected seed-local.mjs to have created ${givenName}, but found nobody.`);
  return result.rows[0];
}

async function grantConsent(client, personId, seasonId) {
  await client.query(
    `insert into public.season_messaging_consents (person_id, season_id, state, source, changed_at)
     values ($1::uuid, $2::uuid, 'granted', 'operator_recorded', now())
     on conflict (person_id, season_id) do update set state = 'granted'`,
    [personId, seasonId],
  );
}

try {
  await client.query("begin");

  // --- Jorvik Kirkbride: mid-chase -----------------------------------------
  const jorvik = await personByGivenName(client, "Jorvik");
  await grantConsent(client, jorvik.person_id, jorvik.season_id);
  // Correction round 2, F-2: a reachable number, or this state renders
  // `no_channel` like every other unreachable row and the "scheduled" demo
  // state has nothing on screen — see the module note above. A reserved-block
  // test number, the same shape `seed-local.mjs` already uses throughout.
  await client.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred, scope)
     select $1::uuid, 'phone', $2, true, null
      where not exists (
        select 1 from public.contact_points where person_id = $1::uuid and kind = 'phone'
      )`,
    [jorvik.person_id, "07700 900224"],
  );
  await seedChase(client, {
    membershipId: jorvik.membership_id,
    personId: jorvik.person_id,
    seasonId: jorvik.season_id,
    key: `onboarding-welcome:${jorvik.membership_id}`,
    section: "welcome",
    channel: "whatsapp",
    actorLabel: "the club",
    occurredAt: "2026-08-12T09:00:00Z",
    outcome: "delivered",
    attemptCount: 1,
  });
  await seedChase(client, {
    membershipId: jorvik.membership_id,
    personId: jorvik.person_id,
    seasonId: jorvik.season_id,
    key: `onboarding-chase:${jorvik.membership_id}:1`,
    section: "chase",
    channel: "whatsapp",
    actorLabel: "the club",
    occurredAt: "2026-09-01T09:00:00Z",
    outcome: "delivered",
    attemptCount: 1,
  });

  // --- Kenelm Netherby: exhausted -------------------------------------------
  const kenelm = await personByGivenName(client, "Kenelm");
  await grantConsent(client, kenelm.person_id, kenelm.season_id);
  await seedChase(client, {
    membershipId: kenelm.membership_id,
    personId: kenelm.person_id,
    seasonId: kenelm.season_id,
    key: `onboarding-welcome:${kenelm.membership_id}`,
    section: "welcome",
    channel: "whatsapp",
    actorLabel: "the club",
    occurredAt: "2026-08-12T09:00:00Z",
    outcome: "delivered",
    attemptCount: 1,
  });
  const kenelmChaseDates = [
    "2026-08-19T09:00:00Z",
    "2026-08-22T09:00:00Z",
    "2026-08-26T09:00:00Z",
    "2026-08-30T09:00:00Z",
  ];
  for (const [index, occurredAt] of kenelmChaseDates.entries()) {
    await seedChase(client, {
      membershipId: kenelm.membership_id,
      personId: kenelm.person_id,
      seasonId: kenelm.season_id,
      key: `onboarding-chase:${kenelm.membership_id}:${index + 1}`,
      section: "chase",
      channel: "whatsapp",
      actorLabel: "the club",
      occurredAt,
      outcome: "delivered",
      attemptCount: 1,
    });
  }
  // W9's own record: the chase stopping itself and escalating, on this
  // membership's own log — the escalation message itself has no screen, but
  // what happened is still worth a line on the person who triggered it.
  await client.query(
    `insert into public.onboarding_activity_log
       (season_membership_id, season_id, section, kind, channel, actor_label, occurred_at)
     select $1::uuid, $2::uuid, 'chase', 'ask', 'system', 'Exhausted — stopped, and escalated',
            '2026-08-30T09:05:00Z'::timestamptz
      where not exists (
        select 1 from public.onboarding_activity_log
         where season_membership_id = $1::uuid and channel = 'system'
      )`,
    [kenelm.membership_id, kenelm.season_id],
  );
  // The exhaustion marker itself — `onboardingChaseExhaustedMarkerKey`'s own
  // shape (`onboarding-chase.ts`). Written here so this membership reads as
  // *already* escalated, once, in the past — not as a pending exhaustion the
  // next real sweep tick would discover and escalate again for the first
  // time, which would also fold in whatever else the live stack has since
  // exhausted into the same batch.
  await client.query(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, person_id, template_variables, created_at, updated_at)
     values ($1, 'other', 'completed', $2::uuid, '{}'::jsonb, $3::timestamptz, $3::timestamptz)
     on conflict (idempotency_key) do nothing`,
    [
      `onboarding-chase-exhausted:${kenelm.membership_id}`,
      kenelm.person_id,
      "2026-08-30T09:05:00Z",
    ],
  );

  // --- Lucian: terminal delivery failure ------------------------------------
  const lucian = await personByGivenName(client, "Lucian");
  await grantConsent(client, lucian.person_id, lucian.season_id);
  await seedChase(client, {
    membershipId: lucian.membership_id,
    personId: lucian.person_id,
    seasonId: lucian.season_id,
    key: `onboarding-welcome:${lucian.membership_id}`,
    section: "welcome",
    channel: "whatsapp",
    actorLabel: "the club",
    occurredAt: "2026-08-12T09:00:00Z",
    outcome: "delivered",
    attemptCount: 1,
  });
  // MAX_ATTEMPTS (delivery.ts) is 5 — attempt_count reaching it with no
  // delivered outcome is what `currentAttemptTerminallyFailed` reads.
  //
  // `failureDetail` is correction round 1, C-5 — the exact sentence
  // `whatsapp-cloud.ts`'s own `PROVIDER_REASONS[131026]` would have stored,
  // so the queue's "Delivery failed · …" row shows real, plain-worded text
  // rather than the defensive "reason was not recorded" fallback.
  await seedChase(client, {
    membershipId: lucian.membership_id,
    personId: lucian.person_id,
    seasonId: lucian.season_id,
    key: `onboarding-chase:${lucian.membership_id}:1`,
    section: "chase",
    channel: "whatsapp",
    actorLabel: "the club",
    occurredAt: "2026-08-19T09:00:00Z",
    outcome: "rejected",
    attemptCount: 5,
    failureDetail: "WhatsApp could not deliver to this number — it may not be a WhatsApp account.",
  });

  // --- Merrick Thornbury: left mid-onboarding -------------------------------
  const merrick = await personByGivenName(client, "Merrick");
  await grantConsent(client, merrick.person_id, merrick.season_id);
  await seedChase(client, {
    membershipId: merrick.membership_id,
    personId: merrick.person_id,
    seasonId: merrick.season_id,
    key: `onboarding-welcome:${merrick.membership_id}`,
    section: "welcome",
    channel: "whatsapp",
    actorLabel: "the club",
    occurredAt: "2026-08-12T09:00:00Z",
    outcome: "delivered",
    attemptCount: 1,
  });
  await seedChase(client, {
    membershipId: merrick.membership_id,
    personId: merrick.person_id,
    seasonId: merrick.season_id,
    key: `onboarding-chase:${merrick.membership_id}:1`,
    section: "chase",
    channel: "whatsapp",
    actorLabel: "the club",
    occurredAt: "2026-08-19T09:00:00Z",
    outcome: "delivered",
    attemptCount: 1,
  });
  if (merrick.status === "onboarding") {
    await client.query(
      `update public.season_memberships
          set status = 'departed', departed_on = '2026-08-25'
        where id = $1::uuid`,
      [merrick.membership_id],
    );
    await client.query(
      `insert into public.season_membership_status_events
         (season_membership_id, from_status, to_status, occurred_at, actor_label, reason)
       select $1::uuid, 'onboarding'::public.membership_status, 'departed'::public.membership_status,
              '2026-08-25T12:00:00Z'::timestamptz, 'LAN-218 seed', 'Left mid-onboarding.'
        where not exists (
          select 1 from public.season_membership_status_events
           where season_membership_id = $1::uuid and to_status = 'departed'
        )`,
      [merrick.membership_id],
    );
  }

  // --- Odile Marchmont: consent granted, no reachable number (C-1) ---------
  // Correction round 1, C-1 (Brian, 2026-09-03 walkthrough): Jorvik Kirkbride
  // and Kenelm Netherby, "an email and no phone". A chase history alone never
  // required a phone number — every delivered attempt above is written
  // directly to `delivery_results`, never sent to a provider — so both of
  // them started out unreachable in this fixture too, which is exactly what
  // correction round 2's F-2 found: it left the "scheduled" demo state with
  // zero rows, since Jorvik rendered `no_channel` like everyone else. Odile
  // arrived through `seed-local.mjs`'s recruit path with no contact point at
  // all; granting consent and adding only a personal email reproduces the
  // exact "no reachable number" shape without touching anyone else's
  // history — Kenelm's own reachability is untouched for the same reason
  // (see his own comment above); only Jorvik is given a number below, so his
  // own claimed state is no longer empty.
  const odile = await personByGivenName(client, "Odile");
  await grantConsent(client, odile.person_id, odile.season_id);
  await client.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred, scope)
     select $1::uuid, 'email', $2, true, 'personal'
      where not exists (
        select 1 from public.contact_points
         where person_id = $1::uuid and kind = 'email' and scope = 'personal'
      )`,
    [odile.person_id, "odile.marchmont@mail.example"],
  );

  await client.query("commit");

  console.log("Seeded the onboarding chase's five review states:");
  console.log("  Jorvik Kirkbride   — mid-chase, reachable, next due on schedule");
  console.log("  Kenelm Netherby    — exhausted and unreachable (F-1's own case)");
  console.log("  Lucian             — terminal delivery failure");
  console.log("  Merrick Thornbury  — left mid-onboarding");
  console.log("  Odile Marchmont    — consent granted, no reachable number (C-1)");
  console.log(
    "A chase_count of zero is provable on the Onboarding form itself; see the module note.",
  );
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
