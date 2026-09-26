/**
 * Lights-out — LAN-433, Brian 2026-09-26: "I just don't want to be sending
 * messages between 10:01pm–6:59am local time. It's just not good form with
 * students."
 *
 * From 22:00 (inclusive) to 07:00 (exclusive), club time, no automated message
 * is dispatched. Held, never dropped and never marked sent: a job that would go
 * in the window simply is not due until the next 07:00, and at release every
 * dispatch-time check runs as it always does. The window is the wall clock in
 * {@link CLUB_TIME_ZONE}, never the recipient's, so both clock-change nights
 * are 22:00 to 07:00 as the clock on the wall reads them.
 *
 * Applied at dispatch only. Nothing here recomputes a ladder or a cadence:
 * `plan.ts` still writes the rung's real moment, and the hold is read at the
 * moment something tries to send it. Pure — no database, no `server-only`.
 */
import { CLUB_TIME_ZONE } from "@/lib/club-time";
import type { MessageKind } from "@/lib/delivery/provider";

/** The first hour held, inclusive. */
export const LIGHTS_OUT_START_HOUR = 22;
/** The first hour released, inclusive — 07:00 sends. */
export const LIGHTS_OUT_END_HOUR = 7;

/**
 * Which message kinds go at any hour. Exactly three, because an operator
 * pressed Send on each of them and the news cannot wait for the morning: a
 * cancellation, a change notice and a question change. Every other kind waits,
 * the two office-facing escalations included (Brian: simplicity wins).
 *
 * A `Record` over every kind, so a new kind does not compile until somebody
 * has decided which side of this line it falls on.
 */
export const LIGHTS_OUT_EXEMPT: Readonly<Record<MessageKind, boolean>> = Object.freeze({
  invitation: false,
  reminder: false,
  nudge: false,
  change_notice: true,
  question_change: true,
  cancellation: true,
  escalation: false,
  recruit_event_followup: false,
  recruit_welcome: false,
  recruit_details_reminder: false,
  recruit_interest_ask: false,
  recruit_interest_reminder: false,
  onboarding_welcome: false,
  onboarding_chase: false,
  onboarding_chase_escalation: false,
});

/**
 * The message kinds each `notification_jobs.job_type` can carry — the
 * dispatchers' own mapping (`messageKindFor` in `delivery.ts`, and the
 * idempotency-key prefixes the sweep routes `other` by). A job type is exempt
 * only when every kind it can carry is.
 */
export const JOB_TYPE_MESSAGE_KINDS: Readonly<Record<string, readonly MessageKind[]>> =
  Object.freeze({
    invitation: ["invitation"],
    reminder: ["reminder", "recruit_event_followup"],
    escalation: ["escalation"],
    schedule_change_notice: ["change_notice"],
    question_change_notice: ["question_change"],
    cancellation_notice: ["cancellation"],
    other: [
      "nudge",
      "recruit_welcome",
      "recruit_details_reminder",
      "recruit_interest_ask",
      "recruit_interest_reminder",
      "onboarding_welcome",
      "onboarding_chase",
      "onboarding_chase_escalation",
    ],
  });

/** Whether lights-out lets this job type through. An unknown type waits. */
export function isJobTypeLightsOutExempt(jobType: string): boolean {
  const kinds = JOB_TYPE_MESSAGE_KINDS[jobType];
  return kinds !== undefined && kinds.length > 0 && kinds.every((kind) => LIGHTS_OUT_EXEMPT[kind]);
}

/** The job types that go at any hour, for the SQL that selects due work. */
export const LIGHTS_OUT_EXEMPT_JOB_TYPES: readonly string[] = Object.freeze(
  Object.keys(JOB_TYPE_MESSAGE_KINDS).filter(isJobTypeLightsOutExempt),
);

interface ClubWallClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
}

function clubWallClock(instant: Date): ClubWallClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour") };
}

/** The instant the club's clock reads `hour`:00 on the given calendar day. */
function clubInstant(year: number, month: number, day: number, hour: number): Date {
  // Guess as if London were UTC, then correct by however far the club's clock
  // reads from that guess. 07:00 and 22:00 are never inside a clock change
  // (those happen at 01:00 and 02:00), so one correction is exact.
  const guess = Date.UTC(year, month - 1, day, hour);
  const read = clubWallClock(new Date(guess));
  const readAsUtc = Date.UTC(read.year, read.month - 1, read.day, read.hour);
  return new Date(guess - (readAsUtc - guess));
}

/** Whether lights-out holds automated messages at this instant. */
export function isLightsOut(now: Date): boolean {
  const { hour } = clubWallClock(now);
  return hour >= LIGHTS_OUT_START_HOUR || hour < LIGHTS_OUT_END_HOUR;
}

/** When a message held at `now` is released: the next 07:00 club time, or `now` itself outside the window. */
export function lightsOutReleaseAt(now: Date): Date {
  if (!isLightsOut(now)) return now;
  const clock = clubWallClock(now);
  if (clock.hour < LIGHTS_OUT_END_HOUR) {
    return clubInstant(clock.year, clock.month, clock.day, LIGHTS_OUT_END_HOUR);
  }
  // 22:00–23:59: tomorrow's 07:00. Date.UTC rolls the day over month and year ends.
  const tomorrow = new Date(Date.UTC(clock.year, clock.month - 1, clock.day + 1));
  return clubInstant(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    LIGHTS_OUT_END_HOUR,
  );
}

/**
 * The most recent release at or before `now` — this morning's 07:00, or
 * yesterday's while the window is on. The queue-age warning measures a held
 * message from here, so a pile released at 07:00 does not read as nine hours
 * late.
 */
export function lastLightsOutReleaseAt(now: Date): Date {
  const clock = clubWallClock(now);
  const today = clubInstant(clock.year, clock.month, clock.day, LIGHTS_OUT_END_HOUR);
  if (clock.hour >= LIGHTS_OUT_END_HOUR) return today;
  const yesterday = new Date(Date.UTC(clock.year, clock.month - 1, clock.day - 1));
  return clubInstant(
    yesterday.getUTCFullYear(),
    yesterday.getUTCMonth() + 1,
    yesterday.getUTCDate(),
    LIGHTS_OUT_END_HOUR,
  );
}

/** When a dispatch that came back `deferred` will go, if lights-out is what held it; otherwise `null`. */
export function lightsOutWaitingUntil(outcome: string): Date | null {
  const now = lightsOutNow();
  return outcome === "deferred" && isLightsOut(now) ? lightsOutReleaseAt(now) : null;
}

let clock: () => Date = () => new Date();

/** The instant every lights-out decision is taken at. */
export function lightsOutNow(): Date {
  return clock();
}

/**
 * Tests only. `vitest.setup.ts` pins the clock to midday so no suite's result
 * depends on the hour it happens to run; the lights-out suites set their own
 * instants. `null` restores the real clock.
 */
export function setLightsOutClockForTesting(next: (() => Date) | null): void {
  clock = next ?? (() => new Date());
}
