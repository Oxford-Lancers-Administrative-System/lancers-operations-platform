import type { CapabilityKey } from "@/lib/auth/capabilities";
import { isNarrowAttendanceRecorder, roleCodesPermit } from "@/lib/auth/capabilities";

/**
 * The operator shell's destinations — all of them.
 *
 * `docs/ux/slice-ux.md` § 3 is explicit: the shell exposes Roster, Events and
 * Report, **and there is no Home destination**. That absence is a decision, not
 * an omission, so this list is the whole navigation and adding a fourth entry
 * is a UX change rather than a code change.
 *
 * `capability` is what the destination *requires*, read from the capability map
 * rather than restated here:
 *
 *   * Roster and Events are ordinary operator surfaces (§ 8, first row). Any
 *     linked active operator opens them; the privileged actions *inside* them —
 *     activation, approval — are guarded individually by the issues that build
 *     them.
 *
 *   * Report is not ordinary. § 8 restricts it to an "authorized report
 *     operator" and does not say who that is, so `leadership_report` is an
 *     empty grant and this destination currently refuses everybody. That is
 *     deliberate and visible: fail-closed until LAN-81 makes the decision, and
 *     the refusal is the interface telling the truth about a decision nobody
 *     has taken rather than a quiet default that lets everyone in.
 *
 * Navigation is never authorization. Every destination guards itself, and this
 * list is also used to decide which one the shell opens on — not what a page is
 * allowed to render.
 */
export interface Destination {
  readonly href: string;
  readonly label: string;
  /** `null` means "any linked, active operator", never "anyone". */
  readonly capability: CapabilityKey | null;
  /** Second line under the label, where the wireframe shows one. */
  readonly detail?: string;
}

export const DESTINATIONS: readonly Destination[] = Object.freeze([
  Object.freeze({ href: "/operate/roster", label: "Roster", capability: null }),
  Object.freeze({ href: "/operate/events", label: "Events", capability: null }),
  Object.freeze({
    href: "/operate/report",
    label: "Report",
    capability: "leadership_report" as CapabilityKey,
  }),
]);

/**
 * The whole of a narrow attendance recorder's navigation — UX-91's sidebar and
 * its phone bottom bar, both of which show exactly one destination. LAN-110.
 *
 * `slice-ux.md` § 3: a coaching assignment "receives only the occurred-event
 * attendance surface. No general operator navigation …". One entry is what
 * "only" means, and the second line is the wireframe's own — **Occurred events
 * only** — which tells a coach why the list is shorter than the club's calendar
 * rather than leaving them to wonder what happened to it.
 *
 * It reuses `/operate/events`, and that is not a shortcut. § 4's route contract
 * is closed, and adding `/operate/attendance` to it would be a UX change this
 * ticket is explicitly forbidden from making ("Do not add a new role,
 * destination, workflow, field, status, or delivery action without a recorded
 * design decision"). The route is shared and the *presentation* is
 * capability-scoped, exactly as § 4 says of the attendance route itself.
 *
 * The label is **Attendance** rather than Events because that is what the
 * wireframe shows and what the destination is for a coach: the list is filtered
 * to occurred events, and every row leads to an attendance board.
 */
export const COACH_DESTINATIONS: readonly Destination[] = Object.freeze([
  Object.freeze({
    href: "/operate/events",
    label: "Attendance",
    capability: "attendance_recorder" as CapabilityKey,
    detail: "Occurred events only",
  }),
]);

/**
 * The destinations this operator's shell shows.
 *
 * Navigation, still, and not authorization: every destination guards itself and
 * a coach who types `/operate/roster` is refused there, not merely unable to
 * click to it.
 */
export function destinationsFor(roleCodes: readonly string[]): readonly Destination[] {
  return isNarrowAttendanceRecorder(roleCodes) ? COACH_DESTINATIONS : DESTINATIONS;
}

/** Can this operator's current roles open the destination? */
export function permitsDestination(
  roleCodes: readonly string[],
  destination: Destination,
): boolean {
  return destination.capability === null || roleCodesPermit(roleCodes, destination.capability);
}

/**
 * The destination the shell opens on, per § 3: "the first destination permitted
 * by the operator's capability map". `null` when none is — an operator with no
 * permitted destination is refused rather than dropped on an empty page.
 */
export function firstPermittedDestination(roleCodes: readonly string[]): Destination | null {
  return (
    destinationsFor(roleCodes).find((destination) => permitsDestination(roleCodes, destination)) ??
    null
  );
}
