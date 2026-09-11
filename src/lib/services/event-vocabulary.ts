// The club's words for an event, and how its dates read — LAN-153 (see relocations.md). Pure, safe
// in a client component. Dates format en-GB at UTC: none of scheduled_on/starts_at/ends_at carries
// a zone, so the viewer's own must never shift them. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE

export function labelFor(labels: Readonly<Record<string, string>>, value: string): string {
  return labels[value] ?? value;
}

export function joinWithAnd(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export { CLUB_TIME_ZONE } from "@/lib/club-time"; // D86: re-exported, not redeclared — see module header

// Parts formatted individually and joined here — en-GB's own punctuation varies by ICU build.
export function formatDatePart(day: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

// Owned by this repository, not ICU — "Sept" vs "Sep" varies by Node build.
export const SHORT_MONTHS: readonly string[] = Object.freeze([
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]);

export function shortMonthOf(day: string): string {
  return SHORT_MONTHS[Number(day.slice(5, 7)) - 1] ?? "";
}

// "Wed 14 Oct 2026" — year included, a season spans two calendar years.
export function formatShortDate(scheduledOn: string | null): string {
  if (!scheduledOn) return "No date yet";
  const weekday = formatDatePart(scheduledOn, { weekday: "short" });
  const day = formatDatePart(scheduledOn, { day: "numeric" });
  const month = shortMonthOf(scheduledOn);
  const year = formatDatePart(scheduledOn, { year: "numeric" });
  return `${weekday} ${day} ${month} ${year}`;
}

export function formatLongDate(scheduledOn: string | null): string {
  if (!scheduledOn) return "No date yet";
  const weekday = formatDatePart(scheduledOn, { weekday: "long" });
  const day = formatDatePart(scheduledOn, { day: "numeric" });
  const month = formatDatePart(scheduledOn, { month: "long" });
  const year = formatDatePart(scheduledOn, { year: "numeric" });
  return `${weekday}, ${day} ${month} ${year}`;
}

function formatTimes(startsAt: string | null, endsAt: string | null): string {
  if (startsAt && endsAt) return `${startsAt}–${endsAt}`;
  if (startsAt) return `from ${startsAt}`;
  if (endsAt) return `until ${endsAt}`;
  return "";
}

export interface EventWhen {
  scheduledOn: string | null;
  startsAt: string | null;
}

export function formatListWhen(event: EventWhen): string {
  const date = formatShortDate(event.scheduledOn);
  return event.startsAt ? `${date}, ${event.startsAt}` : date;
}

export function formatDetailWhen(event: EventWhen & { endsAt: string | null }): string {
  const times = formatTimes(event.startsAt, event.endsAt);
  const date = formatLongDate(event.scheduledOn);
  return times ? `${date} · ${times}` : date;
}

// event_status in the club's words (LAN-151) — the list, detail and chips. Occurred is not here: derived, see DERIVED_STATE_LABELS.
export const STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  draft: "Draft",
  approved: "Approved",
  cancelled: "Cancelled",
});

// What the event looks like now (D30) — shown beside the stored status, never instead of it.
export const DERIVED_STATE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  upcoming: "Upcoming",
  occurred: "Occurred",
  cancelled: "Cancelled",
});

/** `event_type` in the club's words — the seven approved types (D12). */
export const TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  practice: "Practice",
  strength_and_conditioning: "Strength and conditioning",
  chalk: "Chalk",
  game: "Game",
  social: "Social",
  recruitment: "Recruitment",
  meeting: "Meeting",
});

export const DELIVERY_MODE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  in_person: "In person",
  online: "Online",
});

export const TERM_LABELS: Readonly<Record<string, string>> = Object.freeze({
  michaelmas: "Michaelmas",
  hilary: "Hilary",
  trinity: "Trinity",
});

/** What the venue field is called, which depends on where the event is (D21). */
export function venueLabel(deliveryMode: string): string {
  return deliveryMode === "online" ? "Destination" : "Venue";
}

export function describeAttendance(isMandatory: boolean): string {
  return isMandatory ? "Mandatory" : "Optional";
}

export const EQUIPMENT_LABEL = "What to bring"; // shared with calendar-feed.ts's DESCRIPTION fold-in (Q-29)

export const JOINING_LINK_LABEL = "Joining link"; // LAN-284: shared so operator and public pages agree (docs/ux/standards.md rule 7)
