"use server";

import { revalidatePath } from "next/cache";
import { requireCapability, requireOperator } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  ACTIVATION_NEEDS_OVERRIDE_RULE,
  activateMembership,
  reactivateMembership,
  resolveOnboardingItem,
  setMembershipInactive,
  type OnboardingItemStatus,
} from "@/lib/services/membership";
import type { MembershipActionState } from "./action-state";

/**
 * The membership workflow's server actions — LAN-75.
 *
 * ## Authorization, and where it actually lives
 *
 * Every status change opens with `requireCapability("membership_activation")`,
 * which resolves the actor from the **verified session** and refuses unless
 * they hold an Exec seat or the General Manager's. None of these takes an actor
 * argument, and none may: a server action is a POST endpoint the browser can
 * call directly, so an action that accepted "who am I" would accept whatever
 * was sent. The acceptance criterion — "activation is refused for an operator
 * without an Exec/GM role, **in the server action and not only in the UI**" —
 * is this line and the test that calls the action with a coach.
 *
 * The role list is read from `src/lib/auth/capabilities.ts` and is not restated
 * here, so no call site carries a policy of its own.
 *
 * ## Why `active ⇄ inactive` is gated the same way
 *
 * `slice-ux.md` § 8 grants "membership activation" to Exec/GM and says nothing
 * separate about the reverse pair. `inactive → active` plainly *is* an
 * activation, and `active → inactive` takes a player off the roster for
 * selection purposes; putting either behind a weaker guard than the transition
 * they undo would be a boundary an operator could walk around. Fail-closed is
 * the correct direction here, and widening it later is an edit to one line.
 *
 * Resolving an onboarding item is deliberately **not** gated that way. UX-21's
 * audience is "Authorized roster operator" and UX-22's is "Exec or GM"; marking
 * the kit sorted is ordinary roster work, and only the declaration of
 * operational readiness is privileged. `requireOperator()` is still a real
 * boundary — a linked, active operator and nobody else.
 *
 * ## Why a refusal is never a form message
 *
 * `NotPermitted` is excluded from the `catch` and rethrown, exactly as
 * `events/actions.ts` does it. A refusal rendered as red text beside a button
 * reads as "try again", which is the wrong instruction and hides an
 * authorization event inside a validation failure.
 */

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/**
 * Turns a service failure into something an operator can read, and lets a
 * refusal through untouched.
 *
 * `needsOverride` is keyed on the service's `rule`, never on the message text:
 * UX-22 is a different screen from a plain failure, and deciding which one to
 * show by matching English would break the moment the sentence is reworded.
 */
function stateFor(error: unknown): MembershipActionState {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return {
    error: error.message,
    needsOverride: error.rule === ACTIVATION_NEEDS_OVERRIDE_RULE,
  };
}

function refreshMembership(membershipId: string): void {
  revalidatePath("/operate/roster");
  revalidatePath(`/operate/roster/${membershipId}`);
}

/**
 * `confirmed → onboarding → active`, or `onboarding → active`.
 *
 * The override reason is passed straight through. When required items are
 * outstanding and it is empty, the service refuses with
 * `ACTIVATION_NEEDS_OVERRIDE_RULE` and the screen asks UX-22's question; the
 * refusal is the server's, so a client that skipped the panel gets it too.
 */
export async function activateMembershipAction(
  _previous: MembershipActionState,
  formData: FormData,
): Promise<MembershipActionState> {
  const operator = await requireCapability("membership_activation");
  const membershipId = text(formData, "membershipId");

  try {
    await activateMembership({
      actorPersonId: operator.personId,
      membershipId,
      overrideReason: text(formData, "overrideReason"),
    });
  } catch (error) {
    return stateFor(error);
  }

  refreshMembership(membershipId);
  return { error: null, needsOverride: false };
}

/** `active → inactive`. The reason is required — register D1's "why". */
export async function setMembershipInactiveAction(
  _previous: MembershipActionState,
  formData: FormData,
): Promise<MembershipActionState> {
  const operator = await requireCapability("membership_activation");
  const membershipId = text(formData, "membershipId");

  try {
    await setMembershipInactive({
      actorPersonId: operator.personId,
      membershipId,
      reason: text(formData, "reason"),
    });
  } catch (error) {
    return stateFor(error);
  }

  refreshMembership(membershipId);
  return { error: null, needsOverride: false };
}

/** `inactive → active`. Not a fresh readiness declaration; see the service. */
export async function reactivateMembershipAction(
  _previous: MembershipActionState,
  formData: FormData,
): Promise<MembershipActionState> {
  const operator = await requireCapability("membership_activation");
  const membershipId = text(formData, "membershipId");

  try {
    await reactivateMembership({
      actorPersonId: operator.personId,
      membershipId,
      reason: text(formData, "reason"),
    });
  } catch (error) {
    return stateFor(error);
  }

  refreshMembership(membershipId);
  return { error: null, needsOverride: false };
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
  const operator = await requireOperator();
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
  return { error: null, needsOverride: false };
}
