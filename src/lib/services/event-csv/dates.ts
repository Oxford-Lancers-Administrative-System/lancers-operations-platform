import { formatDatePart } from "../event-vocabulary";

/**
 * What a `date` cell may say, and how the confirmation reads it back — LAN-317.
 *
 * Two shapes, and only two: `DD/MM/YYYY` and `YYYY-MM-DD`. Excel on a UK
 * machine rewrites the template's date column the moment the file is opened,
 * which refused every row of the first file the club ever built (Clint, tester
 * week). Brian, 2026-09-11: accept day-first and ISO, never the American
 * order. `03/12/2026` is the third of December, always — the month is never
 * inferred from whether a number happens to exceed twelve, so `01/02/2026`
 * is the first of February and `10/14/2026` is refused rather than guessed at.
 */

/** Both accepted shapes, in the words a refusal uses. */
export const DATE_CELL_EXPECTATION =
  "Dates are DD/MM/YYYY or YYYY-MM-DD — 03/12/2026 and 2026-12-03 both mean 3 December 2026.";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_FIRST_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * The cell as a calendar date, or `null` where it is neither shape or names a
 * day that does not exist — 2026-02-30 is refused rather than rolled forward.
 */
export function parseCalendarDate(value: string): string | null {
  const text = value.trim();

  const iso = ISO_DATE.exec(text);
  if (iso !== null) return calendarDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dayFirst = DAY_FIRST_DATE.exec(text);
  if (dayFirst !== null)
    return calendarDay(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));

  return null;
}

function calendarDay(year: number, month: number, day: number): string | null {
  const candidate = `${`${year}`.padStart(4, "0")}-${`${month}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Rejects 2026-02-30 and 2026-13-01, both of which Date would otherwise roll forward.
  return parsed.toISOString().slice(0, 10) === candidate ? candidate : null;
}

/**
 * "3 December 2026" — the form the confirmation shows beside every date it
 * read, so a day-first file cannot be misread and applied unseen. Dates carry
 * no zone, so this formats at UTC exactly as the rest of the calendar does.
 */
export function formatCalendarDate(day: string): string {
  const dayNumber = formatDatePart(day, { day: "numeric" });
  const month = formatDatePart(day, { month: "long" });
  const year = formatDatePart(day, { year: "numeric" });
  return `${dayNumber} ${month} ${year}`;
}
