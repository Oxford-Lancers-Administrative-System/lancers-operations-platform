import { addDays, weekdayOf } from "./calendar";

// How the event list breaks the season up — LAN-153, REQ-list-shape. Opens on what is upcoming
// (D84), grouped into discrete tables by period, longest being the term (Brian: "Use term"). Pure,
// shared by both tiers — half of REQ-three-arrangements. See relocations.md.
// Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE

export type EventPeriod = "week" | "month" | "term" | "upcoming" | "all";

export const EVENT_PERIODS: readonly EventPeriod[] = Object.freeze([
  "week",
  "month",
  "term",
  "upcoming",
  "all",
]);

// W1 delegated this as ordinary engineering; the approved mockup draws This month selected.
export const DEFAULT_EVENT_PERIOD: EventPeriod = "month";

export function parseEventPeriod(value: string | null | undefined): EventPeriod {
  return EVENT_PERIODS.includes(value as EventPeriod)
    ? (value as EventPeriod)
    : DEFAULT_EVENT_PERIOD;
}

export const PERIOD_LABELS: Readonly<Record<EventPeriod, string>> = Object.freeze({
  week: "This week",
  month: "This month",
  term: "This term",
  upcoming: "All upcoming",
  all: "All events",
});

type BucketKey =
  | "soon"
  | "later_this_month"
  | "later_this_term"
  | "later_this_season"
  | "already_happened"
  | "undated";

export interface PeriodBucket<T> {
  key: BucketKey;
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

// Which buckets a period shows, in order — an event lands in the first it qualifies for; periodBounds
// decides whether it's in view at all. `soon` is fourteen days (the mockup's "This week and next").
const PERIOD_BUCKETS: Readonly<Record<EventPeriod, readonly BucketKey[]>> = Object.freeze({
  week: Object.freeze(["soon", "already_happened"] as const),
  month: Object.freeze(["soon", "later_this_month", "already_happened"] as const),
  term: Object.freeze(["soon", "later_this_month", "later_this_term", "already_happened"] as const),
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

export const SOON_DAYS = 14; // how far ahead "this week and next" reaches, inclusive of today

function endOfMonth(day: string): string {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${day.slice(0, 7)}-${`${last}`.padStart(2, "0")}`;
}

function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

function startOfWeek(day: string): string {
  const weekday = weekdayOf(day);
  if (weekday === null) return day;
  const daysSinceMonday = (weekday + 6) % 7; // weekdayOf is 0=Sunday..6=Saturday; this club's week is Monday-first
  return addDays(day, -daysSinceMonday) ?? day;
}

// C7/Q-18: the calendar boundaries each period names, null meaning "no boundary on this side" — a
// fixed calendar stretch, past included, not a rolling window from today. See relocations.md.
export function periodBounds(
  period: EventPeriod,
  today: string,
  segment: { startsOn: string | null; endsOn: string | null },
): { startsOn: string | null; endsOn: string | null } {
  switch (period) {
    case "week":
      return { startsOn: startOfWeek(today), endsOn: addDays(startOfWeek(today), 6) ?? today };
    case "month":
      return { startsOn: startOfMonth(today), endsOn: endOfMonth(today) };
    case "term":
      // deep in a vacation with no term configured, an inverted range matches no day at all
      return segment.startsOn === null || segment.endsOn === null
        ? { startsOn: today, endsOn: addDays(today, -1) ?? today }
        : { startsOn: segment.startsOn, endsOn: segment.endsOn };
    case "upcoming":
      return { startsOn: today, endsOn: null };
    case "all":
      return { startsOn: null, endsOn: null };
  }
}

export interface DatedEvent {
  scheduledOn: string | null;
}

export interface BucketOptions {
  today: string; // in the club's zone, YYYY-MM-DD
  period: EventPeriod;
  segmentStartsOn: string | null; // first day of the Oxford segment today falls in, or null if none configured
  segmentEndsOn: string | null; // last day of that segment — from oxford-year, so "this term" matches the Oxford View
}

// Empty buckets are dropped (slice-ux.md § 9). Two separate passes: periodBounds decides whether an
// event is in view; a second, unrelated pass decides which table it renders in (see relocations.md).
export function bucketEventsByPeriod<T extends DatedEvent>(
  events: readonly T[],
  options: BucketOptions,
): PeriodBucket<T>[] {
  const { today, period, segmentStartsOn, segmentEndsOn } = options;
  const open = PERIOD_BUCKETS[period];
  const bounds = periodBounds(period, today, {
    startsOn: segmentStartsOn,
    endsOn: segmentEndsOn,
  });

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
      put("undated", event); // never dropped — listed on every period, not "not in a period anyone looks at"
      continue;
    }

    if (bounds.startsOn !== null && day < bounds.startsOn) continue;
    if (bounds.endsOn !== null && day > bounds.endsOn) continue;

    if (day < today) {
      put("already_happened", event);
      continue;
    }

    let key: BucketKey; // first match wins, so buckets partition rather than overlap
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

export function bucketedCount<T>(buckets: readonly PeriodBucket<T>[]): number {
  return buckets.reduce((total, bucket) => total + bucket.events.length, 0);
}
