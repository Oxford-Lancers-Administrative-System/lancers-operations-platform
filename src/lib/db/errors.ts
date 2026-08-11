/**
 * The service layer's error taxonomy, and the mapper that turns a PostgreSQL
 * rejection into one of its members.
 *
 * ## Why a taxonomy rather than `Error`
 *
 * Every caller above this layer — a Server Action, a route handler, a later
 * service module — has to decide what to *do* with a failure: show a field
 * error, return 403, return 404, or fail the request. A single `Error` forces
 * that decision to be made by matching on message text, which breaks silently
 * the first time a message is reworded. Each member below is therefore
 * identifiable programmatically, by `kind` and by `instanceof`, and never by
 * its message.
 *
 * ## Why the messages are written the way they are
 *
 * A mapped message is **shown to an operator**. It must therefore say what the
 * club rule is, in the club's language, and must never carry SQL, a
 * connection string, a driver string, or a row value. That last one matters
 * here specifically: PostgreSQL's `detail`, `hint` and `where` fields routinely
 * quote the offending row, which for this schema means a real person's name or
 * contact details. None of them is ever copied into a `ServiceError`.
 *
 * What *is* copied is the small, safe, schema-level subset — `code`,
 * `constraint`, `table` — onto `ServiceError.context`, so a server-side log can
 * still say which rule fired. The original driver error is deliberately **not**
 * attached as a `cause`: attaching it would put free-form driver text one
 * `console.error` away from a log aggregator, which is precisely what this
 * layer is supposed to prevent.
 */

/** Programmatic discriminator. Stable; safe to switch on. */
export type ServiceErrorKind =
  | "not_found"
  | "not_permitted"
  | "invalid_transition"
  | "constraint_violated"
  | "conflict"
  | "unexpected";

/**
 * The safe subset of a PostgreSQL error, kept for logging and for tests.
 *
 * Everything here is a schema-level identifier chosen by a migration in this
 * repository. Nothing here can contain a row value, a credential, or free-form
 * driver text.
 */
export interface DatabaseErrorContext {
  /** PostgreSQL `SQLSTATE`, e.g. `23514` for a check violation. */
  code?: string;
  /** The named constraint that rejected the statement, when there was one. */
  constraint?: string;
  /** The table the constraint belongs to, when the driver reported one. */
  table?: string;
}

/**
 * Base class for everything this layer throws.
 *
 * Callers discriminate on `kind`. `instanceof ServiceError` also works and is
 * the convenient form, but `kind` is the contract — it survives duplicate
 * module instances, which `instanceof` does not.
 */
export class ServiceError extends Error {
  readonly kind: ServiceErrorKind;
  /**
   * The named database constraint this error came from, when it came from one.
   * This is how two errors of the same class stay distinguishable without
   * anyone matching on message text.
   */
  readonly rule?: string;
  readonly context?: DatabaseErrorContext;

  constructor(
    kind: ServiceErrorKind,
    message: string,
    options: { rule?: string; context?: DatabaseErrorContext } = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.kind = kind;
    this.rule = options.rule;
    this.context = options.context;
  }
}

/** The thing addressed does not exist, or is not visible to this caller. */
export class NotFound extends ServiceError {
  constructor(message: string, options: { rule?: string; context?: DatabaseErrorContext } = {}) {
    super("not_found", message, options);
  }
}

/**
 * The caller is known but is not allowed to do this.
 *
 * This is the type LAN-73's `requireRole()` will throw, which is why it must
 * stay reliably distinguishable from every other failure: an authorization
 * refusal that a caller cannot tell apart from a validation failure gets
 * rendered as a form error and quietly retried.
 */
export class NotPermitted extends ServiceError {
  constructor(message: string, options: { rule?: string; context?: DatabaseErrorContext } = {}) {
    super("not_permitted", message, options);
  }
}

/** The record is in a state this operation is not legal from. */
export class InvalidTransition extends ServiceError {
  constructor(message: string, options: { rule?: string; context?: DatabaseErrorContext } = {}) {
    super("invalid_transition", message, options);
  }
}

/** A durable rule the database carries rejected this change. */
export class ConstraintViolated extends ServiceError {
  constructor(message: string, options: { rule?: string; context?: DatabaseErrorContext } = {}) {
    super("constraint_violated", message, options);
  }
}

/** This change collides with something that already exists. */
export class Conflict extends ServiceError {
  constructor(message: string, options: { rule?: string; context?: DatabaseErrorContext } = {}) {
    super("conflict", message, options);
  }
}

/**
 * The fallback, and the reason `kind` has a sixth member.
 *
 * An unrecognised `SQLSTATE`, a connection-level failure, or a driver fault has
 * to become *something* a caller can handle — reporting it as success is the
 * dangerous outcome, and rethrowing the raw driver error puts its text on the
 * path to an operator's screen. It becomes this, with a message that says
 * plainly that nothing was saved and nothing else.
 */
export class UnexpectedDatabaseError extends ServiceError {
  constructor(
    message = "The database could not complete this change, and nothing was saved. " +
      "Please try again; if it keeps happening, this needs a developer.",
    options: { rule?: string; context?: DatabaseErrorContext } = {},
  ) {
    super("unexpected", message, options);
  }
}

/** True for anything this layer throws. Prefer this to `instanceof`. */
export function isServiceError(value: unknown): value is ServiceError {
  if (!(value instanceof Error)) return false;
  const kind: unknown = (value as Error & { kind?: unknown }).kind;
  return typeof kind === "string" && SERVICE_ERROR_KINDS.has(kind);
}

const SERVICE_ERROR_KINDS = new Set<string>([
  "not_found",
  "not_permitted",
  "invalid_transition",
  "constraint_violated",
  "conflict",
  "unexpected",
] satisfies ServiceErrorKind[]);

/**
 * PostgreSQL error classes this layer understands generically.
 * https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const SQLSTATE = {
  notNullViolation: "23502",
  foreignKeyViolation: "23503",
  uniqueViolation: "23505",
  checkViolation: "23514",
  exclusionViolation: "23P01",
} as const;

type Mapping = (context: DatabaseErrorContext) => ServiceError;

/**
 * Named constraints this layer translates into a specific, operator-readable
 * sentence.
 *
 * The schema names its constraints deliberately (ADR 0008,
 * `docs/architecture/data-model.md`); this table is what makes that naming pay
 * off in the interface. Adding a row here is how a new club rule gets a human
 * message — no other layer should be reading constraint names.
 *
 * Note the taxonomy has five members and this table has four rows, so two of
 * them necessarily share a class. That is not a collision: they stay
 * distinguishable by `rule` and by message, which is what a caller and an
 * operator respectively need. Matching on class alone was never the contract.
 */
const CONSTRAINT_MESSAGES: Readonly<Record<string, Mapping>> = {
  // Invariant P3 / Requirement 5.
  rsvp_responses_no_requires_a_reason: (context) =>
    new ConstraintViolated("A 'no' answer has to say why. Record the reason given and try again.", {
      rule: "rsvp_responses_no_requires_a_reason",
      context,
    }),

  // Invariant E1, as revised by review F11.
  events_approval_requires_date_and_audience: (context) =>
    new InvalidTransition(
      "This event cannot be approved yet. An approved event needs a scheduled date, " +
        "a recorded approver, and an audience that somebody has explicitly confirmed.",
      { rule: "events_approval_requires_date_and_audience", context },
    ),

  // Invariant P5, as revised by review F03.
  attendance_records_require_an_occurred_event: (context) =>
    new InvalidTransition(
      "Attendance can only be recorded against an event that has happened. " +
        "Mark the event as occurred first.",
      { rule: "attendance_records_require_an_occurred_event", context },
    ),

  // Invariant I2 / register D1.
  season_memberships_one_per_person_per_season: (context) =>
    new Conflict(
      "This person already has a membership for that season. " +
        "A single membership carries the whole season, including any gap in it.",
      { rule: "season_memberships_one_per_person_per_season", context },
    ),
};

/**
 * The shape of a `pg` error, as far as this module is willing to look at it.
 *
 * Deliberately narrow. `detail`, `hint`, `where`, `internalQuery` and `message`
 * are all absent by design — see the header note about row values.
 */
interface PostgresErrorLike {
  code?: unknown;
  constraint?: unknown;
  table?: unknown;
}

function readContext(error: unknown): DatabaseErrorContext | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const candidate = error as PostgresErrorLike;
  const context: DatabaseErrorContext = {};
  if (typeof candidate.code === "string") context.code = candidate.code;
  if (typeof candidate.constraint === "string") context.constraint = candidate.constraint;
  if (typeof candidate.table === "string") context.table = candidate.table;

  return Object.keys(context).length > 0 ? context : undefined;
}

/**
 * Turns anything thrown by the driver into a `ServiceError`.
 *
 * Idempotent: a `ServiceError` passed in comes straight back out, so a mapped
 * error travelling up through nested scopes is never re-wrapped and never
 * loses its specificity.
 *
 * The three tiers, in order:
 *
 *   1. a **named** constraint this repository knows about — a specific rule,
 *      in club language;
 *   2. an **unrecognised** integrity violation — still typed usefully by its
 *      `SQLSTATE` class, still safe to show, and carrying the constraint name
 *      as `rule` for the log rather than in the sentence;
 *   3. **anything else**, including connection-level failure — `UnexpectedDatabaseError`.
 *
 * Tier 2 is the one that matters most in practice. A migration can add a
 * constraint tomorrow, and the day it fires the operator must get a usable
 * refusal rather than a stack trace.
 */
export function mapDatabaseError(error: unknown): ServiceError {
  if (isServiceError(error)) return error;

  const context = readContext(error);
  if (!context) return new UnexpectedDatabaseError();

  const named = context.constraint ? CONSTRAINT_MESSAGES[context.constraint] : undefined;
  if (named) return named(context);

  const rule = context.constraint;

  switch (context.code) {
    case SQLSTATE.uniqueViolation:
    case SQLSTATE.exclusionViolation:
      return new Conflict(
        "That change collides with something already recorded. " +
          "Somebody may have changed this while you were working on it.",
        { rule, context },
      );
    case SQLSTATE.checkViolation:
    case SQLSTATE.notNullViolation:
    case SQLSTATE.foreignKeyViolation:
      return new ConstraintViolated(
        "The database refused this change because it breaks one of the club's " +
          "recorded rules. Nothing was saved.",
        { rule, context },
      );
    default:
      return new UnexpectedDatabaseError(undefined, { rule, context });
  }
}
