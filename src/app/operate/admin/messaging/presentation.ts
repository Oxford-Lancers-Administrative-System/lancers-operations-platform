import { shortMonthOf } from "@/lib/services/event-vocabulary";
import type {
  MessagingPlan,
  MessagingSchedule,
  MessagingScheduleChange,
} from "@/lib/services/messaging-schedule";

// The messaging schedule page's own words — W7, LAN-171. Presentation only,
// pure — the worked-example arithmetic lives in messaging-schedule.ts and is
// read, never transcribed (W7's acceptance evidence).

export const MESSAGING_SCHEDULE_TITLE = "Messaging schedule";

export const MESSAGING_SCHEDULE_INTRO =
  "When the club messages people about each kind of event, and when an unanswered invitation " +
  "reaches the President.";

export const MESSAGING_SCHEDULE_FOOTER =
  "Changes take effect for events approved afterwards. Events already approved keep the " +
  "schedule they were approved with. Every change is recorded against your name.";

export const SHOW_EXAMPLE = "Show an example";
export const HIDE_EXAMPLE = "Hide an example";
export const NO_SCHEDULE_CHANGES_NOTICE = "Nothing had changed, so there was nothing to save.";

export const RECRUITMENT_SECTION_HEADING = "Recruitment";

export const EVENT_MESSAGING_SECTION_HEADING = "Event messaging";

export const ONBOARDING_SECTION_HEADING = "Onboarding";

export const ONBOARDING_CHASE_ROW_LABEL = "Onboarding checklist";
export const ONBOARDING_CHASE_SAVE_LABEL = "SAVE ONBOARDING";

export function onboardingChaseSavedNotice(): string {
  return "Onboarding's chase was updated.";
}

export function onboardingChaseSaveFailedNotice(): string {
  return (
    "Onboarding's chase could not be saved as submitted. Nothing was changed. If this keeps " +
    "happening, this needs a developer."
  );
}

export const CYCLE_STEP_TIMING_UNIT = "h";

export function cycleStepSavedNotice(label: string): string {
  return `${label} was updated.`;
}

export function cycleStepSaveFailedNotice(label: string): string {
  return (
    `${label} could not be saved as submitted. Nothing was changed. If this keeps happening, ` +
    "this needs a developer."
  );
}

export const REGULAR_PLAYERS_GROUP_HEADING = "Regular players";
export const RECRUITS_GROUP_HEADING = "Recruits";

/** One save button per event type — OWNER-LAN171-04, Brian. */
export function saveRowButtonLabel(label: string): string {
  return `Save ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

export function scheduleSavedNotice(label: string): string {
  return `${label}'s schedule was updated.`;
}

function summarizeScheduleValues(change: MessagingScheduleChange): string {
  return (
    `RSVP by ${change.rsvpByDays} days, first invitation ${change.invitationLeadDays} days, ` +
    `cadence ${change.reminderCadenceHours} h, WhatsApp ${change.whatsappReminderCount}, ` +
    `email ${change.emailReminderCount}, President ${change.escalationHours} h`
  );
}

// OWNER-LAN171-02: names the row and the values, unlike the generic
// UnexpectedDatabaseError sentence elsewhere.
export function scheduleSaveFailedNotice(label: string, change: MessagingScheduleChange): string {
  return (
    `${label}'s schedule could not be saved as submitted (${summarizeScheduleValues(change)}). ` +
    "Nothing was changed. If this keeps happening, this needs a developer."
  );
}

// A plan instant — comma, not the event page's middle dot (approved W7-02
// mockup); month from shortMonthOf's fixed table, not a second Intl call.
export function formatScheduleWhen(at: Date): string {
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "Europe/London" }).format(at);
  const weekday = part({ weekday: "short" });
  const day = part({ day: "numeric" });
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  const month = shortMonthOf(isoDate);
  const time = part({ hour: "2-digit", minute: "2-digit", hour12: false });
  return `${weekday} ${day} ${month}, ${time}`;
}

interface PreviewStep {
  readonly label: string;
  readonly when: string;
  readonly note: string;
}

export interface SchedulePreview {
  readonly introDetail: string;
  readonly steps: readonly PreviewStep[];
  readonly warning: string | null;
}

const HOUR_MS = 60 * 60 * 1000;

// Turns one already-resolved worked-example plan (a synthetic event four
// weeks out, 20:00, the same for every type) into the rows a disclosure
// draws — resolveMessagingPlanIn's arithmetic, narrated here.
export function buildSchedulePreview(
  plan: MessagingPlan,
  schedule: MessagingSchedule,
): SchedulePreview {
  const steps: PreviewStep[] = [];
  const lastRungIndex = plan.rungs.length - 1;
  let reminderNumber = 0;

  plan.rungs.forEach((rung, index) => {
    if (rung.kind === "invitation") {
      steps.push({
        label: "Invitation — WhatsApp",
        when: formatScheduleWhen(rung.at),
        note: `${schedule.invitationLeadDays} days before the event`,
      });
      return;
    }

    reminderNumber += 1;
    const channelLabel = rung.channel === "whatsapp" ? "WhatsApp" : "email";
    const isLastPlayerMessage = index === lastRungIndex;
    steps.push({
      label: `Reminder ${reminderNumber} — ${channelLabel}`,
      when: formatScheduleWhen(rung.at),
      note: isLastPlayerMessage
        ? `${schedule.reminderCadenceHours} h later, last player message`
        : `${schedule.reminderCadenceHours} h later`,
    });
  });

  steps.push({
    label: "Player RSVP deadline",
    when: formatScheduleWhen(plan.responseDeadlineAt),
    note: `${schedule.rsvpByDays} days before the event`,
  });

  if (plan.escalationAt) {
    steps.push({
      label: "President is told",
      when: formatScheduleWhen(plan.escalationAt),
      note: `${schedule.escalationHours} h after the deadline`,
    });
  }

  steps.push({ label: "The event", when: formatScheduleWhen(plan.eventStartsAt), note: "" });

  let warning: string | null = null;
  if (plan.lateApproval) {
    warning =
      "This type's own invitation lead leaves no room for its reminder ladder — even an event " +
      "four weeks away would be treated as a late approval: WhatsApp only, and the President is " +
      "never told.";
  } else {
    const lastRung = plan.rungs[lastRungIndex];
    const gapMs = plan.responseDeadlineAt.getTime() - lastRung.at.getTime();
    if (gapMs > 0) {
      const gapHours = Math.round(gapMs / HOUR_MS);
      const wholeDays = gapHours % 24 === 0;
      const amount = wholeDays
        ? `${gapHours / 24} ${gapHours / 24 === 1 ? "day" : "days"}`
        : `${gapHours} hours`;
      warning =
        `The last reminder lands ${amount} before the deadline it is chasing. Nobody is ` +
        `contacted in the ${amount} that actually matter.`;
    }
  }

  return {
    introDetail:
      `the event takes place ${formatScheduleWhen(plan.eventStartsAt)}, four weeks from today, ` +
      "and is approved today.",
    steps,
    warning,
  };
}
