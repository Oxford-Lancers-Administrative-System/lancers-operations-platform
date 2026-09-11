// W154C-C1/C2 — form-state strings <-> MUI X picker Dates (D86, Q-27).

const SCHEDULED_ON_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

export function dateFromScheduledOn(scheduledOn: string): Date | null {
  if (!SCHEDULED_ON_PATTERN.test(scheduledOn)) return null;
  const [year, month, day] = scheduledOn.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** A `Date` (or `null`) → `"2026-08-24"`, `""` if unusable. Year zero-padded so a provisional 1-digit year round-trips without the field reading itself as cleared. */
export function scheduledOnFromDate(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromTimeString(time: string): Date | null {
  if (!TIME_PATTERN.test(time)) return null;
  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59) return null;
  const date = new Date(2000, 0, 1, hour, minute, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A `Date` (or `null`) → `"20:00"`, or `""` for anything unusable. */
export function timeStringFromDate(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}
