import "server-only";

import {
  canAdministerTarget,
  type AdministrationSubject,
} from "@/lib/auth/administration-authority";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { withTransaction } from "@/lib/db";
import { readAdministrationSubject } from "@/lib/services/operator-invitations";

/** What Administration is allowed to offer — LAN-133. Renders only; `canAdministerTarget` re-checks every action. Decision history: docs/operating-the-slice.md */

/** The five account-level decisions operator detail can offer. */
export interface PermittedAccountActions {
  readonly resend: boolean;
  readonly correct: boolean;
  readonly deactivate: boolean;
  readonly restore: boolean;
  readonly recoverEmail: boolean;
}

/** The three seat-level decisions role detail can offer. */
export interface PermittedRoleActions {
  readonly assign: boolean;
  readonly replace: boolean;
  readonly end: boolean;
}

export async function permittedAccountActions(
  operator: ResolvedOperator,
  personId: string,
): Promise<PermittedAccountActions> {
  const target = await subject(personId);

  return {
    resend: canAdministerTarget(operator, { action: "resend_invitation", target }),
    correct: canAdministerTarget(operator, { action: "correct_invitation", target }),
    deactivate: canAdministerTarget(operator, { action: "deactivate_account", target }),
    restore: canAdministerTarget(operator, { action: "restore_account", target }),
    recoverEmail: canAdministerTarget(operator, { action: "recover_email", target }),
  };
}

/** Whether this actor may change who holds one seat — each decision names its `roleCode` (LAN129-B1). Decision history: docs/operating-the-slice.md */
export async function permittedRoleActions(
  operator: ResolvedOperator,
  roleCode: string,
  holderPersonId: string | null,
): Promise<PermittedRoleActions> {
  const holder = holderPersonId ? await subject(holderPersonId) : null;
  const nobody: AdministrationSubject = { personId: "", roleCodes: [] };

  return {
    assign: canAdministerTarget(operator, { action: "assign_role", target: nobody, roleCode }),
    replace: holder
      ? canAdministerTarget(operator, {
          action: "replace_role_holder",
          target: holder,
          roleCode,
        })
      : false,
    end: holder
      ? canAdministerTarget(operator, { action: "end_role", target: holder, roleCode })
      : false,
  };
}

function subject(personId: string): Promise<AdministrationSubject> {
  return withTransaction((tx) =>
    readAdministrationSubject(tx, personId, { includeScheduled: true }),
  );
}
