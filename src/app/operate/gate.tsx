import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { assertCapability } from "@/lib/auth/guards";
import { capabilityRequirement, type CapabilityKey } from "@/lib/auth/capabilities";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { isServiceError } from "@/lib/db";
import OperatorAccountState from "./account-state";
import NotPermittedScreen from "./not-permitted";
import { firstPermittedDestination } from "./destinations";

/**
 * The gate every page under `/operate` opens with.
 *
 * One implementation, called by each page, rather than three lines copied into
 * each page: a screen that forgets one of the four outcomes is the way this
 * kind of boundary fails, and the failure is silent. Here there is one place to
 * read and one place to review.
 *
 * It is not a replacement for the layout's own check — it is the second of two
 * independent checks. The layout guards the frame; this guards the page. Either
 * refuses on its own, and neither depends on the other having run.
 *
 * The four outcomes:
 *
 *   * **no session** — redirect to `/login`, preserving this route so the
 *     operator lands where they were going.
 *   * **unlinked / deactivated** — the approved account state, and no page
 *     content at all.
 *   * **active, capability refused** — UX-05, naming what the action requires.
 *     The refusal comes from `assertCapability()` throwing, not from an `if`
 *     written here: the page renders the refusal, the guard makes it.
 *   * **active and permitted** — the operator, for the page to use.
 *
 * `capability` is omitted for the ordinary operator surfaces (§ 8's first row).
 * Omitting it means "any linked, active operator", never "anybody".
 */
export type ShellGate = { operator: ResolvedOperator } | { screen: ReactElement };

export async function gateShellPage(route: string, capability?: CapabilityKey): Promise<ShellGate> {
  const access = await resolveOperatorAccess();

  if (access.state === "no_session") {
    redirect(`/login?redirectTo=${encodeURIComponent(route)}`);
  }

  if (access.state !== "active") {
    return { screen: <OperatorAccountState state={access.state} /> };
  }

  if (capability) {
    try {
      assertCapability(access.operator, capability);
    } catch (error) {
      if (!isServiceError(error) || error.kind !== "not_permitted") throw error;

      // Somewhere this operator can actually go. `undefined` when there is
      // nowhere — in which case UX-05 offers sign-out alone rather than a link
      // that would refuse them again.
      const fallback = firstPermittedDestination(access.operator.roleCodes);
      return {
        screen: (
          <NotPermittedScreen
            requirement={capabilityRequirement(capability)}
            returnHref={fallback && fallback.href !== route ? fallback.href : undefined}
          />
        ),
      };
    }
  }

  return { operator: access.operator };
}
