/**
 * The closed set of administration events, and the rules each carries —
 * LAN-130, `REQ-append-only-audit-evidence`. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */

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
 *     prior state to name, and there is an "after".
 *
 *   * `transition` — the target moved between two named states. **Both are
 *     required and they must differ.** A deactivation of an already
 *     deactivated account has nothing to record, and the writer refuses it
 *     rather than writing a row asserting a change that did not happen.
 *
 *   * `attempt` — something was tried against an unchanged state: a resend, a
 *     correction, a delivery failure that leaves the account exactly where it
 *     was. States are optional and are not compared, because "no change" is
 *     the normal and correct outcome.
 */
type AdministrationEventShape = "creation" | "transition" | "attempt";

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
   * cannot reach the ledger even if a caller forgets. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
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
   * above the lower one. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
   */
  readonly instantOrder: number;
  /** Club-facing description, for the two history surfaces. */
  readonly label: string;
}

function definition(entry: AdministrationEventDefinition): AdministrationEventDefinition {
  return Object.freeze(entry);
}

/**
 * The closed set, with the rules each member carries. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
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
   * change pending — LAN-132, `REQ-rehome-email`. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
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
