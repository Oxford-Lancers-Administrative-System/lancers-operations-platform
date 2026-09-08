#!/usr/bin/env node
/**
 * LAN-229 — a live onboarding link and an exhausted, reachable chase, on the
 * local stack only.
 *
 *   npm run db:reset
 *   npm run db:seed   # -> scripts/local-supabase-command.mjs "seed", which
 *                          runs seed-local.mjs, then seed-onboarding-chase.mjs,
 *                          then this script
 *
 * ## Why this exists
 *
 * `person_access_tokens.token_hash` is minted only at successful message
 * dispatch (`issuePersonTokenIn`, `src/lib/services/player-answer-tokens.ts`).
 * A local environment has no delivery settings, so dispatch always refuses —
 * `person_access_tokens` is empty database-wide on a plain `db:seed`, and
 * `/me/<token>/details` is unreachable by any route a local operator can
 * click through. The same gap means an onboarding chase can never reach
 * `chaseCount` *delivered* attempts locally (`onboarding-chase.ts`'s own
 * `deliveredCount`), so the "exhausted — human follow-up" state W9 describes
 * has nowhere to be seen either.
 *
 * This script does not enable, configure or send anything. It writes the two
 * end states directly, the identical way `scripts/seed-onboarding-chase.mjs`
 * already writes Kenelm Netherby's exhausted-and-unreachable state: straight
 * into `person_access_tokens` / `notification_jobs` / `delivery_results`,
 * never through a provider.
 *
 * ## The two fixtures
 *
 *   1. **A live onboarding link for Lysander Croft.** `seed-local.mjs`
 *      already gives him a season membership at `onboarding` with almost
 *      nothing on file (no college, no contact point of any kind — see that
 *      script's own recruit block, and `tests/seed-onboarding-chase.test.ts`'s
 *      own proof that this stays true) — so his compiled ask is never empty
 *      and `/me/<token>/details` always lands on the form, not the
 *      already-complete page. Reissuing his durable credential here (the
 *      same revoke-then-insert `issuePersonTokenIn` performs) is exactly the
 *      operation this table exists for, not a shortcut around it. Minting a
 *      token adds no contact point and grants no consent, so his own
 *      "genuinely never asked, and also unreachable" state
 *      (`seed-onboarding-chase.mjs`'s own comment) is untouched.
 *
 *   2. **An exhausted, reachable chase for Isolde Thistlewood.** A new
 *      onboarding arrival `seed-local.mjs` creates for this purpose alone
 *      (see that script's own LAN-229 section) — every one of the six
 *      already-onboarding people that script and `seed-onboarding-chase.mjs`
 *      already carry is claimed by an existing, asserted-on review state
 *      (Jorvik: mid-chase; Kenelm: exhausted *and* unreachable; Lucian:
 *      terminal failure; Merrick: departed mid-onboarding; Lysander: no
 *      consent, no contact point at all; Odile: consent but no reachable
 *      number), and none of them can also stand in for "exhausted, and a
 *      human can still act on it" — `chase-presentation.ts`'s own F-1 rule
 *      shows "No phone number on file" instead of "Chase exhausted" the
 *      moment a person is unreachable, and a nudge is refused for the same
 *      reason (`isNudgeable`). Isolde is given a phone number and four
 *      delivered `onboarding-chase:` attempts — `onboarding_chase_settings`'s
 *      seeded `chase_count` (4) — so her queue row reads "Chase exhausted"
 *      verbatim and keeps an active Nudge button, the state W9's escalation
 *      and W8's own nudge-restart both need to be walkable against.
 *
 * ## What is written where
 *
 * The plaintext token is printed to this script's own stdout and to a JSON
 * file beside the rest of this holder's local runtime state
 * (`$SUPABASE_WORKDIR`, the same directory `db:start`/`db:seed` already
 * render this slot's `supabase/config.toml` into) — never into the
 * repository, a commit, or CI. `SUPABASE_WORKDIR` is set by
 * `scripts/local-supabase-command.mjs` for every guarded database command;
 * run any other way, this script still mints the fixtures and still prints
 * the plaintext, it just has nowhere safe to file a copy.
 *
 * Idempotent: re-running (`npm run db:seed` again, with no `db:reset`
 * between) reissues Lysander's durable credential — the identical operation
 * a real reissue performs, which is why the old plaintext this script printed
 * last time stops working, exactly as the domain intends — and re-declares
 * Isolde's chase history under the same idempotency keys and existence
 * checks `seed-onboarding-chase.mjs` already uses, so a second run changes
 * nothing about her state.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { connectLocal, resolveLocalDatabaseUrl } from "./lib/local-db.mjs";

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

/** 32 bytes, base64url — the same shape `mintToken()` in rsvp-tokens.ts produces. */
function mintToken() {
  return crypto.randomBytes(32).toString("base64url");
}

/** sha256 hex — must match `hashToken()` in rsvp-tokens.ts exactly. */
function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

async function membershipFor(client, givenName, familyName) {
  const result = await client.query(
    `select m.id as membership_id, m.person_id, m.season_id, m.status::text as status
       from public.season_memberships m
       join public.people p on p.id = m.person_id
      where p.given_name = $1 and p.family_name = $2 and m.status <> 'archived'
      order by m.created_at desc
      limit 1`,
    [givenName, familyName],
  );
  if (!result.rows[0]) {
    fail(
      `Expected scripts/seed-local.mjs to have created ${givenName} ${familyName}, but found nobody. ` +
        "Run npm run db:reset && npm run db:seed first.",
    );
  }
  return result.rows[0];
}

/** One chase (or welcome) attempt, recorded as already delivered — never offered to a provider. */
async function seedDeliveredAsk(
  client,
  { membershipId, personId, seasonId, key, section, occurredAt },
) {
  const job = await client.query(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, person_id, channel, scheduled_for, attempt_count,
        template_variables, created_at, updated_at)
     values ($1, 'other', 'completed', $2::uuid, 'whatsapp', $3::timestamptz, 1,
             '{}'::jsonb, $3::timestamptz, $3::timestamptz)
     on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
     returning id`,
    [key, personId, occurredAt],
  );
  const jobId = job.rows[0].id;

  await client.query(
    `insert into public.delivery_attempts
       (notification_job_id, attempt_number, channel, provider, requested_at, accepted_at,
        concluded_at, provider_message_id, failure_reason)
     values ($1, 1, 'whatsapp', 'meta_whatsapp_cloud', $2::timestamptz, $2::timestamptz,
             $2::timestamptz, $3, null)
     on conflict (notification_job_id, attempt_number) do nothing`,
    [jobId, occurredAt, `LAN229-seed-${jobId}`],
  );
  await client.query(
    `insert into public.delivery_results
       (notification_job_id, attempt_number, outcome, channel, provider, detail, occurred_at)
     values ($1, 1, 'delivered'::public.delivery_outcome, 'whatsapp', 'meta_whatsapp_cloud', null,
             $2::timestamptz)
     on conflict (notification_job_id, attempt_number) do nothing`,
    [jobId, occurredAt],
  );

  await client.query(
    `insert into public.onboarding_activity_log
       (season_membership_id, season_id, section, kind, channel, actor_label, occurred_at)
     select $1::uuid, $2::uuid, $3, 'ask', 'whatsapp', 'the club', $4::timestamptz
      where not exists (
        select 1 from public.onboarding_activity_log
         where season_membership_id = $1::uuid and section = $3 and channel = 'whatsapp'
           and occurred_at = $4::timestamptz
      )`,
    [membershipId, seasonId, section, occurredAt],
  );
  return jobId;
}

try {
  await client.query("begin");

  // --- 1. A live onboarding link, for Lysander Croft -----------------------
  const lysander = await membershipFor(client, "Lysander", "Croft");
  if (lysander.status !== "onboarding") {
    fail(
      `Lysander Croft's membership is '${lysander.status}', not 'onboarding' — ` +
        "has scripts/seed-local.mjs changed what it seeds for him?",
    );
  }

  // The reissue idiom `issuePersonTokenIn` itself performs: supersede
  // whatever durable credential is live, then mint a fresh one — never a
  // second live row, and never a recovered plaintext (LAN-169's own rule;
  // rsvp-tokens.ts's module note explains why in full).
  await client.query(
    `update public.person_access_tokens
        set revoked_at = now(),
            revoked_reason = 'Reseeded by scripts/seed-player-facing-scenarios.mjs (LAN-229).'
      where person_id = $1 and season_id = $2 and not single_use and revoked_at is null`,
    [lysander.person_id, lysander.season_id],
  );
  const plaintext = mintToken();
  await client.query(
    `insert into public.person_access_tokens (person_id, season_id, token_hash, single_use)
     values ($1, $2, $3, false)`,
    [lysander.person_id, lysander.season_id, hashToken(plaintext)],
  );

  // --- 2. An exhausted, reachable chase, for Isolde Thistlewood ------------
  const isolde = await membershipFor(client, "Isolde", "Thistlewood");
  if (isolde.status !== "onboarding") {
    fail(
      `Isolde Thistlewood's membership is '${isolde.status}', not 'onboarding' — ` +
        "has scripts/seed-local.mjs changed what it seeds for her?",
    );
  }

  await client.query(
    `insert into public.season_messaging_consents (person_id, season_id, state, source, changed_at)
     values ($1::uuid, $2::uuid, 'granted', 'operator_recorded', now())
     on conflict (person_id, season_id) do update set state = 'granted'`,
    [isolde.person_id, isolde.season_id],
  );
  // A reserved test-range number (Ofcom's 07700 900xxx drama range), the same
  // shape scripts/seed-local.mjs and scripts/seed-onboarding-chase.mjs both
  // use throughout.
  await client.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred, scope)
     select $1::uuid, 'phone', $2, true, null
      where not exists (
        select 1 from public.contact_points where person_id = $1::uuid and kind = 'phone'
      )`,
    [isolde.person_id, "07700 900488"],
  );

  await seedDeliveredAsk(client, {
    membershipId: isolde.membership_id,
    personId: isolde.person_id,
    seasonId: isolde.season_id,
    key: `onboarding-welcome:${isolde.membership_id}`,
    section: "welcome",
    occurredAt: "2026-08-12T09:00:00Z",
  });
  const chaseDates = [
    "2026-08-19T09:00:00Z",
    "2026-08-22T09:00:00Z",
    "2026-08-26T09:00:00Z",
    "2026-08-30T09:00:00Z",
  ];
  for (const [index, occurredAt] of chaseDates.entries()) {
    await seedDeliveredAsk(client, {
      membershipId: isolde.membership_id,
      personId: isolde.person_id,
      seasonId: isolde.season_id,
      key: `onboarding-chase:${isolde.membership_id}:${index + 1}`,
      section: "chase",
      occurredAt,
    });
  }

  // The exhaustion marker — `onboardingChaseExhaustedMarkerKey`'s own shape
  // (`src/lib/services/onboarding-chase.ts`). Written here so this membership
  // reads as already escalated, once, in the past, matching
  // `raiseDueOnboardingChaseEscalations`'s own idempotency-key prefix — not
  // as a pending exhaustion the next real sweep tick would discover for the
  // first time.
  await client.query(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, person_id, template_variables, created_at, updated_at)
     values ($1, 'other', 'completed', $2::uuid, '{}'::jsonb, $3::timestamptz, $3::timestamptz)
     on conflict (idempotency_key) do nothing`,
    [
      `onboarding-chase-exhausted:${isolde.membership_id}`,
      isolde.person_id,
      "2026-08-30T09:05:00Z",
    ],
  );
  await client.query(
    `insert into public.onboarding_activity_log
       (season_membership_id, season_id, section, kind, channel, actor_label, occurred_at)
     select $1::uuid, $2::uuid, 'chase', 'ask', 'system', 'Exhausted — stopped, and escalated',
            '2026-08-30T09:05:00Z'::timestamptz
      where not exists (
        select 1 from public.onboarding_activity_log
         where season_membership_id = $1::uuid and channel = 'system'
      )`,
    [isolde.membership_id, isolde.season_id],
  );

  await client.query("commit");

  const workdir = process.env.SUPABASE_WORKDIR;
  const port = process.env.PORT;
  const relativePath = `/me/${plaintext}/details`;
  let writtenTo = null;
  if (workdir) {
    fs.mkdirSync(workdir, { recursive: true, mode: 0o700 });
    const outputPath = path.join(workdir, "seed-player-facing-scenarios.json");
    fs.writeFileSync(
      outputPath,
      `${JSON.stringify(
        {
          onboardingLink: {
            person: "Lysander Croft",
            path: relativePath,
            url: port ? `http://127.0.0.1:${port}${relativePath}` : null,
            token: plaintext,
            mintedAt: new Date().toISOString(),
          },
          exhaustedChase: {
            person: "Isolde Thistlewood",
            membershipId: isolde.membership_id,
          },
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
    fs.chmodSync(outputPath, 0o600);
    writtenTo = outputPath;
  }

  console.log("Seeded LAN-229's two player-facing scenarios:");
  console.log(`  Lysander Croft     — live onboarding link: ${relativePath}`);
  if (port)
    console.log(`                       full URL:   http://127.0.0.1:${port}${relativePath}`);
  console.log(`                       plaintext:  ${plaintext}`);
  console.log("                       (the only place this plaintext is ever shown — it is");
  console.log("                        stored only as a digest and cannot be recovered later.)");
  console.log("  Isolde Thistlewood — exhausted chase, reachable (4/4 delivered, Nudge available)");
  if (writtenTo) console.log(`Also written to ${writtenTo} (mode 0600, gitignored).`);
  else
    console.log(
      "SUPABASE_WORKDIR was not set, so no copy was written to this slot's runtime state — " +
        "run this through npm run db:seed to get one.",
    );
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
