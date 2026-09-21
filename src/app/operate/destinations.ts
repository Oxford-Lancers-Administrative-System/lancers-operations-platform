import type { CapabilityKey } from "@/lib/auth/capabilities";
import { isNarrowAttendanceRecorder, roleCodesPermit } from "@/lib/auth/capabilities";

/**
 * The playbook's index — LAN-399.
 *
 * `/operate/admin/guide` is the existing How administration works page and
 * keeps its own `role_management` gate, so the index takes a segment of its
 * own beneath it and the eight workflow pages sit at
 * `/operate/admin/guide/<slug>` alongside it.
 */
const GUIDE_INDEX_HREF = "/operate/admin/guide/workflows";

// docs/ux/slice-ux.md § 3 owns the shape.
export interface Destination {
  readonly href: string;
  readonly label: string;
  readonly capability: CapabilityKey | null;
  readonly detail?: string;
}

const DESTINATIONS: readonly Destination[] = Object.freeze([
  Object.freeze({
    href: "/operate/roster",
    label: "Roster",
    capability: "person_record_authority" as CapabilityKey,
  }),
  Object.freeze({
    href: "/operate/recruitment",
    label: "Recruitment",
    capability: "person_record_authority" as CapabilityKey,
  }),
  Object.freeze({ href: "/operate/events", label: "Events", capability: null }),
  Object.freeze({
    href: "/operate/report",
    label: "Report",
    capability: "leadership_report" as CapabilityKey,
  }),
]);

// LAN-110's whole navigation, one destination.
const COACH_DESTINATIONS: readonly Destination[] = Object.freeze([
  Object.freeze({
    href: "/operate/events",
    label: "Attendance",
    capability: "attendance_recorder" as CapabilityKey,
    detail: "This season's sessions",
  }),
]);

// Administration is a second list, not more DESTINATIONS entries (LAN-133).
const ADMINISTRATION_DESTINATIONS: readonly Destination[] = Object.freeze([
  Object.freeze({ href: "/operate/admin/follow-ups", label: "Follow-ups", capability: null }),
  Object.freeze({
    href: "/operate/people",
    label: "People",
    capability: "person_record_authority" as CapabilityKey,
  }),
  Object.freeze({
    href: "/operate/people/missing",
    label: "Missing data",
    capability: "person_record_authority" as CapabilityKey,
  }),
  Object.freeze({
    href: "/operate/admin/operators",
    label: "Operators",
    capability: "role_management" as CapabilityKey,
  }),
  Object.freeze({
    href: "/operate/admin/messaging",
    label: "Messaging schedule",
    capability: "delivery_administration" as CapabilityKey,
  }),
  Object.freeze({
    href: "/operate/admin/roles",
    label: "Roles",
    capability: "role_management" as CapabilityKey,
  }),
  // LAN-399. Last, because it is the only entry that is read rather than
  // worked. Its capability is the core four's, so the other seats that reach
  // this list never see it.
  Object.freeze({
    href: GUIDE_INDEX_HREF,
    label: "Guide",
    capability: "operator_guide" as CapabilityKey,
  }),
]);

export const ADMINISTRATION_SECTION = "Administration";

export function administrationDestinationsFor(
  roleCodes: readonly string[],
): readonly Destination[] {
  if (isNarrowAttendanceRecorder(roleCodes)) return [];
  return ADMINISTRATION_DESTINATIONS.filter((destination) =>
    permitsDestination(roleCodes, destination),
  );
}

export function destinationsFor(roleCodes: readonly string[]): readonly Destination[] {
  return isNarrowAttendanceRecorder(roleCodes) ? COACH_DESTINATIONS : DESTINATIONS;
}

function permitsDestination(roleCodes: readonly string[], destination: Destination): boolean {
  return destination.capability === null || roleCodesPermit(roleCodes, destination.capability);
}

export function firstPermittedDestination(roleCodes: readonly string[]): Destination | null {
  return (
    destinationsFor(roleCodes).find((destination) => permitsDestination(roleCodes, destination)) ??
    null
  );
}
