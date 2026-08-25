/**
 * The club's words for an event, and how its dates read. LAN-153.
 *
 * ## Why this moved out of the operator screens
 *
 * All of this used to live in `src/app/operate/events/presentation.ts`, which
 * was the right place while `/operate` was the only place an event was ever
 * displayed. LAN-153 opens a public calendar, and the club calls a practice a
 * **Practice** whoever is reading — the vocabulary is a fact about the domain,
 * not about the operator's screens. Leaving it under `/operate` would have meant
 * either a public surface importing from the operator's, or a second copy of the
 * seven type names; `docs/ux/standards.md` rule 7 is exactly about the second.
 *
 * `./attendance-vocabulary.ts` is the precedent and the shape: pure, no
 * `server-only`, safe in a client component, and owned by the service layer
 * because the words are the domain's rather than a screen's.
 *
 * `CLUB_TIME_ZONE` itself is re-exported from `@/lib/club-time` rather than
 * declared here a second time — that module's own docs are explicit that a
 * second timezone literal is exactly the drift LAN-114 forbids.
 *
 * What did **not** move is anything tiered. `STATUS_LABELS` is here because the
 * word for `approved` is "Approved" wherever it is legitimately shown; *whether*
 * a reader may be shown it is `@/lib/auth/event-tier`'s question, and no answer
 * to it is written down in this file.
 *
 * ## Dates are formatted in `en-GB` at UTC, deliberately
 *
 * `scheduled_on` is a `date` and `starts_at`/`ends_at` are `time` — none of the
 * three carries a zone, so rendering them in the viewer's zone would shift a
 * Wednesday practice into Tuesday for anybody east of Greenwich. There is one
 * club, it is in Oxford, and these values mean what they say. Which day is
 * *today* is a different question, answered once in `@/lib/club-time`.
 */

/**
 * Turning a stored value into the club's word for it.
 *
 * The lookup is shared and the maps are not: the roster's statuses, the events
 * screens' types and the report's onboarding states belong to their own
 * vocabularies. What has to be shared is the **fallback** — a value the map has
 * never heard of renders as itself rather than as a blank cell, because a blank
 * cell reads as "no status" instead of "a status nobody has written a label for
 * yet".
 */
export function labelFor(labels: Readonly<Record<string, string>>, value: string): string {
  return labels[value] ?? value;
}

/**
 * "A, B and C" — the club's punctuation rather than ICU's.
 *
 * Shared rather than screen-local because the audience summary
 * (`@/app/operate/events/[id]/page.tsx`) and the approval refusal that names a
 * missing date or name (`@/lib/services/event-approval.ts`) both join a short
 * list of things the same way, and the service layer cannot import from
 * `app/` to reach a screen's copy of it.
 */
export function joinWithAnd(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * D86. The zone every event time is in, said rather than assumed.
 *
 * Per-user timezones are a later release (DEC-timezone); this is the club's,
 * fixed, and stated wherever a time is shown to somebody who did not enter it.
 * Re-exported rather than redeclared — see the module doc above.
 */
export { CLUB_TIME_ZONE } from "@/lib/club-time";

// ---------------------------------------------------------------------------
// Dates and times
// ---------------------------------------------------------------------------

/**
 * The parts are formatted individually and joined here rather than handed to
 * one formatter, because the separators between them are not ICU's to choose:
 * `en-GB` emits "Wednesday 14 October" on one Node build and
 * "Wednesday, 14 October" on another, and the wireframes show the comma. This
 * way the punctuation is the repository's, and a CI runner with a different ICU
 * build cannot change what a reader sees.
 *
 * Exported because `@/app/calendar/presentation` needs the identical UTC
 * reading for the same `YYYY-MM-DD` values and must not carry a second copy
 * of it — see this file's module doc.
 */
export function formatDatePart(day: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/**
 * Month abbreviations, owned by this repository rather than asked of ICU.
 *
 * The same reasoning as `formatDatePart()` above, and found the same way. `en-GB` with
 * `month: "short"` renders September as **"Sept"** on some ICU builds and "Sep"
 * on others, so the abbreviation a reader sees would depend on which Node the
 * container happened to be built with — and a calendar whose whole job is to
 * state exact dates would disagree with itself between a developer's machine and
 * Cloud Run.
 */
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

/** "Oct" for any `YYYY-MM-DD`. Empty for anything that is not one. */
export function shortMonthOf(day: string): string {
  return SHORT_MONTHS[Number(day.slice(5, 7)) - 1] ?? "";
}

/**
 * "Wed 14 Oct 2026" — the list's date column.
 *
 * The year is not decoration. A season runs from September to June, so a list of
 * one season's events spans two calendar years, and "Wed 16 Jun" does not say
 * which one — which is exactly what Brian hit reading the list.
 */
export function formatShortDate(scheduledOn: string | null): string {
  if (!scheduledOn) return "No date yet";
  const weekday = formatDatePart(scheduledOn, { weekday: "short" });
  const day = formatDatePart(scheduledOn, { day: "numeric" });
  const month = shortMonthOf(scheduledOn);
  const year = formatDatePart(scheduledOn, { year: "numeric" });
  return `${weekday} ${day} ${month} ${year}`;
}

/** "Sunday, 18 October 2026" — the detail heading. Year, for the same reason. */
export function formatLongDate(scheduledOn: string | null): string {
  if (!scheduledOn) return "No date yet";
  const weekday = formatDatePart(scheduledOn, { weekday: "long" });
  const day = formatDatePart(scheduledOn, { day: "numeric" });
  const month = formatDatePart(scheduledOn, { month: "long" });
  const year = formatDatePart(scheduledOn, { year: "numeric" });
  return `${weekday}, ${day} ${month} ${year}`;
}

/** "20:00–22:00", "from 20:00", "until 22:00", or nothing at all. */
export function formatTimes(startsAt: string | null, endsAt: string | null): string {
  if (startsAt && endsAt) return `${startsAt}–${endsAt}`;
  if (startsAt) return `from ${startsAt}`;
  if (endsAt) return `until ${endsAt}`;
  return "";
}

/**
 * What a formatter needs of an event. Structural, so the operator's list entry
 * and the public one both satisfy it without either importing the other's type.
 */
export interface EventWhen {
  scheduledOn: string | null;
  startsAt: string | null;
}

/** "Wed 14 Oct 2026, 20:00" — date and start, as the list shows them. */
export function formatListWhen(event: EventWhen): string {
  const date = formatShortDate(event.scheduledOn);
  return event.startsAt ? `${date}, ${event.startsAt}` : date;
}

/** "Sunday, 18 October 2026 · 10:00–13:00" — the detail subtitle. */
export function formatDetailWhen(event: EventWhen & { endsAt: string | null }): string {
  const times = formatTimes(event.startsAt, event.endsAt);
  const date = formatLongDate(event.scheduledOn);
  return times ? `${date} · ${times}` : date;
}

// ---------------------------------------------------------------------------
// The enums, in the club's words
// ---------------------------------------------------------------------------

/**
 * `event_status` in the club's words. The list, the detail and the chips agree.
 *
 * Three, since LAN-151. `Occurred` is not here because it is not a stored
 * status: it is derived from the date passing, and `DERIVED_STATE_LABELS` below
 * is where a screen gets the word for it.
 */
export const STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  draft: "Draft",
  approved: "Approved",
  cancelled: "Cancelled",
});

/**
 * What the event looks like now, in the club's words (D30).
 *
 * A screen shows this beside the stored status, never instead of it: "Approved"
 * and "Occurred" are answers to two different questions, and collapsing them
 * would put the club back where the assertion was.
 */
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

/** `event_delivery_mode` in the club's words (D20). */
export const DELIVERY_MODE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  in_person: "In person",
  online: "Online",
});

/** The Oxford terms, in the club's words. */
export const TERM_LABELS: Readonly<Record<string, string>> = Object.freeze({
  michaelmas: "Michaelmas",
  hilary: "Hilary",
  trinity: "Trinity",
});

/** What the venue field is called, which depends on where the event is (D21). */
export function venueLabel(deliveryMode: string): string {
  return deliveryMode === "online" ? "Destination" : "Venue";
}

/** "Mandatory" or "Optional" — what the club expects of the people invited. */
export function describeAttendance(isMandatory: boolean): string {
  return isMandatory ? "Mandatory" : "Optional";
}

/**
 * The label for `required_equipment` — the public event page's own word for
 * it. Shared with `@/lib/services/calendar-feed`, which folds the same field
 * into `DESCRIPTION` under this exact label rather than inventing a heading
 * vocabulary of its own (Q-29).
 */
export const EQUIPMENT_LABEL = "What to bring";
