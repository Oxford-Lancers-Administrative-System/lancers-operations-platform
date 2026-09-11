import { withTransaction } from "@/lib/db";
import { recordAdministrationEvent } from "../administration-audit";
import type { OperatorAccountState } from "../operator-account-state";
import { ACCOUNT_COLUMNS, toAccount, type AccountRow } from "./account-read";
import { resolveCommitteeYearForActivation } from "./cycles";

/**
 * Activation — {@link activateOperatorAccount} is the account holder's own
 * act (`authority: { kind: "self" }`), idempotent, and does not reactivate a
 * deactivated account. `DEC-email-authentication`.
 */

export interface ActivateOperatorResult {
  readonly operatorAccountId: string;
  readonly personId: string;
  readonly state: OperatorAccountState;
  /** False when the account was already activated — this call changed nothing. */
  readonly activated: boolean;
}

/**
 * Records that the holder of this login has established credentials.
 *
 * Called by the action that sets the password, with the `auth.users.id` of the
 * session that set it — never with an id a browser supplied. This is the end of
 * the invitation: `DEC-email-authentication`, "first login establishes
 * credentials only".
 *
 * Three properties worth stating, because each one is a decision:
 *
 *   * **Idempotent.** A second password change is not a second activation, and
 *     writes no event. `activated_at` is when credentials were established the
 *     first time.
 *   * **It is the account holder's own act**, so the audit event carries
 *     `authority: { kind: "self" }` — the one shape the vocabulary permits for
 *     somebody with no administrative capability at all.
 *   * **It does not reactivate a deactivated account.** Setting a password is
 *     not permission to sign in; `is_active` is untouched, the derived state
 *     stays Deactivated, and no event is written because nothing transitioned.
 *     `REQ-deactivate-and-reinstate` gives restoration to an administrator.
 *
 * Returns `null` when the login has no operator account. That is not an error:
 * a login can exist unlinked, and the password screen has no business telling
 * its user which it is.
 */
export async function activateOperatorAccount(
  authUserId: string,
): Promise<ActivateOperatorResult | null> {
  return withTransaction(async (tx) => {
    const found = await tx.query<AccountRow>(
      `select ${ACCOUNT_COLUMNS} from public.operator_accounts where auth_user_id = $1 for update`,
      [authUserId],
    );
    if (found.rows.length === 0) return null;

    const account = toAccount(found.rows[0]);
    if (account.activatedAt !== null) {
      return {
        operatorAccountId: account.id,
        personId: account.personId,
        state: account.state,
        activated: false,
      };
    }

    const updated = await tx.query<AccountRow>(
      `update public.operator_accounts
          set activated_at = now(),
              invitation_delivery_failed_at = null,
              invitation_delivery_failure_reason = null,
              updated_at = now()
        where id = $1
      returning ${ACCOUNT_COLUMNS}`,
      [account.id],
    );

    const after = toAccount(updated.rows[0]);
    const operatingYear = await resolveCommitteeYearForActivation(tx);

    // A deactivated account moves from Deactivated to Deactivated, which is not
    // a transition and which the ledger refuses to record — correctly, because
    // nothing about the club's picture of that account changed.
    if (after.state !== account.state) {
      await recordAdministrationEvent(tx, {
        action: "administration.operator.activated",
        actorPersonId: account.personId,
        authority: { kind: "self", roleCodes: [] },
        target: { personId: account.personId, operatorAccountId: account.id },
        operatingYear,
        fromState: account.state,
        toState: after.state,
      });
    }

    return {
      operatorAccountId: after.id,
      personId: after.personId,
      state: after.state,
      activated: true,
    };
  });
}
