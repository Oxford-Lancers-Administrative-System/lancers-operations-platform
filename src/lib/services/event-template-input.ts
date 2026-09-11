/**
 * What an event type's template holds, and the rules one submitted template has
 * to satisfy. LAN-154, workflow W8.
 *
 * Pure, like `event-input.ts` and `event-questions-input.ts` and for the same
 * reason: the template editor is a Client Component, and the module that
 * reaches the database cannot be in its import graph.
 *
 * ## Operators create templates, and name them — LAN-265
 *
 * D12's seven event types and D40's one-template-each were the same fact until
 * Brian reopened it on 2026-09-09: "A template is anything the operators want to
 * create." A template is now a row with its own id and its own name, and the
 * seven-value enum survives underneath it as the behavioural class the code
 * needs a closed vocabulary for. Adding a *class* is still a migration and
 * Brian's decision; adding a *template* is an ordinary administrative act.
 *
 * What that costs this module is one required field. Everything a template says
 * about the event is still optional; the name is not, because the name is the
 * whole of what an operator ever sees of a template.
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
 * No date and no start time (D40, Brian 2026-08-21: "the name is always going to
 * be unique ... Usual time doesn't make any sense to me"). That quotation is
 * about the **event's** name, which a template still never supplies; the
 * template's own name, added by LAN-265, is what the kind of event is called
 * rather than what any one of them is called. What a template can usefully say
 * about time is how long it runs, so it holds a duration.
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
  /** LAN-265. The template's own identity, which is what the event stores. */
  id: string;
  /** What the operator picks it by, and the only word the control shows. */
  name: string;
  /** The class this template gives an event. Never rendered. */
  eventType: string;
  deliveryMode: EventDeliveryMode;
  venue: string;
  description: string;
  requiredEquipment: string;
  attendance: "mandatory" | "optional";
  durationMinutes: number | null;
  questions: RawEventQuestion[];
}

/**
 * The behavioural class a template an operator creates carries.
 *
 * LAN-265: "the seven existing templates keep theirs, and a new template picks
 * the closest one at creation, with 'Practice' the default." Nothing on any
 * screen offers the choice, so in practice this *is* the class of every template
 * created from now on — which is right, because the classes that behave
 * differently (recruitment's audience rules, a game's report bucket) are the
 * ones a migration and a Brian decision would introduce.
 *
 * Here rather than in `event-templates.ts` because the create-and-edit form is a
 * Client Component and needs it: D15's "a blank form opens on a practice" is
 * expressed against the class now that no name can be relied on. That module is
 * `server-only`, so a value both sides need lives on the pure side.
 */
export const DEFAULT_TEMPLATE_CLASS = "practice";

/** The narrowest and widest a default length may be — the schema's own bounds. */
export const MIN_TEMPLATE_DURATION_MINUTES = 5;
export const MAX_TEMPLATE_DURATION_MINUTES = 1440;

/** The narrowest and widest a template's own name may be. */
const MAX_TEMPLATE_NAME_LENGTH = 60;

// ---------------------------------------------------------------------------
// Colour — LAN-276 correction round 1
// ---------------------------------------------------------------------------

/**
 * A template's colour, chosen and stored — LAN-276 correction round 1.
 *
 * Brian, walking the review environment, 2026-09-10: "In the template, swatch
 * color should be something that gets chosen, so it gets added as part of the
 * template." Before this, the calendar coloured a tile by `event_type` — the
 * behavioural class an operator never sees or picks — so every template an
 * operator created showed Practice's blue by accident, because `practice` is
 * `DEFAULT_TEMPLATE_CLASS`. This module is the one place that says which
 * colours exist and what hex each means, so the editor's picker, the calendar
 * and `event_templates_colour_key_known` all read from it rather than three
 * copies that could drift.
 *
 * The **key** is what is stored and posted, never the hex: a palette that
 * needs re-tuning — a new swatch, a nudged tint — changes this array and
 * nothing else, rather than a migration.
 *
 * The seven values that carry a seeded template's name below are exactly the
 * seven hex pairs `EVENT_TYPE_COLOURS` gave those seven event types before
 * this correction, so the migration's backfill keeps the calendar looking
 * exactly as it did. The rest exist only so an operator has more than seven
 * choices; nothing associates them with a class.
 */
export interface TemplateColourSwatch {
  readonly key: string;
  /** The word the picker prints beside the swatch. */
  readonly label: string;
  /** The saturated edge. Strong enough to read at 3px against the tint. */
  readonly accent: string;
  /** The tile's background. Light enough for `text.primary` to sit on it. */
  readonly tint: string;
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

/** Every key the palette offers, in the order the picker shows them. */
export const TEMPLATE_COLOUR_KEYS: readonly string[] = Object.freeze(
  TEMPLATE_COLOUR_PALETTE.map((swatch) => swatch.key),
);

/**
 * The suggested colour on **New template** — C6's "a default suggested"
 * rather than an empty picker. An operator sees it selected and can change it
 * before saving; nothing here is applied silently, which is the difference
 * between this and the accidental sharing the correction removes.
 */
export const DEFAULT_TEMPLATE_COLOUR_KEY = "blue";

function isTemplateColourKey(value: string): boolean {
  return TEMPLATE_COLOUR_KEYS.includes(value);
}

/** The swatch for a stored key. Falls back to the first rather than throwing. */
export function templateColourFor(key: string): TemplateColourSwatch {
  return TEMPLATE_COLOUR_PALETTE.find((swatch) => swatch.key === key) ?? TEMPLATE_COLOUR_PALETTE[0];
}

/** What the template editor posted. Every field a string, every one optional. */
export interface RawEventTemplate {
  /**
   * LAN-265. The one field that is **not** optional: a template with no name
   * cannot be picked, listed or read, because the name is the whole of what an
   * operator ever sees of it.
   */
  name?: string | null;
  /**
   * LAN-276 correction round 1. A palette key — see `TEMPLATE_COLOUR_PALETTE`
   * — never a free hex value. Required exactly as `name` is: a template
   * without a chosen colour is not the fact this correction asks for.
   */
  colourKey?: string | null;
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
  name: string;
  /** LAN-276 correction round 1. A key into `TEMPLATE_COLOUR_PALETTE`. */
  colourKey: string;
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

  // LAN-265. Uniqueness is not checked here and deliberately so: two operators
  // can each be holding a form that says "Kicking Clinic", and the only place
  // that can be decided is the database's own unique index at the moment of the
  // write. This function owns the shape of a value, exactly as it does for the
  // audience groups it also refuses to judge.
  const name = trimmed(raw.name);
  if (name === "") {
    issues.push({ field: "name", message: "Give this template a name." });
  } else if (name.length > MAX_TEMPLATE_NAME_LENGTH) {
    issues.push({
      field: "name",
      message: `Use ${MAX_TEMPLATE_NAME_LENGTH} characters or fewer.`,
    });
  }

  // LAN-276 correction round 1. Required exactly as `name` is: the editor
  // always posts a value (a swatch is selected from the moment the form
  // opens), so an empty or unrecognised one only ever reaches here from a
  // hand-typed request.
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
