/**
 * A throwaway database with the schema at a chosen migration — LAN-151, B-1.
 *
 * ## Why this exists
 *
 * Every other database suite in this repository runs against the local stack,
 * whose schema is the migrations applied **from empty** and then seeded with
 * today's vocabulary. That is the right shape for almost everything, and it is
 * structurally blind to exactly one thing: a migration that rewrites data it
 * finds. No row in that database has ever held `pending_approval`, `not_held`,
 * `camp` or `fixture`, so every `case` arm in LAN-151's legacy mapping is dead
 * code there. Independent review proved the blindness by corrupting
 * `not_held -> cancelled` into `not_held -> draft` and watching 178 tests pass.
 *
 * The mapping is the one artifact in this mission that cannot be forward-fixed.
 * The retired statuses and types are gone from the enum afterwards, and
 * `opponent`, `side` and the two outcome columns are dropped, so a wrong
 * mapping is recovered by restoring the single production database from backup.
 * A test that cannot see it is not a small gap.
 *
 * So this builds the world the migration was written for: the schema as it
 * stood **before** LAN-151, with rows in the vocabulary that existed then.
 *
 * ## What it does, and what it deliberately does not
 *
 * It creates a real database on the same local cluster, replays the migration
 * files in filename order up to and including a named one, and hands back a
 * client. It stubs `auth.users` rather than installing GoTrue: three columns are
 * everything the migrations reference, and standing up the auth service to test
 * an enum cast would be a far larger dependency than the thing under test.
 *
 * It is local-only, by the same guard every other database caller uses. The
 * scratch database is dropped and recreated on every run, so a crashed run
 * costs nothing and leaves nothing behind.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");

/** The last migration before LAN-151. The world the mapping was written for. */
export const MIGRATION_BEFORE_LAN_151 = "20260819160000_operator_email_rehome.sql";

/** LAN-151 itself, applied over that world by the test. */
export const LAN_151_MIGRATION = "20260822120000_events_target_state.sql";

function assertLocal(url: string): URL {
  const target = new URL(url);
  const loopback = ["127.0.0.1", "localhost", "::1", "[::1]"];
  if (!loopback.includes(target.hostname)) {
    throw new Error(`Refusing to build a scratch database on ${target.hostname}: not loopback.`);
  }
  if (/supabase\.(co|in|net)/i.test(target.hostname)) {
    throw new Error("Refusing to build a scratch database against a hosted Supabase target.");
  }
  return target;
}

/** Every migration file, in the order `supabase db reset` applies them. */
export function migrationFiles(upToInclusive: string): string[] {
  const all = fs
    .readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const stop = all.indexOf(upToInclusive);
  if (stop === -1) throw new Error(`No migration named ${upToInclusive}.`);
  return all.slice(0, stop + 1);
}

export function readMigration(name: string): string {
  return fs.readFileSync(path.join(MIGRATIONS, name), "utf8");
}

/**
 * The pieces the Supabase platform provides that a bare PostgreSQL database
 * does not, reduced to what these migrations actually reference.
 *
 * The three roles are cluster-wide and already exist on the local stack; they
 * are created defensively so this harness also works on a cluster that has only
 * ever run plain PostgreSQL.
 */
const PLATFORM_STUB = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create schema if not exists extensions;
create schema if not exists auth;

-- Three columns, because three columns are all the migrations name: the foreign
-- key from operator accounts, the email the invitation state projects, and the
-- last sign-in its view reads. Adding a fourth means a migration started
-- depending on more of GoTrue than this stub knows about, which is worth
-- noticing rather than papering over.
create table if not exists auth.users (
  id uuid primary key,
  email text,
  last_sign_in_at timestamptz
);
`;

export interface ScratchDatabase {
  client: pg.Client;
  name: string;
  /** Apply one further migration file by name. */
  apply(name: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Build a scratch database with every migration up to `upToInclusive` applied.
 *
 * The caller owns what happens next: insert rows in the vocabulary of that
 * moment, then `apply()` the migration under test.
 */
export async function createScratchDatabase(
  name: string,
  upToInclusive: string,
): Promise<ScratchDatabase> {
  // Two `drop database` statements run below on a name this function is handed.
  // The loopback guard proves *which cluster*; this proves *which database*, so
  // a caller cannot pass `postgres` and have the helper drop the stack it is
  // running against.
  if (!/^lancers_[a-z0-9_]+$/.test(name)) {
    throw new Error(`Refusing to create or drop ${name}: a scratch database is named lancers_*.`);
  }
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      "SUPABASE_DB_URL is not set. Run through `npm run test`, which reads the worktree's lease.",
    );
  }
  const target = assertLocal(url);

  // `create database` cannot run inside the database being created, so the
  // maintenance connection is to whatever database the URL names.
  const maintenance = new pg.Client({ connectionString: url });
  await maintenance.connect();
  try {
    // Force, because a previous crashed run may still hold a connection.
    await maintenance.query(`drop database if exists ${pg.escapeIdentifier(name)} with (force)`);
    await maintenance.query(`create database ${pg.escapeIdentifier(name)}`);
  } finally {
    await maintenance.end();
  }

  const scratchUrl = new URL(target.toString());
  scratchUrl.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: scratchUrl.toString() });
  await client.connect();

  await client.query(PLATFORM_STUB);
  for (const file of migrationFiles(upToInclusive)) {
    try {
      await client.query(readMigration(file));
    } catch (error) {
      throw new Error(`Replaying ${file} failed: ${(error as Error).message}`);
    }
  }

  return {
    client,
    name,
    async apply(migration: string) {
      await client.query(readMigration(migration));
    },
    async close() {
      await client.end();
      const cleanup = new pg.Client({ connectionString: url });
      await cleanup.connect();
      try {
        await cleanup.query(`drop database if exists ${pg.escapeIdentifier(name)} with (force)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
