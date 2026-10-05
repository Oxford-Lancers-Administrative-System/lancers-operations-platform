import type { AttendanceBand } from "@/lib/services/attendance-score";
import type { MembershipStatus } from "@/lib/services/membership";
import { SEMANTIC } from "@/theme-tokens";

// The words the roster screens use, fixed in one place — LAN-90 § 4.

export const MEMBERSHIP_STATUS_LABELS: Readonly<Record<MembershipStatus, string>> = Object.freeze({
  onboarding: "Onboarding",
  active: "Active",
  inactive: "Inactive",
  departed: "Departed",
  archived: "Archived",
});

export const ENTRY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  returning: "Returning",
  new: "New",
});

export { labelFor } from "../labels";

/** The attendance figure's text colour by band — the theme's semantic set (`palette.success` etc.), shared by the board and the record. */
export const ATTENDANCE_BAND_COLOUR: Readonly<Record<AttendanceBand, string>> = Object.freeze({
  green: SEMANTIC.success.main,
  amber: SEMANTIC.warning.main,
  red: SEMANTIC.error.main,
});

export function formatWhen(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(value);
}

/** A plain date — `YYYY-MM-DD` as the club reads it. */
export function formatDay(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Europe/London",
  }).format(parsed);
}
