import { TYPE_LABELS } from "@/lib/services/event-vocabulary";
import type { MessagingSchedule, MessagingScheduleChange } from "@/lib/services/messaging-schedule";

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

/**
 * The six fields every event type's row carries. LAN-203 added two more to
 * `MessagingScheduleChange` for the Recruitment row's Recruits group alone —
 * see {@link RECRUIT_SCHEDULE_FIELDS} and {@link RecruitScheduleFieldBounds} —
 * so this excludes them rather than widening `SCHEDULE_FIELDS` to a shape
 * only one of the seven rows has.
 */
type CoreScheduleField = Exclude<
  keyof MessagingScheduleChange,
  "recruitInvitationLeadDays" | "recruitFollowUpCadenceHours"
>;

/** Exported for `ScheduleField` — the one rendering component both `ScheduleFieldBounds` and `RecruitScheduleFieldBounds` share. */
export interface FieldBoundsShape {
  /** The `<input>` name within one row's own form. */
  readonly key: string;
  /** The settings grid's own short label (Brian's chosen shape): "RSVP by", not "Player RSVP by". */
  readonly label: string;
  /** Shown beside the input — "days", "h", or "" for a plain count. */
  readonly unit: string;
  /**
   * What the number does, read at the field itself — MUI `helperText`, the
   * same idiom `invite-form.tsx` and `operator-actions.tsx` already use to
   * explain a field without a reader having to go elsewhere for it.
   * OWNER-LAN171-08, round 3: the grid label alone left what a number
   * actually governs unstated — Brian, on the President field: "it just
   * says 12 hours, but that doesn't explain what 12 hours after the deadline
   * before the meeting is." Present only on the fields Brian named; the two
   * day-count fields' short labels already say what they count.
   */
  readonly helperText?: string;
  /** The fuller phrase a validation message names, where the grid label alone would read clipped. */
  readonly fullLabel: string;
  readonly min: number;
  readonly max: number;
}

export interface ScheduleFieldBounds extends FieldBoundsShape {
  readonly field: CoreScheduleField;
}

/** The Recruits group's own two fields — see {@link RECRUIT_SCHEDULE_FIELDS}. */
export interface RecruitScheduleFieldBounds extends FieldBoundsShape {
  readonly field: "recruitInvitationLeadDays" | "recruitFollowUpCadenceHours";
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
    helperText: "The gap between messages.",
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
    helperText: "WhatsApp messages sent, including the invitation.",
    min: 0,
    max: 10,
  },
  {
    field: "emailReminderCount",
    key: "emailReminderCount",
    label: "Email",
    unit: "",
    fullLabel: "Email reminders",
    helperText: "Email reminders sent once WhatsApp finishes.",
    min: 0,
    max: 10,
  },
  {
    field: "escalationHours",
    key: "escalationHours",
    label: "President",
    unit: "h",
    fullLabel: "President escalation",
    helperText: "Hours after the RSVP deadline before the President is told.",
    min: 0,
    max: 720,
  },
]);

/**
 * The Recruits group's own two fields (LAN-203, `DEC-split-on-the-schedule`)
 * — present in the Recruitment row's body alone, beside the six above, which
 * stay the Regular players group's unchanged. One row, one form, one SAVE
 * (W10, OWNER-LAN171-04's law): these are read by the same
 * `readOneScheduleChange` call the six core fields are, not a second action.
 */
export const RECRUIT_SCHEDULE_FIELDS: readonly RecruitScheduleFieldBounds[] = Object.freeze([
  {
    field: "recruitInvitationLeadDays",
    key: "recruitInvitationLeadDays",
    label: "First inv.",
    unit: "days",
    fullLabel: "Recruits' first invitation",
    helperText: "The invitation, on the recruitment template.",
    min: 0,
    max: 120,
  },
  {
    field: "recruitFollowUpCadenceHours",
    key: "recruitFollowUpCadenceHours",
    label: "One follow-up",
    unit: "h",
    fullLabel: "Recruits' one follow-up",
    helperText: "The only chase. Recruits are never escalated.",
    min: 1,
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

  // LAN-203, DEC-split-on-the-schedule. One row, one form, one SAVE: the
  // Recruits group's two fields are read from the same form the six core
  // ones just were, not a second submission — present in the markup, and
  // therefore in `formData`, only on the Recruitment row.
  const recruitValues: Partial<
    Record<"recruitInvitationLeadDays" | "recruitFollowUpCadenceHours", number>
  > = {};
  if (eventType === "recruitment") {
    for (const bound of RECRUIT_SCHEDULE_FIELDS) {
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
      recruitValues[bound.field] = value;
    }
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
      recruitInvitationLeadDays: recruitValues.recruitInvitationLeadDays,
      recruitFollowUpCadenceHours: recruitValues.recruitFollowUpCadenceHours,
    },
  };
}

/**
 * Whether a proposed change differs from what is currently stored.
 *
 * `current` is a full `MessagingSchedule` — what `readMessagingScheduleIn`
 * actually returns — rather than `MessagingScheduleChange`: the two recruit
 * fields are `number | null` there (every row has a real, stored value,
 * `null` on six of the seven) and `number | undefined` on `proposed` (unset
 * on every row but Recruitment's own submit). The two never need to agree in
 * type, only in value.
 */
export function scheduleChanged(
  current: MessagingSchedule,
  proposed: MessagingScheduleChange,
): boolean {
  return (
    current.rsvpByDays !== proposed.rsvpByDays ||
    current.invitationLeadDays !== proposed.invitationLeadDays ||
    current.reminderCadenceHours !== proposed.reminderCadenceHours ||
    current.whatsappReminderCount !== proposed.whatsappReminderCount ||
    current.emailReminderCount !== proposed.emailReminderCount ||
    current.escalationHours !== proposed.escalationHours ||
    // Both undefined on every row but Recruitment, so this never fires there.
    (proposed.recruitInvitationLeadDays !== undefined &&
      current.recruitInvitationLeadDays !== proposed.recruitInvitationLeadDays) ||
    (proposed.recruitFollowUpCadenceHours !== undefined &&
      current.recruitFollowUpCadenceHours !== proposed.recruitFollowUpCadenceHours)
  );
}
