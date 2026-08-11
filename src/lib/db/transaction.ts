import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import { getPool } from "./connection";
import { mapDatabaseError, UnexpectedDatabaseError } from "./errors";

/**
 * Real multi-statement transactions for the service layer.
 *
 * ## The guarantee
 *
 * Everything a callback writes commits together or not at all. A throw
 * anywhere inside — including inside a nested `withTransaction` — rolls the
 * whole thing back, and the **original** error reaches the caller.
 *
 * ## Why nesting joins rather than nests
 *
 * A nested call runs the callback against the *same* transaction. It does not
 * open a second connection, and it deliberately does **not** open a savepoint.
 *
 * A savepoint would make an inner failure recoverable while the outer scope
 * committed anyway — which is exactly the partial commit this layer exists to
 * prevent. "The audience was inserted but the event was never approved" is the
 * failure mode; a savepoint is how you get it. So an inner throw takes the
 * outer transaction down with it, by construction.
 *
 * The consequence, stated plainly so nobody is surprised by it: there is no way
 * to attempt-and-recover inside a transaction through this helper. If a future
 * service genuinely needs one — a best-effort write whose failure must not
 * abort the surrounding change — that needs savepoint support added
 * deliberately, with its own tests, not improvised at the call site.
 *
 * ## How the join is detected
 *
 * `AsyncLocalStorage`, so that `withTransaction` keeps its one-argument shape
 * and a service function three calls deep does not have to thread a handle
 * through every signature. The store is per-async-context, so two concurrent
 * requests get two independent transactions on two independent connections and
 * neither can see the other's uncommitted rows.
 */

/**
 * The query interface handed to a transaction callback.
 *
 * Deliberately smaller than `pg`'s `PoolClient`: a callback must not be able to
 * issue `begin`, `commit`, `rollback`, `release` or `end` behind this helper's
 * back, because doing so would break the guarantee above silently. It gets a
 * way to run statements, and nothing else.
 */
export interface Tx {
  query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<R>>;
}

const currentTransaction = new AsyncLocalStorage<Tx>();

/**
 * Wraps a checked-out client so every statement's rejection arrives as a
 * `ServiceError` — which is where the error taxonomy actually gets applied, and
 * the reason a caller never sees raw driver text.
 */
function makeTx(client: PoolClient): Tx {
  return {
    async query<R extends QueryResultRow = QueryResultRow>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<QueryResult<R>> {
      try {
        return await client.query<R>(sql, params as unknown[] | undefined);
      } catch (error) {
        throw mapDatabaseError(error);
      }
    },
  };
}

/** The transaction in flight on this async context, or `null`. */
export function currentTx(): Tx | null {
  return currentTransaction.getStore() ?? null;
}

/**
 * Runs `fn` inside a database transaction, committing on return and rolling
 * back on any throw.
 *
 * Called while another `withTransaction` is in flight on the same async
 * context, it joins that transaction instead of opening a second one.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const existing = currentTransaction.getStore();
  if (existing) {
    // Joining. No `begin`, no savepoint, no second connection — and no
    // `commit` either, because the outermost scope owns that.
    return fn(existing);
  }

  let client: PoolClient;
  try {
    client = await getPool().connect();
  } catch (error) {
    // A connection-level failure must not surface driver text — it is the one
    // error most likely to quote a host, a port, or a connection string.
    throw mapDatabaseError(error);
  }

  const tx = makeTx(client);
  let poisoned: Error | undefined;

  try {
    await client.query("begin");
  } catch (error) {
    client.release(true);
    throw mapDatabaseError(error);
  }

  try {
    const result = await currentTransaction.run(tx, () => fn(tx));
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // The rollback itself failed, so the connection's transaction state is
      // unknown and it must not go back into the pool. It is NOT reported to
      // the caller: the original failure is the one that explains what
      // happened, and replacing it would hide the actual cause.
      poisoned = new UnexpectedDatabaseError("The transaction could not be rolled back.");
    }
    // Rethrown exactly as thrown. A `ServiceError` from `tx.query` keeps its
    // specificity; an error the callback raised itself — a validation failure,
    // an intentional abort — reaches the caller unchanged rather than being
    // laundered into a database error it never was.
    throw error;
  } finally {
    // Runs on every path, which is what stops a pooled connection leaking.
    // Passing an error destroys the client instead of returning it.
    client.release(poisoned);
  }
}
