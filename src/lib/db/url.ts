/**
 * Resolution of the service layer's PostgreSQL connection string, and the
 * guard that refuses anything that is not local.
 *
 * ## Why this file exists at all
 *
 * The service layer needs real `begin`/`commit`, which the Data API cannot
 * give it, so it opens a **direct PostgreSQL connection**. That connection
 * authenticates as a PostgreSQL login of its own — a *second* privileged
 * credential and a *second* access path into the same database, distinct from
 * the Data API's `service_role`. See docs/adr/0014-transactional-data-access.md.
 *
 * A second privileged credential makes ADR 0001 matter more, not less, so the
 * guard below is deliberately paranoid and deliberately **not configurable**:
 * it refuses any host that is not loopback, and refuses any connection string
 * carrying a Supabase project reference or a pooler host.
 *
 * ## Relationship to `scripts/lib/local-db.mjs`
 *
 * `scripts/lib/local-db.mjs` already implements exactly this rule for the
 * seeding and schema-test path. This is a **deliberate reimplementation, not a
 * reuse**, for two reasons: that module is plain JavaScript outside `src/`, and
 * making application code that ships in the production container depend on a
 * file described as "shared local-database access for seeding and schema tests"
 * inverts the dependency the wrong way.
 *
 * The two are kept honest by `tests/service-layer-guard-parity.test.ts`, which
 * runs both implementations over the same table of connection strings and fails
 * if they ever disagree. If you change one, change the other.
 *
 * ## What this guard cannot do
 *
 * It checks the host you *ask* for, not the database you *reach*. A loopback
 * port forwarded to a hosted database — an SSH tunnel, `socat` — defeats it
 * completely, and nothing at this layer can detect that. That residual risk is
 * recorded in ADR 0014 rather than papered over.
 */

/**
 * The Supabase CLI's local database, on its documented default port. Matches
 * `DEFAULT_URL` in `scripts/lib/local-db.mjs` exactly.
 */
const DEFAULT_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * The environment variables consulted, in order.
 *
 * `DATABASE_URL` is the service layer's own name and the one `.env.example`
 * documents. `SUPABASE_DB_URL` is the name `scripts/lib/local-db.mjs` already
 * reads, and is accepted as a fallback so that one `.env.local` serves both
 * paths on a developer's machine.
 */
export const DATABASE_URL_VARIABLES = ["DATABASE_URL", "SUPABASE_DB_URL"] as const;

/**
 * Applies the local-only guard to an explicit connection string.
 *
 * Throws — never returns a sanitised or downgraded value — because the only
 * safe response to "this points somewhere it must not" is to refuse to
 * connect at all.
 *
 * The thrown message repeats the offending **host**, never the whole
 * connection string, so a guard failure cannot print a password into a log.
 */
export function assertLocalDatabaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    // Deliberately does not echo `value`: a malformed connection string is
    // still a connection string, and may still carry a password.
    throw new Error(
      "The database connection string is not a valid URL. " +
        "Copy .env.example to .env.local and fill DATABASE_URL from `npm run db:status`.",
    );
  }

  // The host in the authority is not necessarily the host `pg` opens.
  // `pg-connection-string` copies every query parameter into the client
  // configuration, where `host`, `port`, `user` and `password` override the
  // authority — so
  //
  //     postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=203.0.113.9
  //
  // reads as loopback here and connects off the machine. That defeats ADR 0001
  // through the seed path and the schema tests, which is the thing this guard
  // exists to make impossible. Refusing any query or fragment closes it without
  // this file having to track which parameters the driver honours.
  //
  // Found by independent review of LAN-94, in the hosted policy that copied
  // this shape; it was here first.
  if (parsed.search !== "" || parsed.hash !== "") {
    throw new Error(
      "Refusing a connection string that carries query or fragment parameters. " +
        "They can redirect the driver to a different host than the one checked here.",
    );
  }

  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Refusing to run against a non-local database host "${parsed.hostname}". ` +
        "Local Supabase only — see docs/adr/0001-local-supabase-only.md.",
    );
  }

  if (/supabase\.(co|com|in)/i.test(value) || /pooler/i.test(parsed.hostname)) {
    throw new Error("Refusing to run against a hosted Supabase connection string.");
  }

  return value;
}

/**
 * Resolves the connection string from the environment, falling back to the
 * documented local default, and refuses anything that is not local.
 *
 * The fallback is not a convenience: it is what makes the local stack work
 * with no configuration at all, exactly as `scripts/lib/local-db.mjs` does for
 * the seed and schema tests, and it is what CI relies on.
 */
export function resolveDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const configured = DATABASE_URL_VARIABLES.map((name) => env[name]?.trim()).find(
    (value): value is string => Boolean(value),
  );

  return assertLocalDatabaseUrl(configured ?? DEFAULT_URL);
}
