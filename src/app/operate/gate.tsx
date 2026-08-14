import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { assertCapability } from "@/lib/auth/guards";
import {
  capabilityRequirement,
  isNarrowAttendanceRecorder,
  type CapabilityKey,
} from "@/lib/auth/capabilities";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { isServiceError } from "@/lib/db";
import OperatorAccountState from "./account-state";
import CoachNotPermittedScreen from "./coach-not-permitted";
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
 *
 * ## The fifth outcome: a narrow attendance recorder. LAN-110
 *
 * `slice-ux.md` § 3 gives an operator whose only authority is coaching *one*
 * surface, and a capability check cannot express that on its own: Roster and
 * the event detail are open to every linked operator, so there is no capability
 * for a coach to fail. `options.narrowRecorder` is that decision, and it
 * defaults to `"refuse"` — a page says nothing and is closed to a coach.
 *
 * Defaulting closed is the whole value of putting it here. The alternative,
 * listing the surfaces a coach may not open, is a list that a page added next
 * year is silently absent from, and the failure is a coach quietly holding the
 * roster. This way the failure is a coach refused a screen they should have
 * had, which somebody reports on the first day.
 *
 * Two surfaces opt in, and they are the two § 3 names: the attendance board,
 * and the event list that reaches it.
 */
export type ShellGate = { operator: ResolvedOperator } | { screen: ReactElement };

/** What a coach is told when they reach a surface their one destination is not. */
export const COACH_SURFACE_REQUIREMENT =
  "Attendance recording is the only operator surface open to a coaching assignment. " +
  "This action requires a club role that carries general operator access.";

export interface ShellGateOptions {
  /**
   * What a narrow attendance recorder gets here. `"refuse"` is the default and
   * is what every surface outside the coach's one destination wants.
   */
  narrowRecorder?: "allow" | "refuse";
  /**
   * Which refusal a failed `capability` check renders. `"coach"` is UX-96, and
   * belongs to the attendance route alone — it is the one screen whose whole
   * subject is that the reader cannot record attendance here.
   */
  capabilityRefusal?: "operator" | "coach";
}

export async function gateShellPage(
  route: string,
  capability?: CapabilityKey,
  options: ShellGateOptions = {},
): Promise<ShellGate> {
  const access = await resolveOperatorAccess();

  if (access.state === "no_session") {
    redirect(`/login?redirectTo=${encodeURIComponent(route)}`);
  }

  if (access.state !== "active") {
    return { screen: <OperatorAccountState state={access.state} /> };
  }

  if (options.narrowRecorder !== "allow" && isNarrowAttendanceRecorder(access.operator.roleCodes)) {
    // Refused with the ordinary refusal, not the coach one: UX-96 says "you
    // cannot record attendance for this event", which is untrue here — this
    // operator records attendance perfectly well, just not on this screen. The
    // return link is their own destination, which they can always open.
    const fallback = firstPermittedDestination(access.operator.roleCodes);
    return {
      screen: (
        <NotPermittedScreen
          requirement={COACH_SURFACE_REQUIREMENT}
          returnHref={fallback && fallback.href !== route ? fallback.href : undefined}
        />
      ),
    };
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
      const returnHref = fallback && fallback.href !== route ? fallback.href : undefined;

      return {
        screen:
          options.capabilityRefusal === "coach" ? (
            <CoachNotPermittedScreen returnHref={returnHref} />
          ) : (
            <NotPermittedScreen
              requirement={capabilityRequirement(capability)}
              returnHref={returnHref}
            />
          ),
      };
    }
  }

  return { operator: access.operator };
}
