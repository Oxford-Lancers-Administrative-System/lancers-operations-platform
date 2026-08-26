import { TYPE_LABELS } from "@/lib/services/event-vocabulary";
import type { MessagingScheduleChange } from "@/lib/services/messaging-schedule";

/**
 * Reading and checking the schedule form before it reaches the database —
 * W7, LAN-171.
 *
 * The database's own `messaging_schedules_*` check constraints are the
 * backstop (`src/lib/db/errors.ts` names each one in the club's words), and
 * this is the ergonomic layer in front of them: the same six bounds, checked
 * here so a mistyped field comes back naming the event type and the field
 * rather than a round trip to the database. Pure and side-effect-free, so it
 * is testable without a transaction.
 */

/** The seven event types, in the order `messaging_schedules` declares them. */
export const SCHEDULE_EVENT_TYPES: readonly string[] = Object.freeze(Object.keys(TYPE_LABELS));

export interface ScheduleFieldBounds {
  readonly field: keyof MessagingScheduleChange;
  /** The form field's own name, within one event type's group. */
  readonly key: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
}

/** One row per editable column — the same six `messaging_schedules` carries. */
export const SCHEDULE_FIELDS: readonly ScheduleFieldBounds[] = Object.freeze([
  { field: "rsvpByDays", key: "rsvpByDays", label: "Player RSVP by", min: 0, max: 60 },
  {
    field: "invitationLeadDays",
    key: "invitationLeadDays",
    label: "First invitation sent",
    min: 0,
    max: 120,
  },
  {
    field: "reminderCadenceHours",
    key: "reminderCadenceHours",
    label: "Reminder cadence",
    min: 1,
    max: 720,
  },
  {
    field: "whatsappReminderCount",
    key: "whatsappReminderCount",
    label: "WhatsApp reminders",
    min: 0,
    max: 10,
  },
  {
    field: "emailReminderCount",
    key: "emailReminderCount",
    label: "Email reminders",
    min: 0,
    max: 10,
  },
  {
    field: "escalationHours",
    key: "escalationHours",
    label: "President escalation",
    min: 0,
    max: 720,
  },
]);

/** The exact `name` attribute one field of one row's `<input>` carries. */
export function scheduleFieldName(eventType: string, key: string): string {
  return `${eventType}.${key}`;
}

export type ScheduleValidation =
  | { readonly ok: true; readonly changes: ReadonlyMap<string, MessagingScheduleChange> }
  | { readonly ok: false; readonly message: string };

/**
 * Reads and checks every field of every row, or names the first problem.
 *
 * Refuses the whole submission on the first invalid field rather than saving
 * six correct rows and silently dropping a seventh — a partial save from one
 * "Save changes" press would tell the operator less than they typed, not more.
 */
export function readScheduleChanges(formData: FormData): ScheduleValidation {
  const changes = new Map<string, MessagingScheduleChange>();

  for (const eventType of SCHEDULE_EVENT_TYPES) {
    const label = TYPE_LABELS[eventType] ?? eventType;
    const values: Partial<Record<keyof MessagingScheduleChange, number>> = {};

    for (const bound of SCHEDULE_FIELDS) {
      const raw = formData.get(scheduleFieldName(eventType, bound.key));
      if (typeof raw !== "string" || raw.trim() === "") {
        return {
          ok: false,
          message: `${label}: ${bound.label.toLowerCase()} cannot be left blank.`,
        };
      }
      const value = Number(raw);
      if (!Number.isInteger(value)) {
        return {
          ok: false,
          message: `${label}: ${bound.label.toLowerCase()} has to be a whole number.`,
        };
      }
      if (value < bound.min || value > bound.max) {
        return {
          ok: false,
          message: `${label}: ${bound.label.toLowerCase()} has to be between ${bound.min} and ${bound.max}.`,
        };
      }
      values[bound.field] = value;
    }

    const change = values as Required<typeof values>;

    // `messaging_schedules_invitation_precedes_the_deadline`, checked here in
    // the same words so the operator reads this rather than a database refusal.
    if (change.invitationLeadDays < change.rsvpByDays) {
      return {
        ok: false,
        message:
          `${label}: the first invitation has to go out on or before the RSVP deadline — it ` +
          "cannot ask people to answer by a date that has already passed when they are asked.",
      };
    }

    changes.set(eventType, {
      rsvpByDays: change.rsvpByDays,
      invitationLeadDays: change.invitationLeadDays,
      reminderCadenceHours: change.reminderCadenceHours,
      whatsappReminderCount: change.whatsappReminderCount,
      emailReminderCount: change.emailReminderCount,
      escalationHours: change.escalationHours,
    });
  }

  return { ok: true, changes };
}

/** Whether a proposed change differs from what is currently stored. */
export function scheduleChanged(
  current: MessagingScheduleChange,
  proposed: MessagingScheduleChange,
): boolean {
  return (
    current.rsvpByDays !== proposed.rsvpByDays ||
    current.invitationLeadDays !== proposed.invitationLeadDays ||
    current.reminderCadenceHours !== proposed.reminderCadenceHours ||
    current.whatsappReminderCount !== proposed.whatsappReminderCount ||
    current.emailReminderCount !== proposed.emailReminderCount ||
    current.escalationHours !== proposed.escalationHours
  );
}
