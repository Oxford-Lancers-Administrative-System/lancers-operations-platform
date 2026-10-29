// What an event message *is*, the rules one submitted message has to satisfy,
// and when it goes — LAN-508. Pure, like event-questions-input.ts: the event
// form, the edit page and the template editor import it in the browser, and the
// services re-check every rule on the server.

import { CLUB_TIME_ZONE } from "@/lib/club-time";
import { isLightsOut, lightsOutReleaseAt } from "./messaging-schedule/lights-out";
import { shortMonthOf } from "./event-vocabulary";

/** The section's heading, on the form and on the event page (W1-01, W1-04). */
export const EVENT_MESSAGES_HEADLINE = "Event messages";

export type EventMessageChannel = "whatsapp" | "email" | "both"; // public.event_message_channel, in full
export type EventMessageRecipients = "everyone" | "yes"; // public.event_message_recipients, in full

export const EVENT_MESSAGE_CHANNELS: readonly EventMessageChannel[] = Object.freeze([
  "whatsapp",
  "email",
  "both",
]);

export const EVENT_MESSAGE_RECIPIENTS: readonly EventMessageRecipients[] = Object.freeze([
  "everyone",
  "yes",
]);

/** The Channel control's words (W1-01). */
export const EVENT_MESSAGE_CHANNEL_LABELS: Readonly<Record<EventMessageChannel, string>> =
  Object.freeze({ whatsapp: "WhatsApp", email: "Email", both: "Both" });

/** The Recipients control's words (W1-01). */
export const EVENT_MESSAGE_RECIPIENT_LABELS: Readonly<Record<EventMessageRecipients, string>> =
  Object.freeze({ everyone: "Everyone invited", yes: "Those who said Yes" });

/**
 * One short line under each control explaining what it means — LAN-515
 * (Stewart, 29 Oct: "it's just right there for the people that are making
 * this stuff"). Brian's explicit exception to the no-narrative-text rule.
 */
export const EVENT_MESSAGE_HOURS_HELP = "48 = sent two days before the event starts";

export const EVENT_MESSAGE_CHANNEL_HELP: Readonly<Record<EventMessageChannel, string>> =
  Object.freeze({
    whatsapp: "WhatsApp only; anyone without WhatsApp consent gets it by email",
    email: "Email only",
    both: "WhatsApp and email; anyone without WhatsApp consent gets the email only",
  });

export const EVENT_MESSAGE_RECIPIENT_HELP: Readonly<Record<EventMessageRecipients, string>> =
  Object.freeze({
    everyone: "Everyone invited when it sends, whatever they answered",
    yes: "Only those whose answer is Yes when it sends",
  });

/** How the plan row and the event page name a channel: "WhatsApp and email" (W1-03). */
const CHANNEL_PHRASES: Readonly<Record<EventMessageChannel, string>> = Object.freeze({
  whatsapp: "WhatsApp",
  email: "Email",
  both: "WhatsApp and email",
});

/** The schema's own bounds (`event_messages_hours_before_is_sane`). */
export const MIN_EVENT_MESSAGE_HOURS = 1;
export const MAX_EVENT_MESSAGE_HOURS = 336;
/** The schema's own bound (`event_messages_body_is_bounded`). */
export const MAX_EVENT_MESSAGE_LENGTH = 4000;

export const DEFAULT_EVENT_MESSAGE_HOURS = 48;

export interface RawEventMessage {
  /** The stored `event_messages.id`, or absent/empty for one just written. */
  id?: string | null;
  hoursBefore?: string | null;
  channel?: string | null;
  recipients?: string | null;
  body?: string | null;
  /** "true" while it is the template's skeleton, untouched (D42's rule for questions). */
  fromTemplate?: string | null;
}

export interface EventMessageInput {
  id: string | null;
  hoursBefore: number;
  channel: EventMessageChannel;
  recipients: EventMessageRecipients;
  body: string;
  fromTemplate: boolean;
}

export interface EventMessageIssue {
  index: number;
  /** Which control on the card the correction belongs under. */
  field: "hoursBefore" | "channel" | "recipients" | "body";
  message: string;
}

export type EventMessagesValidation =
  { ok: true; value: EventMessageInput[] } | { ok: false; issues: EventMessageIssue[] };

/** Line endings normalised and the end trimmed; the start is the coach's own layout. */
function normaliseBriefBody(body: string | null | undefined): string {
  return typeof body === "string" ? body.replace(/\r\n|\r/g, "\n").trimEnd() : "";
}

/** The whole list at once, collecting every issue (the shared state contract). */
export function validateEventMessages(raw: readonly RawEventMessage[]): EventMessagesValidation {
  const issues: EventMessageIssue[] = [];
  const value: EventMessageInput[] = [];

  raw.forEach((message, index) => {
    const hoursText = (message.hoursBefore ?? "").trim();
    const hours = /^\d+$/.test(hoursText) ? Number(hoursText) : Number.NaN;
    if (
      !Number.isInteger(hours) ||
      hours < MIN_EVENT_MESSAGE_HOURS ||
      hours > MAX_EVENT_MESSAGE_HOURS
    ) {
      issues.push({
        index,
        field: "hoursBefore",
        message: `Hours before is a whole number from ${MIN_EVENT_MESSAGE_HOURS} to ${MAX_EVENT_MESSAGE_HOURS}.`,
      });
      return;
    }

    const channel = (message.channel ?? "").trim();
    if (!(EVENT_MESSAGE_CHANNELS as readonly string[]).includes(channel)) {
      issues.push({ index, field: "channel", message: "Choose a channel." });
      return;
    }
    const recipients = (message.recipients ?? "").trim();
    if (!(EVENT_MESSAGE_RECIPIENTS as readonly string[]).includes(recipients)) {
      issues.push({ index, field: "recipients", message: "Choose who it goes to." });
      return;
    }

    const body = normaliseBriefBody(message.body);
    if (body.trim() === "") {
      issues.push({ index, field: "body", message: "Write the message, or remove it." });
      return;
    }
    if (body.length > MAX_EVENT_MESSAGE_LENGTH) {
      issues.push({
        index,
        field: "body",
        message: `Keep the message under ${MAX_EVENT_MESSAGE_LENGTH} characters.`,
      });
      return;
    }

    const id = (message.id ?? "").trim();
    value.push({
      id: id === "" ? null : id,
      hoursBefore: hours,
      channel: channel as EventMessageChannel,
      recipients: recipients as EventMessageRecipients,
      body,
      fromTemplate: (message.fromTemplate ?? "").trim() === "true",
    });
  });

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value };
}

/** Whether one stored message and one submitted message say different things. */
export function eventMessageChanged(
  stored: Pick<EventMessageInput, "hoursBefore" | "channel" | "recipients" | "body">,
  submitted: Pick<EventMessageInput, "hoursBefore" | "channel" | "recipients" | "body">,
): boolean {
  return (
    stored.hoursBefore !== submitted.hoursBefore ||
    stored.channel !== submitted.channel ||
    stored.recipients !== submitted.recipients ||
    normaliseBriefBody(stored.body) !== normaliseBriefBody(submitted.body)
  );
}

/**
 * Whether a submitted list differs from the stored one at all — the edit page's
 * "is there anything to save" test, on `eventQuestionsDiffer`'s pattern. Order
 * counts, because it is the order the messages are listed in.
 */
export function eventMessagesDiffer(
  stored: readonly EventMessageInput[],
  submitted: readonly EventMessageInput[],
): boolean {
  if (stored.length !== submitted.length) return true;
  return stored.some((before, index) => {
    const after = submitted[index];
    return before.id !== after.id || eventMessageChanged(before, after);
  });
}

/** "48 hours before · WhatsApp and email · Everyone invited" — the plan row and the event page (W1-03, W1-04). */
export function describeEventMessage(message: {
  hoursBefore: number;
  channel: EventMessageChannel;
  recipients: EventMessageRecipients;
}): string {
  const hours = `${message.hoursBefore} ${message.hoursBefore === 1 ? "hour" : "hours"} before`;
  return `${hours} · ${CHANNEL_PHRASES[message.channel]} · ${EVENT_MESSAGE_RECIPIENT_LABELS[message.recipients]}`;
}

// ---------------------------------------------------------------------------
// When it goes
// ---------------------------------------------------------------------------

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function clubWallClock(instant: Date): WallClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

/**
 * The instant an event starts, from its zoneless `scheduled_on` and
 * `starts_at` read as club time — the same reading `EVENT_START_SQL` makes in
 * the database. `null` when either is missing or unreadable.
 */
export function clubEventStart(scheduledOn: string | null, startsAt: string | null): Date | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(scheduledOn ?? "");
  const time = /^(\d{2}):(\d{2})/.exec(startsAt ?? "");
  if (!day || !time) return null;
  const [year, month, date] = [Number(day[1]), Number(day[2]), Number(day[3])];
  const [hour, minute] = [Number(time[1]), Number(time[2])];
  // Guess as if London were UTC, then correct by however far the club's clock
  // reads from the guess (lights-out.ts's own technique, to the minute).
  const guess = Date.UTC(year, month - 1, date, hour, minute);
  const read = clubWallClock(new Date(guess));
  const readAsUtc = Date.UTC(read.year, read.month - 1, read.day, read.hour, read.minute);
  const instant = new Date(guess - (readAsUtc - guess));
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** The send time before lights-out: the event start less the hours. */
function eventMessageNominalSendAt(eventStart: Date, hoursBefore: number): Date {
  return new Date(eventStart.getTime() - hoursBefore * 60 * 60 * 1000);
}

/**
 * When an unsent message actually goes: the event start less the hours, and a
 * moment between 22:00 and 07:00 waits for 07:00 (LAN-433). A moment already
 * past goes on the next sweep, so it is `now`, held the same way.
 */
export function eventMessageSendAt(
  eventStart: Date,
  hoursBefore: number,
  now: Date = new Date(),
): Date {
  const nominal = eventMessageNominalSendAt(eventStart, hoursBefore);
  const moment = nominal.getTime() < now.getTime() ? now : nominal;
  return isLightsOut(moment) ? lightsOutReleaseAt(moment) : moment;
}

function part(at: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: CLUB_TIME_ZONE }).format(at);
}

function clubIsoDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function clubTime(at: Date): string {
  return part(at, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "Fri 6 Nov · 14:00" — the Hours before helper (W1-01) and the plan row (W1-03). */
export function formatEventMessageWhen(at: Date): string {
  return `${part(at, { weekday: "short" })} ${part(at, { day: "numeric" })} ${shortMonthOf(clubIsoDay(at))} · ${clubTime(at)}`;
}

/** "6 Nov 14:00" — the status beside each message on the event page (W1-04). */
export function formatEventMessageMoment(at: Date): string {
  return `${part(at, { day: "numeric" })} ${shortMonthOf(clubIsoDay(at))} ${clubTime(at)}`;
}

/** "6 November at 14:00" — the Send again? dialog (W1-05). */
function formatEventMessageSentOn(at: Date): { date: string; time: string } {
  return { date: part(at, { day: "numeric", month: "long" }), time: clubTime(at) };
}

/** W1-05's body, word for word. */
export function sendAgainBody(sentAt: Date): string {
  const { date, time } = formatEventMessageSentOn(sentAt);
  return `This event message was sent on ${date} at ${time}. Saving sends it again to everyone it went to.`;
}

/** Where one message stands, for the event page's row (W1-04). */
export type EventMessageStatus =
  | { readonly kind: "sent"; readonly at: Date }
  | { readonly kind: "scheduled"; readonly at: Date }
  | { readonly kind: "cancelled" }
  | { readonly kind: "not_sent" };

/**
 * Sent once it has a send; otherwise Scheduled at its moment on an approved
 * event still ahead, Cancelled on a cancelled event, and Not sent once the
 * event has started without it (its moment fell in lights-out too late).
 */
export function eventMessageStatus(input: {
  lastSentAt: Date | null;
  eventStatus: string;
  eventStart: Date | null;
  hoursBefore: number;
  now?: Date;
}): EventMessageStatus {
  const now = input.now ?? new Date();
  if (input.lastSentAt !== null) return { kind: "sent", at: input.lastSentAt };
  if (input.eventStatus === "cancelled") return { kind: "cancelled" };
  if (input.eventStart === null || input.eventStart.getTime() <= now.getTime()) {
    return { kind: "not_sent" };
  }
  const at = eventMessageSendAt(input.eventStart, input.hoursBefore, now);
  return at.getTime() < input.eventStart.getTime()
    ? { kind: "scheduled", at }
    : { kind: "not_sent" };
}

/** "Scheduled 6 Nov 14:00" · "Sent 6 Nov 14:00" · "Cancelled" · "Not sent". */
export function describeEventMessageStatus(status: EventMessageStatus): string {
  switch (status.kind) {
    case "sent":
      return `Sent ${formatEventMessageMoment(status.at)}`;
    case "scheduled":
      return `Scheduled ${formatEventMessageMoment(status.at)}`;
    case "cancelled":
      return "Cancelled";
    case "not_sent":
      return "Not sent";
  }
}

export const SEND_AGAIN_TITLE = "Send again?";
export const SEND_AGAIN_CONFIRM = "Save and send again";
