/**
 * W154C-C1/C2 — pure conversions between the strings this form's state (and
 * the server action) speak (`YYYY-MM-DD`, `HH:mm`) and the `Date` objects the
 * MUI X pickers speak.
 *
 * These exist because C1 and C2 replace the native `<input type="date">` and
 * `<input type="time">` controls with MUI X's `DatePicker`/`TimePicker`: a
 * native control renders in the browser/OS locale and ignores the page
 * entirely (D86's whole complaint), where MUI X's field is drawn by the page
 * itself with an explicit `format`, so day-month-year and — since Q-27 — a
 * deliberately-drawn 12-hour clock with AM/PM in five-minute steps hold
 * regardless of what the browser or OS thinks a date or time looks like. The
 * strings these functions round-trip stay plain 24-hour `HH:mm`; only the
 * picker's own presentation changed.
 *
 * The conversions are local-calendar, not UTC — a `Date`'s day/month/year and
 * hour/minute getters read whatever the JS engine's local time zone says,
 * which is also what the picker's field displays and edits. Going through
 * `Date` and back is round-trip safe for that reason: what the operator sees
 * in the field is exactly what these functions read back out of it.
 */

const SCHEDULED_ON_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

/** `"2026-08-24"` → a local `Date` at midnight on that day, or `null`. */
export function dateFromScheduledOn(scheduledOn: string): Date | null {
  if (!SCHEDULED_ON_PATTERN.test(scheduledOn)) return null;
  const [year, month, day] = scheduledOn.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  // Reject the roll-over a naive `new Date(2026, 1, 30)` would silently
  // accept as 2 March — the picker itself never produces such a value, but a
  // malformed hidden-input round-trip should not either.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/**
 * A `Date` (or `null`) → `"2026-08-24"`, or `""` for anything unusable.
 *
 * The year is zero-padded to four digits even though a real event year never
 * needs it. `DatePicker` is controlled with this string round-tripped back
 * through `dateFromScheduledOn` on every render (see the field below), and it
 * fires `onChange` with a genuine, if provisional, `Date` the moment the year
 * section holds even one digit — a day and month already typed, plus a year
 * of "2", is a real 0002-08-24. An unpadded "2-08-24" fails
 * `SCHEDULED_ON_PATTERN`'s four-digit year, so `dateFromScheduledOn` would
 * hand back `null` on the very next render — a value the field reads as "the
 * application cleared this field", which resets the day and month the
 * operator had already typed. Padding keeps every provisional value inside
 * the shape the round trip understands, so the field only ever sees its own
 * value reflected back, never wiped out from under a still-typing year.
 */
export function scheduledOnFromDate(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * `"20:00"` → a local `Date` carrying that hour and minute, or `null`. The
 * calendar date is arbitrary and never read back out — only the time
 * components are — so it is fixed rather than tied to `scheduledOn`, which
 * keeps the Start and End pickers independent of whatever the Date field
 * currently holds.
 */
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
