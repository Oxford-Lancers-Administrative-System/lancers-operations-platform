/**
 * The closed set of administration events, and the rules each carries —
 * LAN-130, `REQ-append-only-audit-evidence`. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */

export const ADMINISTRATION_EVENT_FAMILIES = Object.freeze([
  "provisioning",
  "account_state",
  "email_recovery",
  "role_assignment",
] as const); // recorded on the event so a projection groups without parsing the action string

export type AdministrationEventFamily = (typeof ADMINISTRATION_EVENT_FAMILIES)[number];

// creation: no prior state, only an "after". transition: fromState/toState both required and must
// differ — a no-op transition is refused. attempt: states optional, "no change" is the normal outcome.
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
  readonly roleRelated: boolean; // whether the event names a role — the only thing separating the two projections
  readonly reasonRequired: boolean;
  readonly selfActionForbidden: boolean; // REQ-final-admin-protection's second line — see relocations.md
  readonly selfAuthorityAllowed: boolean; // true only for first-login activation
  readonly instantOrder: number; // causal tie-break among events sharing one instant; lower happens first
  readonly label: string; // club-facing description, for the two history surfaces
}

function definition(entry: AdministrationEventDefinition): AdministrationEventDefinition {
  return Object.freeze(entry);
}

// The closed set, with the rules each member carries. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
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
  "administration.operator.email_rehome_retried": definition({
    // a second or later verification link, on an account already held in Email change pending (LAN-132, REQ-rehome-email)
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

// Derived from roleRelated, never hand-listed, so the two can never disagree.
export const ROLE_RELATED_ADMINISTRATION_ACTIONS: readonly AdministrationAction[] = Object.freeze(
  ADMINISTRATION_ACTIONS.filter((action) => ADMINISTRATION_EVENTS[action].roleRelated),
);

export function isAdministrationAction(value: unknown): value is AdministrationAction {
  return typeof value === "string" && (ADMINISTRATION_ACTIONS as readonly string[]).includes(value);
}

/** The definition for an action, or `undefined` if it is not one of ours. */
export function administrationEvent(action: string): AdministrationEventDefinition | undefined {
  return isAdministrationAction(action) ? ADMINISTRATION_EVENTS[action] : undefined;
}
