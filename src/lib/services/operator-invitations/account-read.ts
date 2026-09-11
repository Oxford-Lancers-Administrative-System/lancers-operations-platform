import type { Tx } from "@/lib/db";
import { deriveOperatorAccountState, type OperatorAccountState } from "../operator-account-state";

/**
 * Reading an operator account — {@link readOperatorAccountIn} and
 * {@link toAccount} are the one place `operator_accounts` rows become
 * `OperatorAccountRecord`; `activate.ts` re-reads the same columns
 * (`ACCOUNT_COLUMNS`) under `for update` and shares this projection.
 */

/** One operator account, as Administration reads it. */
export interface OperatorAccountRecord {
  readonly id: string;
  readonly personId: string;
  readonly authUserId: string;
  readonly loginEmail: string | null;
  readonly isActive: boolean;
  readonly invitedAt: Date | null;
  readonly activatedAt: Date | null;
  readonly deliveryFailedAt: Date | null;
  readonly deliveryFailureReason: string | null;
  /**
   * When an administrator started the email re-home flow, or `null` — LAN-132.
   * Non-null is the fifth state, and it is read here rather than assumed
   * `false` so that every consumer of this record sees the same account.
   */
  readonly emailRehomePendingAt: Date | null;
  readonly state: OperatorAccountState;
}

export interface AccountRow {
  id: string;
  person_id: string;
  auth_user_id: string;
  login_email: string | null;
  is_active: boolean;
  invited_at: Date | null;
  activated_at: Date | null;
  invitation_delivery_failed_at: Date | null;
  invitation_delivery_failure_reason: string | null;
  email_rehome_pending_at: Date | null;
}

export function toAccount(row: AccountRow): OperatorAccountRecord {
  return {
    id: row.id,
    personId: row.person_id,
    authUserId: row.auth_user_id,
    loginEmail: row.login_email,
    isActive: row.is_active,
    invitedAt: row.invited_at,
    activatedAt: row.activated_at,
    deliveryFailedAt: row.invitation_delivery_failed_at,
    deliveryFailureReason: row.invitation_delivery_failure_reason,
    emailRehomePendingAt: row.email_rehome_pending_at,
    state: deriveOperatorAccountState({
      isActive: row.is_active,
      activatedAt: row.activated_at,
      invitationDeliveryFailedAt: row.invitation_delivery_failed_at,
      // LAN-132 supplied the column this argument was left open for. Reading
      // it here is what makes `refuseUnlessResendable` refuse a resend for an
      // account waiting on an email verification, rather than offering one
      // that would send a second link to the replacement address and read as
      // though the invitation flow were still running.
      emailChangePending: row.email_rehome_pending_at !== null,
    }),
  };
}

export const ACCOUNT_COLUMNS = `id, person_id, auth_user_id, login_email, is_active, invited_at,
         activated_at, invitation_delivery_failed_at, invitation_delivery_failure_reason,
         email_rehome_pending_at`;

/** One account by its own id, inside a transaction. `null` when there is none. */
export async function readOperatorAccountIn(
  tx: Tx,
  operatorAccountId: string,
): Promise<OperatorAccountRecord | null> {
  const result = await tx.query<AccountRow>(
    `select ${ACCOUNT_COLUMNS} from public.operator_accounts where id = $1`,
    [operatorAccountId],
  );
  return result.rows.length === 0 ? null : toAccount(result.rows[0]);
}
