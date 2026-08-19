/**
 * The five operator states, and the one function that decides which one an
 * account is in — LAN-131, mission M-OPERATOR-ADMIN-WITHOUT-SQL,
 * `REQ-invitation-states` and `DEC-administration-language-and-states`.
 *
 * Pure. No database, no `server-only`, no framework, exactly as
 * `./administration-events.ts` is pure, and for the same reason: a state
 * machine that can only be exercised against a live stack is a state machine
 * nobody exercises. Every case below, including the ones that need three facts
 * to be true at once, is reachable from a plain object in a test.
 *
 * ## Why the states are derived rather than stored
 *
 * `operator_accounts` stores facts — deactivated on this date, invitation
 * issued at this time, credentials established at that one, last delivery
 * attempt failed for this reason. The five club-facing states are a *reading*
 * of those facts, and there is exactly one reading, here.
 *
 * A stored `state` column would be a sixth fact that can disagree with the
 * other five. It would need updating on every path that touches any of them —
 * including reinstatement, which `REQ-invitation-states` says "returns the same
 * operator to Active", and which is already implemented as `is_active = true`
 * on the row that was deactivated. Deriving means reinstatement cannot forget.
 *
 * ## The order of the tests is the design
 *
 * They are not independent conditions with an arbitrary tie-break. An account
 * can satisfy several at once — a deactivated account whose invitation never
 * arrived is both — and the order below says which one the club is told about,
 * strongest constraint first:
 *
 *   1. **Deactivated** wins over everything. `REQ-deactivate-and-reinstate`:
 *      deactivation "prevents sign-in", whatever else is true of the account.
 *      Showing "Invitation pending" for an account nobody can sign into would
 *      invite an administrator to resend an invitation that cannot work.
 *   2. **Email change pending** next. The holder had credentials and cannot
 *      currently use them (`REQ-rehome-email`: the administrator "disables the
 *      old login path" and the account stays in this state until verification),
 *      so it outranks Active.
 *   3. **Active** — credentials established, account usable.
 *   4. **Delivery failed** — no credentials yet, and the last attempt to
 *      deliver the invitation is known to have failed.
 *   5. **Invitation pending** — no credentials yet, nothing known to be wrong.
 *      The default, and deliberately the default: an account this module cannot
 *      otherwise classify is one nobody has signed into.
 *
 * ## What `emailChangePending` is, and why it is an argument
 *
 * `REQ-rehome-email` is not this work package's requirement — the
 * administrator-driven email re-home flow, its verification link and the
 * state's storage belong to the package that implements it. But
 * `REQ-invitation-states` names all five states as one vocabulary, and a state
 * union missing one of them would force that package to invent a sixth name or
 * to fork this function.
 *
 * So the state is in the union and its input is an explicit argument, supplied
 * by the caller that knows. Today the only caller passes `false`, because
 * nothing yet starts a re-home; the seam is a named parameter rather than a
 * column this package guessed the shape of.
 */

/** The five states, as `DEC-administration-language-and-states` names them. */
export const OPERATOR_ACCOUNT_STATES = Object.freeze([
  "invitation_pending",
  "delivery_failed",
  "active",
  "deactivated",
  "email_change_pending",
] as const);

export type OperatorAccountState = (typeof OPERATOR_ACCOUNT_STATES)[number];

/**
 * What one state is called and means, in the club's words.
 *
 * The copy lives here rather than in a component for the reason
 * `REQ-capability-copy-consistency` gives about capability descriptions: two
 * screens showing the same state must not be able to describe it differently,
 * and a refusal that quotes a state must quote the same words the badge shows.
 * `WP-surfaces` chooses the visual treatment; the words are not its to choose.
 */
export interface OperatorAccountStateDefinition {
  readonly state: OperatorAccountState;
  /** The badge. Sentence case, club language, never a technical term. */
  readonly label: string;
  /** One sentence saying what is true of the account, for the detail surface. */
  readonly description: string;
  /** Can this operator sign in and act today? */
  readonly usable: boolean;
  /**
   * Is a resend offered? `REQ-invitation-states`: "exposes resend while pending
   * or failed". Derived by nobody else — a screen asking "is the state one of
   * these two?" would be a second copy of this rule.
   */
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

/** The stored facts this module reads. Exactly the columns, and nothing else. */
export interface OperatorAccountStateInput {
  readonly isActive: boolean;
  readonly activatedAt: Date | string | null;
  readonly invitationDeliveryFailedAt: Date | string | null;
  /**
   * `REQ-rehome-email`'s state, supplied by whoever owns it. See the module
   * note — this package's callers pass `false`.
   */
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
