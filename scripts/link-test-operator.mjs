#!/usr/bin/env node
/**
 * Links the single pre-provisioned local test user to a seeded Person, so the
 * local stack has a working operator in one command.
 *
 *   npm run db:seed          # synthetic people, committees and role assignments
 *   npm run db:seed-user     # the one local auth user
 *   npm run db:link-operator # <- this: joins the two
 *
 * LAN-71. Without this there is no `operator_accounts` row anywhere on a fresh
 * machine, so `/dashboard` shows its unlinked state and nothing exercises the
 * resolution path.
 *
 * Safety rails, all of them deliberate:
 *   * The non-local guard in scripts/lib/local-db.mjs. It refuses any host that
 *     is not loopback and any hosted Supabase connection string, and this
 *     script neither weakens nor bypasses it.
 *   * Idempotent. Running it twice reports the existing link and changes
 *     nothing.
 *   * Prints no key material — the test user's email address and the synthetic
 *     person's name, and nothing else.
 *
 * The person it picks is chosen from the seeded data, never invented: the
 * holder of the most currently-effective committee seats in the current
 * committee year, tie-broken by id so the choice is deterministic. That gives
 * the local operator a realistic multi-seat role list rather than an empty one.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { connectLocal, resolveLocalDatabaseUrl } from "./lib/local-db.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local"), quiet: true });

const email = process.env.TEST_USER_EMAIL ?? "test.user@oxfordlancers.local";

function fail(message, hint) {
  console.error(message);
  if (hint) console.error(hint);
  process.exit(1);
}

// Resolve the URL before opening anything, so a non-local target is refused
// with the guard's own message rather than a connection error.
let databaseUrl;
try {
  databaseUrl = resolveLocalDatabaseUrl();
} catch (error) {
  fail(error.message);
}

const client = await connectLocal(databaseUrl);

/** Formats a seeded person for display. `family_name` is nullable by design. */
function displayName(person) {
  const first = person.known_as?.trim() || person.given_name.trim();
  const last = person.family_name?.trim();
  return last ? `${first} ${last}` : first;
}

try {
  await client.query("begin");

  const user = await client.query("select id from auth.users where lower(email) = lower($1)", [
    email,
  ]);

  if (user.rowCount === 0) {
    await client.query("rollback");
    fail(
      `No local auth user with the address ${email}.`,
      "Run `npm run db:seed-user` first — this script links an existing user, it does not create one.",
    );
  }

  const authUserId = user.rows[0].id;

  // Already linked? Report it and stop. This is the second-run path.
  const existing = await client.query(
    `select oa.id, oa.is_active, p.given_name, p.family_name, p.known_as
       from public.operator_accounts oa
       join public.people p on p.id = oa.person_id
      where oa.auth_user_id = $1`,
    [authUserId],
  );

  if (existing.rowCount > 0) {
    const row = existing.rows[0];

    if (!row.is_active) {
      // Reactivation keeps the recorded `disabled_at`: erasing when an account
      // was revoked would destroy the only evidence that it ever was.
      await client.query(
        "update public.operator_accounts set is_active = true, updated_at = now() where id = $1",
        [row.id],
      );
      await client.query("commit");
      console.log(`Reactivated the existing operator account for ${email} -> ${displayName(row)}.`);
      process.exit(0);
    }

    await client.query("rollback");
    console.log(`${email} is already linked to ${displayName(row)}. Nothing to do.`);
    process.exit(0);
  }

  const candidate = await client.query(
    `with current_year as (
       select id
         from public.committee_years
        where starts_on <= current_date and (ends_on is null or ends_on > current_date)
        order by starts_on desc
        limit 1
     )
     select p.id, p.given_name, p.family_name, p.known_as,
            string_agg(distinct r.code, ', ') as codes
       from public.role_assignments ra
       join current_year cy on cy.id = ra.committee_year_id
       join public.roles r on r.id = ra.role_id
       join public.people p on p.id = ra.person_id
      where (ra.effective_to is null or ra.effective_to > now())
        and not exists (
          select 1 from public.operator_accounts oa where oa.person_id = p.id)
      group by p.id, p.given_name, p.family_name, p.known_as
      order by count(distinct r.id) desc, p.id
      limit 1`,
  );

  if (candidate.rowCount === 0) {
    await client.query("rollback");
    fail(
      "No seeded person holds a currently-effective committee seat that is not already linked.",
      "Run `npm run db:seed` first. If it has been run, the seeded committee data has changed and this script needs revisiting.",
    );
  }

  const person = candidate.rows[0];

  await client.query(
    "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
    [authUserId, person.id],
  );
  await client.query("commit");

  console.log(`Linked ${email} -> ${displayName(person)}`);
  console.log(`Currently-effective roles: ${person.codes}`);
  console.log("Sign in at http://localhost:3000/login and open /dashboard.");
} catch (error) {
  await client.query("rollback").catch(() => {});
  fail(`Could not link the local test operator: ${error.message}`);
} finally {
  await client.end();
}
