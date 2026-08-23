import { addDays } from "./calendar";

/**
 * How the event list breaks the season up. LAN-153, `REQ-list-shape`.
 *
 * ## It opens on what is upcoming, and it groups
 *
 * Brian, 20 August 2026, and D84: the list opens on what is coming up rather
 * than on the whole season, and the events in view group by period into
 * **discrete tables** rather than one flat run. The longest of those buckets is
 * the **term**, not a calendar quarter — Brian: "Use term." A quarter cuts
 * Michaelmas in half, and the club does not think in quarters.
 *
 * Past events stay reachable (D57 keeps a cancelled event visible with its
 * history, and an occurred event is the register's own record), and they are
 * never the default view. **All events** is the widest bucket and is where they
 * are, with every sort and every filter working there exactly as everywhere
 * else — Brian, 21 August 2026: "we do need an all events thing … All the sorts
 * should work here. All the filters should work here as well."
 *
 * ## Pure, and shared by both tiers
 *
 * No clock and no database: today, the period and the end of the current Oxford
 * segment are all arguments. The public list and the operator's are the same
 * buckets over the same query, which is half of `REQ-three-arrangements` — the
 * two lists disagreeing about which week an event is in would be exactly the
 * defect that requirement exists to prevent.
 *
 * ## The order inside a bucket is the sort's, not this module's
 *
 * Buckets preserve the order they are handed. The list has one sort control and
 * `docs/ux/standards.md` rule 7 is about one question having one answer, so
 * "Already happened" reads in the same direction as everything above it rather
 * than quietly reversing itself. An operator who wants the most recent first
 * flips the direction, and the whole page follows.
 */

export type EventPeriod = "week" | "month" | "term" | "upcoming" | "all";

export const EVENT_PERIODS: readonly EventPeriod[] = Object.freeze([
  "week",
  "month",
  "term",
  "upcoming",
  "all",
]);

/**
 * What the list opens on.
 *
 * `W1` delegates this one to the Mission Lead as "ordinary engineering within
 * 'opens on upcoming'", and the approved mockup draws the operator list with
 * **This month** selected, so this is the mockup's answer rather than a new one.
 * A month is also the horizon somebody scanning before the Monday meeting is
 * actually working to.
 */
export const DEFAULT_EVENT_PERIOD: EventPeriod = "month";

/** The period a query string asks for. Anything unrecognised is the default. */
export function parseEventPeriod(value: string | null | undefined): EventPeriod {
  return EVENT_PERIODS.includes(value as EventPeriod)
    ? (value as EventPeriod)
    : DEFAULT_EVENT_PERIOD;
}

/** What each period is called on the control. */
export const PERIOD_LABELS: Readonly<Record<EventPeriod, string>> = Object.freeze({
  week: "This week",
  month: "This month",
  term: "This term",
  upcoming: "All upcoming",
  all: "All events",
});

/** The bucket keys, in the order they are rendered. */
export type BucketKey =
  | "soon"
  | "later_this_month"
  | "later_this_term"
  | "later_this_season"
  | "already_happened"
  | "undated";

export interface PeriodBucket<T> {
  key: BucketKey;
  /** The table's caption. */
  label: string;
  events: T[];
}

const BUCKET_LABELS: Readonly<Record<BucketKey, string>> = Object.freeze({
  soon: "This week and next",
  later_this_month: "Later this month",
  later_this_term: "Later this term",
  later_this_season: "Later this season",
  already_happened: "Already happened",
  undated: "No date recorded yet",
});

/**
 * Which buckets a period shows, in order.
 *
 * The buckets partition what is in view — an event lands in the first one it
 * qualifies for — so a period is expressed as *which of them are open* rather
 * than as a second set of date arithmetic that could disagree with the first.
 *
 * `soon` is fourteen days wide on every period including **This week**, which is
 * what the approved mockup draws: its caption is "This week and next", and a
 * seven-day bucket labelled that way would be worse than a fourteen-day one.
 */
const PERIOD_BUCKETS: Readonly<Record<EventPeriod, readonly BucketKey[]>> = Object.freeze({
  week: Object.freeze(["soon"] as const),
  month: Object.freeze(["soon", "later_this_month"] as const),
  term: Object.freeze(["soon", "later_this_month", "later_this_term"] as const),
  upcoming: Object.freeze([
    "soon",
    "later_this_month",
    "later_this_term",
    "later_this_season",
  ] as const),
  all: Object.freeze([
    "soon",
    "later_this_month",
    "later_this_term",
    "later_this_season",
    "already_happened",
  ] as const),
});

/** How far ahead "this week and next" reaches, inclusive of today. */
export const SOON_DAYS = 14;

/** The last day of the calendar month `day` falls in. */
function endOfMonth(day: string): string {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${day.slice(0, 7)}-${`${last}`.padStart(2, "0")}`;
}

/** What a bucketed event has to carry. Both tiers' list entries satisfy it. */
export interface DatedEvent {
  scheduledOn: string | null;
}

export interface BucketOptions {
  /** Today in the club's zone, `YYYY-MM-DD`. */
  today: string;
  period: EventPeriod;
  /**
   * The last day of the Oxford segment today falls in, or `null` when today is
   * in no configured segment.
   *
   * From `@/lib/services/oxford-year`, so "this term" on the list means the same
   * stretch of days the Oxford View draws as this term. Deriving a second answer
   * here — three months, or the calendar quarter — is how the two surfaces would
   * come to disagree.
   */
  segmentEndsOn: string | null;
}

/**
 * The events in view, grouped into the discrete tables the list renders.
 *
 * Empty buckets are dropped, so a season with nothing in the next fortnight does
 * not render an empty table above a full one — the page distinguishes "nothing
 * this period" from "nothing this season" itself, which `slice-ux.md` § 9
 * requires and an empty table would blur.
 */
export function bucketEventsByPeriod<T extends DatedEvent>(
  events: readonly T[],
  options: BucketOptions,
): PeriodBucket<T>[] {
  const { today, period, segmentEndsOn } = options;
  const open = PERIOD_BUCKETS[period];

  const soonEnds = addDays(today, SOON_DAYS - 1) ?? today;
  const monthEnds = endOfMonth(today);
  const termEnds = segmentEndsOn;

  const grouped = new Map<BucketKey, T[]>();
  const put = (key: BucketKey, event: T) => {
    const bucket = grouped.get(key);
    if (bucket) bucket.push(event);
    else grouped.set(key, [event]);
  };

  for (const event of events) {
    const day = event.scheduledOn;

    if (day === null) {
      // An undated event has no period, and is never dropped: `W1`'s exception
      // table says it "cannot be placed on a calendar; listed separately rather
      // than dropped". It is listed on every period for the same reason — it is
      // not in a period nobody is looking at, it is in no period at all.
      put("undated", event);
      continue;
    }

    if (day < today) {
      if (open.includes("already_happened")) put("already_happened", event);
      continue;
    }

    // First match wins, so the buckets partition rather than overlap.
    let key: BucketKey;
    if (day <= soonEnds) key = "soon";
    else if (day <= monthEnds) key = "later_this_month";
    else if (termEnds !== null && day <= termEnds) key = "later_this_term";
    else key = "later_this_season";

    if (open.includes(key)) put(key, event);
  }

  const order: BucketKey[] = [...open, "undated"];
  return order
    .map((key) => ({ key, label: BUCKET_LABELS[key], events: grouped.get(key) ?? [] }))
    .filter((bucket) => bucket.events.length > 0);
}

/** How many events the buckets actually hold — what the page has in view. */
export function bucketedCount<T>(buckets: readonly PeriodBucket<T>[]): number {
  return buckets.reduce((total, bucket) => total + bucket.events.length, 0);
}
