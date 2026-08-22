/**
 * Where the synthetic dataset's calendar sits relative to the real one.
 *
 * ## The fault this exists to remove
 *
 * `scripts/seed-local.mjs` was authored around one fixed notional "now" —
 * Hilary 2027, week 6 — written into the file as a literal. That was fine on
 * the day it was written and wrong on every day since: run against a machine
 * clock in 2026, every one of the sixty-seven events the dataset records as
 * having *happened* is dated in the future, so the application has no past
 * event anywhere, no saved register anywhere, and no way to show an attendance
 * figure that is a real pair rather than a dash.
 *
 * Replacing one literal with a later literal is not a fix. It reintroduces the
 * same rot on a later date, which is the fault rather than the symptom. So the
 * frame is **derived from the machine clock** instead, and the dataset is slid
 * onto today rather than re-authored around it.
 *
 * ## What "slid" means, precisely
 *
 * Every date in the dataset moves by one offset — `shiftDays` — and nothing
 * else changes. Every interval, every ordering, every weekday, every gap
 * between terms and every week number survives untouched, because they are all
 * differences and a common offset cancels in a difference. The club's history
 * is the same history; only the calendar it is pinned to moves.
 *
 * Three properties constrain the offset.
 *
 * **It is a whole number of weeks.** The club's weeks run Sunday–Saturday
 * (SDA §5.4), the term card is built from them, and the four recurring series
 * are defined by weekday. An offset that is not a multiple of seven would put
 * Sunday Session on a Thursday and every term's 0th week in mid-week. Whole
 * weeks are the only offsets that leave the club's rhythm intact.
 *
 * **It wraps by whole years.** Fifty-two weeks is the closest whole number of
 * weeks to a year, so the offset is decomposed into some number of those wraps
 * plus a residual. Without the wrap the dataset would need re-basing by hand
 * once real time walked past the end of the authored season — which is the rot
 * again, a year later.
 *
 * **The residual is bounded.** The dataset's labels name years: seasons and
 * committee years are "2026-27", the position vocabularies name the era they
 * were adopted in, the legacy workbooks carry the year in the filename. A
 * residual large enough to move one of those dates across a New Year would make
 * its label a lie. {@link MIN_RESIDUAL_DAYS} and {@link MAX_RESIDUAL_DAYS} are
 * the widest residuals under which every one of them survives, and they are
 * whole weeks so that the rounding above still holds. The seed derives the
 * remaining year-bearing labels from the slid dates, so that even at the bound
 * a label cannot contradict the date it names.
 *
 * The bound costs accuracy, not correctness: when today is further from the
 * authored notional now than the bound allows, the notional now lands as close
 * to it as the bound permits — never outside the season. See
 * {@link seedFrame} for exactly how far that can be.
 */

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

/** Fifty-two weeks: a whole year, to the nearest whole week. */
const WRAP_DAYS = 52 * WEEK_DAYS;

/**
 * The instant the dataset is authored around: Hilary 2027, week 6.
 *
 * Michaelmas and early Hilary are therefore history with outcomes, and the rest
 * of the season is still ahead — which is what makes the nonresponse queue and
 * the mid-term attendance lapse visible at the same time. Nothing in the seed
 * is re-dated when the frame moves; this instant is simply carried to today.
 */
export const AUTHORED_NOW_ISO = "2027-02-20T12:00:00Z";

/** The authored current season, whose bounds the notional now must stay inside. */
export const AUTHORED_SEASON_STARTS_ON = "2026-09-27";
export const AUTHORED_SEASON_ENDS_ON = "2027-06-19";

/**
 * The furthest the calendar may slide backwards: twenty-two weeks.
 *
 * The binding date is the previous committee year's AGM, 2025-06-04, which
 * reaches 2025-01-01 at exactly this offset and would fall into 2024 beyond it,
 * making the label "2025-26" false.
 */
export const MIN_RESIDUAL_DAYS = -22 * WEEK_DAYS;

/**
 * The furthest it may slide forwards: thirteen weeks.
 *
 * The binding date is the previous season's opening, 2025-09-28, which reaches
 * 2025-12-28 here and would cross into 2026 beyond it.
 */
export const MAX_RESIDUAL_DAYS = 13 * WEEK_DAYS;

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Any ISO date or timestamp appearing inside a larger string, such as JSON. */
const EMBEDDED_ISO = /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?/g;

const clampToWeeks = (days) => Math.round(days / WEEK_DAYS) * WEEK_DAYS;

/** Noon UTC on the calendar day `instant` falls in — the hour must not matter. */
function noonOn(instant) {
  return Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate(),
    12,
    0,
    0,
    0,
  );
}

/**
 * The frame to seed in, given the machine clock.
 *
 * Returns:
 *
 * - `shiftDays` — add this to every authored date to get the date to store.
 * - `now` — today, expressed in the **authored** frame. The seed generates
 *   against this, so `isPast` and every deadline decide exactly as they always
 *   did; sliding the result by `shiftDays` then lands them on today.
 * - `wraps`, `residual` — the decomposition, for the seed's own reporting and
 *   for the guard below.
 * - `clamped` — whether the residual hit a bound, which is the only case in
 *   which `now` is not within three days of {@link AUTHORED_NOW_ISO}.
 *
 * Because the residual is bounded and any raw residual is at most half a wrap,
 * `now` lands within `[AUTHORED_NOW - 28 days, AUTHORED_NOW + 91 days]` — from
 * Hilary week 1 to Trinity week 4. Both ends are inside the authored season,
 * with the whole of Michaelmas behind them, which is what guarantees the
 * dataset always has past events with registers, past events without, and
 * events still to come.
 */
export function seedFrame(today = new Date()) {
  const authoredNow = Date.parse(AUTHORED_NOW_ISO);
  const anchor = noonOn(today);

  const ideal = Math.round((anchor - authoredNow) / DAY_MS);
  const wraps = Math.round(ideal / WRAP_DAYS);
  const rawResidual = clampToWeeks(ideal - wraps * WRAP_DAYS);

  const residual = Math.min(MAX_RESIDUAL_DAYS, Math.max(MIN_RESIDUAL_DAYS, rawResidual));
  const shiftDays = wraps * WRAP_DAYS + residual;

  return {
    shiftDays,
    wraps,
    residual,
    clamped: residual !== rawResidual,
    now: new Date(anchor - shiftDays * DAY_MS),
    today: new Date(anchor),
  };
}

/**
 * One authored date or timestamp, moved onto the frame.
 *
 * A value that is not a date is returned unchanged rather than guessed at: the
 * dataset is full of strings that contain digits and years — `"2026-27"`,
 * `"oulafc-2026"`, `"{72,24}"` — and none of them is a date. Only a string that
 * is *entirely* an ISO date or timestamp moves, plus ISO values embedded in a
 * JSON payload, which is how a notification job carries the event date it was
 * rendered from.
 */
export function shiftAuthoredValue(value, shiftDays) {
  if (shiftDays === 0 || typeof value !== "string") return value;

  if (ISO_DATE_ONLY.test(value)) {
    return new Date(Date.parse(`${value}T00:00:00Z`) + shiftDays * DAY_MS)
      .toISOString()
      .slice(0, 10);
  }
  if (ISO_TIMESTAMP.test(value)) {
    return new Date(Date.parse(value) + shiftDays * DAY_MS).toISOString();
  }
  if (value.startsWith("{") || value.startsWith("[")) {
    return value.replace(EMBEDDED_ISO, (match) => shiftAuthoredValue(match, shiftDays));
  }
  return value;
}

/**
 * The calendar year an authored date lands in once slid.
 *
 * This is what the seed builds its year-bearing labels from, so that a label
 * and the date it names cannot disagree however far the frame has moved.
 */
export function shiftedYearOf(authoredDate, shiftDays) {
  return new Date(Date.parse(`${authoredDate}T00:00:00Z`) + shiftDays * DAY_MS).getUTCFullYear();
}
