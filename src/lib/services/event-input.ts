// The event vocabulary and the rules one submitted form has to satisfy. Split out of events.ts,
// imported by the client form component; pure (no database, no server-only, no framework).

import { isSafeUri } from "./safe-uri";

// public.event_type, in full — the approved seven-type model (D12, LAN-151). See relocations.md.
export const EVENT_TYPES: readonly string[] = Object.freeze([
  "practice",
  "strength_and_conditioning",
  "chalk",
  "game",
  "social",
  "recruitment",
  "meeting",
]);

export const OPERATOR_CREATED_ORIGIN = "club_controlled"; // an operator typing into the club's own calendar controls the event

// The three stored statuses, and no others (D12, D30, LAN-151). See relocations.md.
export type EventStatus = "draft" | "approved" | "cancelled";

export const EVENT_STATUSES: readonly EventStatus[] = Object.freeze([
  "draft",
  "approved",
  "cancelled",
]);

// public.event_delivery_mode (D20): a property of the event, not guessed from the venue text (D21).
export type EventDeliveryMode = "in_person" | "online";

export const EVENT_DELIVERY_MODES: readonly EventDeliveryMode[] = Object.freeze([
  "in_person",
  "online",
]);

// D30: nothing asserts that an event occurred — occurred when its date has passed and it was not
// cancelled, same rule rsvp_attendance_mismatches uses in SQL. See relocations.md.
export type DerivedEventState = "upcoming" | "occurred" | "cancelled";

export function derivedEventState(
  event: { status: EventStatus; scheduledOn: string | null },
  today: string,
): DerivedEventState {
  if (event.status === "cancelled") return "cancelled";
  if (event.scheduledOn === null) return "upcoming"; // a draft with no date has not happened
  return event.scheduledOn < today ? "occurred" : "upcoming";
}

// The Status filter's fourth value (Q-6) — not a fourth event_status; nothing stores it (D30).
export const OCCURRED_FILTER: DerivedEventState = "occurred";

// The three stored states with the derived one in its place in time.
export const EVENT_STATUS_FILTERS: readonly string[] = Object.freeze([
  "draft",
  "approved",
  OCCURRED_FILTER,
  "cancelled",
]);

// What an operator typed, before any of it has been believed. origin/termId/weekNumber absent (LAN-76; see relocations.md).
export interface RawEventDraft {
  name?: string | null;
  templateId?: string | null; // LAN-265: the template this event is created from, replacing eventType — see relocations.md
  scheduledOn?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  deliveryMode?: string | null; // "in_person" or "online" (D20); absent means in person
  venue?: string | null; // address in person, destination online (D21)
  description?: string | null; // D18: free text
  requiredEquipment?: string | null; // D17: its own field, separate from description
  joiningUrl?: string | null; // the online event's link; published on the public calendar (LAN-284)
  attendance?: string | null; // "mandatory" or "optional"; absent is unanswered, never a default
}

export interface EventDraftInput {
  name: string;
  templateId: string; // LAN-265: the class the event ends up with is this template's, not a field
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  deliveryMode: EventDeliveryMode;
  venue: string | null;
  description: string | null;
  requiredEquipment: string | null;
  joiningUrl: string | null;
  isMandatory: boolean;
}

export interface FieldIssue {
  field: keyof RawEventDraft;
  message: string;
}

export type EventDraftValidation =
  { ok: true; value: EventDraftInput } | { ok: false; issues: FieldIssue[] };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; // shared with events.ts

// Collects **every** issue, not just the first (shared state contract). See relocations.md.
export function validateEventDraft(raw: RawEventDraft): EventDraftValidation {
  const issues: FieldIssue[] = [];

  const name = trimmed(raw.name);
  if (name === "") {
    issues.push({ field: "name", message: "Give the event a name." });
  }

  // LAN-265: shape only — whether the id still names a template is readTemplateInheritanceIn's question.
  const templateId = trimmed(raw.templateId);
  if (!UUID_PATTERN.test(templateId)) {
    issues.push({ field: "templateId", message: "Choose the kind of event this is." });
  }

  const scheduledOn = optional(raw.scheduledOn);
  if (scheduledOn !== null && !DATE_PATTERN.test(scheduledOn)) {
    issues.push({ field: "scheduledOn", message: "Enter the date as a calendar date." });
  }

  const startsAtRaw = optional(raw.startsAt);
  const endsAtRaw = optional(raw.endsAt);
  let startsAt: string | null = null;
  let endsAt: string | null = null;

  if (startsAtRaw !== null && !TIME_PATTERN.test(startsAtRaw)) {
    issues.push({ field: "startsAt", message: "Enter the start as a time of day." });
  } else {
    startsAt = startsAtRaw === null ? null : toMinutePrecision(startsAtRaw);
    if (startsAt !== null && !isFiveMinuteIncrement(startsAt)) {
      issues.push({ field: "startsAt", message: FIVE_MINUTE_INCREMENT_MESSAGE });
      startsAt = null;
    }
  }

  if (endsAtRaw !== null && !TIME_PATTERN.test(endsAtRaw)) {
    issues.push({ field: "endsAt", message: "Enter the end as a time of day." });
  } else {
    endsAt = endsAtRaw === null ? null : toMinutePrecision(endsAtRaw);
    if (endsAt !== null && !isFiveMinuteIncrement(endsAt)) {
      issues.push({ field: "endsAt", message: FIVE_MINUTE_INCREMENT_MESSAGE });
      endsAt = null;
    }
  }

  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) {
    issues.push({ field: "endsAt", message: "The event has to end after it starts." }); // events_times_ordered, said as a sentence
  }

  const attendance = trimmed(raw.attendance);
  if (attendance !== "" && attendance !== "mandatory" && attendance !== "optional") {
    issues.push({
      field: "attendance",
      message: "Say whether attendance is expected at this event.",
    });
  }

  const deliveryModeRaw = trimmed(raw.deliveryMode);
  const deliveryMode: EventDeliveryMode = deliveryModeRaw === "online" ? "online" : "in_person"; // D20: absent means in person
  if (deliveryModeRaw !== "" && !EVENT_DELIVERY_MODES.includes(deliveryModeRaw as never)) {
    issues.push({ field: "deliveryMode", message: "Say whether this is in person or online." });
  }

  const joiningUrl = optional(raw.joiningUrl);
  if (joiningUrl !== null && deliveryMode !== "online") {
    issues.push({
      field: "joiningUrl",
      message: "A joining link belongs to an online event. Change this to online, or clear it.",
    }); // REQ-no-joining-url
  }

  // LAN-284 made this field public; LAN-272 finding F1: a javascript: value here ran on an unauthenticated page. See relocations.md.
  if (joiningUrl !== null && !isSafeUri(joiningUrl)) {
    issues.push({ field: "joiningUrl", message: JOINING_URL_MESSAGE });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      name,
      templateId,
      scheduledOn,
      startsAt,
      endsAt,
      deliveryMode,
      venue: optional(raw.venue),
      description: optional(raw.description),
      requiredEquipment: optional(raw.requiredEquipment),
      joiningUrl,
      isMandatory: attendance === "mandatory",
    },
  };
}

const FIVE_MINUTE_INCREMENT_MESSAGE = "Enter the time in five-minute steps."; // D78: an entry rule, not a check constraint (see relocations.md)

export const JOINING_URL_MESSAGE = "Enter a full web address starting with https://";

export function isFiveMinuteIncrement(time: string): boolean {
  const minutes = Number(time.slice(3, 5));
  return Number.isInteger(minutes) && minutes % 5 === 0;
}

export interface TermWindow {
  id: string;
  name: string;
  academicYear: string;
  startsOn: string; // YYYY-MM-DD, the first day of firstWeek
  endsOn: string; // YYYY-MM-DD, falls inside lastWeek
  firstWeek: number; // -1 for Michaelmas, 0 for Hilary and Trinity
  lastWeek: number;
}

/** Where a date falls in the Oxford calendar. Both `null` means outside term. */
export interface TermCoordinate {
  termId: string | null;
  weekNumber: number | null;
}

const MS_PER_DAY = 86_400_000;

function dayMs(day: string): number | null {
  if (!DATE_PATTERN.test(day)) return null;
  const parsed = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

// week = first_week + floor((date - starts_on) / 7 days); starts_on is the first day of first_week,
// not of week 1 (Michaelmas begins at -1). Outside every term is legitimate, not an error.
export function deriveTermCoordinate(
  scheduledOn: string | null,
  terms: readonly TermWindow[],
): TermCoordinate {
  if (scheduledOn === null) return { termId: null, weekNumber: null };

  const dateMs = dayMs(scheduledOn);
  if (dateMs === null) return { termId: null, weekNumber: null };

  for (const term of terms) {
    const startMs = dayMs(term.startsOn);
    const endMs = dayMs(term.endsOn);
    if (startMs === null || endMs === null) continue;
    if (dateMs < startMs || dateMs > endMs) continue;

    const week = term.firstWeek + Math.floor((dateMs - startMs) / (7 * MS_PER_DAY));

    if (week < -1 || week > 8 || week > term.lastWeek) continue; // schema permits -1..8 only — see relocations.md

    return { termId: term.id, weekNumber: week };
  }

  return { termId: null, weekNumber: null };
}

// Trimmed, line endings normalised to \n (LAN-264; see relocations.md).
export function trimmed(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\r\n|\r/g, "\n").trim() : "";
}

export function optional(value: string | null | undefined): string | null {
  const text = trimmed(value);
  return text === "" ? null : text;
}

/** `HH:MM` — seconds are dropped so a re-edit round-trips unchanged. */
export function toMinutePrecision(time: string): string {
  return time.slice(0, 5);
}
