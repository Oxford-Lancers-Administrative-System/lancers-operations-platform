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

// The gate every page under /operate opens with — the second of two
// independent checks. LAN-110's fifth outcome: a narrow attendance recorder
// defaults closed. Decision history: docs/ux/tickets/LAN-110-coach-attendance.md · docs/ux/tickets/LAN-73-shell-and-access.md.
export type ShellGate = { operator: ResolvedOperator } | { screen: ReactElement };

/** What a coach is told when they reach a surface their one destination is not. */
const COACH_SURFACE_REQUIREMENT =
  "Attendance recording is the only operator surface open to a coaching assignment. " +
  "This action requires a club role that carries general operator access.";

export interface ShellGateOptions {
  narrowRecorder?: "allow" | "refuse";
  /** `"coach"` is UX-96, and belongs to the attendance route alone. */
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
    // The ordinary refusal, not the coach one — UX-96 would be untrue here.
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
