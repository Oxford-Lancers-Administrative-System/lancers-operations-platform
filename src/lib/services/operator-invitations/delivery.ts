import type { ResolvedOperator } from "@/lib/auth/operator";
import type { Tx } from "@/lib/db";
import { recordAdministrationEvent } from "../administration-audit";
import type { AdministrationOperatingYear } from "../administration-events";
import { InvitationDeliveryFailure, type OperatorIdentityPort } from "../operator-identity";
import { readOperatorAccountIn } from "./account-read";
import { administrationAuthority, requireOperator } from "./shared";

// Delivery failure, shared by `invite.ts` and `resend.ts`.

export async function deliverInvitation(
  identity: OperatorIdentityPort,
  email: string,
  callbackUrl: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await identity.sendInvitation(email, callbackUrl);
    return { ok: true };
  } catch (error) {
    if (error instanceof InvitationDeliveryFailure) {
      return { ok: false, reason: describeDeliveryFailure(error.message) };
    }
    throw error;
  }
}

/** The recorded reason, trimmed and bounded to a sentence; stored, not shown — surfaces render the state's own sentence. */
function describeDeliveryFailure(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed === "") return "The invitation email could not be delivered.";
  return trimmed.length > 300 ? `${trimmed.slice(0, 297)}...` : trimmed;
}

/** Records a delivery failure against an account that already exists — columns and event both, never a second Person or account. */
export async function markDeliveryFailed(
  tx: Tx,
  input: {
    operator: ResolvedOperator | null;
    operatorAccountId: string;
    personId: string;
    operatingYear: AdministrationOperatingYear;
    reason: string;
  },
): Promise<void> {
  const before = await readOperatorAccountIn(tx, input.operatorAccountId);
  if (!before) return;

  await tx.query(
    `update public.operator_accounts
        set invitation_delivery_failed_at = now(),
            invitation_delivery_failure_reason = $2,
            updated_at = now()
      where id = $1`,
    [input.operatorAccountId, input.reason],
  );

  const after = await readOperatorAccountIn(tx, input.operatorAccountId);
  if (!after || after.state === before.state) return;

  await recordAdministrationEvent(tx, {
    action: "administration.operator.invitation_delivery_failed",
    actorPersonId: requireOperator(input.operator).personId,
    authority: administrationAuthority(input.operator),
    target: { personId: input.personId, operatorAccountId: input.operatorAccountId },
    operatingYear: input.operatingYear,
    fromState: before.state,
    toState: after.state,
    detail: { reason: input.reason },
  });
}
