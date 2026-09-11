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

export const ADMINISTRATION_CONTEXT_KEY = "administration";

export const ADMINISTRATION_ENVELOPE_VERSION = 1; // bumped when the envelope's shape changes

// The authority the actor held at the time — a role assignment that ended last month must still
// explain why the person who made it was allowed to. roleCodes is copied from resolveOperator(),
// not re-derived later (which would answer a different question).
type AdministrationAuthority =
  | {
      readonly kind: "capability";
      readonly capability: CapabilityKey; // the capability the action was permitted under
      readonly roleCodes: readonly string[];
    }
  | {
      readonly kind: "self"; // the account holder acting on their own account — first login only
      readonly roleCodes: readonly string[];
    };

// scope mirrors role_assignments.scope (D8). Account-state/recovery events carry the active
// committee-year context (REQ-append-only-audit-evidence, DEC-active-operating-year).
export interface AdministrationOperatingYear {
  readonly scope: "committee_year" | "season";
  readonly id: string;
  readonly label: string; // club-facing, e.g. "2026-27"; stored so history stays readable
}

/** Who the event is about. */
interface AdministrationTarget {
  readonly personId: string; // the durable Person — always present, what Operator audit history keys on
  readonly operatorAccountId?: string | null; // where the event concerns the login rather than a role
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
  readonly actorPersonId: string; // people.id, from resolveOperator()
  readonly authority: AdministrationAuthority;
  readonly target: AdministrationTarget;
  readonly role?: AdministrationRoleSubject | null; // required for role_assignment events, refused on every other family
  readonly operatingYear: AdministrationOperatingYear;
  readonly fromState?: string | null; // required by transition, refused by creation
  readonly toState?: string | null; // required by creation and transition
  readonly reason?: string | null; // required where the approved requirement requires it
  readonly backdated?: boolean; // REQ-effective-dated-role-history: audited backdating carries a reason like an ending one does
  readonly correlationId?: string | null; // links the two events one action necessarily produced (a replacement's pair) — never two rows for one fact
  readonly detail?: Record<string, unknown>; // must be a JSON object; never a second copy of the above
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

// The polymorphic entity pointer means what it means elsewhere: the row the event is *about*. A
// role event is about the assignment; every other event is about the operator account. The target
// Person lives in the envelope because it's a second key, not the subject.
const ENTITY_TABLES: Readonly<Record<AdministrationEventFamily, string>> = Object.freeze({
  provisioning: "public.operator_accounts",
  account_state: "public.operator_accounts",
  email_recovery: "public.operator_accounts",
  role_assignment: "public.role_assignments",
});

export const NO_CHANGE_RULE = "administration_no_change_not_recorded"; // exported so a caller matches on the rule, not message text

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// Checks a proposed record against the vocabulary and returns what the writer needs, or refuses.
// Pure, separated from the writing so every rule is provable without a database. Everything is
// refused before a row exists — there is no partial write to undo.
export function prepareAdministrationEvent(
  record: AdministrationEventRecord,
): PreparedAdministrationEvent {
  const definition = administrationEvent(record.action);
  if (!definition) {
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

  // REQ-final-admin-protection, as a second line behind the service that refuses the action
  // itself — a self-action is not refusable-and-audited, it simply may not exist.
  if (definition.selfActionForbidden && record.actorPersonId === record.target.personId) {
    throw new NotPermitted(
      `${definition.label} cannot be performed by the operator on themselves.`,
      { rule: "administration_self_action_forbidden" },
    );
  }

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

  const role: AdministrationRoleSubject | null = record.role ?? null;
  if (definition.roleRelated) {
    if (role === null || !isUuid(role.id) || blank(role.code) || !isUuid(role.assignmentId)) {
      refuse(
        `${definition.label} must name the role and the assignment it affects.`,
        "administration_role_required",
      );
    }
  } else if (role !== null) {
    // a role on an account-state event would put it into Holder history, where it does not belong
    refuse(
      `${definition.label} does not concern a role assignment and must not name one.`,
      "administration_role_not_permitted",
    );
  }

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
      // invalid_transition, not constraint_violated: the record is well-formed and legal to
      // attempt, but the target was already where it would move to — see relocations.md.
      throw new InvalidTransition(
        `${definition.label} changed nothing — the state was already "${toState}" — so there ` +
          "is nothing to record.",
        { rule: NO_CHANGE_RULE },
      );
    }
  }

  const reason = trimmedOrNull(record.reason);
  const backdated = record.backdated === true;
  if (definition.reasonRequired && reason === null) {
    refuse(`${definition.label} requires a reason.`, "administration_reason_required");
  }
  if (backdated && reason === null) {
    refuse(
      "A backdated assignment requires a reason.",
      "administration_backdating_reason_required",
    );
  }

  // audit_events_context_is_object refuses a non-object context at the database; refusing here
  // gives the caller a sentence, and an array detail can't corrupt the shape a projection parses.
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
