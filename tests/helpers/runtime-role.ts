/**
 * Creating the approved hosted runtime role, in the **local** database.
 *
 * ADR 0014 records that the local suite proves nothing about the hosted
 * posture, because migrations run as `postgres` — which owns every table and
 * holds admin privileges, so RLS never bites and grants never matter. That is
 * true of every test that connects as `postgres`, and it was true of all of
 * them until LAN-94.
 *
 * This helper is how a test stops connecting as the owner. It builds a login
 * with exactly the shape approved for production — no ownership, grants
 * inherited through membership of `service_role`, and `BYPASSRLS` — so a test
 * can exercise the application's real privileges against the real schema.
 *
 * Local only: every connection is built from `resolveLocalDatabaseUrl()`, which
 * refuses any non-loopback host. The roles are created and dropped by the tests
 * that ask for them and exist nowhere else.
 */
import { randomUUID } from "node:crypto";

import pg from "pg";

import { resolveLocalDatabaseUrl } from "../../scripts/lib/local-db.mjs";

export interface RuntimeRole {
  readonly name: string;
  readonly client: pg.Client;
}

/**
 * A throwaway password, regenerated per process. Local, disposable, and never
 * written anywhere — the hosted equivalent lives only in Secret Manager.
 */
const PASSWORD = randomUUID();

/**
 * Creates `name` as a least-privilege login and connects as it.
 *
 * `bypassRls` is a parameter rather than a constant so a test can build the
 * negative control — the same role *without* the attribute, which reads zero
 * rows from every table while holding full select grants. Demonstrating that
 * failure is what makes the attribute's presence evidence rather than habit.
 */
export async function createRuntimeRole(
  admin: pg.Client,
  name: string,
  { bypassRls = true }: { bypassRls?: boolean } = {},
): Promise<RuntimeRole> {
  await dropRuntimeRole(admin, name);

  await admin.query(`create role ${name} login password '${PASSWORD}' nocreatedb nocreaterole`);
  // The decision under test: grants are inherited from `service_role` rather
  // than restated, so the migrations remain the single source of truth and a
  // future migration cannot leave this role behind.
  await admin.query(`grant service_role to ${name}`);
  if (bypassRls) await admin.query(`alter role ${name} bypassrls`);

  const local = new URL(resolveLocalDatabaseUrl());
  local.username = name;
  local.password = PASSWORD;

  const client = new pg.Client({ connectionString: local.toString() });
  await client.connect();

  return { name, client };
}

/** Removes the role and everything it holds. Safe to call when it never existed. */
export async function dropRuntimeRole(admin: pg.Client, name: string): Promise<void> {
  await admin.query(`drop owned by ${name}`).catch(() => undefined);
  await admin.query(`revoke service_role from ${name}`).catch(() => undefined);
  await admin.query(`drop role if exists ${name}`).catch(() => undefined);
}

/** Runs a statement and reports its PostgreSQL error code, or null on success. */
export async function errorCode(client: pg.Client, sql: string): Promise<string | null> {
  try {
    await client.query(sql);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  }
}
