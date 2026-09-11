import { addClubDays, formatClubDay } from "@/lib/club-time";
import { optional, trimmed, type EventDeliveryMode, type EventStatus } from "./event-input";

// The rules an amendment and a cancellation obey — W5/W6, LAN-156. Pure, like event-input.ts;
// event-amendment.ts re-exports this. Knows nothing about a message (the Mission 4 seam). See relocations.md.

// The fields an amendment compares — exactly W4's editor fields; `status` and the template (LAN-265) cannot be among them. See relocations.md.
export type AmendableField =
  | "name"
  | "scheduledOn"
  | "startsAt"
  | "endsAt"
  | "deliveryMode"
  | "venue"
  | "description"
  | "requiredEquipment"
  | "joiningUrl"
  | "isMandatory";

export interface AmendableEvent {
  name: string;
  templateId: string; // carried but never compared (LAN-265) — needed to recompute deadline/chase threshold
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

export interface AmendmentChange {
  field: AmendableField;
  label: string; // "Venue" — the label the operator saw on the field they edited
  previous: string | null; // what it was, rendered; null where it was not set
  next: string | null; // what it becomes, rendered; null where it is being cleared
  material: boolean; // D55: whether this can strand somebody at the wrong place/time — see MATERIAL_FIELDS
}

// D55's list ("date, time or venue") plus deliveryMode, the venue's other half (D20/D21). See relocations.md.
export const MATERIAL_FIELDS: readonly AmendableField[] = Object.freeze([
  "scheduledOn",
  "startsAt",
  "endsAt",
  "deliveryMode",
  "venue",
]);

const FIELD_LABELS: Readonly<Record<AmendableField, string>> = Object.freeze({
  name: "Name",
  scheduledOn: "Date",
  startsAt: "Start",
  endsAt: "End",
  deliveryMode: "In person or online",
  venue: "Venue",
  description: "Description",
  requiredEquipment: "Required equipment",
  joiningUrl: "Joining link",
  isMandatory: "Attendance",
});

const AMENDABLE_FIELDS: readonly AmendableField[] = Object.freeze([
  "name",
  "scheduledOn",
  "startsAt",
  "endsAt",
  "deliveryMode",
  "venue",
  "description",
  "requiredEquipment",
  "joiningUrl",
  "isMandatory",
]);

export function isMaterial(field: AmendableField): boolean {
  return MATERIAL_FIELDS.includes(field);
}

function renderValue(event: AmendableEvent, field: AmendableField): string | null {
  switch (field) {
    case "isMandatory":
      return event.isMandatory ? "Mandatory" : "Optional";
    case "deliveryMode":
      return event.deliveryMode === "online" ? "Online" : "In person";
    case "name":
      return trimmed(event.name) === "" ? null : trimmed(event.name);
    case "scheduledOn": {
      // R156-B4: formatted for display (docs/ux/standards.md rule 3).
      const value = optional(event.scheduledOn);
      return value === null ? null : formatClubDay(value);
    }
    default:
      return optional(event[field] as string | null);
  }
}

// The fields that actually moved, compared on the **normalised** value, so a trailing space is not an amendment.
export function diffAmendment(
  before: AmendableEvent,
  after: AmendableEvent,
): readonly AmendmentChange[] {
  const changes: AmendmentChange[] = [];

  for (const field of AMENDABLE_FIELDS) {
    const previous = renderValue(before, field);
    const next = renderValue(after, field);
    if (previous === next) continue;
    changes.push({
      field,
      label: FIELD_LABELS[field],
      previous,
      next,
      material: isMaterial(field),
    });
  }

  return changes;
}

export function hasMaterialChange(changes: readonly AmendmentChange[]): boolean {
  return changes.some((change) => change.material);
}

// The amendment a submitted form actually asks for — LAN-244. A form that never touched a field
// cannot change it: baseline-vs-submitted is "what did this operator type" (see relocations.md).
export function mergeAmendment(
  current: AmendableEvent,
  baseline: AmendableEvent,
  submitted: AmendableEvent,
): AmendableEvent {
  const touched = new Set(diffAmendment(baseline, submitted).map((change) => change.field));
  const merged = { ...current };

  for (const field of AMENDABLE_FIELDS) {
    if (!touched.has(field)) continue;
    // each arm assigns one field to itself — keeps the value-type union sound without an `any` cast
    switch (field) {
      case "isMandatory":
        merged.isMandatory = submitted.isMandatory;
        break;
      case "deliveryMode":
        merged.deliveryMode = submitted.deliveryMode;
        break;
      case "name":
        merged.name = submitted.name;
        break;
      default:
        merged[field] = submitted[field];
        break;
    }
  }

  return merged;
}

// Where the single notify tick starts — D55/W5. One decision per amendment (Brian: "It's one tick"), not one per field.
export function defaultNotify(
  changes: readonly AmendmentChange[],
  options: { isFuture: boolean },
): boolean {
  return options.isFuture && hasMaterialChange(changes);
}

// Whether turning the tick off must be chosen, not defaulted — the same predicate as the default.
export function silenceNeedsConfirmation(
  changes: readonly AmendmentChange[],
  options: { isFuture: boolean },
): boolean {
  return defaultNotify(changes, options);
}

// D58/D31: everyone invited is told by default, except a bygone event being tidied up.
export function cancellationDefaultNotify(options: { isFuture: boolean }): boolean {
  return options.isFuture;
}

export function cancellationSilenceNeedsConfirmation(options: { isFuture: boolean }): boolean {
  return options.isFuture; // same rule as W5, for the same reason
}

// Whether an event is still ahead of the club. A null date answers "not future" (invariant E1a);
// compared on the calendar day, so today's event is still "future" all day.
export function isFutureEvent(event: { scheduledOn: string | null }, today: string): boolean {
  return event.scheduledOn !== null && event.scheduledOn >= today;
}

// OD-1/Q6: recomputes where the RSVP chase threshold lands (public.event_type_settings, D75/D77/LAN-151); Mission 4 does the actual chasing.
export function chaseThresholdOn(
  scheduledOn: string | null,
  chaseThresholdDays: number,
): string | null {
  if (scheduledOn === null) return null;
  return addClubDays(scheduledOn, -Math.abs(chaseThresholdDays));
}

// D60: a cancelled event goes nowhere — a predicate over the *stored* status, not a transition list.
export function isTerminal(status: EventStatus): boolean {
  return status === "cancelled";
}
