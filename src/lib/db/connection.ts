import "server-only";

import pg from "pg";

import { resolveDatabaseUrl } from "./url";

/**
 * The service layer's pooled PostgreSQL connection.
 *
 * ## This is a second privileged access path
 *
 * The application already reaches Supabase through the Data API, presenting a
 * secret key to PostgREST, which connects as `authenticator` and switches to
 * `service_role`. **This module does something different.** It opens a direct
 * PostgreSQL connection, authenticating as a PostgreSQL login in its own right,
 * with whatever attributes and grants that login has. Locally that login is
 * `postgres`, which owns every table and has admin privileges.
 *
 * So this is an *additional* privileged credential and an *additional* access
 * path into the same database — not the same principal wearing a different hat.
 * ADR 0010's posture is extended by it, not preserved unchanged. The full
 * reasoning, and the hosted questions this repository has deliberately **not**
 * answered, are in docs/adr/0014-transactional-data-access.md.
 *
 * ## Why it exists
 *
 * `supabase-js` issues one PostgREST request per call and has no transaction.
 * Approving an event has to insert the audience, flip the event's status,
 * create the invitations and write the audit rows *or do none of it*. That
 * needs real `begin`/`commit`, which needs a real connection.
 *
 * Reads that need no transaction may keep going through `createAdminClient()`.
 * Writes that span more than one statement come through here.
 *
 * ## `server-only`
 *
 * The `server-only` import makes importing this from a Client Component a build
 * error, exactly as `src/lib/supabase/admin.ts` does. The connection string is
 * a server-only secret; a module reachable from the browser bundle would be a
 * privileged path with a password in it.
 *
 * ## What is deliberately left configurable
 *
 * Pool size and prepared-statement use are read from the environment rather
 * than hard-coded, because the hosted connection mode is **not chosen yet**
 * (LAN-83 owns it) and Supabase documents that transaction-mode pooling does
 * not support prepared statements. Hard-coding either would quietly decide a
 * question this issue is not allowed to decide.
 */

/**
 * Lazily constructed, so that merely importing this module — which `tsc` and
 * the Next.js build both do — never opens a socket or reads configuration.
 */
let pool: pg.Pool | null = null;

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, and is not.`);
  }
  return parsed;
}

/**
 * The process-wide pool.
 *
 * One pool per process is the point: a per-request pool would defeat pooling
 * entirely, and Cloud Run's many short-lived instances make connection count
 * the scarce resource. How scarce, and therefore what `max` should be in
 * production, is one of the open questions routed to LAN-83.
 */
export function getPool(): pg.Pool {
  if (pool) return pool;

  pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(),
    max: readPositiveInteger("DATABASE_POOL_MAX", 10),
    idleTimeoutMillis: readPositiveInteger("DATABASE_IDLE_TIMEOUT_MS", 10_000),
    connectionTimeoutMillis: readPositiveInteger("DATABASE_CONNECT_TIMEOUT_MS", 5_000),
  });

  // A pooled client can fail while idle — the server restarts, the network
  // drops. Without a listener, `pg` escalates that to an uncaught exception and
  // takes the process down. The pool has already discarded the client by the
  // time this runs, so there is nothing to do but decline to crash.
  pool.on("error", () => {});

  return pool;
}

/**
 * Closes the pool and forgets it.
 *
 * Exists for test teardown, so a suite does not hold the event loop open, and
 * so a later test can observe a freshly built pool. Nothing at request time
 * should call this.
 */
export async function closePool(): Promise<void> {
  if (!pool) return;
  const closing = pool;
  pool = null;
  await closing.end();
}
