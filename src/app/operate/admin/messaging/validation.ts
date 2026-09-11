import type { MessagingSchedule, MessagingScheduleChange } from "@/lib/services/messaging-schedule";

// Reading and checking one row's form before it reaches the database — W7, LAN-171. Decision history: docs/ux/tickets/LAN-171-plan-and-schedule.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md.

// LAN-203 added two fields to MessagingScheduleChange for the Recruitment
// row's Recruits group alone (see RECRUIT_SCHEDULE_FIELDS); excluded here
// rather than widening SCHEDULE_FIELDS to a shape only one row has.
type CoreScheduleField = Exclude<
  keyof MessagingScheduleChange,
  "recruitInvitationLeadDays" | "recruitFollowUpCadenceHours"
>;

// helperText: OWNER-LAN171-08 round 3, Brian on the President field. Decision history: docs/ux/tickets/LAN-171-plan-and-schedule.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md.
export interface FieldBoundsShape {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly helperText?: string;
  readonly fullLabel: string;
  readonly min: number;
  readonly max: number;
}

export interface ScheduleFieldBounds extends FieldBoundsShape {
  readonly field: CoreScheduleField;
}

export interface RecruitScheduleFieldBounds extends FieldBoundsShape {
  readonly field: "recruitInvitationLeadDays" | "recruitFollowUpCadenceHours";
}

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
    // Q-19/OWNER-LAN171-05: counts the invitation as WhatsApp #1 — never "WhatsApp reminders".
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

// The Recruits group's own two fields (LAN-203, `DEC-split-on-the-schedule`)
// — one row, one form, one SAVE (W10, OWNER-LAN171-04). Decision history: docs/ux/tickets/LAN-171-plan-and-schedule.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md.
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

export function readOneScheduleChange(
  label: string,
  eventType: string,
  formData: FormData,
): ScheduleValidation {
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

  // messaging_schedules_invitation_precedes_the_deadline, checked here in the club's words.
  if (change.invitationLeadDays < change.rsvpByDays) {
    return {
      ok: false,
      message:
        `${label}: the first invitation has to go out on or before the RSVP deadline — it ` +
        "cannot ask people to answer by a date that has already passed when they are asked.",
    };
  }

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

/** `current` is a full `MessagingSchedule` (recruit fields `number | null`); `proposed` has them `number | undefined`. They need to agree in value only. */
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
