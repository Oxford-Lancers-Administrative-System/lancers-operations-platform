import {
  describeLeadershipLimits,
  describeRoleCapabilities,
  NO_CAPABILITY_SUMMARY,
  roleLabel,
} from "@/lib/auth/capabilities";
import {
  subjectOfRow,
  type AccessSwitch,
  type GrantSubject,
  type RecruitingCategory,
  type RosterCategory,
} from "@/lib/auth/grants";
import { CLUB_TIME_ZONE, formatClubDay, UNREADABLE_DATE } from "@/lib/club-time";
import {
  operatorAccountState,
  type OperatorAccountState,
} from "@/lib/services/operator-account-state";
import type { DirectoryOperator, DirectoryRole } from "@/lib/services/administration-directory";
import { labelFor } from "../labels";
import { MEMBERSHIP_STATUS_LABELS } from "../roster/presentation";

// How Administration says things — LAN-133, `WP-surfaces`, `DEC-administration-language-and-states`; presentation only.

/** `DEC-administration-navigation`: three sections, by group code. */
const OPERATOR_SECTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  operational_administration: "Standing Officers",
  club_committee: "Club Officers",
  coaching_staff: "Coaches",
});

/** `REQ-admin-surfaces` / `REQ-deactivate-and-reinstate`. */
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

/** One line: "President · Wide Receivers Coach", or "No current role". */
export function describeSeats(roles: readonly DirectoryRole[]): string {
  if (roles.length === 0) return "No current role";
  return roles.map(describeSeat).join(" \u00b7 ");
}

/** One seat, with whichever known date (LAN-141 #11). */
function describeSeat(role: DirectoryRole): string {
  const notes: string[] = [];
  if (role.scheduled) notes.push(`from ${formatDay(role.effectiveFrom)}`);
  if (role.effectiveTo) notes.push(`ends ${formatDay(role.effectiveTo)}`);
  return notes.length === 0 ? role.label : `${role.label} (${notes.join(", ")})`;
}

/** Colour per account state (`REQ-invitation-states`). */
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

/** The Operators list's invitation column (LAN131-A5). */
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

/** Who holds one seat (`REQ-admin-surfaces`; Brian, 20 Aug 2026). */
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

/** Plain-language Permissions summary for one seat, and whether it's empty (`REQ-capability-copy-consistency`). */
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

/** What one seat may not do (LAN-141 #10). `null` for seats that don't administer. */
export function limitsLine(code: string): string | null {
  const limits = describeLeadershipLimits(code);
  return limits.length === 0 ? null : `Cannot ${limits.join("; ")}.`;
}

/** Phrases the Roles index shows before "and N more" (reviewed prototype's column width). */
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

/** One assignment's period (`REQ-effective-dated-role-history`: open-ended is ordinary). */
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

/** The stored membership status, in the club's words (LAN-90 § 4). */
export function membershipStatusLabel(status: string): string {
  return labelFor(MEMBERSHIP_STATUS_LABELS, status);
}

// ---------------------------------------------------------------------------
// Access — LAN-430, W1 of mission M-GRANULAR-ROLES-AND-PERMISSIONS (LAN-423)
// ---------------------------------------------------------------------------

/** The Roster group's eleven lines, in the seat page's order (W1-03): the board's ten groups, then Contact & emergency. */
export const ACCESS_ROSTER_LINES: readonly { key: RosterCategory; label: string }[] = Object.freeze(
  [
    { key: "person", label: "Person" },
    { key: "onboarding", label: "Onboarding" },
    { key: "membership", label: "Membership" },
    { key: "availability", label: "Availability" },
    { key: "coaching", label: "Coaching assignments" },
    { key: "offensive", label: "Offensive assignments" },
    { key: "defensive", label: "Defensive assignments" },
    { key: "special_teams", label: "Special teams assignments" },
    { key: "warmup", label: "Warmup assignments" },
    { key: "kit", label: "Kit" },
    { key: "contact_emergency", label: "Contact & emergency" },
  ],
);

/** The Recruiting group's three lines. */
export const ACCESS_RECRUITING_LINES: readonly { key: RecruitingCategory; label: string }[] =
  Object.freeze([
    { key: "recruit_person", label: "Person information" },
    { key: "recruit_details", label: "Recruit details" },
    { key: "recruit_events", label: "Event details" },
  ]);

/** The two switches. */
export const ACCESS_SWITCH_LINES: readonly { key: AccessSwitch; label: string }[] = Object.freeze([
  { key: "add_to_roster", label: "May add to the roster" },
  { key: "add_recruits", label: "May add recruits" },
]);

/** The four group headings, in page order. */
export const ACCESS_GROUP_LABELS = Object.freeze({
  roster: "Roster",
  recruiting: "Recruiting",
  template: "Event templates",
  switch: "Adding people",
});

const LEVEL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  none: "None",
  view: "View",
  edit: "Edit",
  manage: "Manage",
  yes: "Yes",
});

/** A level as the seat page prints it: a switch's `none` is "No". */
export function accessLevelLabel(subject: GrantSubject, level: string): string {
  if (subject.kind === "switch") return level === "yes" ? "Yes" : "No";
  return LEVEL_LABELS[level] ?? level;
}

/** A line's own name. A template line is the template's name; `templateName` is `null` for a template since deleted. */
function accessLineLabel(subject: GrantSubject, templateName: string | null = null): string {
  switch (subject.kind) {
    case "roster":
      return ACCESS_ROSTER_LINES.find((line) => line.key === subject.key)?.label ?? subject.key;
    case "recruiting":
      return ACCESS_RECRUITING_LINES.find((line) => line.key === subject.key)?.label ?? subject.key;
    case "switch":
      return ACCESS_SWITCH_LINES.find((line) => line.key === subject.key)?.label ?? subject.key;
    case "template":
      return templateName ?? "A deleted template";
  }
}

/** One changed line, as a History entry and a confirmation list print it: "Kit: None → Edit", "Chalk (template): None → Manage". */
export function describeAccessChange(
  change: { subject: GrantSubject; from: string; to: string },
  templateName: string | null = null,
): string {
  const label = accessLineLabel(change.subject, templateName);
  const name = change.subject.kind === "template" ? `${label} (template)` : label;
  return `${name}: ${accessLevelLabel(change.subject, change.from)} → ${accessLevelLabel(change.subject, change.to)}`;
}

/** The outcome Notice after one press: "Kit changed from None to Edit." */
export function accessChangedNotice(
  change: { subject: GrantSubject; from: string; to: string },
  templateName: string | null = null,
): string {
  return `${accessLineLabel(change.subject, templateName)} changed from ${accessLevelLabel(change.subject, change.from)} to ${accessLevelLabel(change.subject, change.to)}.`;
}

function grantsChangedCount(count: number): string {
  return `${count} ${count === 1 ? "grant" : "grants"} changed.`;
}

/** The outcome Notice after Copy access: "Access copied from Vice-President. 23 grants changed." */
export function accessCopiedNotice(sourceLabel: string, count: number): string {
  return `Access copied from ${sourceLabel}. ${grantsChangedCount(count)}`;
}

/** The outcome Notice after Grant everything. */
export function everythingGrantedNotice(count: number): string {
  return `Everything granted. ${grantsChangedCount(count)}`;
}

/** Where a line sits on the seat page: roster, recruiting, templates (alphabetical), switches. For sorting a list of changes the way the page reads. */
export function accessLineRank(subject: GrantSubject, templateName: string | null = null): string {
  const pad = (index: number) => String(index).padStart(2, "0");
  switch (subject.kind) {
    case "roster":
      return `0${pad(ACCESS_ROSTER_LINES.findIndex((line) => line.key === subject.key))}`;
    case "recruiting":
      return `1${pad(ACCESS_RECRUITING_LINES.findIndex((line) => line.key === subject.key))}`;
    case "template":
      return `2${(templateName ?? "").toLowerCase()}`;
    case "switch":
      return `3${pad(ACCESS_SWITCH_LINES.findIndex((line) => line.key === subject.key))}`;
  }
}

/** A group's summary when it is folded at 375 (W1-05): "Edit all", "Edit 2 · View 1", "None"; the switches "1 of 2". */
export function accessGroupSummary(
  lines: readonly { subject: GrantSubject; level: string }[],
): string {
  if (lines.length === 0) return "None";
  if (lines[0].subject.kind === "switch") {
    return `${lines.filter((line) => line.level === "yes").length} of ${lines.length}`;
  }
  const held = lines.filter((line) => line.level !== "none");
  if (held.length === 0) return "None";
  if (held.length === lines.length && held.every((line) => line.level === held[0].level)) {
    return `${accessLevelLabel(held[0].subject, held[0].level)} all`;
  }
  return ["manage", "edit", "view"]
    .map((level) => ({ level, count: held.filter((line) => line.level === level).length }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `${LEVEL_LABELS[entry.level]} ${entry.count}`)
    .join(" · ");
}

/** A change as an access audit row stores it (`src/lib/services/access-grants.ts`, `describeChange`). */
interface StoredAccessChange {
  readonly subjectKind?: unknown;
  readonly subjectKey?: unknown;
  readonly templateId?: unknown;
  readonly templateName?: unknown;
  readonly from?: unknown;
  readonly to?: unknown;
}

function storedChangeLine(stored: StoredAccessChange): { rank: string; line: string } | null {
  const subject = subjectOfRow({
    subject_kind: typeof stored.subjectKind === "string" ? stored.subjectKind : "",
    subject_key: typeof stored.subjectKey === "string" ? stored.subjectKey : null,
    template_id: typeof stored.templateId === "string" ? stored.templateId : null,
    level: "none",
  });
  if (subject === null) return null;
  const templateName = typeof stored.templateName === "string" ? stored.templateName : null;
  return {
    rank: accessLineRank(subject, templateName),
    line: describeAccessChange(
      {
        subject,
        from: typeof stored.from === "string" ? stored.from : "none",
        to: typeof stored.to === "string" ? stored.to : "none",
      },
      templateName,
    ),
  };
}

/**
 * What an access History entry says changed — one line for a single press,
 * one line per changed grant for a copy or Grant everything, in the page's
 * order. Empty for any other entry.
 */
export function accessHistoryLines(entry: {
  readonly family: string;
  readonly action: string;
  readonly fromState: string | null;
  readonly toState: string | null;
  readonly detail: Record<string, unknown>;
}): string[] {
  if (entry.family !== "access") return [];
  const stored: StoredAccessChange[] =
    entry.action === "administration.access.changed"
      ? [{ ...entry.detail, from: entry.fromState, to: entry.toState }]
      : Array.isArray(entry.detail.changes)
        ? (entry.detail.changes as StoredAccessChange[])
        : [];
  return stored
    .map(storedChangeLine)
    .filter((line): line is { rank: string; line: string } => line !== null)
    .sort((left, right) => left.rank.localeCompare(right.rank))
    .map((line) => line.line);
}

/** An access History entry's title: a copy names its source seat (W1-08); the rest keep their label. */
export function accessHistoryTitle(entry: {
  readonly action: string;
  readonly label: string;
  readonly detail: Record<string, unknown>;
}): string {
  if (entry.action === "administration.access.copied") {
    const source = entry.detail.sourceRoleCode;
    if (typeof source === "string") return `Access copied from ${roleLabel(source)}`;
  }
  return entry.label;
}
