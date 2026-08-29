"use server";

import { revalidatePath } from "next/cache";
import { requireCapability, requireGeneralOperator } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  resolveOnboardingItem,
  setMembershipStatus,
  type MembershipStatus,
  type OnboardingItemStatus,
} from "@/lib/services/membership";
import type { MembershipActionState } from "./action-state";

/**
 * The membership workflow's server actions — LAN-75, and the free ladder
 * LAN-186's owner walkthrough put in its place (`Q-12`).
 *
 * ## Authorization, and where it actually lives
 *
 * A status change opens with `requireCapability("membership_activation")`,
 * which resolves the actor from the **verified session** and refuses unless
 * they hold an Exec seat or the General Manager's. It takes no actor argument,
 * and may not: a server action is a POST endpoint the browser can call
 * directly, so an action that accepted "who am I" would accept whatever was
 * sent. The acceptance criterion — "activation is refused for an operator
 * without an Exec/GM role, **in the server action and not only in the UI**" —
 * is this line and the test that calls the action with a coach.
 *
 * The role list is read from `src/lib/auth/capabilities.ts` and is not restated
 * here, so no call site carries a policy of its own. Q-12 removed the legal-
 * transition table and every reason a transition used to ask for; it did not
 * touch who may change a status, so every direction — including the ones a
 * free ladder newly permits, like flipping straight to `departed` or
 * `archived` — stays behind this same gate.
 *
 * Resolving an onboarding item is deliberately **not** gated that way. UX-21's
 * audience is "Authorized roster operator"; marking the kit sorted is ordinary
 * roster work. `requireGeneralOperator()` is still a real boundary — a linked,
 * active operator and nobody else.
 *
 * LAN-110 narrowed that floor by exactly one actor. A coaching assignment is
 * refused, because its fixed boundaries name "recruitment/onboarding state"
 * among the things a coach cannot edit, and the ordinary floor admitted a Head
 * Coach as readily as the Kit Manager. Hiding the roster from the coach's
 * navigation would not have been enough: this is a server action, and LAN-110
 * says in terms that hidden controls are not an authorization boundary.
 *
 * ## Why a refusal is never a form message
 *
 * `NotPermitted` is excluded from the `catch` and rethrown, exactly as
 * `events/actions.ts` does it. A refusal rendered as red text beside a control
 * reads as "try again", which is the wrong instruction and hides an
 * authorization event inside a validation failure.
 */

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/** Turns a service failure into something an operator can read, and lets a refusal through untouched. */
function stateFor(error: unknown): MembershipActionState {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return { error: error.message };
}

function refreshMembership(membershipId: string): void {
  revalidatePath("/operate/roster");
  revalidatePath(`/operate/roster/${membershipId}`);
}

/**
 * Sets a membership's status to any other value in the ladder — the one
 * control `membership-actions.tsx`'s `MembershipStatusControl` posts to,
 * wherever it renders: the roster board's Status cell, the player page's
 * "Membership status" panel, and the people page once it exists. No reason, no
 * confirmation, no legality check — `setMembershipStatus()` is the whole rule,
 * and this is only the boundary and the revalidation around it.
 */
export async function setMembershipStatusAction(params: {
  membershipId: string;
  status: MembershipStatus;
}): Promise<MembershipActionState> {
  const operator = await requireCapability("membership_activation");

  try {
    await setMembershipStatus({
      actorPersonId: operator.personId,
      membershipId: params.membershipId,
      status: params.status,
    });
  } catch (error) {
    return stateFor(error);
  }

  refreshMembership(params.membershipId);
  return { error: null };
}

/**
 * Marks one onboarding item complete, waived or not applicable.
 *
 * The status arrives from the form and is checked by the service against the
 * three resolutions this screen offers — `pending` and `invited` are states the
 * process moves through, not decisions an operator makes here, and a crafted
 * request naming one is refused rather than written.
 */
export async function resolveOnboardingItemAction(
  _previous: MembershipActionState,
  formData: FormData,
): Promise<MembershipActionState> {
  const operator = await requireGeneralOperator();
  const membershipId = text(formData, "membershipId");

  try {
    await resolveOnboardingItem({
      actorPersonId: operator.personId,
      membershipId,
      itemId: text(formData, "itemId"),
      status: text(formData, "status") as OnboardingItemStatus,
      reason: text(formData, "reason"),
    });
  } catch (error) {
    return stateFor(error);
  }

  refreshMembership(membershipId);
  return { error: null };
}
