import { withTransaction } from "@/lib/db";
import { recordAdministrationEvent } from "../administration-audit";
import type { OperatorAccountState } from "../operator-account-state";
import { ACCOUNT_COLUMNS, toAccount, type AccountRow } from "./account-read";
import { resolveCommitteeYearForActivation } from "./cycles";

// Activation — {@link activateOperatorAccount} is the account holder's own act, idempotent,
// and does not reactivate a deactivated account. `DEC-email-authentication`.

export interface ActivateOperatorResult {
  readonly operatorAccountId: string;
  readonly personId: string;
  readonly state: OperatorAccountState;
  readonly activated: boolean;
}

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
