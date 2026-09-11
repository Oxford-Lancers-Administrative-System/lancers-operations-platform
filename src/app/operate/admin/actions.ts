"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { invitationCallbackUrl } from "@/lib/auth/invitation";
import { recoveryCallbackUrl } from "@/lib/auth/recovery";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  correctOperatorInvitation,
  findOperatorCandidates,
  inviteOperator,
  resendOperatorInvitation,
} from "@/lib/services/operator-invitations";
import {
  assignRole,
  deactivateOperatorAccess,
  endRoleAssignment,
  replaceRoleHolder,
  restoreOperatorAccess,
  startOperatorEmailRehome,
} from "@/lib/services/operator-administration";
import { operatorAccountState } from "@/lib/services/operator-account-state";
import type { AdminActionState, CandidateChoice } from "./action-state";

// Administration's server actions — LAN-133, `WP-surfaces`. Thin adapters:
// read the form, call one service, turn a ServiceError into a sentence. Each
// opens with requireCapability("role_management") against the verified
// session; the target-aware question is asked inside the service, never
// here. A refusal comes back in `refusal` on the action state, never thrown
// (a server action rethrow reaches the framework, not a refusal screen).
// Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.

const ADMINISTRATION_CAPABILITY = "role_management" as const;

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function optional(formData: FormData, field: string): string | undefined {
  const value = text(formData, field);
  return value === "" ? undefined : value;
}

/** A service failure or refusal, both returned as state — never thrown (except an unexpected fault). Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md. */
function failure(error: unknown): AdminActionState {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") {
    return { error: null, notice: null, candidates: null, refusal: error.message };
  }
  return { error: error.message, notice: null, candidates: null, refusal: null };
}

function done(notice: string): AdminActionState {
  return { error: null, notice, candidates: null, refusal: null };
}

/** The absolute URL an emailed link comes back to; empty triggers the service's own refusal. */
async function callbackUrls(): Promise<{ invitation: string; recovery: string }> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  const requestOrigin = host ? `${proto}://${host}` : null;
  const input = { appBaseUrl: process.env.APP_BASE_URL, requestOrigin };

  return {
    invitation: invitationCallbackUrl(input) ?? "",
    recovery: recoveryCallbackUrl(input) ?? "",
  };
}

function refreshOperator(operatorAccountId: string): void {
  revalidatePath("/operate/admin/operators");
  revalidatePath(`/operate/admin/operators/${operatorAccountId}`);
  // Role detail shows the holder's access state too.
  revalidatePath("/operate/admin/roles");
}

function refreshRoles(roleId?: string): void {
  revalidatePath("/operate/admin/roles");
  revalidatePath("/operate/admin/operators");
  if (roleId) revalidatePath(`/operate/admin/roles/${roleId}`);
}

/** What a delivery attempt is called afterwards, in one sentence. */
function deliveryNotice(
  sent: string,
  result: { delivered: boolean; deliveryFailureReason: string | null },
): string {
  if (result.delivered) return sent;
  return result.deliveryFailureReason
    ? `The record is saved, but the email could not be delivered: ${result.deliveryFailureReason}`
    : "The record is saved, but the email could not be delivered. Check the address and send it again.";
}

/** Who this might already be — `REQ-invite-existing-person`'s first step. Matches exactly, never by prefix. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md. */
export async function searchCandidatesAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability(ADMINISTRATION_CAPABILITY);

  try {
    const found = await findOperatorCandidates(operator, {
      givenName: optional(formData, "givenName") ?? null,
      familyName: optional(formData, "familyName") ?? null,
      email: optional(formData, "email") ?? null,
      phone: optional(formData, "phone") ?? null,
    });

    const candidates: CandidateChoice[] = found.map((candidate) => ({
      personId: candidate.personId,
      name: [candidate.displayAlias?.trim() || candidate.givenName, candidate.familyName]
        .filter((part) => Boolean(part))
        .join(" "),
      email: candidate.email,
      phone: candidate.phone,
      matchedOn: [...candidate.matchedOn],
      operatorState: candidate.operatorAccount
        ? operatorAccountState(candidate.operatorAccount.state).label
        : null,
      operatorAccountId: candidate.operatorAccount?.id ?? null,
    }));

    return { error: null, notice: null, candidates, refusal: null };
  } catch (error) {
    return failure(error);
  }
}

/** One guided invitation — `REQ-invite-existing-person`. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md. */
export async function inviteOperatorAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability(ADMINISTRATION_CAPABILITY);
  const personId = optional(formData, "personId");
  const roleCode = text(formData, "roleCode");
  const callbacks = await callbackUrls();

  let operatorAccountId: string;
  let delivery: { delivered: boolean; deliveryFailureReason: string | null };

  try {
    const result = await inviteOperator({
      operator,
      subject: personId
        ? { kind: "existing", personId }
        : {
            kind: "new",
            givenName: text(formData, "givenName"),
            familyName: text(formData, "familyName"),
            phone: optional(formData, "phone") ?? null,
          },
      email: text(formData, "email"),
      roles: [
        {
          roleCode,
          effectiveFrom: optional(formData, "effectiveFrom") ?? null,
          reason: optional(formData, "reason") ?? null,
        },
      ],
      callbackUrl: callbacks.invitation,
    });
    operatorAccountId = result.operatorAccountId;
    delivery = { delivered: result.delivered, deliveryFailureReason: result.deliveryFailureReason };
  } catch (error) {
    return failure(error);
  }

  refreshOperator(operatorAccountId);
  refreshRoles();
  redirect(
    `/operate/admin/operators/${operatorAccountId}?notice=${
      delivery.delivered ? "invited" : "invited-undelivered"
    }`,
  );
}

/** Send the same invitation to the same address again. */
export async function resendInvitationAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability(ADMINISTRATION_CAPABILITY);
  const operatorAccountId = text(formData, "operatorAccountId");
  const callbacks = await callbackUrls();

  try {
    const result = await resendOperatorInvitation({
      operator,
      operatorAccountId,
      callbackUrl: callbacks.invitation,
    });
    refreshOperator(operatorAccountId);
    return done(deliveryNotice("The invitation has been sent again.", result));
  } catch (error) {
    return failure(error);
  }
}

/** Correct the address and send it again — `REQ-invitation-states`. */
export async function correctInvitationAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability(ADMINISTRATION_CAPABILITY);
  const operatorAccountId = text(formData, "operatorAccountId");
  const callbacks = await callbackUrls();

  try {
    const result = await correctOperatorInvitation({
      operator,
      operatorAccountId,
      email: text(formData, "email"),
      callbackUrl: callbacks.invitation,
    });
    refreshOperator(operatorAccountId);
    return done(
      deliveryNotice(`The invitation has been sent again, to ${result.loginEmail}.`, result),
    );
  } catch (error) {
    return failure(error);
  }
}

/** Stop this operator signing in. The reason is required. */
export async function deactivateOperatorAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability(ADMINISTRATION_CAPABILITY);
  const operatorAccountId = text(formData, "operatorAccountId");

  try {
    await deactivateOperatorAccess({
      operator,
      operatorAccountId,
      reason: text(formData, "reason"),
    });
    refreshOperator(operatorAccountId);
    return done(
      "Operator access is deactivated. The roles this person holds are unchanged — no seat has " +
        "been ended and no seat is vacant.",
    );
  } catch (error) {
    return failure(error);
  }
}

/** Let them sign in again, on the same account. */
export async function restoreOperatorAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability(ADMINISTRATION_CAPABILITY);
  const operatorAccountId = text(formData, "operatorAccountId");

  try {
    await restoreOperatorAccess({
      operator,
      operatorAccountId,
      reason: optional(formData, "reason"),
    });
    refreshOperator(operatorAccountId);
    return done("Operator access is restored. Only the roles still in effect come back with it.");
  } catch (error) {
    return failure(error);
  }
}

/** Move the sign-in address, and ask them to prove they hold it. */
export async function startEmailRehomeAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability(ADMINISTRATION_CAPABILITY);
  const operatorAccountId = text(formData, "operatorAccountId");
  const callbacks = await callbackUrls();

  try {
    const result = await startOperatorEmailRehome({
      operator,
      operatorAccountId,
      email: text(formData, "email"),
      reason: text(formData, "reason"),
      callbackUrl: callbacks.recovery,
    });
    refreshOperator(operatorAccountId);
    return done(
      deliveryNotice(
        `The old sign-in address no longer works. A verification link has gone to ${result.loginEmail}, ` +
          "and this account stays in Email change pending until it is followed.",
        result,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}

/** Give somebody a seat — `REQ-effective-dated-role-history`. Backdating rules live in the service. */
export async function assignRoleAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability(ADMINISTRATION_CAPABILITY);
  const roleId = text(formData, "roleId");

  try {
    await assignRole({
      operator,
      personId: text(formData, "personId"),
      roleCode: text(formData, "roleCode"),
      effectiveFrom: optional(formData, "effectiveFrom"),
      reason: optional(formData, "reason"),
    });
    refreshRoles(roleId);
    return done("The role is assigned.");
  } catch (error) {
    return failure(error);
  }
}

/** End one assignment. Only this creates a Not assigned vacancy. */
export async function endRoleAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability(ADMINISTRATION_CAPABILITY);
  const roleId = text(formData, "roleId");

  try {
    const result = await endRoleAssignment({
      operator,
      roleAssignmentId: text(formData, "roleAssignmentId"),
      effectiveTo: optional(formData, "effectiveTo"),
      reason: text(formData, "reason"),
    });
    refreshRoles(roleId);
    return done(
      result.scheduled
        ? "The role is set to end on that date. Until then the holder keeps it."
        : "The role has ended. The assignment stays in the club's history.",
    );
  } catch (error) {
    return failure(error);
  }
}

/** Hand a seat over: the outgoing assignment ends and the successor's begins. */
export async function replaceRoleHolderAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability(ADMINISTRATION_CAPABILITY);
  const roleId = text(formData, "roleId");

  try {
    await replaceRoleHolder({
      operator,
      roleAssignmentId: text(formData, "roleAssignmentId"),
      successorPersonId: text(formData, "successorPersonId"),
      effectiveFrom: optional(formData, "effectiveFrom"),
      reason: text(formData, "reason"),
    });
    refreshRoles(roleId);
    return done("The role has changed hands. Both assignments stay in the club's history.");
  } catch (error) {
    return failure(error);
  }
}
