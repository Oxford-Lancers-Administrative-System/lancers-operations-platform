/**
 * The Supabase **administrative API** half of the founding bootstrap — LAN-135,
 * `REQ-one-time-bootstrap`.
 *
 * ## Why this exists at all, in the requirement's own words
 *
 * The requirement asks for "one supported idempotent owner-run bootstrap script
 * using the Supabase administrative API **rather than direct SQL insertion into
 * Auth-owned tables**". That clause is the mission in miniature, and it is not
 * a style preference:
 *
 *   * GoTrue owns the shape of `auth.users`, `auth.identities` and the columns
 *     around them, and changes them between releases;
 *   * the hosted runtime connects as `app_runtime`, a least-privilege login
 *     with no reach into the `auth` schema at all (ADR 0026), so a row written
 *     there by hand is invisible to the application that has to use it;
 *   * and a password or identity row written by hand is a support incident
 *     nobody can debug.
 *
 * So this file speaks HTTP to the Auth server through `@supabase/supabase-js`,
 * and the SQL half of the script — `database.mjs` — touches only `public`.
 *
 * ## The two targets must agree
 *
 * The dangerous mistake is not pointing at the wrong database. It is pointing
 * at the *right* database and the *wrong* Auth server: logins created in one
 * project, `operator_accounts` rows in another, and three administrators who
 * cannot sign in to the club they now run. Every row this script writes names
 * an `auth.users.id` by foreign key, so the two halves have to be the same
 * project or nothing works — and it would be discovered at the worst possible
 * moment.
 *
 * `assertIdentityTarget` therefore refuses any pairing that is not obviously
 * consistent: a hosted database demands the hosted project's own Auth URL, and
 * a loopback database demands a loopback Auth URL. There is no flag to override
 * it.
 */

import { createClient } from "@supabase/supabase-js";

import { PRODUCTION_PROJECT_REF } from "../connection-smoke-test.mjs";

/** Hostnames that are this machine and cannot be anybody's production. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * How many Auth users this script will page through looking for one address.
 *
 * GoTrue's admin list is paged and `@supabase/supabase-js` exposes no
 * server-side email filter, so the duplicate check reads pages. The cap exists
 * so that "not found" can never quietly mean "gave up": a directory larger than
 * this refuses the run rather than reporting an absence it did not establish.
 */
const MAX_PAGES = 50;
const PAGE_SIZE = 200;

/**
 * Resolves the Auth server for a target, or refuses.
 *
 * Never returns, logs or echoes the key. The key is read here and handed
 * straight to the client; nothing in this script prints it, and the caller is
 * given only the URL to show a human.
 *
 * @param {{ kind: "hosted" | "local" }} target from `resolveTarget`
 * @param {Record<string, string | undefined>} env
 */
export function assertIdentityTarget(target, env = process.env) {
  const url = (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (url === "") {
    throw new Error(
      "No Supabase Auth server to work against. Set SUPABASE_URL (or, for a local " +
        "rehearsal, NEXT_PUBLIC_SUPABASE_URL).",
    );
  }
  if (key === "") {
    throw new Error(
      "No privileged Supabase key. Set SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY). " +
        "Pass it in the environment so it does not land in shell history.",
    );
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    // Deliberately does not echo the value.
    throw new Error("SUPABASE_URL is not a valid URL.");
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLoopback = LOOPBACK.has(hostname) || hostname.endsWith(".localhost");

  if (target.kind === "hosted") {
    // The Auth server must be the same project the database is. Compared by
    // exact hostname rather than by "contains the ref", so a lookalike host
    // carrying the reference somewhere in it is refused.
    const expected = `${PRODUCTION_PROJECT_REF}.supabase.co`;
    if (hostname !== expected) {
      throw new Error(
        `Refusing to create logins on "${hostname}" while writing rows to the hosted ` +
          `project ${PRODUCTION_PROJECT_REF}. The database and the Auth server must be the ` +
          "same project, or the operators created cannot sign in.",
      );
    }
  } else if (!isLoopback) {
    throw new Error(
      `Refusing to create logins on "${hostname}" while writing rows to a database on this ` +
        "machine. The database and the Auth server must be the same project.",
    );
  }

  return { url, key, describe: () => `Supabase Auth at ${parsed.origin}` };
}

/** Is this the Auth server saying the address is taken? Mirrors `operator-identity.ts`. */
function isDuplicateAddress(error) {
  const code = error?.code;
  if (code === "email_exists" || code === "user_already_exists") return true;
  const message = error?.message;
  return typeof message === "string" && /already (been )?registered|already exists/i.test(message);
}

/**
 * The four operations the bootstrap needs, over the privileged client.
 *
 * The same four `OperatorIdentityPort` defines in
 * `src/lib/services/operator-identity.ts`, minus the ones this script has no
 * business performing — it never changes an address and never activates
 * anybody — plus the lookup the dry run needs.
 *
 * A plain object rather than a class so the contract test can substitute a fake
 * for the paths that must not depend on a live Auth server, and use the real
 * one for the path that must.
 */
export function supabaseIdentity({ url, key }) {
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    /**
     * The Auth login for an address, or `null`.
     *
     * Fails closed: a directory too large to page through in full raises rather
     * than answering `null`, because `null` here is what tells the plan it is
     * safe to create a login.
     */
    async findLoginByEmail(email) {
      const wanted = email.trim().toLowerCase();

      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
        if (error) {
          throw new Error(`The Supabase Auth directory could not be read: ${error.message}`);
        }

        const users = data?.users ?? [];
        const found = users.find((user) => (user.email ?? "").toLowerCase() === wanted);
        if (found) return { id: found.id, email: found.email ?? null };
        if (users.length < PAGE_SIZE) return null;
      }

      throw new Error(
        `Refusing to continue: the Supabase Auth directory has more than ${MAX_PAGES * PAGE_SIZE} ` +
          "users and this script could not establish whether the address already has a login. " +
          "Nothing was written.",
      );
    },

    /**
     * Creates an unconfirmed, passwordless login and returns its
     * `auth.users.id`. **Sends no email.**
     *
     * Unconfirmed on purpose, exactly as the application's invitation path is:
     * confirmation is what following the invitation link does, and a login
     * created already confirmed could not be invited at all.
     */
    async createLogin(email) {
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: false });

      if (error || !data?.user?.id) {
        if (isDuplicateAddress(error)) {
          throw new Error(
            `That address already has a Supabase Auth login. Nothing was written. ` +
              "Re-run the dry run — it will name the conflict.",
          );
        }
        throw new Error(`The operator login could not be created: ${error?.message ?? "unknown"}`);
      }

      return { authUserId: data.user.id };
    },

    /** Sends the first-access invitation. Throws on any failure. */
    async sendInvitation(email, redirectTo) {
      const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error) throw new Error(error.message);
    },

    /** Removes a login. Compensation only — see `database.mjs`. */
    async deleteLogin(authUserId) {
      const { error } = await admin.auth.admin.deleteUser(authUserId);
      if (error) throw new Error(`The operator login could not be removed: ${error.message}`);
    },
  };
}
