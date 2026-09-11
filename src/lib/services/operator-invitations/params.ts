import type { ResolvedOperator } from "@/lib/auth/operator";
import type { OperatorAccountState } from "../operator-account-state";
import type { OperatorIdentityPort } from "../operator-identity";
import type { InitialRoleAssignment, InvitationSubject } from "./shared";

export interface InviteOperatorParams {
  readonly operator: ResolvedOperator | null;
  readonly subject: InvitationSubject;
  readonly email: string;
  readonly roles: readonly InitialRoleAssignment[];
  readonly callbackUrl: string;
  /** Swapped only by tests. Defaults to the real Supabase Auth port. */
  readonly identity?: OperatorIdentityPort;
}

export interface InviteOperatorResult {
  readonly personId: string;
  readonly operatorAccountId: string;
  readonly authUserId: string;
  readonly loginEmail: string;
  readonly personCreated: boolean;
  readonly roleAssignmentIds: readonly string[];
  readonly state: OperatorAccountState;
  /** `false` when undelivered; the Person, account and assignments are committed either way. */
  readonly delivered: boolean;
  readonly deliveryFailureReason: string | null;
}
