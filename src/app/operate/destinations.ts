import { holdsAccess, type AccessHolder, type AccessRule } from "@/lib/auth/access";
import { isNarrowAttendanceRecorder } from "@/lib/auth/capabilities";
import { RECRUITING_REACH, ROSTER_REACH } from "@/lib/auth/roster-access";

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
  /**
   * Who sees the entry: a capability, a grant rule, or either of several
   * (`@/lib/auth/access`). `null` is every operator the list is shown to.
   */
  readonly access: AccessRule | null;
  readonly detail?: string;
}

/**
 * LAN-429's sidebar rules (LAN-423, W1 "Handoffs"). Roster, People and Missing
 * data follow any roster category at `view`; Recruitment any recruiting
 * category at `view`; Events any template at `view` or an attendance
 * capability; Follow-ups any template at `view`; Messaging any template at
 * `manage`. Report is drawn only for the seats holding `leadership_report`
 * (LAN-423 round 6, Brian: "not a permissions issue"), never a grant line.
 * The rest of Administration is unchanged.
 */
const ANY_ROSTER: AccessRule = ROSTER_REACH;
const ANY_RECRUITING: AccessRule = RECRUITING_REACH;
const ANY_TEMPLATE: AccessRule = Object.freeze({ anyOf: "template", minimum: "view" });
const ANY_MANAGED_TEMPLATE: AccessRule = Object.freeze({ anyOf: "template", minimum: "manage" });
const EVENTS: AccessRule = Object.freeze({
  either: Object.freeze([ANY_TEMPLATE, "attendance_recording", "attendance_recorder"]),
}) as AccessRule;

const DESTINATIONS: readonly Destination[] = Object.freeze([
  Object.freeze({ href: "/operate/roster", label: "Roster", access: ANY_ROSTER }),
  Object.freeze({ href: "/operate/recruitment", label: "Recruitment", access: ANY_RECRUITING }),
  Object.freeze({ href: "/operate/events", label: "Events", access: EVENTS }),
  Object.freeze({
    href: "/operate/report",
    label: "Report",
    access: "leadership_report" as AccessRule,
  }),
]);

// LAN-110's whole navigation, one destination.
const COACH_DESTINATIONS: readonly Destination[] = Object.freeze([
  Object.freeze({
    href: "/operate/events",
    label: "Attendance",
    access: "attendance_recorder" as AccessRule,
    detail: "This season's sessions",
  }),
]);

// Administration is a second list, not more DESTINATIONS entries (LAN-133).
const ADMINISTRATION_DESTINATIONS: readonly Destination[] = Object.freeze([
  Object.freeze({ href: "/operate/admin/follow-ups", label: "Follow-ups", access: ANY_TEMPLATE }),
  Object.freeze({ href: "/operate/people", label: "People", access: ANY_ROSTER }),
  Object.freeze({ href: "/operate/people/missing", label: "Missing data", access: ANY_ROSTER }),
  Object.freeze({
    href: "/operate/admin/operators",
    label: "Operators",
    access: "role_management" as AccessRule,
  }),
  Object.freeze({
    href: "/operate/admin/messaging",
    label: "Messaging schedule",
    access: ANY_MANAGED_TEMPLATE,
  }),
  Object.freeze({
    href: "/operate/admin/roles",
    label: "Roles",
    access: "role_management" as AccessRule,
  }),
  // LAN-399. Last, because it is the only entry that is read rather than
  // worked. Its capability is the core four's, so the other seats that reach
  // this list never see it.
  Object.freeze({
    href: GUIDE_INDEX_HREF,
    label: "Guide",
    access: "operator_guide" as AccessRule,
  }),
]);

export const ADMINISTRATION_SECTION = "Administration";

export function administrationDestinationsFor(operator: AccessHolder): readonly Destination[] {
  if (isNarrowAttendanceRecorder(operator.roleCodes, operator.grants)) return [];
  return ADMINISTRATION_DESTINATIONS.filter((destination) =>
    permitsDestination(operator, destination),
  );
}

/** The primary list. Filtered by access (LAN-429): an entry the operator cannot open is not drawn. */
export function destinationsFor(operator: AccessHolder): readonly Destination[] {
  if (isNarrowAttendanceRecorder(operator.roleCodes, operator.grants)) return COACH_DESTINATIONS;
  return DESTINATIONS.filter((destination) => permitsDestination(operator, destination));
}

function permitsDestination(operator: AccessHolder, destination: Destination): boolean {
  return destination.access === null || holdsAccess(operator, destination.access);
}

export function firstPermittedDestination(operator: AccessHolder): Destination | null {
  return (
    destinationsFor(operator).find((destination) => permitsDestination(operator, destination)) ??
    null
  );
}
