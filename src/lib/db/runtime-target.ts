/**
 * Which database the *runtime* may open, as opposed to which database a local
 * tool may open.
 *
 * ## Why this file exists separately from `./url.ts`
 *
 * `./url.ts` answers one question — "is this loopback?" — and answers it
 * unconditionally, for everything: the seed scripts, the schema tests, CI, and
 * the application in development. That guard is unchanged by this file and must
 * stay unchanged. `tests/local-only-guard-source.test.ts` reads it as text and
 * fails if a conjunct is ever added to it.
 *
 * This file answers a second, narrower question that only the deployed
 * container is allowed to ask: **"is this the one hosted database the owner
 * approved?"** Splitting them is the point. A single function with a hosted
 * branch inside it would mean every local tool that calls the guard inherits
 * the branch, and the ticket this implements says exactly that must not happen.
 *
 * ## The policy, stated once
 *
 * - **Not the deployed service** → `resolveDatabaseUrl()` from `./url.ts`,
 *   which is loopback-only and not configurable. Development, CI, tests,
 *   fixtures and seed commands all land here, and nothing they can set moves
 *   them out of it.
 * - **The deployed service** → `DATABASE_URL` must be present and must match
 *   {@link APPROVED_HOSTED_TARGET} exactly. There is no fallback to a local
 *   default, and no other remote target is reachable — including a different
 *   Supabase project, a different pooler, or the same project on a different
 *   port.
 *
 * ## Why the target is a literal here rather than configuration
 *
 * Because configuration is the thing being defended against. If the approved
 * host arrived from an environment variable, then setting that variable would
 * widen the policy — which is the "generic bypass variable" the acceptance
 * criteria forbid. Pinning it in checked-in source means widening it is a
 * commit, a pull request and a review.
 *
 * None of these values is a secret. The project reference already appears in
 * `NEXT_PUBLIC_SUPABASE_URL`, which is compiled into the browser bundle; the
 * host and port are published in Supabase's own dashboard. The password is the
 * secret, it lives only in Secret Manager, and it is deliberately not part of
 * the comparison below.
 *
 * ## What this cannot do
 *
 * The same residual risk `./url.ts` records: it checks the target asked for,
 * not the database reached. It is accident prevention. The security boundary is
 * the credential's own grants, its RLS treatment, who may read the secret, and
 * the change controls on production — see
 * docs/adr/0026-hosted-runtime-database-connection.md.
 */

import { assertLocalDatabaseUrl, resolveDatabaseUrl } from "./url";

/**
 * The Cloud Run service that is allowed to reach the hosted database.
 *
 * Cloud Run sets `K_SERVICE` itself on every instance it starts; it is not a
 * value this repository supplies, and it is not a switch anybody is invited to
 * flip. It is used as the marker for "this process is the deployed service"
 * because the alternative — a `DATABASE_TARGET=hosted` style variable — is
 * precisely the production-mode switch the acceptance criteria rule out.
 *
 * A developer who forged it would still have to hold the production password
 * *and* name the exact approved target below, because both checks apply.
 */
export const CLOUD_RUN_SERVICE = "lancers-operations-platform";

/**
 * The one hosted database the deployed runtime may open.
 *
 * Shared Supavisor pooler, transaction mode. Chosen over the direct connection
 * and the dedicated pooler because both of those answer on IPv6 only unless the
 * paid IPv4 add-on is bought, and Cloud Run egresses over IPv4 — verified in
 * the project's own dashboard, which offers the IPv4 add-on for exactly that
 * reason. Transaction mode forbids prepared statements, which costs this
 * codebase nothing: `Tx.query` takes `(sql, params)` and gives no caller a way
 * to name a statement.
 *
 * `username` is the role, not the person: `app_runtime` is a login with no
 * ownership of any table, holding the grants ADR 0010 already curates through
 * membership of `service_role`. Supavisor requires the project reference to be
 * appended to the role name, which is why it appears here.
 */
export const APPROVED_HOSTED_TARGET = {
  hostname: "aws-0-eu-west-2.pooler.supabase.com",
  port: "6543",
  database: "postgres",
  username: "app_runtime.fggbgeraiadetyiyjlvb",
} as const;

/** The environment variable the deployed runtime reads, and the only one. */
export const HOSTED_DATABASE_URL_VARIABLE = "DATABASE_URL";

/**
 * Whether this process is the deployed Cloud Run service.
 *
 * Deliberately an exact match on the approved service name rather than "is
 * `K_SERVICE` set at all": a second Cloud Run service in the same project —
 * which release scope does not have, but might — would not inherit this
 * database policy by accident.
 */
export function isDeployedRuntime(env: Record<string, string | undefined> = process.env): boolean {
  return env.K_SERVICE === CLOUD_RUN_SERVICE;
}

/**
 * Applies the approved-target policy to a hosted connection string.
 *
 * Throws unless every identifying component matches. The message names the
 * component that disagreed and never echoes the value, because the value is a
 * connection string with a password in it.
 */
export function assertApprovedHostedDatabaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      "DATABASE_URL is not a valid connection string. " +
        "The deployed runtime refuses to guess; see docs/deployment.md.",
    );
  }

  // A connection string's authority is not the whole story, and comparing only
  // the authority is how this guard was first written and was wrong.
  //
  // `pg` parses with `pg-connection-string`, which copies **every query
  // parameter** into the client configuration and lets `host`, `port`, `user`
  // and `password` override what the authority said. So
  //
  //     …@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?host=elsewhere&port=5432
  //
  // reads as the approved target to `new URL()` while `pg` opens `elsewhere`.
  // Every component below would have matched.
  //
  // Refusing any query or fragment closes that completely, and does so without
  // this module having to track which parameter names the driver honours today.
  // Nothing legitimate is lost: the approved target carries neither.
  if (parsed.search !== "" || parsed.hash !== "") {
    throw new Error(
      "Refusing a connection string that carries query or fragment parameters. " +
        "They can redirect the driver to a different host, port or user than the one checked here.",
    );
  }

  const actual = {
    hostname: parsed.hostname,
    port: parsed.port,
    database: parsed.pathname.replace(/^\//, ""),
    username: parsed.username,
  };

  const mismatched = (Object.keys(APPROVED_HOSTED_TARGET) as (keyof typeof actual)[]).filter(
    (component) => actual[component] !== APPROVED_HOSTED_TARGET[component],
  );

  if (mismatched.length > 0) {
    throw new Error(
      `Refusing a hosted database that is not the approved target: ${mismatched.join(", ")} ` +
        `${mismatched.length === 1 ? "does" : "do"} not match. ` +
        "Only the target pinned in src/lib/db/runtime-target.ts may be opened.",
    );
  }

  return value;
}

/**
 * The connection string this process may open, whoever this process is.
 *
 * The two branches never merge: outside the deployed service the loopback-only
 * guard applies exactly as it always has, and inside it only the approved
 * hosted target is permitted. There is no third case and no way to ask for one.
 */
export function resolveRuntimeDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  if (!isDeployedRuntime(env)) {
    return resolveDatabaseUrl(env);
  }

  const configured = env[HOSTED_DATABASE_URL_VARIABLE]?.trim();

  // Fails closed. The local default in `./url.ts` is what makes a developer
  // machine work with no configuration; inheriting it here would mean a
  // misconfigured revision silently trying to reach a database inside its own
  // container, and reporting a connection error rather than a missing secret.
  if (!configured) {
    throw new Error(
      `The deployed runtime has no ${HOSTED_DATABASE_URL_VARIABLE}. ` +
        "Refusing to fall back to a local database. " +
        "The Cloud Run revision is missing its Secret Manager binding; see docs/deployment.md.",
    );
  }

  return assertApprovedHostedDatabaseUrl(configured);
}

/**
 * Re-exported so `./connection.ts` has one import and so the loopback guard
 * stays visibly part of this policy rather than looking superseded by it.
 */
export { assertLocalDatabaseUrl };
