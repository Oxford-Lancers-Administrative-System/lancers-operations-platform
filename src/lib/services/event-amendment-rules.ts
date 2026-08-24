import { addClubDays, formatClubDay } from "@/lib/club-time";
import { optional, trimmed, type EventDeliveryMode, type EventStatus } from "./event-input";

/**
 * The rules an amendment and a cancellation obey — W5 and W6, LAN-156.
 *
 * Pure, for the same structural reason `event-input.ts` is pure: the review
 * screen that shows an operator what changed, and the tick that decides whether
 * it notifies, are rendered in the browser, and a module the browser imports
 * cannot reach the PostgreSQL client. Everything that touches a row is in
 * `event-amendment.ts`, which re-exports this file so a server caller has one
 * import.
 *
 * The division also keeps the four decisions below testable without a database,
 * which matters because every one of them is a club rule rather than a query:
 *
 *   1. what counts as a change (`diffAmendment`);
 *   2. which changes strand somebody, and therefore where the single notify
 *      tick starts (`isMaterial`, `defaultNotify`);
 *   3. when silence has to be chosen rather than defaulted into
 *      (`silenceNeedsConfirmation`);
 *   4. where the RSVP chase threshold lands once an event moves
 *      (`chaseThresholdOn`).
 *
 * ## What this file deliberately does not know
 *
 * Anything about a message. Whether the club is on WhatsApp or on email does
 * not change one line here, which is the packet's own test for which side of
 * the Mission 4 seam a rule sits on. Nothing here schedules, formats, sends,
 * retries or chases.
 */

// ---------------------------------------------------------------------------
// What an amendment may change
// ---------------------------------------------------------------------------

/**
 * The fields an amendment compares.
 *
 * Exactly the fields `W4`'s editor puts on screen, because `W5` is that editor
 * made reachable on an approved event rather than a second form with its own
 * ideas. `status` is not among them and cannot be: an amendment never leaves
 * `approved` (REQ-amend-in-place).
 */
export type AmendableField =
  | "name"
  | "eventType"
  | "scheduledOn"
  | "startsAt"
  | "endsAt"
  | "deliveryMode"
  | "venue"
  | "description"
  | "requiredEquipment"
  | "joiningUrl"
  | "isMandatory";

/** The comparable shape of an event, before or after. */
export interface AmendableEvent {
  name: string;
  eventType: string;
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

/** One field that moved, in the words the review screen uses. */
export interface AmendmentChange {
  field: AmendableField;
  /** "Venue" — the label the operator saw on the field they edited. */
  label: string;
  /** What it was, rendered. `null` where it was not set. */
  previous: string | null;
  /** What it becomes, rendered. `null` where it is being cleared. */
  next: string | null;
  /**
   * D55. Whether this is a change that can strand somebody at the wrong place
   * at the wrong time — see `MATERIAL_FIELDS`.
   */
  material: boolean;
}

/**
 * D55's list, and the one addition it implies.
 *
 * The decision names "date, time or venue", and `startsAt`/`endsAt` are the
 * time. `deliveryMode` is here because it is the venue's other half: D20 and
 * D21 made in-person-or-online a property of the event with one venue column
 * meaning an address or a destination accordingly, so a practice moving from
 * Iffley Road to a video call changes where somebody has to be exactly as much
 * as moving to University Parks does, and strands them harder.
 *
 * What is deliberately **not** here: `name`, `description`, `requiredEquipment`,
 * `eventType`, `joiningUrl` and `isMandatory`. D55 lists description, equipment
 * and name as the silent ones, and D14 says a name change is not material
 * because the name is where the club writes "vs Bath". The remaining three are
 * not on D55's list in either direction; treating them as silent-by-default is
 * the same answer as the fields they most resemble, and the operator can still
 * turn the tick on for any of them with no confirmation asked.
 */
export const MATERIAL_FIELDS: readonly AmendableField[] = Object.freeze([
  "scheduledOn",
  "startsAt",
  "endsAt",
  "deliveryMode",
  "venue",
]);

const FIELD_LABELS: Readonly<Record<AmendableField, string>> = Object.freeze({
  name: "Name",
  eventType: "Type",
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

/** Every field an amendment compares, in the order the editor shows them. */
export const AMENDABLE_FIELDS: readonly AmendableField[] = Object.freeze([
  "name",
  "eventType",
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
    case "eventType":
      return optional(event.eventType);
    // R156-B4. `scheduledOn` is a stored calendar date ("2026-11-11"), and this
    // is the one place that value becomes the string the review screen and the
    // change history print. Left raw, it read as `2026-11-11` on both —
    // `docs/ux/standards.md` rule 3 — while every other date in the
    // application read `11 Nov 2026`. `startsAt`/`endsAt` need no equivalent
    // pass: a stored time of day is already the club's display form, "20:00",
    // not an instant with a shape rule 3 is about.
    case "scheduledOn": {
      const value = optional(event.scheduledOn);
      return value === null ? null : formatClubDay(value);
    }
    default:
      return optional(event[field] as string | null);
  }
}

/**
 * The fields that actually moved between two versions of one event.
 *
 * Compared on the **normalised** value, not on the raw one, so that adding a
 * trailing space to a description is not an amendment: it produces no history
 * row, sends nobody a message, and holds nothing. `optional()` is the same
 * normalisation `validateEventDraft` applies before storing, so the comparison
 * is between what is stored and what would be stored.
 */
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

/** Whether any of these changes is one D55 says speaks up by itself. */
export function hasMaterialChange(changes: readonly AmendmentChange[]): boolean {
  return changes.some((change) => change.material);
}

// ---------------------------------------------------------------------------
// The one notify decision
// ---------------------------------------------------------------------------

/**
 * Where the single tick starts — D55, as W5 reframed it.
 *
 * There is **one** decision per amendment and not one per changed field:
 * "You don't notify per thing … It's one tick" (Brian, 2026-08-21). Nobody
 * receives three messages because three fields moved. D55's per-field defaults
 * survive as the thing that decides where that one tick starts.
 *
 * `isFuture` is the second half, from W5's exceptions table: a past event is a
 * correction to the record, so the tick starts off however much moved. Nobody
 * needs a message about a venue change to a session three weeks gone.
 */
export function defaultNotify(
  changes: readonly AmendmentChange[],
  options: { isFuture: boolean },
): boolean {
  return options.isFuture && hasMaterialChange(changes);
}

/**
 * Whether turning the tick off has to be chosen rather than defaulted into.
 *
 * "37 people were told this is at Iffley Road Astro" — the confirmation names
 * the consequence in people, not in fields. An outright prohibition was
 * considered and rejected, because it would make a corrected spelling
 * impossible to fix without messaging the whole squad.
 *
 * The predicate is the same one that decides the default, which is the point:
 * silence is only a decision worth stopping for where the default was to
 * speak.
 */
export function silenceNeedsConfirmation(
  changes: readonly AmendmentChange[],
  options: { isFuture: boolean },
): boolean {
  return defaultNotify(changes, options);
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

/**
 * D58 and D31 together. Everyone invited is told by default — except where the
 * silent path exists for, which is tidying up a bygone event that never
 * happened. So the default follows the event's date, and nothing else.
 */
export function cancellationDefaultNotify(options: { isFuture: boolean }): boolean {
  return options.isFuture;
}

/** The same rule W5 uses, for the same reason: thirty-two people are expecting to be somewhere. */
export function cancellationSilenceNeedsConfirmation(options: { isFuture: boolean }): boolean {
  return options.isFuture;
}

/**
 * Whether an event is still ahead of the club, in the club's own zone.
 *
 * A `null` date cannot be approved (invariant E1a), so it cannot be amended or
 * cancelled either — but the predicate answers anyway rather than throwing,
 * and answers "not future", because an event with no date strands nobody.
 *
 * Compared on the calendar day rather than on the start time: an event today at
 * 14:00 is a future event at 18:00 for this purpose, because the people
 * invited to it are still expecting it and the register may already be open.
 */
export function isFutureEvent(event: { scheduledOn: string | null }, today: string): boolean {
  return event.scheduledOn !== null && event.scheduledOn >= today;
}

// ---------------------------------------------------------------------------
// The chase threshold, recomputed
// ---------------------------------------------------------------------------

/**
 * OD-1/Q6 — where the RSVP chase threshold lands, against whatever date the
 * event now has.
 *
 * The per-type day counts are stored in `public.event_type_settings` (D75,
 * D77), which LAN-151 created for exactly this. This function is the
 * recomputation: given the new date and the type's threshold in days, the day
 * on which an unanswered invitation becomes an exception the club chases.
 *
 * **Mission 4 does the chasing.** Nothing here schedules a reminder, decides an
 * escalation, or writes a job. The value is recomputed so that a practice moved
 * from next week to next month stops being chased on next week's schedule, and
 * it is recorded against the amendment so the recomputation is observable
 * rather than implied.
 *
 * `null` when the event has no date, which is a state an approved event cannot
 * be in.
 */
export function chaseThresholdOn(
  scheduledOn: string | null,
  chaseThresholdDays: number,
): string | null {
  if (scheduledOn === null) return null;
  return addClubDays(scheduledOn, -Math.abs(chaseThresholdDays));
}

// ---------------------------------------------------------------------------
// Terminality
// ---------------------------------------------------------------------------

/**
 * D60. A cancelled event goes nowhere.
 *
 * Written as a predicate over the *stored* status rather than as a list of
 * permitted transitions, because the guarantee the acceptance evidence asks for
 * is the negative one: "cannot be returned to any other status by any route,
 * including a direct service call". Every write path in `event-amendment.ts`
 * asks this question first, so the guarantee is one sentence in one place
 * rather than a rule each caller remembers.
 */
export function isTerminal(status: EventStatus): boolean {
  return status === "cancelled";
}
