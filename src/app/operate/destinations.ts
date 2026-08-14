import type { CapabilityKey } from "@/lib/auth/capabilities";
import { roleCodesPermit } from "@/lib/auth/capabilities";

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
 *     operator" and does not say who that is, so `leadership_report` was an
 *     empty grant that refused everybody — deliberately and visibly — until
 *     LAN-81, the issue that owed the answer, resolved it to the four calendar
 *     roles. `capabilities.ts` carries the reasoning and the reason it is
 *     narrower than the ordinary operator floor: the snapshot leads with the
 *     reasons people gave for not attending.
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
  return DESTINATIONS.find((destination) => permitsDestination(roleCodes, destination)) ?? null;
}
