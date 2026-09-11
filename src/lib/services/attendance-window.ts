// When the register opens (D71-D74, LAN-152): a buffer before start, never closes (D72). Decides
// only "may the sheet be opened?" — not "did it happen?" (D30) or "is a save accepted?" (./attendance.ts).

export const ATTENDANCE_REGISTER_BUFFER_HOURS = 6; // D71 "approximately six hours"; the one tuning value, see relocations.md
export const ATTENDANCE_REGISTER_BUFFER_MS = ATTENDANCE_REGISTER_BUFFER_HOURS * 60 * 60 * 1000; // same value, in the unit every comparison uses

export interface ScheduledEvent {
  scheduledOn: string | null; // YYYY-MM-DD, or null on an undated draft
  startsAt: string | null; // HH:MM, or null — a date-only fixture is normal
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^(\d{2}):(\d{2})(?::\d{2})?$/;

// The club's zone offset at one instant, ms — looked up per-moment since it changes twice a year (BST/GMT).
function londonOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    timeZoneName: "longOffset",
  }).formatToParts(instant);

  const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match) return 0; // winter reads plain "GMT" with no digits — an offset of zero, not a parse failure
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === "-" ? -minutes : minutes) * 60_000;
}

function clockOf(startsAt: string | null): string | null {
  if (startsAt === null) return "00:00";
  const match = CLOCK_TIME.exec(startsAt);
  return match === null ? null : `${match[1]}:${match[2]}`; // HH:MM, midnight when untimed, null when unreadable
}

// The instant an event starts, or null with no date. A null date is not midnight (no buffer/register); a null time falls back to the day's start.
export function eventStartInstant(event: ScheduledEvent): Date | null {
  if (event.scheduledOn === null || !CALENDAR_DATE.test(event.scheduledOn)) return null;

  const time = clockOf(event.startsAt);
  if (time === null) return null; // unreadable time is never silently taken as midnight

  const wallClock = Date.parse(`${event.scheduledOn}T${time}:00Z`);
  if (Number.isNaN(wallClock)) return null;

  const approximate = wallClock - londonOffsetMs(new Date(wallClock)); // two passes: refine the offset at the approximate instant
  return new Date(wallClock - londonOffsetMs(new Date(approximate)));
}

export function registerOpensAt(event: ScheduledEvent): Date | null {
  const start = eventStartInstant(event);
  return start === null ? null : new Date(start.getTime() - ATTENDANCE_REGISTER_BUFFER_MS);
}

export function isRegisterOpen(event: ScheduledEvent, now: Date = new Date()): boolean {
  const opens = registerOpensAt(event);
  return opens !== null && now.getTime() >= opens.getTime();
}

// The buffer, plus D72 kept: a register with anything recorded is already open (see relocations.md).
export function isRegisterAvailable(
  event: ScheduledEvent,
  registerSaved: boolean,
  now: Date = new Date(),
): boolean {
  return registerSaved || isRegisterOpen(event, now);
}
