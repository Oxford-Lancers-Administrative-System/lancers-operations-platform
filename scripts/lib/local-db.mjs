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

const DEFAULT_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Resolves the local database URL and refuses anything that is not local. */
export function resolveLocalDatabaseUrl(raw = process.env.SUPABASE_DB_URL) {
  const value = raw?.trim() || DEFAULT_URL;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`SUPABASE_DB_URL is not a valid URL: ${value}`);
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
