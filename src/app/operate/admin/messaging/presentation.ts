import { shortMonthOf } from "@/lib/services/event-vocabulary";
import type {
  MessagingPlan,
  MessagingSchedule,
  MessagingScheduleChange,
} from "@/lib/services/messaging-schedule";

/**
 * The messaging schedule page's own words — W7, LAN-171.
 *
 * Presentation only: every function here is pure and decides nothing. The
 * worked-example arithmetic itself lives in `messaging-schedule.ts` and is
 * read through `resolveMessagingPlanIn`, exactly as W7's acceptance evidence
 * requires — "the values shown are the ones the scheduler actually uses —
 * read from the same source, never transcribed". What is here is only how
 * that already-resolved plan becomes the rows a reader sees.
 */

export const MESSAGING_SCHEDULE_TITLE = "Messaging schedule";

export const MESSAGING_SCHEDULE_INTRO =
  "When the club messages people about each kind of event, and when an unanswered invitation " +
  "reaches the President.";

export const MESSAGING_SCHEDULE_RULE_HEADLINE =
  "The invitation goes first, then a reminder every cadence until they run out — WhatsApp, " +
  "then email last.";

export const MESSAGING_SCHEDULE_RULE_DETAIL =
  "Days are counted before the event starts. Open any row for a worked example. There are no " +
  "quiet hours.";

export const MESSAGING_SCHEDULE_FOOTER =
  "Changes take effect for events approved afterwards. Events already approved keep the " +
  "schedule they were approved with. Every change is recorded against your name.";

export const SHOW_EXAMPLE = "Show an example";
export const HIDE_EXAMPLE = "Hide an example";
export const NO_SCHEDULE_CHANGES_NOTICE = "Nothing had changed, so there was nothing to save.";

// ---------------------------------------------------------------------------
// LAN-203 — the page's three sections (W10, Brian 2026-08-31)
// ---------------------------------------------------------------------------

export const RECRUITMENT_SECTION_HEADING = "Recruitment";
export const RECRUITMENT_SECTION_INTRO = "What the club sends after somebody is captured.";

export const EVENT_MESSAGING_SECTION_HEADING = "Event messaging";
export const EVENT_MESSAGING_SECTION_INTRO =
  "What an event sends, and how it chases, by event type.";

export const ONBOARDING_SECTION_HEADING = "Onboarding";
export const ONBOARDING_SECTION_NOTE = "Not built yet.";

// ---------------------------------------------------------------------------
// LAN-218 — the Onboarding section itself, `W11`
// ---------------------------------------------------------------------------

export const ONBOARDING_CHASE_ROW_LABEL = "Onboarding checklist";
export const ONBOARDING_CHASE_SAVE_LABEL = "SAVE ONBOARDING";
export const ONBOARDING_CHASE_SECTION_NOTE =
  "One packet, chased on one link. When the count runs out the chase is exhausted and a person " +
  "takes over.";

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

/**
 * One save button per event type (OWNER-LAN171-04) — Brian: "I think there
 * should be a save button per event. Having one group save at the top
 * doesn't really make a lot of sense." `label` is `TYPE_LABELS`' own
 * capitalised form ("Practice"); this lowercases only its first letter, so
 * the button reads "Save practice" rather than restating the row's own
 * heading in full capitals.
 */
export function saveRowButtonLabel(label: string): string {
  return `Save ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

export function scheduleSavedNotice(label: string): string {
  return `${label}'s schedule was updated.`;
}

/**
 * The values one row's form actually submitted, in the club's units — for
 * {@link scheduleSaveFailedNotice}, which names them rather than making the
 * operator guess what was lost.
 */
export function summarizeScheduleValues(change: MessagingScheduleChange): string {
  return (
    `RSVP by ${change.rsvpByDays} days, first invitation ${change.invitationLeadDays} days, ` +
    `cadence ${change.reminderCadenceHours} h, WhatsApp ${change.whatsappReminderCount}, ` +
    `email ${change.emailReminderCount}, President ${change.escalationHours} h`
  );
}

/**
 * A write that genuinely failed — OWNER-LAN171-02. The generic
 * `UnexpectedDatabaseError` sentence ("The database could not complete this
 * change... Please try again") is deliberately vague everywhere else in this
 * codebase, because most callers have no safe, non-PII detail to add. This
 * screen does: which row, and which values it tried to save. Retrying without
 * changing anything cannot help a deterministic rejection, so this never
 * suggests it.
 */
export function scheduleSaveFailedNotice(label: string, change: MessagingScheduleChange): string {
  return (
    `${label}'s schedule could not be saved as submitted (${summarizeScheduleValues(change)}). ` +
    "Nothing was changed. If this keeps happening, this needs a developer."
  );
}

/**
 * A plan instant, in the club's own zone — "Tue 15 Sep, 20:00".
 *
 * A comma rather than the event page's middle dot, matching the approved
 * `W7-02` mockup's own punctuation for this surface. The month comes from
 * `shortMonthOf`'s fixed table rather than a second `Intl` call — recent ICU
 * data renders `{ month: "short" }` for September as "Sept" in `en-GB`, and
 * this club abbreviates every month to three letters everywhere else.
 */
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

/** One line of the worked example — a step, its date, and why. */
export interface PreviewStep {
  readonly label: string;
  readonly when: string;
  readonly note: string;
}

export interface SchedulePreview {
  /** "the event takes place Tue 22 Sep, 20:00, four weeks from today, and is approved today." */
  readonly introDetail: string;
  readonly steps: readonly PreviewStep[];
  /** The gap sentence, or `null` where the last reminder lands at or after the deadline. */
  readonly warning: string | null;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Turns one already-resolved worked-example plan into the rows a row's
 * disclosure draws.
 *
 * `plan` is resolved against a synthetic event four weeks from today, at
 * 20:00 — the page's own worked example, built the same way for every type so
 * the seven rows are comparable. The arithmetic is `resolveMessagingPlanIn`'s;
 * this only narrates it.
 */
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
