import "server-only";

import {
  canAdministerTarget,
  type AdministrationSubject,
} from "@/lib/auth/administration-authority";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { withTransaction } from "@/lib/db";
import { readAdministrationSubject } from "@/lib/services/operator-invitations";

/**
 * What Administration is allowed to **offer** — LAN-133.
 *
 * Deciding what to render, never what to permit. `canAdministerTarget` is
 * documented for exactly this and says the same thing: "a hidden control is a
 * courtesy, and the action behind it still guards". Every action behind every
 * control here asks the same question again, inside the transaction that
 * writes, against role codes read there. Deleting this file would change what
 * the screens look like and change nothing about what they allow.
 *
 * It exists because the alternative is worse in a specific way. A page that
 * offers the President a **Deactivate operator access** button on the General
 * Manager's record is not merely untidy: `REQ-final-admin-protection` makes
 * that refusal a constitutional fact, and an interface that presents a
 * constitutional impossibility as an available action teaches its reader
 * something false about the club.
 *
 * ## Why the seats come from the database
 *
 * The guard's answer is only as good as the seats it was asked about. The
 * calling page already holds the target's roles — it drew them — and passing
 * those in would be quietly wrong twice over: they are the seats *in force*,
 * where the guard wants every seat *not yet ended*, and they are a snapshot the
 * page took earlier. `readAdministrationSubject(…, { includeScheduled: true })`
 * is the same read the services make, with the same option, for the reason
 * `operator-administration.ts` records: a President-elect whose seat begins at
 * a handover must be protected now, not from the handover date.
 *
 * This is not a `"use server"` module and must not become one. These are reads
 * a page performs, not endpoints a browser calls.
 */

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

/**
 * Whether this actor may change who holds one seat.
 *
 * All three decisions are role-scoped, so each names the `roleCode` it
 * concerns — LAN129-B1's correction, which exists because a missing seat once
 * meant "no seat is involved" and left a vacant General Manager installable by
 * anybody. `personId` is the current holder for a replacement or an ending, and
 * is absent for an assignment into a vacancy: there is no target Person yet,
 * and the seat being conferred is what the leadership rule has to weigh.
 */
export async function permittedRoleActions(
  operator: ResolvedOperator,
  roleCode: string,
  holderPersonId: string | null,
): Promise<PermittedRoleActions> {
  const holder = holderPersonId ? await subject(holderPersonId) : null;
  // An assignment into a vacancy has no incumbent. The subject is the person
  // being given the seat, who is not chosen yet — so the question asked is the
  // one that can be asked without them, and `assignRole` asks the complete one
  // again once they are.
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
