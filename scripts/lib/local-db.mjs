/**
 * Shared local-database access for seeding and schema tests.
 *
 * ADR 0001: development, tests, migrations and type generation run against the
 * LOCAL Supabase stack only. There is one production project and no staging,
 * so the guard below is deliberately paranoid and deliberately not
 * configurable: it refuses any host that is not loopback, and refuses any
 * connection string carrying a Supabase project reference.
 */
import pg from "pg";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * What a caller is told when it named no database.
 *
 * ## Why there is no longer a default
 *
 * This module used to fall back to
 * `postgresql://postgres:postgres@127.0.0.1:54322/postgres` when
 * `SUPABASE_DB_URL` was unset. That address is not a neutral placeholder: port
 * 54322 is the **`primary` slot** of the local Supabase coordinator, which is a
 * database somebody is very likely using. Two slots exist precisely so that two
 * pieces of work do not share one stack, and the default quietly pointed every
 * unconfigured caller at the first of them.
 *
 * The scripts that read this are destructive. `scripts/seed-local.mjs` truncates
 * and reloads the whole synthetic dataset; `link-test-operator.mjs` and
 * `link-review-coach.mjs` rewrite the review logins. Run by hand with nothing
 * exported — the ordinary way to run a script — they did that to whatever stack
 * happened to hold `primary`, reported success, and said nothing about which
 * database they had rewritten. That is how a `review-ready` stack was re-seeded
 * out from under its owner: not a wrong URL, an **unstated** one.
 *
 * The guarded commands (`npm run db:seed`, `db:reset`, `db:start`) were never
 * affected and are unchanged. `scripts/local-supabase-command.mjs` reads the
 * caller's lease and exports `SUPABASE_DB_URL` for the slot that lease names, so
 * every legitimate caller already passes an explicit target and keeps working.
 * What changes is the unguarded path, which now refuses instead of guessing.
 *
 * This is strictly a narrowing. Every refusal below still applies to every URL
 * that gets past this point: loopback-only, no query or fragment parameters, no
 * hosted Supabase connection string. Nothing here makes a previously refused
 * target reachable — ADR 0001 and ADR 0014 are untouched, and
 * `tests/service-layer-guard-parity.test.ts` still proves this guard agrees with
 * `src/lib/db/url.ts` on every explicit URL.
 */
const NO_TARGET_MESSAGE =
  "SUPABASE_DB_URL is not set, and there is no default. This script writes to the " +
  "database it is given, and the old default pointed at the coordinator's `primary` " +
  "slot — which is somebody's working stack. Run the guarded command instead " +
  "(npm run db:seed, db:reset, db:start), or export SUPABASE_DB_URL for the slot you " +
  "hold: `npm run db:status` prints its port.";

/** Resolves the local database URL and refuses anything that is not local. */
export function resolveLocalDatabaseUrl(raw = process.env.SUPABASE_DB_URL) {
  const value = raw?.trim();

  // Before any of the refusals below, because "which database?" has to have an
  // answer before it can be checked. An unanswered question is not a local
  // database; it is an unstated one.
  if (!value) throw new Error(NO_TARGET_MESSAGE);

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`SUPABASE_DB_URL is not a valid URL: ${value}`);
  }

  // The host in the authority is not necessarily the host `pg` opens.
  // `pg-connection-string` copies every query parameter into the client
  // configuration, where `host`, `port`, `user` and `password` override the
  // authority, so `…@127.0.0.1:54322/postgres?host=203.0.113.9` reads as
  // loopback here and connects off the machine — defeating ADR 0001 through
  // this exact module, which seeds and runs the schema tests. Mirrored in
  // src/lib/db/url.ts; tests/service-layer-guard-parity.test.ts proves they
  // agree.
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

/** Opens a client against the local database. The caller closes it. */
export async function connectLocal(url = resolveLocalDatabaseUrl()) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

/**
 * A tiny deterministic PRNG (mulberry32). The seed must be identical on every
 * machine and every run, so `Math.random` is not used anywhere in the generator.
 */
export function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic UUIDs, so relationships can be built without round-trips. */
export function makeUuidFactory(random) {
  const hex = "0123456789abcdef";
  return function uuid() {
    let out = "";
    for (let i = 0; i < 32; i += 1) {
      if (i === 12) out += "4";
      else if (i === 16) out += hex[8 + Math.floor(random() * 4)];
      else out += hex[Math.floor(random() * 16)];
      if (i === 7 || i === 11 || i === 15 || i === 19) out += "-";
    }
    return out;
  };
}

/** Multi-row insert, chunked so a large table does not exceed the bind limit. */
export async function insertRows(client, table, columns, rows, chunkSize = 500) {
  if (rows.length === 0) return;
  const columnList = columns.map((c) => `"${c}"`).join(", ");

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const values = [];
    const params = [];
    let n = 1;

    for (const row of chunk) {
      values.push(`(${columns.map(() => `$${n++}`).join(", ")})`);
      for (const column of columns) params.push(row[column] ?? null);
    }

    await client.query(`insert into ${table} (${columnList}) values ${values.join(", ")}`, params);
  }
}
