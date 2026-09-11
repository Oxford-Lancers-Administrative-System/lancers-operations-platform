import { addDays } from "./calendar";
import { CLUB_TIME_ZONE } from "@/lib/club-time";
import { EQUIPMENT_LABEL } from "./event-vocabulary";
import { safeUri } from "./safe-uri";

// RFC 5545 subscription feed (W2, LAN-158). Pure, route /calendar/feed.ics permanent, always the open season.

export interface FeedEvent {
  id: string;
  name: string;
  scheduledOn: string | null; // YYYY-MM-DD, or null when not decided yet
  startsAt: string | null; // HH:MM, or null for a date with no time set
  endsAt: string | null; // HH:MM, or null
  deliveryMode: string;
  venue: string | null;
  isCancelled: boolean;
  description: string | null; // D18; joined with requiredEquipment into DESCRIPTION (Q-29)
  requiredEquipment: string | null; // D17; joined with description into DESCRIPTION (Q-29)
  joiningUrl: string | null; // LAN-284; emitted as URL, never inside DESCRIPTION
  updatedAt: string; // ISO 8601 instant — events.updated_at; SEQUENCE derives from this
}

// Permanent hostname, a literal not configuration — LAN-158 ties the feed URL to it (docs/deployment.md, ADR 0031).
export const FEED_HOSTNAME = "app.oxfordlancers.com";

/** `UID` — the event's own id plus the application hostname, never regenerated. */
export function buildEventUid(eventId: string): string {
  return `${eventId}@${FEED_HOSTNAME}`;
}

// Fixed point SEQUENCE counts whole seconds from; any fixed point predating every updated_at works.
export const FEED_SEQUENCE_EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0);

/** `SEQUENCE` — whole seconds from {@link FEED_SEQUENCE_EPOCH} to `updatedAt`. */
export function deriveSequence(updatedAtIso: string): number {
  const updatedMs = Date.parse(updatedAtIso);
  if (Number.isNaN(updatedMs)) return 0;
  return Math.max(0, Math.floor((updatedMs - FEED_SEQUENCE_EPOCH) / 1000));
}

// RFC 5545 §3.3.11 TEXT escaping: backslash, semicolon, comma, line break as literal `\n`.
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const MAX_LINE_OCTETS = 75;

// RFC 5545 §3.1 folding: split a line over 75 octets into CRLF continuations; UTF-8 aware — never cuts mid-character.
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= MAX_LINE_OCTETS) return line;

  const segments: string[] = [];
  let offset = 0;
  let first = true;
  while (offset < bytes.length) {
    const limit = first ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1; // a continuation's own leading space counts
    let end = Math.min(offset + limit, bytes.length);
    while (end > offset && (bytes[end]! & 0xc0) === 0x80) end -= 1;
    segments.push(bytes.subarray(offset, end).toString("utf8"));
    offset = end;
    first = false;
  }

  return segments.map((segment, index) => (index === 0 ? segment : ` ${segment}`)).join("\r\n");
}

// Zone's UTC offset (ms) at epochMs, via Intl's wall-clock digits reinterpreted as UTC.
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
  const hour = get("hour") % 24; // Intl prints midnight as hour "24" for some locales/zones
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

// Wall-clock reading in CLUB_TIME_ZONE to a real UTC instant; two passes to handle DST transitions.
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

interface EventTiming {
  allDay: boolean;
  dtstart: string;
  dtend: string | null;
}

// DTSTART/DTEND for one event with a scheduledOn; no startsAt is a whole-day entry (VALUE=DATE).
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

// LOCATION, or null to omit. An online event with no stated destination still says "Online" (matches whereItIs).
function locationFor(event: FeedEvent): string | null {
  if (event.venue !== null && event.venue.trim() !== "") return event.venue;
  return event.deliveryMode === "online" ? "Online" : null;
}

// DESCRIPTION, or null — never empty; both present are blank-line joined, description first (Q-29).
function descriptionFor(event: FeedEvent): string | null {
  const description =
    event.description !== null && event.description.trim() !== "" ? event.description : null;
  const equipment =
    event.requiredEquipment !== null && event.requiredEquipment.trim() !== ""
      ? event.requiredEquipment
      : null;

  if (description === null && equipment === null) return null;
  if (equipment === null) return description;
  if (description === null) return `${EQUIPMENT_LABEL}: ${equipment}`;
  return `${description}\n\n${EQUIPMENT_LABEL}: ${equipment}`;
}

function buildVEventLines(event: FeedEvent, now: Date): string[] {
  const timing = eventTiming(event);
  const location = locationFor(event);
  const description = descriptionFor(event);
  const joiningUrl = safeUri(event.joiningUrl);
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
  if (description !== null) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (joiningUrl !== null) lines.push(`URL:${joiningUrl}`); // URI-typed, never escaped; safe only because safeUri already refused control chars and non-http(s) schemes
  lines.push(`STATUS:${event.isCancelled ? "CANCELLED" : "CONFIRMED"}`);
  lines.push(`SEQUENCE:${deriveSequence(event.updatedAt)}`);
  lines.push("END:VEVENT");
  return lines;
}

/** `PRODID` — RFC 5545 §3.7.3 requires the `-//vendor//product//language` shape. */
const PROD_ID = "-//Oxford Lancers//Club Calendar//EN";

// The complete text/calendar document; an event with no scheduledOn is skipped (DTSTART is required, Q-11/Q-12).
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

  return `${lines.map(foldLine).join("\r\n")}\r\n`; // each line folded, CRLF-joined (RFC 5545 §3.1), trailing CRLF
}
