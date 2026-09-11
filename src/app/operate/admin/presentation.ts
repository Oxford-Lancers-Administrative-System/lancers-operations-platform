import {
  describeLeadershipLimits,
  describeRoleCapabilities,
  NO_CAPABILITY_SUMMARY,
} from "@/lib/auth/capabilities";
import { CLUB_TIME_ZONE, formatClubDay, UNREADABLE_DATE } from "@/lib/club-time";
import {
  operatorAccountState,
  type OperatorAccountState,
} from "@/lib/services/operator-account-state";
import type { DirectoryOperator, DirectoryRole } from "@/lib/services/administration-directory";
import { labelFor } from "../labels";
import { MEMBERSHIP_STATUS_LABELS } from "../roster/presentation";

// How Administration says things — LAN-133, `WP-surfaces`, `DEC-administration-language-and-states`; presentation only.

/** `DEC-administration-navigation`: three sections, by group code. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
const OPERATOR_SECTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  operational_administration: "Standing Officers",
  club_committee: "Club Officers",
  coaching_staff: "Coaches",
});

/** `REQ-admin-surfaces` / `REQ-deactivate-and-reinstate`. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export const UNASSIGNED_SECTION_LABEL = "Without a current role";

export interface OperatorSection {
  /** `role_groups.code`, or `""` for the remainder. */
  readonly code: string;
  readonly label: string;
  readonly operators: readonly DirectoryOperator[];
}

export function sectionLabelForGroup(groupCode: string, groupLabel: string): string {
  return OPERATOR_SECTION_LABELS[groupCode] ?? groupLabel;
}

// Operators split into approved sections; an operator in >1 group appears in each (LAN-141 #9, relocations.md).
export function operatorSections(
  operators: readonly DirectoryOperator[],
): readonly OperatorSection[] {
  const sections = new Map<
    string,
    { sort: number; label: string; operators: DirectoryOperator[] }
  >();

  const place = (code: string, label: string, sort: number, operator: DirectoryOperator): void => {
    const section = sections.get(code);
    if (section) section.operators.push(operator);
    else sections.set(code, { sort, label, operators: [operator] });
  };

  for (const operator of operators) {
    const groups = distinctGroups(operator.roles);

    if (groups.length === 0) {
      place("", UNASSIGNED_SECTION_LABEL, Number.MAX_SAFE_INTEGER, operator);
      continue;
    }

    for (const group of groups) {
      place(
        group.groupCode,
        sectionLabelForGroup(group.groupCode, group.groupLabel),
        group.groupSortOrder,
        operator,
      );
    }
  }

  return [...sections.entries()]
    .sort((left, right) => left[1].sort - right[1].sort)
    .map(([code, section]) => ({ code, label: section.label, operators: section.operators }));
}

function distinctGroups(roles: readonly DirectoryRole[]): readonly DirectoryRole[] {
  const seen = new Map<string, DirectoryRole>();
  for (const role of roles) if (!seen.has(role.groupCode)) seen.set(role.groupCode, role);
  return [...seen.values()].sort((left, right) => left.groupSortOrder - right.groupSortOrder);
}

/** One line: "President · Wide Receivers Coach", or "No current role". Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export function describeSeats(roles: readonly DirectoryRole[]): string {
  if (roles.length === 0) return "No current role";
  return roles.map(describeSeat).join(" \u00b7 ");
}

/** One seat, with whichever known date (LAN-141 #11). Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
function describeSeat(role: DirectoryRole): string {
  const notes: string[] = [];
  if (role.scheduled) notes.push(`from ${formatDay(role.effectiveFrom)}`);
  if (role.effectiveTo) notes.push(`ends ${formatDay(role.effectiveTo)}`);
  return notes.length === 0 ? role.label : `${role.label} (${notes.join(", ")})`;
}

/** Colour per account state (`REQ-invitation-states`). Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export function accountStateColour(
  state: OperatorAccountState,
): "success" | "warning" | "error" | "default" {
  switch (state) {
    case "active":
      return "success";
    case "invitation_pending":
      return "warning";
    case "delivery_failed":
      return "error";
    case "email_change_pending":
      return "warning";
    case "deactivated":
      return "default";
  }
}

export function accountStateLabel(state: OperatorAccountState): string {
  return operatorAccountState(state).label;
}

/** The Operators list's invitation column (LAN131-A5). Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export function describeInvitationProgress(operator: {
  readonly state: OperatorAccountState;
  readonly invitedAt: Date | null;
  readonly activatedAt: Date | null;
  readonly deliveryFailedAt: Date | null;
  readonly deliveryFailureReason: string | null;
}): string {
  if (operator.state === "delivery_failed") {
    // "Failed" alone was the answer when unrecorded — a word, not a sentence (LAN-141).
    const when = operator.deliveryFailedAt
      ? `Failed ${formatInstant(operator.deliveryFailedAt)}`
      : "Failed, at a time that was not recorded";
    return operator.deliveryFailureReason ? `${when} · ${operator.deliveryFailureReason}` : when;
  }
  if (operator.activatedAt) return `Accepted ${formatDay(operator.activatedAt)}`;
  if (operator.invitedAt) return `Sent ${formatInstant(operator.invitedAt)}`;
  return "No invitation recorded";
}

/** What Administration calls a seat nobody holds. `DEC-account-state-separation`. */
export const NOT_ASSIGNED = "Not assigned";

/** Two cycles: coaching seats hang off the season, committee seats off the committee year. */
export const NO_CYCLE: Readonly<Record<"committee_year" | "season", string>> = Object.freeze({
  committee_year: "No committee year recorded",
  season: "No season under way",
});

/** Who holds one seat (`REQ-admin-surfaces`; Brian, 20 Aug 2026). Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export function describeHolders(role: {
  readonly scope: "committee_year" | "season";
  readonly vacant: boolean;
  readonly cycleMissing: boolean;
  readonly holders: readonly {
    readonly displayName: string;
    readonly effectiveTo: string | null;
    readonly scheduled: boolean;
    readonly accessDeactivated: boolean;
    readonly operatorState: OperatorAccountState | null;
  }[];
  /** Recorded to start later. Never holders, and never a substitute for one. */
  readonly scheduled?: readonly {
    readonly displayName: string;
    readonly effectiveFrom: string;
  }[];
}): string {
  const arriving = (role.scheduled ?? [])
    .map((entry) => `${entry.displayName} from ${formatDay(entry.effectiveFrom)}`)
    .join(", ");

  // The cycle is checked last, not first (LAN-141 #4) — only an answer when there's no holder.
  if (role.holders.length === 0 && arriving === "" && role.cycleMissing) {
    return NO_CYCLE[role.scope];
  }

  const current = role.vacant
    ? NOT_ASSIGNED
    : role.holders
        .map((holder) => {
          const notes: string[] = [];
          if (holder.accessDeactivated) notes.push("access deactivated");
          if (holder.effectiveTo) notes.push(`ends ${formatDay(holder.effectiveTo)}`);
          return notes.length === 0
            ? holder.displayName
            : `${holder.displayName} (${notes.join(", ")})`;
        })
        .join(", ");

  return arriving === "" ? current : `${current} \u00b7 ${arriving}`;
}

/** Plain-language Permissions summary for one seat, and whether it's empty (`REQ-capability-copy-consistency`). Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export function permissionsSummary(code: string): {
  readonly empty: boolean;
  readonly items: readonly string[];
} {
  const described = describeRoleCapabilities(code);
  const empty = described.length === 1 && described[0] === NO_CAPABILITY_SUMMARY;
  return { empty, items: described };
}

export function permissionsLine(code: string): string {
  const { empty, items } = permissionsSummary(code);
  return empty ? items[0] : `Can ${items.join("; ")}.`;
}

/** What one seat may not do (LAN-141 #10). `null` for seats that don't administer. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export function limitsLine(code: string): string | null {
  const limits = describeLeadershipLimits(code);
  return limits.length === 0 ? null : `Cannot ${limits.join("; ")}.`;
}

/** Phrases the Roles index shows before "and N more" (reviewed prototype's column width). Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
const INDEX_PERMISSION_PHRASES = 3;

export function permissionsPreview(code: string): string {
  const { empty, items } = permissionsSummary(code);
  if (empty) return items[0];
  if (items.length <= INDEX_PERMISSION_PHRASES) return `Can ${items.join("; ")}.`;

  const shown = items.slice(0, INDEX_PERMISSION_PHRASES).join("; ");
  const remaining = items.length - INDEX_PERMISSION_PHRASES;
  return `Can ${shown}; and ${remaining} more.`;
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export { UNREADABLE_DATE } from "@/lib/club-time";

// The moment to render + its zone: three input shapes, not interchangeable — a defect the browser preflight found (LAN-141, relocations.md).
function toInstant(value: Date | string): { instant: Date; zone: string } | null {
  if (typeof value !== "string") {
    return Number.isNaN(value.getTime()) ? null : { instant: value, zone: CLUB_TIME_ZONE };
  }

  const calendarDate = CALENDAR_DATE.test(value);
  const instant = new Date(calendarDate ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(instant.getTime())) return null;
  return { instant, zone: calendarDate ? "UTC" : CLUB_TIME_ZONE };
}

function part(
  moment: { instant: Date; zone: string },
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: moment.zone }).format(
    moment.instant,
  );
}

/** "18 Aug 2026" — a calendar date, or an instant reduced to its day. */
export function formatDay(value: Date | string): string {
  if (typeof value === "string" && CALENDAR_DATE.test(value)) return formatClubDay(value);

  const moment = toInstant(value);
  if (!moment) return UNREADABLE_DATE;
  return `${part(moment, { day: "numeric" })} ${part(moment, { month: "short" })} ${part(moment, {
    year: "numeric",
  })}`;
}

/** "18 Aug 2026, 14:22" — a recorded moment, in the club's own time. */
export function formatInstant(value: Date | string): string {
  const moment = toInstant(value);
  if (!moment) return UNREADABLE_DATE;
  return `${formatDay(value)}, ${part(moment, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

/** One assignment's period (`REQ-effective-dated-role-history`: open-ended is ordinary). Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export function describePeriod(assignment: {
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly scheduled: boolean;
}): string {
  const from = formatDay(assignment.effectiveFrom);
  if (assignment.scheduled) {
    return assignment.effectiveTo
      ? `Starts ${from}, ends ${formatDay(assignment.effectiveTo)}`
      : `Starts ${from}`;
  }
  return assignment.effectiveTo ? `${from} – ${formatDay(assignment.effectiveTo)}` : `From ${from}`;
}

/** The stored membership status, in the club's words (LAN-90 § 4). Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export function membershipStatusLabel(status: string): string {
  return labelFor(MEMBERSHIP_STATUS_LABELS, status);
}
