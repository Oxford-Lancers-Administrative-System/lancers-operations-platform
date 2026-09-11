// The five operator states, derived (not stored) from account facts — LAN-131, `REQ-invitation-states`, `DEC-administration-language-and-states`. Pure: no database.
// Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md

export const OPERATOR_ACCOUNT_STATES = Object.freeze([
  "invitation_pending",
  "delivery_failed",
  "active",
  "deactivated",
  "email_change_pending",
] as const);

export type OperatorAccountState = (typeof OPERATOR_ACCOUNT_STATES)[number];

/** What one state is called and means, in the club's words (`REQ-capability-copy-consistency`). */
export interface OperatorAccountStateDefinition {
  readonly state: OperatorAccountState;
  readonly label: string;
  readonly description: string;
  readonly usable: boolean;
  /** Is a resend offered — `REQ-invitation-states`: pending or failed only. */
  readonly resendAvailable: boolean;
}

function state(entry: OperatorAccountStateDefinition): OperatorAccountStateDefinition {
  return Object.freeze(entry);
}

export const OPERATOR_ACCOUNT_STATE_DEFINITIONS: Readonly<
  Record<OperatorAccountState, OperatorAccountStateDefinition>
> = Object.freeze({
  invitation_pending: state({
    state: "invitation_pending",
    label: "Invitation pending",
    description:
      "The invitation has been sent and has not been taken up yet. Invitation links expire " +
      "after a short time, which is normal — resend it whenever they are ready.",
    usable: false,
    resendAvailable: true,
  }),
  delivery_failed: state({
    state: "delivery_failed",
    label: "Delivery failed",
    description:
      "The invitation could not be delivered to that address. Check the address, correct it " +
      "if it is wrong, and send it again. The person's record and this login are unchanged.",
    usable: false,
    resendAvailable: true,
  }),
  active: state({
    state: "active",
    label: "Active",
    description: "This person has set up their sign-in and can use the roles they hold.",
    usable: true,
    resendAvailable: false,
  }),
  deactivated: state({
    state: "deactivated",
    label: "Deactivated",
    description:
      "This person cannot sign in. The roles they hold are unchanged — deactivating access " +
      "does not end a role or leave a seat vacant.",
    usable: false,
    resendAvailable: false,
  }),
  email_change_pending: state({
    state: "email_change_pending",
    label: "Email change pending",
    description:
      "A replacement email address has been sent a verification link. The old sign-in has " +
      "been disabled, and this person cannot sign in until they confirm the new address.",
    usable: false,
    resendAvailable: false,
  }),
});

export interface OperatorAccountStateInput {
  readonly isActive: boolean;
  readonly activatedAt: Date | string | null;
  readonly invitationDeliveryFailedAt: Date | string | null;
  /** `REQ-rehome-email`'s state; this package's callers pass `false`. */
  readonly emailChangePending?: boolean;
}

/** Which of the five this account is in. Total: every input yields a state. */
export function deriveOperatorAccountState(input: OperatorAccountStateInput): OperatorAccountState {
  if (!input.isActive) return "deactivated";
  if (input.emailChangePending === true) return "email_change_pending";
  if (input.activatedAt !== null && input.activatedAt !== undefined) return "active";
  if (input.invitationDeliveryFailedAt !== null && input.invitationDeliveryFailedAt !== undefined) {
    return "delivery_failed";
  }
  return "invitation_pending";
}

/** The definition for a state. Never throws — the union is closed. */
export function operatorAccountState(value: OperatorAccountState): OperatorAccountStateDefinition {
  return OPERATOR_ACCOUNT_STATE_DEFINITIONS[value];
}

/** A narrowing check, so a stored or posted string never passes untested. */
export function isOperatorAccountState(value: unknown): value is OperatorAccountState {
  return (
    typeof value === "string" && (OPERATOR_ACCOUNT_STATES as readonly string[]).includes(value)
  );
}
