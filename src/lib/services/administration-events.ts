/**
 * The canonical administration event vocabulary — LAN-130, mission
 * M-OPERATOR-ADMIN-WITHOUT-SQL, `REQ-append-only-audit-evidence`.
 *
 * Pure. No database, no `server-only`, no framework. It is the closed set of
 * things operator administration can record, the envelope those records carry,
 * and the rules that decide whether a proposed record is one of them. The
 * writing and the reading live in `./administration-audit.ts`; this module is
 * what both of them — and any screen that renders an entry — agree on.
 *
 * ## The one property everything here exists to protect
 *
 * **One event, two projections, no duplicate records.** Operator audit history
 * and Holder history are two *readings* of a single `public.audit_events`
 * stream, not two streams. A role assignment appears in both because it names
 * both a target Person and a role — not because it was written twice. Writing
 * the same fact twice so that two screens can each read it easily is precisely
 * the reconciliation problem register D9 refuses, and it is the failure this
 * vocabulary is shaped to make impossible: there is one writer, it writes one
 * row, and the projections differ only in which key they filter on.
 *
 * That is why the envelope below carries `targetPersonId` *and* `roleId` on the
 * same record rather than splitting them across two record types. The row is
 * indexed for both readings from the start.
 *
 * ## Why the envelope lives in `context`
 *
 * `public.audit_events` predates this mission
 * (`20260810121000_domain_reporting.sql`). It already carries actor, action, a
 * deliberately polymorphic entity pointer, before/after state, reason,
 * timestamp and a `jsonb` `context` constrained to an object. Four of the
 * fields `REQ-append-only-audit-evidence` names have no column of their own —
 * authority at the time, the target Person when it is not the entity, the
 * affected role, and the operating year — and `context` is the column that
 * exists for exactly that. Nothing here changes the schema, and this package
 * deliberately owns no migration.
 *
 * The envelope is versioned (`ADMINISTRATION_ENVELOPE_VERSION`) so that a later
 * shape change is detectable in stored rows rather than silently ambiguous.
 *
 * ## What is deliberately absent
 *
 *   * **No view action.** Ordinary page views are excluded by the requirement,
 *     and the enforcement is that the vocabulary contains no term for one. An
 *     unknown action is refused by `prepareAdministrationEvent`, so "audit the
 *     page view" cannot be done by passing a string.
 *
 *   * **No update and no delete.** Append-only is not a convention here. There
 *     is no term for amending or retracting an event, `service_role` holds only
 *     `select, insert` on the table, and a correction is a new event.
 *
 *   * **No general audit browser.** The Stage-4 cross-system search, filter,
 *     export and investigation surface stays out of scope. The two projections
 *     are keyed reads of one target or one role; neither takes a free-text
 *     query, a date range or an entity type.
 */

import { CAPABILITY_KEYS, type CapabilityKey } from "@/lib/auth/capabilities";
import { ConstraintViolated, InvalidTransition, NotPermitted } from "@/lib/db/errors";

/**
 * The four kinds of change `REQ-append-only-audit-evidence` names.
 *
 * They are recorded on the event so a projection can group without parsing the
 * action string, and so that adding a fifth family is a visible decision rather
 * than a new prefix somebody invents at a call site.
 */
export const ADMINISTRATION_EVENT_FAMILIES = Object.freeze([
  "provisioning",
  "account_state",
  "email_recovery",
  "role_assignment",
] as const);

export type AdministrationEventFamily = (typeof ADMINISTRATION_EVENT_FAMILIES)[number];

/**
 * How an action relates to the target's state, and therefore what the writer
 * demands of `fromState` and `toState`.
 *
 *   * `creation` — the thing being recorded did not exist before. There is no
 *     prior state to name, and there is an "after". Inviting an operator and
 *     assigning a role are creations.
 *
 *   * `transition` — the target moved between two named states. **Both are
 *     required and they must differ.** This is where "refused no-change actions
 *     are excluded" stops being a convention: a deactivation of an already
 *     deactivated account has nothing to record, and the writer refuses it
 *     rather than writing a row asserting a change that did not happen.
 *
 *   * `attempt` — something was tried against an unchanged state: a resend, a
 *     correction, a delivery failure that leaves the account exactly where it
 *     was. States are optional and are not compared, because "no change" is the
 *     normal and correct outcome. An attempt is written only when it actually
 *     happened; a refused one never reaches the writer, and — unlike a
 *     transition — that is a caller obligation this module cannot check for it.
 */
export type AdministrationEventShape = "creation" | "transition" | "attempt";

/** Every administration action, in the order the families are listed above. */
export const ADMINISTRATION_ACTIONS = Object.freeze([
  "administration.operator.invited",
  "administration.operator.invitation_resent",
  "administration.operator.invitation_corrected",
  "administration.operator.invitation_delivery_failed",
  "administration.operator.activated",
  "administration.operator.deactivated",
  "administration.operator.restored",
  "administration.operator.email_rehome_started",
  "administration.operator.email_rehome_retried",
  "administration.operator.email_rehome_verified",
  "administration.operator.email_rehome_failed",
  "administration.role.assigned",
  "administration.role.ended",
] as const);

export type AdministrationAction = (typeof ADMINISTRATION_ACTIONS)[number];

/** What one action is, and what the writer demands of a record carrying it. */
export interface AdministrationEventDefinition {
  readonly action: AdministrationAction;
  readonly family: AdministrationEventFamily;
  readonly shape: AdministrationEventShape;
  /**
   * Whether the event names a role, and therefore whether it is part of the
   * role-related subset Holder history reads.
   *
   * This is the only thing that separates the two projections. It is a property
   * of the event, not of a second copy of it.
   */
  readonly roleRelated: boolean;
  /** A reason is required by the approved requirement for this action. */
  readonly reasonRequired: boolean;
  /**
   * `REQ-final-admin-protection`: nobody may deactivate themselves, end their
   * own role assignment, or use the administrator recovery flow on themselves.
   *
   * The service that performs the action is the primary boundary and refuses it
   * before anything is written. This flag is the second line: an event naming
   * the same person as actor and target is refused here too, so a self-action
   * cannot reach the ledger even if a caller forgets. Self-*assignment* is
   * deliberately not on this list — an administrator holding `role_management`
   * can already grant themselves a seat, a consequence Brian recorded when he
   * took that decision, and pretending otherwise here would be theatre.
   */
  readonly selfActionForbidden: boolean;
  /**
   * Whether the target may act on their own account without an administrative
   * capability. True only for first-login activation, where the person
   * establishing their credentials is the account holder and holds no
   * administrative authority at all.
   */
  readonly selfAuthorityAllowed: boolean;
  /**
   * Causal position among administration events that share one instant. Lower
   * happens first; a projection ordering newest-first renders the higher one
   * above the lower one.
   *
   * `audit_events.occurred_at` defaults to `now()`, which is **transaction**
   * time, not statement time. Two events written in one transaction therefore
   * carry an identical timestamp, and a projection ordered on that column alone
   * falls through to an arbitrary tie-break — which is not a cosmetic problem
   * for a replacement: it renders the successor's assignment and the outgoing
   * holder's ending in a random order, half of them implying that the successor
   * was appointed before the seat was vacated.
   *
   * Two pairs are written in one transaction, and both are covered by one rule:
   * **an assignment begins only after the account it hangs off exists, and only
   * after any outgoing assignment has ended.** So a role assignment beginning
   * sorts last within an instant, and everything else shares position 0 —
   * `role.ended` before `role.assigned` in a replacement, and
   * `operator.invited` before `role.assigned` in an invitation that carries an
   * initial role.
   *
   * A later package that writes two events in one transaction whose order
   * matters, and which this rule does not already separate, declares its
   * position here. Events that genuinely happen at once — two holders assigned
   * to one non-Office seat — share a position and fall back to a stable but
   * arbitrary tie-break, which is the honest answer for facts with no order
   * between them.
   */
  readonly instantOrder: number;
  /** Club-facing description, for the two history surfaces. */
  readonly label: string;
}

function definition(entry: AdministrationEventDefinition): AdministrationEventDefinition {
  return Object.freeze(entry);
}

/**
 * The closed set, with the rules each member carries.
 *
 * Two modelling choices worth naming, because a reviewer should be able to
 * disagree with them explicitly rather than discover them:
 *
 *   * **Creating the Person is not a separate event.** `REQ-invite-existing-person`
 *     makes duplicate-checked create-or-link part of one guided invitation. One
 *     administrator action, one event; whether the Person was created or linked
 *     is `detail`, not a second row. A second row would be the first duplicate.
 *
 *   * **Replacing a role holder is two events, not three.** `REQ-effective-dated-role-history`
 *     says replacement ends the outgoing assignment and creates the successor
 *     "without rewriting history" — two assignment rows change, so two events
 *     are written, one `role.ended` and one `role.assigned`, sharing a
 *     `correlationId`. There is deliberately no `role.replaced` action: it would
 *     record for a third time facts the other two already carry, which is the
 *     duplication this package exists to prevent. Holder history renders a
 *     correlated pair as a replacement.
 */
export const ADMINISTRATION_EVENTS: Readonly<
  Record<AdministrationAction, AdministrationEventDefinition>
> = Object.freeze({
  "administration.operator.invited": definition({
    action: "administration.operator.invited",
    family: "provisioning",
    shape: "creation",
    roleRelated: false,
    reasonRequired: false,
    selfActionForbidden: false,
    selfAuthorityAllowed: false,
    instantOrder: 0,
    label: "Operator invited",
  }),
  "administration.operator.invitation_resent": definition({
    action: "administration.operator.invitation_resent",
    family: "provisioning",
    shape: "attempt",
    roleRelated: false,
    reasonRequired: false,
    selfActionForbidden: false,
    selfAuthorityAllowed: false,
    instantOrder: 0,
    label: "Invitation resent",
  }),
  "administration.operator.invitation_corrected": definition({
    action: "administration.operator.invitation_corrected",
    family: "provisioning",
    shape: "attempt",
    roleRelated: false,
    reasonRequired: false,
    selfActionForbidden: false,
    selfAuthorityAllowed: false,
    instantOrder: 0,
    label: "Invitation corrected and resent",
  }),
  "administration.operator.invitation_delivery_failed": definition({
    action: "administration.operator.invitation_delivery_failed",
    family: "provisioning",
    shape: "transition",
    roleRelated: false,
    reasonRequired: false,
    selfActionForbidden: false,
    selfAuthorityAllowed: false,
    instantOrder: 0,
    label: "Invitation delivery failed",
  }),
  "administration.operator.activated": definition({
    action: "administration.operator.activated",
    family: "account_state",
    shape: "transition",
    roleRelated: false,
    reasonRequired: false,
    selfActionForbidden: false,
    selfAuthorityAllowed: true,
    instantOrder: 0,
    label: "Operator activated their account",
  }),
  "administration.operator.deactivated": definition({
    action: "administration.operator.deactivated",
    family: "account_state",
    shape: "transition",
    roleRelated: false,
    reasonRequired: true,
    selfActionForbidden: true,
    selfAuthorityAllowed: false,
    instantOrder: 0,
    label: "Operator access deactivated",
  }),
  "administration.operator.restored": definition({
    action: "administration.operator.restored",
    family: "account_state",
    shape: "transition",
    roleRelated: false,
    reasonRequired: false,
    selfActionForbidden: false,
    selfAuthorityAllowed: false,
    instantOrder: 0,
    label: "Operator access restored",
  }),
  "administration.operator.email_rehome_started": definition({
    action: "administration.operator.email_rehome_started",
    family: "email_recovery",
    shape: "transition",
    roleRelated: false,
    reasonRequired: true,
    selfActionForbidden: true,
    selfAuthorityAllowed: false,
    instantOrder: 0,
    label: "Email access recovery started",
  }),
  /**
   * A second or later verification link, on an account already held in Email
   * change pending — LAN-132, `REQ-rehome-email`: "Failure is correctable and
   * retryable on the same account."
   *
   * It exists because a retry genuinely is not a transition. The account was
   * pending before it and is pending after it, and
   * `prepareAdministrationEvent` refuses a transition whose before and after
   * are the same — correctly, because a row saying the state changed from
   * `email_change_pending` to `email_change_pending` is a record of nothing.
   * What *did* change is the address the link went to, which is on the detail,
   * exactly as `invitation_corrected` carries it.
   *
   * `attempt`, therefore, and for the same reason `invitation_resent` and
   * `invitation_corrected` are: a thing that was tried, against an account
   * whose state it did not move.
   *
   * `instantOrder` is 0. It shares its instant with nothing — one retry is one
   * event in one transaction — and 0 is the position everything that is not an
   * assignment beginning already holds.
   */
  "administration.operator.email_rehome_retried": definition({
    action: "administration.operator.email_rehome_retried",
    family: "email_recovery",
    shape: "attempt",
    roleRelated: false,
    reasonRequired: true,
    selfActionForbidden: true,
    selfAuthorityAllowed: false,
    instantOrder: 0,
    label: "Email access recovery retried",
  }),
  "administration.operator.email_rehome_verified": definition({
    action: "administration.operator.email_rehome_verified",
    family: "email_recovery",
    shape: "transition",
    roleRelated: false,
    reasonRequired: false,
    selfActionForbidden: false,
    selfAuthorityAllowed: true,
    instantOrder: 0,
    label: "Replacement email verified",
  }),
  "administration.operator.email_rehome_failed": definition({
    action: "administration.operator.email_rehome_failed",
    family: "email_recovery",
    shape: "attempt",
    roleRelated: false,
    reasonRequired: false,
    selfActionForbidden: false,
    selfAuthorityAllowed: false,
    instantOrder: 0,
    label: "Email access recovery attempt failed",
  }),
  "administration.role.assigned": definition({
    action: "administration.role.assigned",
    family: "role_assignment",
    shape: "creation",
    roleRelated: true,
    reasonRequired: false,
    selfActionForbidden: false,
    selfAuthorityAllowed: false,
    instantOrder: 1,
    label: "Role assigned",
  }),
  "administration.role.ended": definition({
    action: "administration.role.ended",
    family: "role_assignment",
    shape: "transition",
    roleRelated: true,
    reasonRequired: true,
    selfActionForbidden: true,
    selfAuthorityAllowed: false,
    instantOrder: 0,
    label: "Role assignment ended",
  }),
});

/**
 * The role-related subset — the actions Holder history reads.
 *
 * Derived from `roleRelated`, never hand-listed, so the two can never disagree.
 */
export const ROLE_RELATED_ADMINISTRATION_ACTIONS: readonly AdministrationAction[] = Object.freeze(
  ADMINISTRATION_ACTIONS.filter((action) => ADMINISTRATION_EVENTS[action].roleRelated),
);

/** A narrowing check, so a stored or posted string never passes untested. */
export function isAdministrationAction(value: unknown): value is AdministrationAction {
  return typeof value === "string" && (ADMINISTRATION_ACTIONS as readonly string[]).includes(value);
}

/** The definition for an action, or `undefined` if it is not one of ours. */
export function administrationEvent(action: string): AdministrationEventDefinition | undefined {
  return isAdministrationAction(action) ? ADMINISTRATION_EVENTS[action] : undefined;
}

// ---------------------------------------------------------------------------
// The envelope
// ---------------------------------------------------------------------------

/** The `audit_events.context` key this mission's events reserve. */
export const ADMINISTRATION_CONTEXT_KEY = "administration";

/** Bumped when the envelope's shape changes. Stored on every event. */
export const ADMINISTRATION_ENVELOPE_VERSION = 1;

/**
 * The authority the actor held **at the time**, which is the point: a role
 * assignment that ended last month must still explain why the person who made
 * it was allowed to.
 *
 * `roleCodes` is the actor's currently-effective `roles.code` set as
 * `resolveOperator()` reported it, copied rather than referenced — re-deriving
 * it later would answer a different question.
 */
export type AdministrationAuthority =
  | {
      readonly kind: "capability";
      /** The capability the action was permitted under. */
      readonly capability: CapabilityKey;
      readonly roleCodes: readonly string[];
    }
  | {
      /** The account holder acting on their own account. First login only. */
      readonly kind: "self";
      readonly roleCodes: readonly string[];
    };

/**
 * The operating year the administrator was working in.
 *
 * `scope` mirrors `public.role_assignments.scope`: a committee seat hangs off a
 * committee year, a coaching seat off a season (register D8). Account-state and
 * recovery events carry the active committee-year context they were performed
 * under, because `REQ-append-only-audit-evidence` names operating year on every
 * event and `DEC-active-operating-year` says there is always exactly one.
 */
export interface AdministrationOperatingYear {
  readonly scope: "committee_year" | "season";
  readonly id: string;
  /** Club-facing, e.g. "2026-27". Stored so history stays readable. */
  readonly label: string;
}

/** Who the event is about. */
export interface AdministrationTarget {
  /** The durable Person. Always present — it is what Operator audit history keys on. */
  readonly personId: string;
  /** The operator account, where the event concerns the login rather than a role. */
  readonly operatorAccountId?: string | null;
}

/** The role and assignment a role-related event concerns. */
export interface AdministrationRoleSubject {
  readonly id: string;
  readonly code: string;
  readonly assignmentId: string;
}

/** What a caller hands the writer. */
export interface AdministrationEventRecord {
  readonly action: AdministrationAction;
  /** `people.id` of the operator responsible, from `resolveOperator()`. */
  readonly actorPersonId: string;
  readonly authority: AdministrationAuthority;
  readonly target: AdministrationTarget;
  /** Required for `role_assignment` events, refused on every other family. */
  readonly role?: AdministrationRoleSubject | null;
  readonly operatingYear: AdministrationOperatingYear;
  /** State before. Required by `transition`, refused by `creation`. */
  readonly fromState?: string | null;
  /** State after. Required by `creation` and `transition`. */
  readonly toState?: string | null;
  /** Why. Required where the approved requirement requires it. */
  readonly reason?: string | null;
  /**
   * An assignment dated before today. `REQ-effective-dated-role-history` permits
   * backdating but calls it *audited* backdating, so a backdated assignment
   * carries a reason like an ending one does.
   */
  readonly backdated?: boolean;
  /**
   * Links the two events one administrator action necessarily produced — the
   * `role.ended` and `role.assigned` pair of a replacement. Never used to make
   * one fact into two rows.
   */
  readonly correlationId?: string | null;
  /** Action-specific detail. Must be a JSON object; never a second copy of the above. */
  readonly detail?: Record<string, unknown>;
}

/** The envelope as it is stored under `context.administration`. */
export interface AdministrationEnvelope {
  readonly version: number;
  readonly targetPersonId: string;
  readonly targetOperatorAccountId: string | null;
  readonly roleId: string | null;
  readonly roleCode: string | null;
  readonly roleAssignmentId: string | null;
  readonly operatingYear: AdministrationOperatingYear;
  readonly authority: {
    kind: "capability" | "self";
    capability: string | null;
    roleCodes: string[];
  };
  readonly correlationId: string | null;
  readonly backdated: boolean;
  readonly detail: Record<string, unknown>;
}

/** What the writer needs, once the record has been checked. */
export interface PreparedAdministrationEvent {
  readonly action: AdministrationAction;
  readonly definition: AdministrationEventDefinition;
  readonly actorPersonId: string;
  readonly entityTable: string;
  readonly entityId: string;
  readonly fromState: string | null;
  readonly toState: string | null;
  readonly reason: string | null;
  readonly envelope: AdministrationEnvelope;
}

/**
 * `entity_table` for each family.
 *
 * The polymorphic entity pointer keeps meaning what it already meant elsewhere
 * in the ledger: the row the event is *about*. A role event is about the
 * assignment; every other administration event is about the operator account.
 * The target Person is in the envelope precisely because it is a second key,
 * not the subject.
 */
const ENTITY_TABLES: Readonly<Record<AdministrationEventFamily, string>> = Object.freeze({
  provisioning: "public.operator_accounts",
  account_state: "public.operator_accounts",
  email_recovery: "public.operator_accounts",
  role_assignment: "public.role_assignments",
});

/**
 * `rule` on the refusal of a transition that would change nothing. Exported so
 * a caller matches on the rule rather than on message text.
 */
export const NO_CHANGE_RULE = "administration_no_change_not_recorded";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a canonical lowercase-or-uppercase UUID. Ids come from the database. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function blank(value: string | null | undefined): boolean {
  return typeof value !== "string" || value.trim() === "";
}

function refuse(message: string, rule: string): never {
  throw new ConstraintViolated(message, { rule });
}

function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Checks a proposed record against the vocabulary and returns what the writer
 * needs, or refuses.
 *
 * Pure, and separated from the writing so that every rule below is provable
 * without a database — and so that the rules are in one readable place rather
 * than distributed through a query builder.
 *
 * Everything it refuses, it refuses *before* a row exists. There is no partial
 * write to undo.
 */
export function prepareAdministrationEvent(
  record: AdministrationEventRecord,
): PreparedAdministrationEvent {
  const definition = administrationEvent(record.action);
  if (!definition) {
    // The closed set is the enforcement of "ordinary page views and refused
    // no-change actions are excluded". There is no term for either, so there is
    // no way to write one.
    refuse(
      `"${String(record.action)}" is not an administration event. The recordable ` +
        "administration actions are a closed set; adding one is a decision, not a call site.",
      "administration_action_unknown",
    );
  }

  if (!isUuid(record.actorPersonId)) {
    refuse(
      "An administration event must name the person who performed it.",
      "administration_actor_required",
    );
  }

  if (!isUuid(record.target?.personId)) {
    refuse(
      "An administration event must name the Person it affects.",
      "administration_target_required",
    );
  }

  // --- authority at the time ------------------------------------------------
  const authority = record.authority;
  if (!authority || (authority.kind !== "capability" && authority.kind !== "self")) {
    refuse(
      "An administration event must record the authority the actor held at the time.",
      "administration_authority_required",
    );
  }

  if (authority.kind === "self") {
    if (!definition.selfAuthorityAllowed) {
      refuse(
        `${definition.label} is an administrative action and must record the capability it ` +
          "was performed under.",
        "administration_authority_required",
      );
    }
    if (!Array.isArray(authority.roleCodes)) {
      refuse(
        "An administration event must record the roles the actor held at the time.",
        "administration_authority_required",
      );
    }
    if (record.actorPersonId !== record.target.personId) {
      refuse(
        "An event recorded as self-service must name the account holder as the actor.",
        "administration_self_authority_mismatch",
      );
    }
  } else {
    if (!(CAPABILITY_KEYS as readonly string[]).includes(authority.capability)) {
      refuse(
        `"${String(authority.capability)}" is not a capability this application defines.`,
        "administration_authority_capability_unknown",
      );
    }
    if (!Array.isArray(authority.roleCodes) || authority.roleCodes.length === 0) {
      refuse(
        "An administration event must record the club roles the actor held when they acted.",
        "administration_authority_roles_required",
      );
    }
    if (authority.roleCodes.some((code) => blank(code))) {
      refuse(
        "An administration event must record the club roles the actor held when they acted.",
        "administration_authority_roles_required",
      );
    }
  }

  // `REQ-final-admin-protection`, as a second line behind the service that
  // refuses the action itself. Deactivating yourself, ending your own role and
  // recovering your own email are not refusable-and-audited; they are simply
  // not permitted, so no such event may exist.
  if (definition.selfActionForbidden && record.actorPersonId === record.target.personId) {
    throw new NotPermitted(
      `${definition.label} cannot be performed by the operator on themselves.`,
      { rule: "administration_self_action_forbidden" },
    );
  }

  // --- operating year -------------------------------------------------------
  const year = record.operatingYear;
  if (
    !year ||
    (year.scope !== "committee_year" && year.scope !== "season") ||
    !isUuid(year.id) ||
    blank(year.label)
  ) {
    refuse(
      "An administration event must record the operating year it was performed in.",
      "administration_operating_year_required",
    );
  }

  // --- the role subject -----------------------------------------------------
  const role: AdministrationRoleSubject | null = record.role ?? null;
  if (definition.roleRelated) {
    if (role === null || !isUuid(role.id) || blank(role.code) || !isUuid(role.assignmentId)) {
      refuse(
        `${definition.label} must name the role and the assignment it affects.`,
        "administration_role_required",
      );
    }
  } else if (role !== null) {
    // A role on an account-state event would put it into Holder history, where
    // it does not belong, and would invite a second "role view" of an event the
    // role projection was never meant to carry.
    refuse(
      `${definition.label} does not concern a role assignment and must not name one.`,
      "administration_role_not_permitted",
    );
  }

  // --- the entity the event is about ---------------------------------------
  const entityTable = ENTITY_TABLES[definition.family];
  const entityId = role === null ? record.target.operatorAccountId : role.assignmentId;
  if (!isUuid(entityId)) {
    refuse(
      definition.roleRelated
        ? `${definition.label} must name the assignment it affects.`
        : `${definition.label} must name the operator account it affects.`,
      "administration_entity_required",
    );
  }

  // --- before and after -----------------------------------------------------
  const fromState = trimmedOrNull(record.fromState);
  const toState = trimmedOrNull(record.toState);

  if (definition.shape === "creation") {
    if (fromState !== null) {
      refuse(
        `${definition.label} creates the thing it describes, so it has no prior state.`,
        "administration_creation_has_no_prior_state",
      );
    }
    if (toState === null) {
      refuse(
        `${definition.label} must record the state it produced.`,
        "administration_state_required",
      );
    }
  } else if (definition.shape === "transition") {
    if (fromState === null || toState === null) {
      refuse(
        `${definition.label} must record the state before and the state after.`,
        "administration_state_required",
      );
    }
    if (fromState === toState) {
      // "Refused no-change actions are excluded" — structurally. A row saying a
      // state changed from `active` to `active` is a record of nothing, and
      // somebody reading the history later would believe it.
      //
      // `invalid_transition` rather than `constraint_violated`, because that is
      // exactly what it is: the record is well-formed and the action was legal
      // to attempt, but the target was already where it would have moved to. A
      // caller discriminating on `kind` can tell "that had already happened"
      // from "you built the record wrongly".
      throw new InvalidTransition(
        `${definition.label} changed nothing — the state was already "${toState}" — so there ` +
          "is nothing to record.",
        { rule: NO_CHANGE_RULE },
      );
    }
  }

  // --- reason ---------------------------------------------------------------
  const reason = trimmedOrNull(record.reason);
  const backdated = record.backdated === true;
  if (definition.reasonRequired && reason === null) {
    refuse(`${definition.label} requires a reason.`, "administration_reason_required");
  }
  if (backdated && reason === null) {
    // `REQ-effective-dated-role-history`: backdating is permitted, and audited.
    // An audited backdating with no reason is just a backdating.
    refuse(
      "A backdated assignment requires a reason.",
      "administration_backdating_reason_required",
    );
  }

  // --- detail ---------------------------------------------------------------
  // `audit_events_context_is_object` refuses a non-object context at the
  // database. Refusing here means the caller gets a sentence rather than an
  // integrity error, and — since the envelope is nested inside the context —
  // means an array detail cannot corrupt the shape a projection parses.
  const detail: Record<string, unknown> = record.detail ?? {};
  const detailValue: unknown = detail;
  if (typeof detailValue !== "object" || detailValue === null || Array.isArray(detailValue)) {
    refuse(
      "An administration event's detail must be a JSON object.",
      "administration_detail_is_object",
    );
  }

  const correlationId = record.correlationId ?? null;
  if (correlationId !== null && !isUuid(correlationId)) {
    refuse(
      "An administration event's correlation identifier must be a UUID.",
      "administration_correlation_id_invalid",
    );
  }

  const envelope: AdministrationEnvelope = {
    version: ADMINISTRATION_ENVELOPE_VERSION,
    targetPersonId: record.target.personId,
    targetOperatorAccountId: record.target.operatorAccountId ?? null,
    roleId: role?.id ?? null,
    roleCode: role?.code ?? null,
    roleAssignmentId: role?.assignmentId ?? null,
    operatingYear: { scope: year.scope, id: year.id, label: year.label.trim() },
    authority: {
      kind: authority.kind,
      capability: authority.kind === "capability" ? authority.capability : null,
      roleCodes: [...authority.roleCodes],
    },
    correlationId,
    backdated,
    detail: { ...detail },
  };

  return {
    action: definition.action,
    definition,
    actorPersonId: record.actorPersonId,
    entityTable,
    entityId,
    fromState,
    toState,
    reason,
    envelope,
  };
}
