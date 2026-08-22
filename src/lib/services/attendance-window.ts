/**
 * When the register opens — decisions D71 to D74, LAN-152.
 *
 * Pure, and with no import that reaches a database, for the same reason
 * `./attendance-vocabulary.ts` is: the attendance screens are partly client
 * components, and a module they import must not drag `pg` into the browser
 * bundle.
 *
 * ## The rule
 *
 * The register **opens on a buffer before the event starts, and never closes.**
 * There is no upper bound anywhere in this file, and that absence is the rule
 * rather than an omission: a forgotten session is filled in days later and a
 * mistake is corrected at any time, so a register that shut would be a register
 * that loses the truth about an evening nobody got round to.
 *
 * ## Why a buffer at all
 *
 * The realistic moment somebody takes a register is standing at the pitch as
 * people arrive, which is before the session's own start time. Opening it
 * exactly at kick-off would mean the person holding the phone could not use it
 * for the ten minutes they actually have free.
 *
 * ## What this does not decide
 *
 * Whether the event happened. D30 retires the occurrence assertion and derives
 * occurrence from the date passing without a cancellation, and this file has no
 * opinion on that — it answers "may the sheet be opened?", not "did it happen?".
 * Whether a **save** is accepted is `./attendance.ts`'s, and today it is still
 * additionally gated on the stored `occurred` status, because
 * `attendance_records_require_an_occurred_event` is a check constraint and
 * retiring it is the migration package's work, not this one's.
 */

/**
 * Six hours, and it is a **tuning value** rather than a rule.
 *
 * D71 says "approximately six hours" and the packet delegates the exact length,
 * which is why it is one exported number with one name rather than an
 * expression spelled out at each call site. Changing the club's mind about it
 * is editing this line; nothing else in the repository knows the number.
 */
export const ATTENDANCE_REGISTER_BUFFER_HOURS = 6;

/** The same value in milliseconds, which is the unit every comparison uses. */
export const ATTENDANCE_REGISTER_BUFFER_MS = ATTENDANCE_REGISTER_BUFFER_HOURS * 60 * 60 * 1000;

/** What this module needs of an event. Deliberately not `EventDetail`. */
export interface ScheduledEvent {
  /** `YYYY-MM-DD`, or `null` on a draft that has not been dated. */
  scheduledOn: string | null;
  /** `HH:MM`, or `null` — eight of eleven fixtures carry a date and no time. */
  startsAt: string | null;
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^(\d{2}):(\d{2})(?::\d{2})?$/;

/**
 * The club's zone offset at one instant, in milliseconds.
 *
 * `events.scheduled_on` is a `date` and `events.starts_at` is a `time`: neither
 * carries a zone, and they mean Oxford wall-clock. Turning that into an instant
 * therefore needs the offset that was in force *at that moment*, which changes
 * twice a year — a 20:00 practice in October is 20:00 UTC and the same practice
 * in June is 19:00 UTC.
 *
 * `timeZoneName: "longOffset"` is what makes this readable rather than a table
 * of transition dates, and it is the same answer PostgreSQL gives for
 * `at time zone 'Europe/London'`, which is how the database-side tests in
 * `attendance.test.ts` already express the identical computation.
 */
function londonOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    timeZoneName: "longOffset",
  }).formatToParts(instant);

  const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset);
  // Winter reads plain "GMT" with no digits at all, which is an offset of zero
  // rather than a value this failed to parse.
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === "-" ? -minutes : minutes) * 60_000;
}

/** `HH:MM`, midnight for an untimed event, or `null` for an unreadable value. */
function clockOf(startsAt: string | null): string | null {
  if (startsAt === null) return "00:00";
  const match = CLOCK_TIME.exec(startsAt);
  return match === null ? null : `${match[1]}:${match[2]}`;
}

/**
 * The instant an event starts, or `null` when it has no date.
 *
 * A **null date is not midnight.** An undated draft has no start, so it has no
 * buffer and no register, and saying so with `null` is what stops the caller
 * treating the epoch as a moment that has comfortably passed.
 *
 * A null **time** is different: the date is the event, so the day's start is
 * the best answer the club's own record supports, and the buffer then opens the
 * register the evening before. One rule, no special case, and a fixture with a
 * confirmed date and nothing else — the normal BUCS case — still gets a sheet.
 */
export function eventStartInstant(event: ScheduledEvent): Date | null {
  if (event.scheduledOn === null || !CALENDAR_DATE.test(event.scheduledOn)) return null;

  const time = clockOf(event.startsAt);
  // An unreadable time is not silently taken as midnight: it would move the
  // opening moment by up to a day, on a value that reached here unparsed.
  if (time === null) return null;

  const wallClock = Date.parse(`${event.scheduledOn}T${time}:00Z`);
  if (Number.isNaN(wallClock)) return null;

  // Two passes. The first offset is looked up at the wall-clock reading, which
  // is at most an hour from the true instant; the second is looked up at the
  // instant that produced, which is exact everywhere except inside the hour a
  // spring-forward erases — where no correct answer exists because the wall
  // clock never showed that time.
  const approximate = wallClock - londonOffsetMs(new Date(wallClock));
  return new Date(wallClock - londonOffsetMs(new Date(approximate)));
}

/** The moment the register becomes available, or `null` when it never does. */
export function registerOpensAt(event: ScheduledEvent): Date | null {
  const start = eventStartInstant(event);
  return start === null ? null : new Date(start.getTime() - ATTENDANCE_REGISTER_BUFFER_MS);
}

/**
 * Whether the register may be opened now.
 *
 * Note what is missing: there is no second comparison closing it again. D72 is
 * that it never closes, and the way to keep a rule like that true is to have
 * nowhere for the opposite to be written.
 */
export function isRegisterOpen(event: ScheduledEvent, now: Date = new Date()): boolean {
  const opens = registerOpensAt(event);
  return opens !== null && now.getTime() >= opens.getTime();
}
