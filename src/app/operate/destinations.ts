import type { CapabilityKey } from "@/lib/auth/capabilities";
import { isNarrowAttendanceRecorder, roleCodesPermit } from "@/lib/auth/capabilities";

// docs/ux/slice-ux.md § 3 owns the shape. Decision history: docs/ux/tickets/LAN-186-roster-board.md · docs/ux/tickets/LAN-204-recruit-board-record-exits-flip.md · docs/ux/tickets/LAN-110-coach-attendance.md · docs/ux/tickets/LAN-184-people-and-missing-queue.md · docs/ux/tickets/LAN-73-shell-and-access.md.
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
  // Decision history: docs/ux/tickets/LAN-186-roster-board.md · docs/ux/tickets/LAN-204-recruit-board-record-exits-flip.md · docs/ux/tickets/LAN-110-coach-attendance.md · docs/ux/tickets/LAN-184-people-and-missing-queue.md · docs/ux/tickets/LAN-73-shell-and-access.md.
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

// LAN-110's whole navigation, one destination. Decision history: docs/ux/tickets/LAN-110-coach-attendance.md
const COACH_DESTINATIONS: readonly Destination[] = Object.freeze([
  Object.freeze({
    href: "/operate/events",
    label: "Attendance",
    capability: "attendance_recorder" as CapabilityKey,
    detail: "This season's sessions",
  }),
]);

// Administration is a second list, not more DESTINATIONS entries (LAN-133). Decision history: docs/ux/tickets/LAN-186-roster-board.md · docs/ux/tickets/LAN-204-recruit-board-record-exits-flip.md · docs/ux/tickets/LAN-110-coach-attendance.md · docs/ux/tickets/LAN-184-people-and-missing-queue.md · docs/ux/tickets/LAN-73-shell-and-access.md.
const ADMINISTRATION_DESTINATIONS: readonly Destination[] = Object.freeze([
  // Decision history: docs/ux/tickets/LAN-186-roster-board.md · docs/ux/tickets/LAN-204-recruit-board-record-exits-flip.md · docs/ux/tickets/LAN-110-coach-attendance.md · docs/ux/tickets/LAN-184-people-and-missing-queue.md · docs/ux/tickets/LAN-73-shell-and-access.md.
  Object.freeze({ href: "/operate/admin/follow-ups", label: "Follow-ups", capability: null }),
  // Decision history: docs/ux/tickets/LAN-186-roster-board.md · docs/ux/tickets/LAN-204-recruit-board-record-exits-flip.md · docs/ux/tickets/LAN-110-coach-attendance.md · docs/ux/tickets/LAN-184-people-and-missing-queue.md · docs/ux/tickets/LAN-73-shell-and-access.md.
  Object.freeze({
    href: "/operate/people",
    label: "People",
    capability: "person_record_authority" as CapabilityKey,
  }),
  // Decision history: docs/ux/tickets/LAN-186-roster-board.md · docs/ux/tickets/LAN-204-recruit-board-record-exits-flip.md · docs/ux/tickets/LAN-110-coach-attendance.md · docs/ux/tickets/LAN-184-people-and-missing-queue.md · docs/ux/tickets/LAN-73-shell-and-access.md.
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
