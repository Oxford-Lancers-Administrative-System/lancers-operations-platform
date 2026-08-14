#!/usr/bin/env node
/**
 * The second local review login: a **coaching assignment and nothing else**.
 *
 *   npm run db:seed          # synthetic people, committees and role assignments
 *   npm run db:seed-user     # the one local auth user
 *   npm run db:link-operator # joins the two
 *   npm run db:link-coach    # <- this: the coach's own login, on the same stack
 *
 * LAN-110. The coach surface — attendance-only navigation, UX-90 to UX-97 — is
 * shown to an operator whose *only* authority is coaching, so the operator login
 * cannot reach it: `link-test-operator.mjs` deliberately picks the person
 * holding the most committee seats, and that person gets the operator's board,
 * which is correct and is the whole point of the boundary. Without a second
 * login the coach's screens cannot be looked at on a local stack at all.
 *
 * ## What it does, and the one thing it changes
 *
 * The seeded catalogue already has the club's three coaching seats and the
 * people holding them. Two things stand between that and a working review:
 *
 *   * **The seat has not started.** The 2026-27 coaching appointments run from
 *     1 September, and the local stack's "today" is before that, so
 *     `resolveOperatorAccess()` correctly reports no effective coaching seat —
 *     both bounds of effective dating are enforced, which is LAN-95's
 *     correction and must not be weakened. This script therefore brings the
 *     current-season head-coach appointment forward to today **on the local
 *     stack only**, which is the smallest honest change: a club in mid-August
 *     has its coaching staff appointed for the coming season.
 *
 *     `scripts/seed-local.mjs` is deliberately left alone. `event-audience.ts`
 *     reasons explicitly about the seed's coaches starting on 1 September, and
 *     several suites are written against the deterministic dataset; moving the
 *     date there would change what other issues are tested against, to make one
 *     screen reviewable.
 *
 *   * **There is no login for it.** The auth user is created through the Auth
 *     admin API, exactly as `create-test-user.mjs` does, and linked through
 *     `operator_accounts`.
 *
 * Safety rails, all of them deliberate and none of them new:
 *   * The non-local guard in `scripts/lib/local-db.mjs`. It refuses any host
 *     that is not loopback and any hosted Supabase connection string, and this
 *     script neither weakens nor bypasses it.
 *   * Idempotent. Running it twice reports the existing link and changes
 *     nothing.
 *   * Prints no key material — the address and the synthetic person's name, and
 *     nothing else. The password comes from the environment the guarded
 *     coordinator supplies and is never read, logged or written here.
 *
 * It is a **local review** convenience and nothing else. It creates no pilot
 * data, references no pilot script, and has no hosted counterpart: on hosted,
 * a coaching seat is granted by Brian through the supported administrative
 * path, and `scripts/pilot/lan-110/README.md` says exactly how.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { connectLocal, resolveLocalDatabaseUrl } from "./lib/local-db.mjs";
import { LOCAL_REVIEW_COACH_EMAIL } from "./lib/local-review-account.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local"), quiet: true });

const email = process.env.REVIEW_COACH_EMAIL ?? LOCAL_REVIEW_COACH_EMAIL;
const password = process.env.REVIEW_COACH_PASSWORD ?? process.env.TEST_USER_PASSWORD;

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

const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!apiUrl || !secretKey) fail("Missing local Supabase configuration.");
if (!password) fail("No local review password in the environment.");

// The same loopback check `create-test-user.mjs` applies to the Auth endpoint.
// The database guard above covers PostgreSQL; this covers the admin API, which
// is a second privileged credential reaching a different port.
let isLocalApi = false;
try {
  const target = new URL(apiUrl);
  isLocalApi =
    ["http:", "https:"].includes(target.protocol) &&
    ["127.0.0.1", "localhost", "::1"].includes(target.hostname);
} catch {
  isLocalApi = false;
}
if (!isLocalApi) {
  fail(
    `Refusing to run: ${apiUrl} is not a local Supabase URL.`,
    "This script provisions a user with a privileged key and is local-only by design.",
  );
}

/** Display form. `family_name` is nullable by design. */
function displayName(person) {
  const first = person.known_as?.trim() || person.given_name.trim();
  const last = person.family_name?.trim();
  return last ? `${first} ${last}` : first;
}

const client = await connectLocal(databaseUrl);

try {
  await client.query("begin");

  /**
   * The person holding a current-season coaching seat and **no other seat that
   * is or will be effective**.
   *
   * The second half matters: the seeded Defence Coach is also a player, and one
   * of the coaches could as easily have been given a committee seat. A person
   * with both would receive the operator's board, so linking the review login
   * to them would silently produce the wrong screen and look like a bug in the
   * code rather than in the fixture.
   */
  const candidate = await client.query(
    `select p.id, p.given_name, p.family_name, p.known_as, ra.id as assignment_id,
            ra.effective_from
       from public.role_assignments ra
       join public.roles r on r.id = ra.role_id
       join public.people p on p.id = ra.person_id
       join public.seasons s on s.id = ra.season_id
      where r.code = 'head_coach'
        and s.ends_on is null
        and (ra.effective_to is null or ra.effective_to > now())
        and not exists (
          select 1
            from public.role_assignments other
            join public.roles other_role on other_role.id = other.role_id
           where other.person_id = p.id
             and other_role.code <> 'head_coach'
             and (other.effective_to is null or other.effective_to > now()))
      order by ra.effective_from, p.id
      limit 1`,
  );

  if (candidate.rowCount === 0) {
    await client.query("rollback");
    fail(
      "No seeded person holds a current-season head-coach seat without also holding another role.",
      "Run `npm run db:seed` first. If it has been run, the seeded coaching data has changed and this script needs revisiting.",
    );
  }

  const person = candidate.rows[0];

  // Bring the appointment forward to today when it has not started yet. Both
  // bounds of effective dating stay enforced in `resolveOperatorAccess()`; what
  // changes is the fixture, on a disposable local stack, and only forwards.
  const broughtForward = await client.query(
    `update public.role_assignments
        set effective_from = current_date
      where id = $1 and effective_from > current_date
      returning id`,
    [person.assignment_id],
  );

  await client.query("commit");

  const supabase = createClient(apiUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listError) fail(`Could not list users: ${listError.message}`);

  const match = existing.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());

  let authUserId;
  if (match) {
    const { error } = await supabase.auth.admin.updateUserById(match.id, {
      password,
      email_confirm: true,
    });
    if (error) fail(`Could not update ${email}: ${error.message}`);
    authUserId = match.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) fail(`Could not create ${email}: ${error.message}`);
    authUserId = data.user.id;
  }

  const linked = await client.query(
    `insert into public.operator_accounts (auth_user_id, person_id)
     values ($1, $2)
     on conflict (auth_user_id) do update
        set is_active = true, updated_at = now()
     returning id`,
    [authUserId, person.id],
  );

  if (linked.rowCount === 0) fail("Could not link the local review coach.");

  console.log(`Linked ${email} -> ${displayName(person)} (head_coach)`);
  if (broughtForward.rowCount > 0) {
    console.log("Brought the current-season head-coach appointment forward to today, locally.");
  }
  console.log(`Sign in at http://localhost:${process.env.PORT ?? "3000"}/login`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  fail(`Could not link the local review coach: ${error.message}`);
} finally {
  await client.end();
}
