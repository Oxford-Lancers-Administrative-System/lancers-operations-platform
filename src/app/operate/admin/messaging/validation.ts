import { TYPE_LABELS } from "@/lib/services/event-vocabulary";
import type { MessagingScheduleChange } from "@/lib/services/messaging-schedule";

/**
 * Reading and checking one row's form before it reaches the database — W7,
 * LAN-171.
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
  /** The `<input>` name within one row's own form. */
  readonly key: string;
  /** The settings grid's own short label (Brian's chosen shape): "RSVP by", not "Player RSVP by". */
  readonly label: string;
  /** Shown beside the input — "days", "h", or "" for a plain count. */
  readonly unit: string;
  /** The fuller phrase a validation message names, where the grid label alone would read clipped. */
  readonly fullLabel: string;
  readonly min: number;
  readonly max: number;
}

/** One row per editable column — the same six `messaging_schedules` carries. */
export const SCHEDULE_FIELDS: readonly ScheduleFieldBounds[] = Object.freeze([
  {
    field: "rsvpByDays",
    key: "rsvpByDays",
    label: "RSVP by",
    unit: "days",
    fullLabel: "Player RSVP by",
    min: 0,
    max: 60,
  },
  {
    field: "invitationLeadDays",
    key: "invitationLeadDays",
    label: "First inv.",
    unit: "days",
    fullLabel: "First invitation sent",
    min: 0,
    max: 120,
  },
  {
    field: "reminderCadenceHours",
    key: "reminderCadenceHours",
    label: "Cadence",
    unit: "h",
    fullLabel: "Reminder cadence",
    min: 1,
    max: 720,
  },
  {
    // Q-19 / OWNER-LAN171-05: this counts the invitation as WhatsApp #1, so
    // the grid label is "WhatsApp" alone — never "WhatsApp reminders", which
    // would call the invitation a reminder.
    field: "whatsappReminderCount",
    key: "whatsappReminderCount",
    label: "WhatsApp",
    unit: "",
    fullLabel: "WhatsApp count, including the invitation",
    min: 0,
    max: 10,
  },
  {
    field: "emailReminderCount",
    key: "emailReminderCount",
    label: "Email",
    unit: "",
    fullLabel: "Email reminders",
    min: 0,
    max: 10,
  },
  {
    field: "escalationHours",
    key: "escalationHours",
    label: "President",
    unit: "h",
    fullLabel: "President escalation",
    min: 0,
    max: 720,
  },
]);

export type ScheduleValidation =
  | { readonly ok: true; readonly change: MessagingScheduleChange }
  | { readonly ok: false; readonly message: string };

/**
 * Reads and checks one event type's six fields, from its own row's form.
 *
 * Every bound `messaging_schedules` itself carries is checked here, in the
 * club's own words, before anything reaches the database:
 * `rsvp_by_days`/`invitation_lead_days`/`reminder_cadence_hours`/
 * `whatsapp_reminder_count`/`email_reminder_count`/`escalation_hours` each
 * have a matching `min`/`max` above, and
 * `messaging_schedules_invitation_precedes_the_deadline` has the cross-field
 * check below — so a genuine database rejection of a well-formed row should
 * never happen; when one does anyway, `scheduleSaveFailedNotice` is what the
 * operator sees, not a raw constraint failure.
 */
export function readOneScheduleChange(eventType: string, formData: FormData): ScheduleValidation {
  const label = TYPE_LABELS[eventType] ?? eventType;
  const values: Partial<Record<keyof MessagingScheduleChange, number>> = {};

  for (const bound of SCHEDULE_FIELDS) {
    const raw = formData.get(bound.key);
    if (typeof raw !== "string" || raw.trim() === "") {
      return {
        ok: false,
        message: `${label}: ${bound.fullLabel.toLowerCase()} cannot be left blank.`,
      };
    }
    const value = Number(raw);
    if (!Number.isInteger(value)) {
      return {
        ok: false,
        message: `${label}: ${bound.fullLabel.toLowerCase()} has to be a whole number.`,
      };
    }
    if (value < bound.min || value > bound.max) {
      return {
        ok: false,
        message: `${label}: ${bound.fullLabel.toLowerCase()} has to be between ${bound.min} and ${bound.max}.`,
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

  return {
    ok: true,
    change: {
      rsvpByDays: change.rsvpByDays,
      invitationLeadDays: change.invitationLeadDays,
      reminderCadenceHours: change.reminderCadenceHours,
      whatsappReminderCount: change.whatsappReminderCount,
      emailReminderCount: change.emailReminderCount,
      escalationHours: change.escalationHours,
    },
  };
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
