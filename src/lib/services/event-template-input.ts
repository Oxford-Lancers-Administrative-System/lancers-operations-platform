/**
 * What an event type's template holds, and the rules one submitted template has
 * to satisfy. LAN-154, workflow W8.
 *
 * Pure, like `event-input.ts` and `event-questions-input.ts` and for the same
 * reason: the template editor is a Client Component, and the module that
 * reaches the database cannot be in its import graph.
 *
 * ## Seven templates, and nobody creates or deletes one
 *
 * D12 fixes seven event types and D40 gives each exactly one template. The rows
 * are created by `20260822120000_events_target_state.sql` and the table is
 * granted `select, update` and nothing else, so "add an eighth type" is refused
 * by the grant as well as by this module. Adding one is a change to the approved
 * domain model and Brian's decision.
 *
 * ## Every field is optional
 *
 * Brian, 2026-08-21: "the template does not mean that everything needs to be
 * changed ... You can have some details not decided." A field left undecided
 * arrives empty on a new event and overwrites nothing. That is why every value
 * below is nullable and why `defaultIsMandatory` is a tri-state rather than a
 * boolean: `null` means the template does not say, which is not the same as
 * "optional".
 *
 * ## What a template deliberately does not hold
 *
 * No name, no date and no start time (D40, Brian 2026-08-21: "the name is always
 * going to be unique ... Usual time doesn't make any sense to me"). What a type
 * can usefully say about time is how long it runs, so it holds a duration.
 *
 * And no RSVP timing of any kind. The per-type chase threshold lives in
 * `event_type_settings` for Mission 4 to consume; a template is what an event
 * arrives looking like, and when somebody is chased is not part of what an event
 * is.
 */

import { EVENT_DELIVERY_MODES, optional, trimmed, type EventDeliveryMode } from "./event-input";
import type { AudienceGroupKey } from "./audience-selection";
import type { RawEventQuestion } from "./event-questions-input";

/**
 * The seven templates in the shape the create-and-edit form fills itself from.
 *
 * Here rather than in `event-templates.ts` because the form is a Client
 * Component: it needs the *type*, and the module that reads the rows is
 * `server-only`. `readEventFormDefaults` builds these.
 *
 * The values are strings and not nulls because they go straight into form
 * controls, where "the template does not say" and "empty" are the same thing.
 */
export interface EventTypeFormDefaults {
  deliveryMode: EventDeliveryMode;
  venue: string;
  description: string;
  requiredEquipment: string;
  attendance: "mandatory" | "optional";
  durationMinutes: number | null;
  questions: RawEventQuestion[];
}

/** The narrowest and widest a default length may be — the schema's own bounds. */
export const MIN_TEMPLATE_DURATION_MINUTES = 5;
export const MAX_TEMPLATE_DURATION_MINUTES = 1440;

/** What the template editor posted. Every field a string, every one optional. */
export interface RawEventTemplate {
  defaultVenue?: string | null;
  defaultDeliveryMode?: string | null;
  /** Minutes, as typed. Empty means the template does not say. */
  defaultDurationMinutes?: string | null;
  defaultDescription?: string | null;
  defaultRequiredEquipment?: string | null;
  /** `"mandatory"`, `"optional"`, or anything else for "the template does not say". */
  defaultAttendance?: string | null;
  /** The default audience, as group keys (D47). Never people. */
  audienceGroups?: readonly string[];
  questions?: readonly RawEventQuestion[];
}

/** The same values, checked. */
export interface EventTemplateInput {
  defaultVenue: string | null;
  defaultDeliveryMode: EventDeliveryMode | null;
  defaultDurationMinutes: number | null;
  defaultDescription: string | null;
  defaultRequiredEquipment: string | null;
  /** Tri-state on purpose: `null` is "the template does not say". */
  defaultIsMandatory: boolean | null;
  audienceGroups: AudienceGroupKey[];
}

/** One field, one correction — the same shape the event form uses. */
export interface TemplateFieldIssue {
  field: keyof RawEventTemplate;
  message: string;
}

export type EventTemplateValidation =
  { ok: true; value: EventTemplateInput } | { ok: false; issues: TemplateFieldIssue[] };

/**
 * Validates one submitted template, collecting every issue.
 *
 * The audience groups are **not** validated against the event type here, because
 * which groups a type may carry is a rule about the roster and the recruitment
 * funnel rather than about this form — `audience-selection.ts` owns it, the
 * service applies it, and `event_template_audience_groups_recruits_are_recruitment_only`
 * is the database's backstop. What this function owns is the shape of a value.
 */
export function validateEventTemplate(raw: RawEventTemplate): EventTemplateValidation {
  const issues: TemplateFieldIssue[] = [];

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

/**
 * "2 hours" · "90 minutes" · "1 hour 30 minutes" — a default length, read aloud.
 *
 * The template list and the template editor both print it, so it is one
 * function: `docs/ux/standards.md` rule 7 is about exactly this kind of pair.
 */
export function describeDuration(minutes: number | null): string {
  if (minutes === null) return "Not set";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = hours === 0 ? "" : hours === 1 ? "1 hour" : `${hours} hours`;
  const minutePart = rest === 0 ? "" : rest === 1 ? "1 minute" : `${rest} minutes`;
  return [hourPart, minutePart].filter(Boolean).join(" ") || "Not set";
}

/**
 * C6. Brian: "the default times should be done in 30-minute increments
 * between 30 minutes and 4 hours ... It shouldn't be freeform text." Eight
 * options, each a multiple of 30 minutes; `describeDuration` is what labels
 * each one in the editor's select, so the wording can never drift from what
 * the template list and the confirmation dialog already say for the same
 * number.
 *
 * This is the editor's offered grid, not the model's limit — validation
 * still accepts any five-minute step from `MIN_TEMPLATE_DURATION_MINUTES` to
 * `MAX_TEMPLATE_DURATION_MINUTES`, unchanged, because a template saved before
 * this grid existed may hold a value that is not on it, and must go on
 * meaning exactly what it always meant.
 */
export const TEMPLATE_DURATION_OPTIONS: readonly number[] = Object.freeze([
  30, 60, 90, 120, 150, 180, 210, 240,
]);

/**
 * The end time a start implies, given a default length (D78).
 *
 * Pure and string-in/string-out, so the browser can fill the End field as the
 * operator types a start and the service can apply the same rule to a draft
 * created from a template. Wraps past midnight rather than refusing: an event
 * that runs to 00:30 is a real social, and the event's own
 * `events_times_ordered` constraint is what decides whether the pair is legal.
 */
export function endTimeFromStart(startsAt: string | null, minutes: number | null): string | null {
  if (startsAt === null || minutes === null) return null;
  const hour = Number(startsAt.slice(0, 2));
  const minute = Number(startsAt.slice(3, 5));
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  const total = (hour * 60 + minute + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
