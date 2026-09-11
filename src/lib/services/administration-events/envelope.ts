import { CAPABILITY_KEYS, type CapabilityKey } from "@/lib/auth/capabilities";
import { ConstraintViolated, InvalidTransition, NotPermitted } from "@/lib/db/errors";
import {
  administrationEvent,
  type AdministrationAction,
  type AdministrationEventDefinition,
  type AdministrationEventFamily,
} from "./vocabulary";

/**
 * The envelope stored under `context.administration`, and the checks that
 * build one from a caller's record — LAN-130. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */

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
type AdministrationAuthority =
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
interface AdministrationTarget {
  /** The durable Person. Always present — it is what Operator audit history keys on. */
  readonly personId: string;
  /** The operator account, where the event concerns the login rather than a role. */
  readonly operatorAccountId?: string | null;
}

/** The role and assignment a role-related event concerns. */
interface AdministrationRoleSubject {
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
interface AdministrationEnvelope {
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
