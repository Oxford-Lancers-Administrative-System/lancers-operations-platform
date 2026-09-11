import type { ResolvedOperator } from "@/lib/auth/operator";
import type { OperatorAccountState } from "../operator-account-state";
import type { OperatorIdentityPort } from "../operator-identity";
import type { InitialRoleAssignment, InvitationSubject } from "./shared";

/**
 * What a caller supplies to {@link inviteOperator}, and what it returns.
 * LAN-131, mission M-OPERATOR-ADMIN-WITHOUT-SQL.
 */

export interface InviteOperatorParams {
  /** From `resolveOperatorAccess()`. `null` is refused, not defaulted. */
  readonly operator: ResolvedOperator | null;
  readonly subject: InvitationSubject;
  /** The address the invitation is sent to, and the address they sign in with. */
  readonly email: string;
  readonly roles: readonly InitialRoleAssignment[];
  /** From `invitationCallbackUrl()`. An absolute URL on a trusted origin. */
  readonly callbackUrl: string;
  /** Swapped only by tests. Defaults to the real Supabase Auth port. */
  readonly identity?: OperatorIdentityPort;
}

/** What the invitation produced. */
export interface InviteOperatorResult {
  readonly personId: string;
  readonly operatorAccountId: string;
  readonly authUserId: string;
  readonly loginEmail: string;
  /** True when this invitation minted the `people` row. */
  readonly personCreated: boolean;
  readonly roleAssignmentIds: readonly string[];
  readonly state: OperatorAccountState;
  /**
   * `false` when the invitation email could not be delivered. The Person, the
   * account and the assignments are committed either way — this says whether
   * the administrator should expect the person to receive it, or should look
   * at the address and resend.
   */
  readonly delivered: boolean;
  readonly deliveryFailureReason: string | null;
}
