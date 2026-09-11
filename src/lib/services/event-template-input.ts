// What an event type's template holds — LAN-154, W8. Pure, like event-input.ts (Client Component).
// D12/D40/LAN-265: a row with its own id/name; the enum survives as the behavioural class. Every
// field optional except name; null means "does not say" (see relocations.md).
// Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE

import { EVENT_DELIVERY_MODES, optional, trimmed, type EventDeliveryMode } from "./event-input";
import type { AudienceGroupKey } from "./audience-selection";
import type { RawEventQuestion } from "./event-questions-input";

// Here, not event-templates.ts (server-only) — readEventFormDefaults builds these.
export interface EventTypeFormDefaults {
  id: string; // LAN-265: the template's own identity, which is what the event stores
  name: string; // what the operator picks it by, the only word the control shows
  eventType: string; // the class this template gives an event; never rendered
  deliveryMode: EventDeliveryMode;
  venue: string;
  description: string;
  requiredEquipment: string;
  attendance: "mandatory" | "optional";
  durationMinutes: number | null;
  questions: RawEventQuestion[];
}

// LAN-265: every new template picks "Practice" — nothing on screen offers a choice (D15).
export const DEFAULT_TEMPLATE_CLASS = "practice";

export const MIN_TEMPLATE_DURATION_MINUTES = 5; // the schema's own bounds
export const MAX_TEMPLATE_DURATION_MINUTES = 1440;

const MAX_TEMPLATE_NAME_LENGTH = 60;

// A template's colour, chosen and stored — LAN-276 correction round 1 (see relocations.md). The
// key is stored, never the hex, so re-tuning the palette changes this array and nothing else.
export interface TemplateColourSwatch {
  readonly key: string;
  readonly label: string; // the word the picker prints beside the swatch
  readonly accent: string; // the saturated edge, strong enough to read at 3px against the tint
  readonly tint: string; // the tile's background, light enough for text.primary to sit on
}

export const TEMPLATE_COLOUR_PALETTE: readonly TemplateColourSwatch[] = Object.freeze([
  Object.freeze({ key: "blue", label: "Blue", accent: "#1565c0", tint: "#e8f1fb" }),
  Object.freeze({ key: "teal", label: "Teal", accent: "#00796b", tint: "#e2f1ef" }),
  Object.freeze({ key: "purple", label: "Purple", accent: "#4527a0", tint: "#ece7f7" }),
  Object.freeze({ key: "red", label: "Red", accent: "#c62828", tint: "#fbe9e9" }),
  Object.freeze({ key: "orange", label: "Orange", accent: "#ef6c00", tint: "#fdf0e2" }),
  Object.freeze({ key: "green", label: "Green", accent: "#2e7d32", tint: "#e8f3e9" }),
  Object.freeze({ key: "slate", label: "Slate", accent: "#455a64", tint: "#eceff1" }),
  Object.freeze({ key: "indigo", label: "Indigo", accent: "#283593", tint: "#e8eaf6" }),
  Object.freeze({ key: "pink", label: "Pink", accent: "#ad1457", tint: "#fce4ec" }),
  Object.freeze({ key: "brown", label: "Brown", accent: "#4e342e", tint: "#efebe9" }),
  Object.freeze({ key: "cyan", label: "Cyan", accent: "#00838f", tint: "#e0f7fa" }),
  Object.freeze({ key: "lime", label: "Lime", accent: "#827717", tint: "#f9fbe7" }),
]);

export const TEMPLATE_COLOUR_KEYS: readonly string[] = Object.freeze(
  TEMPLATE_COLOUR_PALETTE.map((swatch) => swatch.key),
);

export const DEFAULT_TEMPLATE_COLOUR_KEY = "blue"; // C6's "a default suggested", not an empty picker — changeable before saving

function isTemplateColourKey(value: string): boolean {
  return TEMPLATE_COLOUR_KEYS.includes(value);
}

export function templateColourFor(key: string): TemplateColourSwatch {
  return TEMPLATE_COLOUR_PALETTE.find((swatch) => swatch.key === key) ?? TEMPLATE_COLOUR_PALETTE[0];
}

export interface RawEventTemplate {
  name?: string | null; // LAN-265: the one non-optional field — unnamed, a template can't be picked, listed or read
  colourKey?: string | null; // LAN-276 R1: a palette key, required exactly as name is
  defaultVenue?: string | null;
  defaultDeliveryMode?: string | null;
  defaultDurationMinutes?: string | null; // minutes, as typed; empty means the template does not say
  defaultDescription?: string | null;
  defaultRequiredEquipment?: string | null;
  defaultAttendance?: string | null; // "mandatory", "optional", or anything else for "does not say"
  audienceGroups?: readonly string[]; // group keys (D47), never people
  questions?: readonly RawEventQuestion[];
}

export interface EventTemplateInput {
  name: string;
  colourKey: string; // LAN-276 R1: a key into TEMPLATE_COLOUR_PALETTE
  defaultVenue: string | null;
  defaultDeliveryMode: EventDeliveryMode | null;
  defaultDurationMinutes: number | null;
  defaultDescription: string | null;
  defaultRequiredEquipment: string | null;
  defaultIsMandatory: boolean | null; // tri-state on purpose: null is "does not say"
  audienceGroups: AudienceGroupKey[];
}

export interface TemplateFieldIssue {
  field: keyof RawEventTemplate;
  message: string;
}

export type EventTemplateValidation =
  { ok: true; value: EventTemplateInput } | { ok: false; issues: TemplateFieldIssue[] };

// Audience groups are not validated against the event type here — that's audience-selection.ts's rule.
export function validateEventTemplate(raw: RawEventTemplate): EventTemplateValidation {
  const issues: TemplateFieldIssue[] = [];

  const name = trimmed(raw.name);
  if (name === "") {
    issues.push({ field: "name", message: "Give this template a name." });
  } else if (name.length > MAX_TEMPLATE_NAME_LENGTH) {
    issues.push({
      field: "name",
      message: `Use ${MAX_TEMPLATE_NAME_LENGTH} characters or fewer.`,
    });
  }

  const colourKeyRaw = trimmed(raw.colourKey);
  if (colourKeyRaw === "") {
    issues.push({ field: "colourKey", message: "Choose a colour for this template." });
  } else if (!isTemplateColourKey(colourKeyRaw)) {
    issues.push({ field: "colourKey", message: "Choose one of the offered colours." });
  }

  const deliveryModeRaw = trimmed(raw.defaultDeliveryMode);
  let defaultDeliveryMode: EventDeliveryMode | null = null;
  if (deliveryModeRaw !== "" && deliveryModeRaw !== "unset") {
    if (!EVENT_DELIVERY_MODES.includes(deliveryModeRaw as EventDeliveryMode)) {
      issues.push({
        field: "defaultDeliveryMode",
        message: "Say whether this kind of event is in person or online, or leave it undecided.",
      });
    } else {
      defaultDeliveryMode = deliveryModeRaw as EventDeliveryMode;
    }
  }

  const durationRaw = trimmed(raw.defaultDurationMinutes);
  let defaultDurationMinutes: number | null = null;
  if (durationRaw !== "") {
    const minutes = Number(durationRaw);
    if (!Number.isInteger(minutes)) {
      issues.push({ field: "defaultDurationMinutes", message: "Enter the length in minutes." });
    } else if (minutes < MIN_TEMPLATE_DURATION_MINUTES || minutes > MAX_TEMPLATE_DURATION_MINUTES) {
      issues.push({
        field: "defaultDurationMinutes",
        message: `Enter between ${MIN_TEMPLATE_DURATION_MINUTES} and ${MAX_TEMPLATE_DURATION_MINUTES} minutes.`,
      });
    } else if (minutes % 5 !== 0) {
      issues.push({
        field: "defaultDurationMinutes",
        message: "Enter the length in five-minute steps.",
      });
    } else {
      defaultDurationMinutes = minutes;
    }
  }

  const attendance = trimmed(raw.defaultAttendance);
  const defaultIsMandatory =
    attendance === "mandatory" ? true : attendance === "optional" ? false : null;

  const audienceGroups: AudienceGroupKey[] = [];
  for (const group of raw.audienceGroups ?? []) {
    const key = trimmed(group);
    if (key !== "" && !audienceGroups.includes(key as AudienceGroupKey)) {
      audienceGroups.push(key as AudienceGroupKey);
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      name,
      colourKey: colourKeyRaw,
      defaultVenue: optional(raw.defaultVenue),
      defaultDeliveryMode,
      defaultDurationMinutes,
      defaultDescription: optional(raw.defaultDescription),
      defaultRequiredEquipment: optional(raw.defaultRequiredEquipment),
      defaultIsMandatory,
      audienceGroups,
    },
  };
}

// "2 hours" · "90 minutes" · "1 hour 30 minutes" — the template list and editor both print it (docs/ux/standards.md rule 7).
export function describeDuration(minutes: number | null): string {
  if (minutes === null) return "Not set";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = hours === 0 ? "" : hours === 1 ? "1 hour" : `${hours} hours`;
  const minutePart = rest === 0 ? "" : rest === 1 ? "1 minute" : `${rest} minutes`;
  return [hourPart, minutePart].filter(Boolean).join(" ") || "Not set";
}

// C6: 30-minute increments between 30 min and 4 hours, not freeform text — the editor's grid only.
export const TEMPLATE_DURATION_OPTIONS: readonly number[] = Object.freeze([
  30, 60, 90, 120, 150, 180, 210, 240,
]);

// Pure, string-in/string-out (D78). Wraps past midnight — events_times_ordered decides legality.
export function endTimeFromStart(startsAt: string | null, minutes: number | null): string | null {
  if (startsAt === null || minutes === null) return null;
  const hour = Number(startsAt.slice(0, 2));
  const minute = Number(startsAt.slice(3, 5));
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  const total = (hour * 60 + minute + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
