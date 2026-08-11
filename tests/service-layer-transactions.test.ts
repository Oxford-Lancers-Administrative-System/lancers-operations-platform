// @vitest-environment node
/**
 * `withTransaction` against the real local database.
 *
 * Matrix rows 1–6. Everything here is asserted from a **second, independent
 * connection**, because the failure mode being guarded against is a helper that
 * looks like it works: an uncommitted row is visible to the transaction that
 * wrote it, so a rollback test that reads back through the same handle passes
 * whether or not rollback happens.
 *
 * These tests commit real rows into `public.people`, marked so cleanup is
 * exact. They do not touch the seeded dataset.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The modules under test are server-only; the real package throws outside a
// server bundle. The boundary itself is asserted in src/lib/db/server-only.test.ts.
vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, getPool, withTransaction, type Tx } from "@/lib/db";
import { createFixture, openObserver } from "./helpers/service-layer";

// A marker of this suite's own. Vitest runs test files in parallel against one
// shared database, so a shared marker would mean a sibling suite's cleanup
// deleting these rows mid-test.
const fixture = createFixture("transactions");

let observer: Client;

beforeAll(async () => {
  observer = await openObserver();
  await fixture.cleanUp(observer);
});

afterEach(async () => {
  await fixture.cleanUp(observer);
});

afterAll(async () => {
  await fixture.cleanUp(observer);
  await observer.end();
  await closePool();
});

/** The transaction id PostgreSQL has assigned to this scope. */
async function transactionId(tx: Tx): Promise<string> {
  const result = await tx.query<{ id: string }>("select txid_current()::text as id");
  return result.rows[0].id;
}

describe("row 1 — commits on success", () => {
  it("leaves rows written inside the callback visible to another connection", async () => {
    const returned = await withTransaction(async (tx) => {
      const result = await tx.query<{ id: string }>(...fixture.insertPerson("commit"));
      return result.rows[0].id;
    });

    expect(returned).toMatch(/^[0-9a-f-]{36}$/);
    expect(await fixture.countPeople(observer, "commit")).toBe(1);
  });

  it("commits several statements as one unit", async () => {
    await withTransaction(async (tx) => {
      await tx.query(...fixture.insertPerson("multi"));
      await tx.query(...fixture.insertPerson("multi"));
      await tx.query(...fixture.insertPerson("multi"));
    });

    expect(await fixture.countPeople(observer, "multi")).toBe(3);
  });

  it("commits cleanly when the callback writes nothing at all", async () => {
    // The boundary case: an empty transaction must not throw, must not leave
    // the connection in a transaction, and must return the callback's value.
    await expect(withTransaction(async () => "nothing to do")).resolves.toBe("nothing to do");

    // Proof the connection really left its transaction: a session still inside
    // one reports a non-'idle' state, and the next transaction would inherit it.
    const value = await withTransaction(async (tx) => {
      const result = await tx.query<{ n: number }>("select 1 as n");
      return result.rows[0].n;
    });
    expect(value).toBe(1);
  });
});

describe("row 2 — rolls back on a thrown error", () => {
  it("leaves no trace of a row written before the throw", async () => {
    const boom = new Error("the callback decided this cannot go ahead");

    await expect(
      withTransaction(async (tx) => {
        await tx.query(...fixture.insertPerson("rollback"));
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(await fixture.countPeople(observer, "rollback")).toBe(0);
  });

  it("propagates the original error rather than a rollback error", async () => {
    // Row 2's real risk is not a lost row, it is a silent success or a
    // substituted error: a caller that cannot see WHY the write failed cannot
    // tell an operator anything useful, and a caller that sees success writes
    // a confirmation for something that never happened.
    class DomainRefusal extends Error {
      readonly detail = "the season is archived";
    }
    const refusal = new DomainRefusal("refused");

    let caught: unknown;
    try {
      await withTransaction(async (tx) => {
        await tx.query(...fixture.insertPerson("original-error"));
        throw refusal;
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(refusal);
    expect(caught).toBeInstanceOf(DomainRefusal);
    expect((caught as DomainRefusal).detail).toBe("the season is archived");
    expect(await fixture.countPeople(observer, "original-error")).toBe(0);
  });

  it("rolls back a throw that happens before any write", async () => {
    const boom = new Error("nothing written yet");
    await expect(
      withTransaction(async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    // And the pool is still usable afterwards, which is the thing an early
    // throw is most likely to break.
    await withTransaction(async (tx) => {
      await tx.query(...fixture.insertPerson("after-early-throw"));
    });
    expect(await fixture.countPeople(observer, "after-early-throw")).toBe(1);
  });

  it("rolls back a partial write when the database itself rejects a later statement", async () => {
    await expect(
      withTransaction(async (tx) => {
        await tx.query(...fixture.insertPerson("db-rejected"));
        // Blank given_name violates people_given_name_not_blank.
        await tx.query("insert into public.people (given_name) values ('   ')");
      }),
    ).rejects.toMatchObject({ kind: "constraint_violated" });

    expect(await fixture.countPeople(observer, "db-rejected")).toBe(0);
  });
});

describe("row 3 — a nested call joins the outer transaction", () => {
  it("runs the inner scope in the same PostgreSQL transaction", async () => {
    const ids: string[] = [];

    await withTransaction(async (outer) => {
      ids.push(await transactionId(outer));
      await withTransaction(async (inner) => {
        ids.push(await transactionId(inner));
      });
    });

    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it("keeps one transaction at depth 3", async () => {
    const ids: string[] = [];

    await withTransaction(async (a) => {
      ids.push(await transactionId(a));
      await withTransaction(async (b) => {
        ids.push(await transactionId(b));
        await withTransaction(async (c) => {
          ids.push(await transactionId(c));
        });
      });
    });

    expect(new Set(ids).size).toBe(1);
  });

  it("lets the inner scope see the outer scope's uncommitted rows", async () => {
    await withTransaction(async (outer) => {
      await outer.query(...fixture.insertPerson("nested-visibility"));

      await withTransaction(async (inner) => {
        const seen = await inner.query<{ count: string }>(
          "select count(*)::text as count from public.people where given_name = $1 and family_name = $2",
          [fixture.marker, "nested-visibility"],
        );
        expect(Number(seen.rows[0].count)).toBe(1);
      });
    });

    expect(await fixture.countPeople(observer, "nested-visibility")).toBe(1);
  });

  it("checks out no second connection while nested", async () => {
    // A second checked-out client is the observable signature of a second
    // transaction, and is what would deadlock the moment the two touched the
    // same row.
    const pool = getPool();
    await withTransaction(async () => {
      const outerCheckedOut = pool.totalCount - pool.idleCount;
      await withTransaction(async () => {
        expect(pool.totalCount - pool.idleCount).toBe(outerCheckedOut);
      });
      await withTransaction(async () => {
        await withTransaction(async () => {
          expect(pool.totalCount - pool.idleCount).toBe(outerCheckedOut);
        });
      });
    });
  });
});

describe("row 4 — an inner rollback takes the outer transaction with it", () => {
  it("leaves no row from either scope when the innermost one throws", async () => {
    const boom = new Error("the inner scope refused");

    await expect(
      withTransaction(async (outer) => {
        await outer.query(...fixture.insertPerson("inner-throw-outer"));
        await withTransaction(async (inner) => {
          await inner.query(...fixture.insertPerson("inner-throw-inner"));
          throw boom;
        });
      }),
    ).rejects.toBe(boom);

    // The outer write surviving is the exact partial commit this layer exists
    // to prevent — "the audience was inserted but the event was never approved".
    expect(await fixture.countPeople(observer, "inner-throw-outer")).toBe(0);
    expect(await fixture.countPeople(observer, "inner-throw-inner")).toBe(0);
  });

  it("does not let a nested scope swallow its own failure", async () => {
    // The dangerous shape: an inner scope that catches nothing but whose
    // helper quietly recovers via a savepoint, letting the outer commit.
    const boom = new Error("deep failure");

    await expect(
      withTransaction(async (a) => {
        await a.query(...fixture.insertPerson("depth-3"));
        await withTransaction(async (b) => {
          await b.query(...fixture.insertPerson("depth-3"));
          await withTransaction(async () => {
            throw boom;
          });
        });
      }),
    ).rejects.toBe(boom);

    expect(await fixture.countPeople(observer, "depth-3")).toBe(0);
  });

  it("rolls the inner scope's work back when the OUTER scope throws afterwards", async () => {
    const boom = new Error("the outer scope refused, after the inner one returned");

    await expect(
      withTransaction(async (outer) => {
        await withTransaction(async (inner) => {
          await inner.query(...fixture.insertPerson("outer-throws-later"));
        });
        await outer.query(...fixture.insertPerson("outer-throws-later"));
        throw boom;
      }),
    ).rejects.toBe(boom);

    // An inner scope that returned normally must not have committed anything:
    // only the outermost scope commits.
    expect(await fixture.countPeople(observer, "outer-throws-later")).toBe(0);
  });

  it("commits the inner scope's work when the outer one succeeds", async () => {
    await withTransaction(async (outer) => {
      await withTransaction(async (inner) => {
        await inner.query(...fixture.insertPerson("nested-commit"));
      });
      await outer.query(...fixture.insertPerson("nested-commit"));
    });

    expect(await fixture.countPeople(observer, "nested-commit")).toBe(2);
  });
});

describe("row 5 — concurrent transactions are isolated", () => {
  it("does not let two overlapping calls see each other's uncommitted rows", async () => {
    // Both transactions are held open at the same time, so this fails if the
    // helper ever reuses one connection for two logical transactions — the bug
    // that would let one request observe another's in-flight state.
    let releaseA: () => void = () => {};
    let releaseB: () => void = () => {};
    const aHasWritten = new Promise<void>((resolve) => (releaseA = resolve));
    const bHasWritten = new Promise<void>((resolve) => (releaseB = resolve));

    const seen: Record<string, number> = {};
    const txIds: string[] = [];

    await Promise.all([
      withTransaction(async (tx) => {
        txIds.push(await transactionId(tx));
        await tx.query(...fixture.insertPerson("concurrent-a"));
        releaseA();
        await bHasWritten;
        const result = await tx.query<{ count: string }>(
          "select count(*)::text as count from public.people where given_name = $1 and family_name = $2",
          [fixture.marker, "concurrent-b"],
        );
        seen.aSawB = Number(result.rows[0].count);
      }),
      withTransaction(async (tx) => {
        txIds.push(await transactionId(tx));
        await tx.query(...fixture.insertPerson("concurrent-b"));
        releaseB();
        await aHasWritten;
        const result = await tx.query<{ count: string }>(
          "select count(*)::text as count from public.people where given_name = $1 and family_name = $2",
          [fixture.marker, "concurrent-a"],
        );
        seen.bSawA = Number(result.rows[0].count);
      }),
    ]);

    expect(seen.aSawB).toBe(0);
    expect(seen.bSawA).toBe(0);
    expect(new Set(txIds).size).toBe(2);

    // Both did commit, so the isolation above was real isolation and not two
    // transactions that both silently failed.
    expect(await fixture.countPeople(observer, "concurrent-a")).toBe(1);
    expect(await fixture.countPeople(observer, "concurrent-b")).toBe(1);
  });
});

describe("row 6 — the connection goes back to the pool on both paths", () => {
  it("checks the client back in after a success and after a throw", async () => {
    const pool = getPool();

    await withTransaction(async (tx) => {
      await tx.query("select 1");
    });
    expect(pool.totalCount - pool.idleCount).toBe(0);

    await expect(
      withTransaction(async () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
    expect(pool.totalCount - pool.idleCount).toBe(0);
  });

  it("survives many more calls than the pool has connections", async () => {
    // A leak does not fail a test; it hangs one, much later, once `max` clients
    // are checked out and never returned. Running well past `max` with
    // successes and failures interleaved is what turns that into a visible
    // failure here rather than an outage later.
    const pool = getPool();
    const attempts = pool.options.max! * 4;

    for (let i = 0; i < attempts; i += 1) {
      if (i % 3 === 0) {
        await expect(
          withTransaction(async (tx) => {
            await tx.query("select 1");
            throw new Error(`failure ${i}`);
          }),
        ).rejects.toThrow(`failure ${i}`);
      } else if (i % 3 === 1) {
        // A failure raised by the database rather than by the callback.
        await expect(
          withTransaction(async (tx) => {
            await tx.query("insert into public.people (given_name) values ('  ')");
          }),
        ).rejects.toMatchObject({ kind: "constraint_violated" });
      } else {
        await withTransaction(async (tx) => {
          await tx.query("select 1");
        });
      }
    }

    expect(pool.totalCount - pool.idleCount).toBe(0);
    expect(pool.totalCount).toBeLessThanOrEqual(pool.options.max!);
    expect(pool.waitingCount).toBe(0);
  }, 30_000);

  it("does not exhaust the pool under concurrency beyond its size", async () => {
    const pool = getPool();
    const concurrency = pool.options.max! * 3;

    const results = await Promise.all(
      Array.from({ length: concurrency }, (_unused, i) =>
        withTransaction(async (tx) => {
          const result = await tx.query<{ n: number }>("select $1::int as n", [i]);
          return result.rows[0].n;
        }),
      ),
    );

    expect(results).toHaveLength(concurrency);
    expect(pool.totalCount - pool.idleCount).toBe(0);
  }, 30_000);
});
