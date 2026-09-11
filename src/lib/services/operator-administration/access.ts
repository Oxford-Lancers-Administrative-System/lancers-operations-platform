import { assertAdministrationTarget } from "@/lib/auth/administration-authority";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { ConstraintViolated, InvalidTransition, withTransaction } from "@/lib/db";
import { recordAdministrationEvent } from "../administration-audit";
import type { OperatorAccountState } from "../operator-account-state";
import {
  currentDateIn,
  readAdministrationSubject,
  resolveActiveCommitteeYear,
} from "../operator-invitations";
import {
  DEACTIVATION_REASON_MESSAGE,
  DEACTIVATION_REASON_RULE,
  administrationAuthority,
  assertClubKeepsAnAdministrator,
  blankToNull,
  lockAccount,
  requireOperator,
  updateAccount,
} from "./shared";

/**
 * Deactivate and restore operator access — neither touches a role
 * (`REQ-deactivate-and-reinstate`). Deactivation writes three columns on one
 * row; restoration restores no capability snapshot, because there is none —
 * capabilities are read from `role_assignments` on every request. Decision
 * history: relocations.md.
 */

export interface OperatorAccessParams {
  readonly operator: ResolvedOperator | null;
  readonly operatorAccountId: string;
  readonly reason?: string;
}

export interface OperatorAccessResult {
  readonly operatorAccountId: string;
  readonly personId: string;
  readonly state: OperatorAccountState;
}

/**
 * Stops this operator signing in, immediately, and touches no role.
 *
 * `REQ-deactivate-and-reinstate` is emphatic about the second half:
 * deactivation "prevents sign-in without ending organizational roles, making a
 * role pending or creating a vacancy; role detail instead shows that the current
 * holder's operator access is deactivated". So this writes three columns on one
 * row and nothing else — {@link readRoleHolders} is what makes role detail say
 * so, and `operator-administration.test.ts` counts `role_assignments` rows
 * before and after to prove it.
 */
export async function deactivateOperatorAccess(
  params: OperatorAccessParams,
): Promise<OperatorAccessResult> {
  const actor = requireOperator(params.operator);
  const reason = blankToNull(params.reason);
  if (reason === null) {
    throw new ConstraintViolated(DEACTIVATION_REASON_MESSAGE, { rule: DEACTIVATION_REASON_RULE });
  }

  return withTransaction(async (tx) => {
    const account = await lockAccount(tx, params.operatorAccountId);
    const operatingYear = await resolveActiveCommitteeYear(tx);

    const subject = await readAdministrationSubject(tx, account.personId, {
      includeScheduled: true,
    });
    assertAdministrationTarget(params.operator, { action: "deactivate_account", target: subject });

    if (!account.isActive) {
      throw new InvalidTransition(
        "This operator's access is already deactivated, so there is nothing to change.",
        { rule: "administration_already_deactivated" },
      );
    }

    await assertClubKeepsAnAdministrator(
      tx,
      { kind: "deactivate_account", personId: account.personId },
      // Immediately. A deactivation has no date to choose, and modelling it as
      // permanent from today is the conservative reading — nothing here knows
      // whether or when it will be undone.
      await currentDateIn(tx),
    );

    const after = await updateAccount(
      tx,
      account.id,
      `is_active = false, disabled_at = now(), disabled_reason = $2`,
      [reason],
    );

    await recordAdministrationEvent(tx, {
      action: "administration.operator.deactivated",
      actorPersonId: actor.personId,
      authority: administrationAuthority(actor),
      target: { personId: account.personId, operatorAccountId: account.id },
      operatingYear,
      fromState: account.state,
      toState: after.state,
      reason,
    });

    return { operatorAccountId: after.id, personId: after.personId, state: after.state };
  });
}

/**
 * Lets this operator sign in again.
 *
 * "Reinstatement restores only capabilities from assignments that remain
 * effective." Nothing here restores a capability, and that is the point:
 * capabilities are read from `role_assignments` on every request, so a seat that
 * ended while the account was deactivated stays ended and does not come back.
 * There is no capability snapshot to get wrong because there is no snapshot.
 *
 * The reason is optional. `REQ-deactivate-and-reinstate` requires one for
 * deactivation and does not for restoration, and the audit vocabulary agrees —
 * `administration.operator.restored` carries `reasonRequired: false`. Coming
 * back needs no excuse, exactly as returning a membership to active does not.
 */
export async function restoreOperatorAccess(
  params: OperatorAccessParams,
): Promise<OperatorAccessResult> {
  const actor = requireOperator(params.operator);

  return withTransaction(async (tx) => {
    const account = await lockAccount(tx, params.operatorAccountId);
    const operatingYear = await resolveActiveCommitteeYear(tx);

    const subject = await readAdministrationSubject(tx, account.personId, {
      includeScheduled: true,
    });
    assertAdministrationTarget(params.operator, { action: "restore_account", target: subject });

    if (account.isActive) {
      throw new InvalidTransition(
        "This operator's access is not deactivated, so there is nothing to restore.",
        { rule: "administration_not_deactivated" },
      );
    }

    // `disabled_at` and `disabled_reason` are deliberately kept. The table's
    // own `operator_accounts_disabled_is_dated` note says so: "is_active = true
    // with a disabled_at set is a reinstatement, and keeping the previous date
    // is more informative than erasing it."
    const after = await updateAccount(tx, account.id, "is_active = true", []);

    await recordAdministrationEvent(tx, {
      action: "administration.operator.restored",
      actorPersonId: actor.personId,
      authority: administrationAuthority(actor),
      target: { personId: account.personId, operatorAccountId: account.id },
      operatingYear,
      fromState: account.state,
      toState: after.state,
      reason: blankToNull(params.reason),
    });

    return { operatorAccountId: after.id, personId: after.personId, state: after.state };
  });
}
