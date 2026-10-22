/**
 * The attendance register's **Group by** — LAN-497, build spec approved by
 * Brian, 16 October 2026 (Option 2 of the LAN-497/495 design proposal).
 *
 * Four families, each the roster's own field and the roster's own access
 * category: Coaching group, Offensive position group, Defensive position group
 * and Warmup group. A viewer is offered a family only where their role holds
 * View on that roster category (`roster-access.ts`) — no new permission — and
 * `readAttendanceBoard` returns a family's values only to such a viewer.
 *
 * Pure: no database, no React. Safe in a client bundle.
 */
import type { OperatorGrants } from "@/lib/auth/grants";
import { mayViewRoster } from "@/lib/auth/roster-access";
import {
  COACHING_GROUP_VALUES,
  DEFENSIVE_POSITION_GROUP_VALUES,
  OFFENSIVE_POSITION_GROUP_VALUES,
  WARMUP_SMALL_GROUP_VALUES,
} from "./roster-board/vocabulary";

/** The families, in the select's order. Each is also its roster category and its `?by=` value. */
export const ATTENDANCE_GROUP_FAMILIES = Object.freeze([
  "coaching",
  "offensive",
  "defensive",
  "warmup",
] as const);

export type AttendanceGroupFamily = (typeof ATTENDANCE_GROUP_FAMILIES)[number];

/** The select's labels — the roster's field names. */
export const ATTENDANCE_GROUP_FAMILY_LABELS: Readonly<Record<AttendanceGroupFamily, string>> =
  Object.freeze({
    coaching: "Coaching group",
    offensive: "Offensive position group",
    defensive: "Defensive position group",
    warmup: "Warmup group",
  });

/** The last section's heading — "No warmup group". */
export const ATTENDANCE_NO_GROUP_LABELS: Readonly<Record<AttendanceGroupFamily, string>> =
  Object.freeze({
    coaching: "No coaching group",
    offensive: "No offensive position group",
    defensive: "No defensive position group",
    warmup: "No warmup group",
  });

/** Each family's values in roster vocabulary order — the order its sections run in. */
export const ATTENDANCE_GROUP_VALUES: Readonly<Record<AttendanceGroupFamily, readonly string[]>> =
  Object.freeze({
    coaching: COACHING_GROUP_VALUES,
    offensive: OFFENSIVE_POSITION_GROUP_VALUES,
    defensive: DEFENSIVE_POSITION_GROUP_VALUES,
    warmup: WARMUP_SMALL_GROUP_VALUES,
  });

/** One participant's values, for the families this viewer may see. A family absent from the map was not sent. */
export type AttendanceGroupValues = Readonly<
  Partial<Record<AttendanceGroupFamily, readonly string[]>>
>;

function isAttendanceGroupFamily(value: unknown): value is AttendanceGroupFamily {
  return (
    typeof value === "string" && (ATTENDANCE_GROUP_FAMILIES as readonly string[]).includes(value)
  );
}

/** The families a viewer may group by: View on the matching roster category, each independently. */
export function visibleAttendanceGroupFamilies(
  grants: OperatorGrants | null,
): AttendanceGroupFamily[] {
  if (grants === null) return [];
  return ATTENDANCE_GROUP_FAMILIES.filter((family) => mayViewRoster(grants, family));
}

/**
 * A `?by=` value, or null for None. A family the viewer may not see is
 * ignored, the same as one that is not a family at all.
 */
export function parseAttendanceGroupBy(
  value: unknown,
  visible: readonly AttendanceGroupFamily[],
): AttendanceGroupFamily | null {
  return isAttendanceGroupFamily(value) && visible.includes(value) ? value : null;
}

/** Where a remembered choice is kept in this browser — one per viewer. */
export function attendanceGroupByStorageKey(personId: string): string {
  return `lancers:attendance-group-by:${personId}`;
}
