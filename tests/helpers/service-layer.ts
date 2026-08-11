/**
 * Shared setup for the service-layer integration suites.
 *
 * These tests exercise `withTransaction` against the **real** local database,
 * because that is the only place the behaviour under test exists. A mocked
 * transaction commits and rolls back because the mock says so; it cannot
 * deadlock, cannot leak a connection, cannot see another session's uncommitted
 * rows, and cannot be rejected by a check constraint. Every one of those is a
 * behaviour this layer is supposed to get right.
 *
 * Unlike the schema suites, these cannot wrap every test in a rolled-back
 * transaction — the transaction *is* the thing under test, and proving a commit
 * really committed means leaving a committed row behind for a moment. Every
 * suite therefore marks the rows it writes and deletes them afterwards.
 *
 * **Each suite gets its own marker.** Vitest runs test files in parallel
 * against one shared database, so a marker shared between two suites means one
 * suite's cleanup deletes the other's fixtures mid-test — which shows up as a
 * baffling foreign-key failure rather than as the collision it is.
 *
 * Local Supabase only; the same connection module the application uses, and the
 * same guard, which refuses any non-loopback host.
 */
import pg from "pg";

import { resolveDatabaseUrl } from "@/lib/db/url";

/**
 * A second, independent connection, opened outside the pool under test.
 *
 * Every "is the row actually there?" assertion goes through this rather than
 * through the transaction that wrote it. Reading a row from inside its own
 * transaction proves nothing about whether it committed — an uncommitted row is
 * perfectly visible to the transaction that wrote it, which is the whole reason
 * a naive rollback test passes when rollback is broken.
 */
export async function openObserver(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  return client;
}

export interface Fixture {
  /** The `people.given_name` value every row this suite writes carries. */
  marker: string;
  /** The insert statement, spread straight into a `query` call. */
  insertPerson(tag: string): [string, string[]];
  /** Counts this suite's marked people, from outside any transaction under test. */
  countPeople(observer: pg.Client, tag: string): Promise<number>;
  /** Deletes everything this suite may have committed. Safe to call twice. */
  cleanUp(observer: pg.Client): Promise<void>;
  /** Deletes only this suite's audit rows, for use between tests. */
  cleanUpAudit(observer: pg.Client): Promise<void>;
}

/**
 * Builds a fixture namespace for one suite.
 *
 * `suite` must be unique across the repository — it is what keeps two parallel
 * suites from deleting each other's rows.
 */
export function createFixture(suite: string): Fixture {
  const marker = `LAN72Fixture:${suite}`;

  return {
    marker,

    insertPerson(tag) {
      return [
        "insert into public.people (given_name, family_name) values ($1, $2) returning id",
        [marker, tag],
      ];
    },

    async countPeople(observer, tag) {
      const result = await observer.query<{ count: string }>(
        "select count(*)::text as count from public.people where given_name = $1 and family_name = $2",
        [marker, tag],
      );
      return Number(result.rows[0].count);
    },

    async cleanUpAudit(observer) {
      await observer.query("delete from public.audit_events where entity_table = $1", [marker]);
    },

    async cleanUp(observer) {
      // Audit rows first: `audit_events.actor_person_id` is `on delete restrict`.
      await observer.query("delete from public.audit_events where entity_table = $1", [marker]);
      await observer.query("delete from public.people where given_name = $1", [marker]);
    },
  };
}
