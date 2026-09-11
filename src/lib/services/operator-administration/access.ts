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
      // immediately; a deactivation has no date to choose
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

/** Lets this operator sign in again. Restores no capability snapshot — capabilities are always read from `role_assignments`. Reason is optional. */
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

    // disabled_at/disabled_reason are deliberately kept; see operator_accounts_disabled_is_dated.
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
