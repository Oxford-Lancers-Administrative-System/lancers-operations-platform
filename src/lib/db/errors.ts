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
 * Several rows share a `ServiceError` class, and that is not a collision: they
 * stay distinguishable by `rule` and by message, which is what a caller and an
 * operator respectively need. Matching on class alone was never the contract.
 */
const CONSTRAINT_MESSAGES: Readonly<Record<string, Mapping>> = {
  // LAN-131, `REQ-invitation-states`: "refuses duplicate Person bindings or
  // duplicate emails with an actionable reason". The invitation service refuses
  // both before the statement is sent, with the message beside the field that
  // caused them. These two mappings are the backstop for the race it cannot
  // close by checking — two administrators inviting the same person, or the
  // same address, at the same moment — and they matter because the generic
  // unique-violation sentence ("somebody may have changed this while you were
  // working on it") is true and useless here: it does not say which of the two
  // things collided, and both have a different next action.
  //
  // `operator_accounts_login_email_key` is a unique *index* rather than a table
  // constraint, because it is over `lower(login_email)` and partial. PostgreSQL
  // reports the index name in the same `constraint` field, so it is translated
  // the same way.
  operator_accounts_person_key: (context) =>
    new Conflict(
      "That person already has an operator login. One person has one login, however many " +
        "roles they hold — open their operator record to give them another role, resend their " +
        "invitation, or restore their access.",
      { rule: "operator_accounts_person_key", context },
    ),

  operator_accounts_login_email_key: (context) =>
    new Conflict(
      "That email address already has an operator login. One person has one login, so if this " +
        "is the same person, open their operator record instead of inviting them again — and " +
        "if it is somebody else, invite them with their own address.",
      { rule: "operator_accounts_login_email_key", context },
    ),

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

  // LAN-76. The service layer refuses all three of these before the statement
  // is sent, with the message beside the field that caused them. These mappings
  // are the backstop for the paths that do not go through a form — another
  // service, a script, a later issue building on `events` — and they exist so
  // that such a caller gets the club's sentence rather than "breaks one of the
  // club's recorded rules".
  events_times_ordered: (context) =>
    new ConstraintViolated("An event has to end after it starts.", {
      rule: "events_times_ordered",
      context,
    }),

  events_name_not_blank: (context) =>
    new ConstraintViolated("An event has to have a name. Give it one and try again.", {
      rule: "events_name_not_blank",
      context,
    }),

  // D76's rule that a cancellation is always explained. An unexplained one is a
  // decision nobody can review later. Withdrawal and rejection were here too
  // until LAN-151 retired both statuses; cancellation is the only negative
  // decision the club still records.
  events_negative_decisions_are_explained: (context) =>
    new ConstraintViolated("Cancelling an event has to say why. Record the reason and try again.", {
      rule: "events_negative_decisions_are_explained",
      context,
    }),

  // Invariant P5's database half. The other half — when the register opens —
  // cannot be a check constraint, because a check constraint cannot read the
  // clock, so it never reaches this map: the service refuses it first, in
  // `attendance.ts`.
  attendance_records_require_an_approved_event: (context) =>
    new InvalidTransition(
      "Attendance can only be recorded against an approved event. " +
        "A draft has nobody on it, and a cancelled event did not take place.",
      { rule: "attendance_records_require_an_approved_event", context },
    ),

  // Invariant P8, on all three tables that carry it. Player capacity anchors to
  // the season membership; coach, committee, guest and recruit anchor to the
  // durable person. LAN-77 resolves both the capacity and the anchor from one
  // catalogue entry, so an approval built through the audience screen cannot
  // reach these. They are the backstop for every other caller — a later issue
  // adding a late invitee, a correction script, a test — and they matter because
  // the failure is otherwise indistinguishable from a bug: the anchor columns
  // are both nullable and both plausible.
  event_audience_members_anchor_matches_capacity: (context) =>
    new ConstraintViolated(
      "A player has to be added to an audience through their season membership, and a " +
        "coach or committee member through the person who holds the role. One of these " +
        "was added the other way round.",
      { rule: "event_audience_members_anchor_matches_capacity", context },
    ),

  // The same rule on the attendance table, and the one place it is genuinely
  // easy to get wrong: a player is recorded against their **membership** at
  // player capacity, and everybody else against the durable **person** — a
  // walk-on at `recruit` capacity, since LAN-110 mints one into recruitment
  // rather than onto the roster. Both anchor columns are nullable and both are
  // plausible, so a row written the other way round would otherwise fail as an
  // anonymous check violation.
  attendance_records_anchor_matches_capacity: (context) =>
    new ConstraintViolated(
      "A player's attendance is recorded against their season membership, and anybody " +
        "else's against the person. This one was recorded the other way round.",
      { rule: "attendance_records_anchor_matches_capacity", context },
    ),

  invitations_anchor_matches_capacity: (context) =>
    new ConstraintViolated(
      "A player is invited through their season membership, and a coach or committee " +
        "member through the person who holds the role. One of these invitations was " +
        "created the other way round.",
      { rule: "invitations_anchor_matches_capacity", context },
    ),

  // Invariant M1. The key is derived from the event, the capacity and the
  // participant, so a duplicate means this invitee already has a job for this
  // event — which is the collision the key exists to cause rather than a fault
  // to work around. A second delivery is the thing being prevented.
  notification_jobs_idempotency_key_unique: (context) =>
    new Conflict(
      "A message has already been queued for one of these invitees for this event. " +
        "Nothing was sent twice, and nothing further was created.",
      { rule: "notification_jobs_idempotency_key_unique", context },
    ),

  // Invariant P1. An invitation cannot hang off an event that is not approved,
  // and the composite foreign key cascades the event's status into the row, so
  // this fires if an approval is ever attempted out of order.
  invitations_require_an_approved_event: (context) =>
    new InvalidTransition(
      "Invitations can only exist for an approved event. Approve the event first.",
      { rule: "invitations_require_an_approved_event", context },
    ),

  // Invariant I2 / register D1.
  season_memberships_one_per_person_per_season: (context) =>
    new Conflict(
      "This person already has a membership for that season. " +
        "A single membership carries the whole season, including any gap in it.",
      { rule: "season_memberships_one_per_person_per_season", context },
    ),

  // Invariant M5 — the four rules that make a weekly report an immutable
  // snapshot rather than a document. LAN-81 allocates versions in the service
  // layer, under an advisory lock, so a caller going through
  // `generateWeeklyReport` reaches none of these. They are the backstop for
  // every other caller — a correction script, a later issue, a second
  // generation racing this one — and the issue asks for one of them by name:
  // the composite foreign key already refuses a cross-season supersession, and
  // the service has to surface that as a readable error rather than a raw
  // failure.
  weekly_reports_supersedes_the_same_report: (context) =>
    new ConstraintViolated(
      "A regenerated report can only supersede an earlier version of the same report — " +
        "the same season and the same reporting date.",
      { rule: "weekly_reports_supersedes_the_same_report", context },
    ),

  weekly_reports_one_per_version: (context) =>
    new Conflict(
      "That version of this report already exists. Another version was generated a moment " +
        "ago; open the report to see it, and generate again if you still need a newer one.",
      { rule: "weekly_reports_one_per_version", context },
    ),

  weekly_reports_one_superseding_row: (context) =>
    new Conflict(
      "Another version already supersedes that one. A report has a single line of versions, " +
        "so open the current report and generate again from there.",
      { rule: "weekly_reports_one_superseding_row", context },
    ),

  weekly_reports_first_version_supersedes_nothing: (context) =>
    new ConstraintViolated(
      "The first version of a report supersedes nothing, and every later version supersedes " +
        "exactly one.",
      { rule: "weekly_reports_first_version_supersedes_nothing", context },
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
