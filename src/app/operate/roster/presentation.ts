import type { MembershipStatus } from "@/lib/services/membership";

// The words the roster screens use, fixed in one place — LAN-90 § 4. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md.

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
