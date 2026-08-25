import { addDays } from "./calendar";
import { CLUB_TIME_ZONE } from "@/lib/club-time";

/**
 * The RFC 5545 document `W2`'s subscription feed serves. LAN-158.
 *
 * ## No dependency, by the Lead's decision (Q-21)
 *
 * There is no iCalendar library on `main`, and adding one puts `package.json`
 * and `package-lock.json` on the merge gate's prohibited-surface list. RFC 5545
 * for this shape is small, and the Lead's determination is exact about what
 * that shape is: "a VCALENDAR wrapper and one VEVENT per event carrying UID,
 * DTSTAMP, DTSTART, DTEND, SUMMARY, LOCATION, STATUS and SEQUENCE." That is the
 * complete list of `VEVENT` properties this module writes — no DESCRIPTION, no
 * CATEGORIES, nothing the workflow's "what the subscriber gets" table lists
 * beyond it. `SUMMARY` already carries the type where an operator wrote it into
 * the event's name (the seeded data does this — "Chalk — michaelmas week 4").
 *
 * ## Pure, like `./calendar`
 *
 * No database, no `server-only`. Every input is an argument — including the
 * instant DTSTAMP is stamped at — so the module is exercised directly with
 * hand-built event rows and is deterministic under test. `./events.ts` reads
 * the row from PostgreSQL; this module only turns a plain object into text.
 *
 * ## Route and URL shape: `/calendar/feed.ics`
 *
 * Permanently stable, no season in the path, always serving the open season —
 * the Lead's determination. A subscriber adds a calendar URL once and cannot be
 * asked to re-add it every year, so stability beats making the season visible
 * in the path; "season-scoped" is satisfied by the content instead. **When the
 * season rolls over, a subscriber's entries change wholesale** — the feed keeps
 * its address and starts describing a different season under it. That is the
 * intended behaviour, not a defect to fix later.
 *
 * ## Identity and revision
 *
 * `UID` is the event's own uuid plus `@` and the application's permanent
 * hostname (`docs/deployment.md`, ADR 0031) — stable for the life of the event
 * and never regenerated, so a provider recognises the same entry across every
 * fetch. `SEQUENCE` is whole seconds between `events.updated_at` and
 * {@link FEED_SEQUENCE_EPOCH}, a fixed constant declared below: monotonic,
 * needs no migration, and does not depend on LAN-156's amendment work (not yet
 * merged) to exist. Every legitimate update increases `events.updated_at`, so
 * `SEQUENCE` increases with it — which is what tells a subscribed calendar to
 * replace its copy of the entry rather than add a second one.
 *
 * ## What the feed leaves out, and why that is structural
 *
 * `FeedEvent` has no field for a person, an RSVP, attendance, or an online
 * event's joining URL — the same absence `PublicEventListEntry` has, for the
 * same reason (`./events.ts`). There is nothing here to withhold because there
 * is nothing here to read one of them from.
 *
 * ## Times, and the defect this module exists not to repeat
 *
 * `scheduled_on`, `starts_at` and `ends_at` are bare — no zone attached — and
 * the workflow specification is explicit that they mean Europe/London wall
 * clock. A test elsewhere in this mission found "today" resolved once in UTC
 * and once in `Europe/London`, wrong for one hour a night. This module never
 * repeats that: every timed `DTSTART`/`DTEND` is converted through
 * {@link CLUB_TIME_ZONE} — imported, not re-declared — into a real UTC instant,
 * correctly across the British Summer Time boundary, and emitted with the
 * trailing `Z` that says so. An event with a date but no time is emitted as a
 * whole-day entry instead of being guessed a start time it was never given.
 */

// ---------------------------------------------------------------------------
// What the feed needs of an event
// ---------------------------------------------------------------------------

/** The subset of a public event row the feed reads. Structural, like `CalendarEvent`. */
export interface FeedEvent {
  id: string;
  name: string;
  /** `YYYY-MM-DD`, or `null` for an event whose date is not decided yet. */
  scheduledOn: string | null;
  /** `HH:MM`, or `null` for a date with no time set. */
  startsAt: string | null;
  /** `HH:MM`, or `null`. */
  endsAt: string | null;
  deliveryMode: string;
  venue: string | null;
  isCancelled: boolean;
  /** ISO 8601 instant — `events.updated_at`. `SEQUENCE` is derived from this. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * The application's permanent hostname (`docs/deployment.md`, ADR 0031).
 *
 * A literal, not configuration: LAN-158's workflow spec ties the feed URL to
 * this exact hostname ("the feed URL cannot move"), and the acceptance
 * boundary says explicitly not to add configuration for it or touch
 * deployment. The value is already public — it is the site's own address.
 */
export const FEED_HOSTNAME = "app.oxfordlancers.com";

/** `UID` — the event's own id plus the application hostname, never regenerated. */
export function buildEventUid(eventId: string): string {
  return `${eventId}@${FEED_HOSTNAME}`;
}

/**
 * The fixed instant `SEQUENCE` counts whole seconds from.
 *
 * Any fixed point works — the requirement is only that it never moves and
 * predates every `updated_at` this feed will ever read, so `SEQUENCE` is always
 * non-negative. Chosen as the start of the calendar year this mission shipped
 * in, needing no migration and no dependency on when a given event was created.
 */
export const FEED_SEQUENCE_EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0);

/** `SEQUENCE` — whole seconds from {@link FEED_SEQUENCE_EPOCH} to `updatedAt`. */
export function deriveSequence(updatedAtIso: string): number {
  const updatedMs = Date.parse(updatedAtIso);
  if (Number.isNaN(updatedMs)) return 0;
  return Math.max(0, Math.floor((updatedMs - FEED_SEQUENCE_EPOCH) / 1000));
}

// ---------------------------------------------------------------------------
// RFC 5545 mechanics: escaping and line folding
// ---------------------------------------------------------------------------

/**
 * RFC 5545 §3.3.11 TEXT escaping — backslash, semicolon, comma, then any line
 * break as the literal two characters `\n`.
 *
 * Applied to every free-text value this module emits (`SUMMARY`, `LOCATION`,
 * the calendar name), because an event name or venue is operator-entered and
 * validators are strict about exactly these four substitutions.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const MAX_LINE_OCTETS = 75;

/**
 * RFC 5545 §3.1 line folding: a content line longer than 75 octets is split
 * into physical lines of at most 75 octets each, joined by CRLF, every
 * continuation line beginning with a single space.
 *
 * UTF-8 aware — folding counts *octets*, not characters, and this never cuts
 * inside a multi-byte character: a continuation byte (`10xxxxxx`) at the
 * candidate boundary walks the cut point back to the start of the character it
 * belongs to. A club or venue name with an accent is the case this guards.
 *
 * Lines at or under the limit are returned unchanged — folding is invisible for
 * the common case, which is every property this module emits except a long
 * `SUMMARY` or the calendar name.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= MAX_LINE_OCTETS) return line;

  const segments: string[] = [];
  let offset = 0;
  let first = true;
  while (offset < bytes.length) {
    // A continuation line's own leading space counts against its 75 octets.
    const limit = first ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    let end = Math.min(offset + limit, bytes.length);
    while (end > offset && (bytes[end]! & 0xc0) === 0x80) end -= 1;
    segments.push(bytes.subarray(offset, end).toString("utf8"));
    offset = end;
    first = false;
  }

  return segments.map((segment, index) => (index === 0 ? segment : ` ${segment}`)).join("\r\n");
}

// ---------------------------------------------------------------------------
// Wall-clock (Europe/London) to UTC instant
// ---------------------------------------------------------------------------

/**
 * The zone's offset from UTC, in milliseconds, at the instant `epochMs` names.
 *
 * Reads the zone's own wall-clock digits for that instant via `Intl` and
 * compares them, reinterpreted as UTC, against the instant itself — the
 * standard technique for recovering an IANA zone's offset without a database of
 * transition rules. Positive during British Summer Time, zero outside it.
 */
function offsetMsAt(epochMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(epochMs));

  const get = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  // `Intl` prints midnight as hour "24" for some locales/zones; normalise it.
  const hour = get("hour") % 24;
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return asIfUtc - epochMs;
}

/**
 * A `YYYY-MM-DD` + `HH:MM` wall-clock reading in {@link CLUB_TIME_ZONE},
 * converted to the real UTC instant it names.
 *
 * Two passes: the first treats the wall clock as if it were already UTC to get
 * a same-day estimate, reads the zone's offset at that estimate, and applies
 * it; the second repeats the read at the corrected instant. One pass is wrong
 * only within the hour of a daylight-saving transition, which two passes
 * resolves for every date that is not the transition instant itself.
 */
function londonInstant(day: string, time: string): Date {
  const naiveMs = Date.parse(`${day}T${time}:00Z`);
  const firstOffset = offsetMsAt(naiveMs, CLUB_TIME_ZONE);
  const firstPass = naiveMs - firstOffset;
  const secondOffset = offsetMsAt(firstPass, CLUB_TIME_ZONE);
  return new Date(naiveMs - secondOffset);
}

/** `YYYYMMDDTHHMMSSZ` — RFC 5545 §3.3.5 UTC date-time. */
function formatUtcStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

// ---------------------------------------------------------------------------
// One VEVENT
// ---------------------------------------------------------------------------

interface EventTiming {
  allDay: boolean;
  dtstart: string;
  dtend: string | null;
}

/**
 * `DTSTART`/`DTEND` for one event, already known to have a `scheduledOn`.
 *
 * No time set (`startsAt === null`) is a whole-day entry: `VALUE=DATE`,
 * `DTSTART` on the day and `DTEND` on the day after — RFC 5545's own exclusive
 * convention for an all-day span, matching how Google, Apple and Outlook all
 * read one. A start with no end is a valid zero-duration `VEVENT` (`DTEND` is
 * optional in the spec); this module does not invent a duration nobody
 * recorded, matching `formatTimes` in `event-vocabulary.ts`, which prints
 * "from HH:MM" rather than guessing an end either.
 */
function eventTiming(event: FeedEvent): EventTiming {
  const day = event.scheduledOn as string;

  if (event.startsAt === null) {
    const nextDay = addDays(day, 1) ?? day;
    return { allDay: true, dtstart: day.replace(/-/g, ""), dtend: nextDay.replace(/-/g, "") };
  }

  const dtstart = formatUtcStamp(londonInstant(day, event.startsAt));
  const dtend = event.endsAt === null ? null : formatUtcStamp(londonInstant(day, event.endsAt));
  return { allDay: false, dtstart, dtend };
}

/**
 * `LOCATION`, or `null` to omit the property entirely.
 *
 * An online event without a stated destination still says "Online" — matching
 * `whereItIs` on the public event page — rather than emitting an empty value. A
 * venue-less in-person event (an incomplete draft; Q-11/Q-12 says the feed
 * shows it anyway) has nothing honest to say, so the property is left out
 * rather than emitted blank.
 */
function locationFor(event: FeedEvent): string | null {
  if (event.venue !== null && event.venue.trim() !== "") return event.venue;
  return event.deliveryMode === "online" ? "Online" : null;
}

function buildVEventLines(event: FeedEvent, now: Date): string[] {
  const timing = eventTiming(event);
  const location = locationFor(event);
  const dateParam = timing.allDay ? ";VALUE=DATE" : "";

  const lines = [
    "BEGIN:VEVENT",
    `UID:${buildEventUid(event.id)}`,
    `DTSTAMP:${formatUtcStamp(now)}`,
    `DTSTART${dateParam}:${timing.dtstart}`,
  ];
  if (timing.dtend !== null) lines.push(`DTEND${dateParam}:${timing.dtend}`);
  lines.push(`SUMMARY:${escapeText(event.name)}`);
  if (location !== null) lines.push(`LOCATION:${escapeText(location)}`);
  lines.push(`STATUS:${event.isCancelled ? "CANCELLED" : "CONFIRMED"}`);
  lines.push(`SEQUENCE:${deriveSequence(event.updatedAt)}`);
  lines.push("END:VEVENT");
  return lines;
}

// ---------------------------------------------------------------------------
// The whole document
// ---------------------------------------------------------------------------

/** `PRODID` — RFC 5545 §3.7.3 requires the `-//vendor//product//language` shape. */
const PROD_ID = "-//Oxford Lancers//Club Calendar//EN";

/**
 * The complete `text/calendar` document for the open season.
 *
 * An event with no `scheduledOn` — a draft whose date is not decided yet — is
 * skipped rather than emitted: RFC 5545 requires `DTSTART` on a published
 * `VEVENT`, and there is no honest value to put there for a date nobody chose.
 * Every other event in the season is included regardless of status, per
 * Q-11/Q-12 — a cancelled one stays, marked `STATUS:CANCELLED`, and a draft
 * appears exactly as the public calendar already shows it.
 *
 * `now` is a parameter so `DTSTAMP` — "when this document was generated" — is
 * deterministic under test; it defaults to the real clock for the route
 * handler that calls this in production.
 *
 * An empty `events` array produces a complete, valid, zero-`VEVENT` document —
 * the workflow's own exception: "the season has no events yet ⇒ the feed is
 * valid and empty. A calendar app subscribing to it succeeds and shows
 * nothing, rather than erroring."
 */
export function buildCalendarFeed(options: {
  seasonLabel: string;
  events: readonly FeedEvent[];
  now?: Date;
}): string {
  const now = options.now ?? new Date();

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PROD_ID}`,
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(`Oxford Lancers — Season ${options.seasonLabel}`)}`,
  ];

  for (const event of options.events) {
    if (event.scheduledOn === null) continue;
    lines.push(...buildVEventLines(event, now));
  }

  lines.push("END:VCALENDAR");

  // Every property line is folded independently and the physical lines are
  // joined by CRLF throughout, per RFC 5545 §3.1. A trailing CRLF ends the
  // document, matching how every content line — including the last — ends.
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
