/**
 * The service layer's data-access entry point.
 *
 * Service modules under `src/lib/services/` import from here. Nothing else
 * should reach for `./connection` directly — `getPool()` is exported for tests
 * and for a future shutdown hook, not as a way to run statements outside a
 * transaction.
 *
 * See `src/lib/services/README.md` for the conventions every service module
 * follows, and docs/adr/0014-transactional-data-access.md for why this path
 * exists at all and what it deliberately leaves unresolved.
 */

export { closePool, getPool } from "./connection";
export {
  Conflict,
  ConstraintViolated,
  InvalidTransition,
  isServiceError,
  mapDatabaseError,
  NotFound,
  NotPermitted,
  ServiceError,
  UnexpectedDatabaseError,
  type DatabaseErrorContext,
  type ServiceErrorKind,
} from "./errors";
export { currentTx, withTransaction, type Tx } from "./transaction";
export { assertLocalDatabaseUrl, resolveDatabaseUrl } from "./url";
