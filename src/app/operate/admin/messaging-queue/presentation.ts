// The whole-club message queue's words — LAN-468. Labels, values
// and states only. State words are the delivery screen's own (`DELIVERY_LABELS`,
// `docs/ux/slice-ux.md` § 6); the waiting words are messaging safety's.

import { DELIVERY_LABELS } from "@/app/participation/presentation";
import { CHANNEL_LABELS } from "@/app/operate/admin/follow-ups/presentation";
import { CYCLE_STEP_LABELS } from "@/app/operate/admin/messaging/cycle-validation";
import type {
  ChannelFilter,
  KindFamily,
  MessageKind,
  QueueWindow,
  StatusFilter,
} from "@/lib/services/message-queue-vocabulary";

export const PAGE_HEADING = "Messaging queue";
export const MESSAGES_PATH = "/operate/admin/messaging-queue";

export { CHANNEL_LABELS };

export const KIND_LABELS: Readonly<Record<MessageKind, string>> = Object.freeze({
  invitation: "Invitation",
  reminder: "Reminder",
  recruit_followup: "Recruit follow-up",
  escalation: "Escalation",
  change_notice: "Change notice",
  cancellation: "Cancellation",
  question_change: "Question change",
  recruit_welcome: `Recruit ${CYCLE_STEP_LABELS.welcome.toLowerCase()}`,
  recruit_details_reminder: `Recruit ${CYCLE_STEP_LABELS.details_reminder.toLowerCase()}`,
  recruit_interest_ask: CYCLE_STEP_LABELS.interest_ask,
  recruit_interest_reminder: CYCLE_STEP_LABELS.interest_reminder,
  onboarding_welcome: "Onboarding welcome",
  onboarding_chase: "Onboarding chase",
  onboarding_nudge: "Onboarding nudge",
  onboarding_escalation: "Onboarding escalation",
  other: "Other",
});

export const KIND_FAMILY_LABELS: Readonly<Record<KindFamily, string>> = Object.freeze({
  invitation: "Invitations",
  reminder: "Reminders",
  escalation: "Escalations",
  notice: "Notices",
  recruitment: "Recruitment",
  onboarding: "Onboarding",
});

export const STATE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ...DELIVERY_LABELS,
  not_sent: "Not sent — event passed",
  withheld: "Withheld — no consent",
});

export const STATUS_FILTER_LABELS: Readonly<Record<StatusFilter, string>> = Object.freeze({
  queued: DELIVERY_LABELS.queued!,
  attempted: DELIVERY_LABELS.attempted!,
  delivered: DELIVERY_LABELS.delivered!,
  failed: DELIVERY_LABELS.failed!,
  held: DELIVERY_LABELS.held!,
  cancelled: DELIVERY_LABELS.cancelled!,
  not_sent: STATE_LABELS.not_sent!,
  withheld: STATE_LABELS.withheld!,
});

export const CHANNEL_FILTER_LABELS: Readonly<Record<ChannelFilter, string>> = Object.freeze({
  whatsapp: CHANNEL_LABELS.whatsapp!,
  email: CHANNEL_LABELS.email!,
});

export const WINDOW_LABELS: Readonly<Record<QueueWindow, string>> = Object.freeze({
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  next7: "Next 7 days",
});

export const ALL = "All";

// The summary.
export const METRIC_QUEUED = "Queued";
export const METRIC_ATTEMPTED = "Attempted";
export const METRIC_DELIVERED_TODAY = "Delivered today";
export const METRIC_FAILED_TODAY = "Failed today";

export function yesterdayCaption(count: number): string {
  return `Yesterday: ${count}`;
}

export function nextDueCaption(when: string): string {
  return `Next ${when}`;
}

export function dueNowCaption(dueNow: number): string {
  return `Due now: ${dueNow}`;
}

/** The lights-out panel's own words (`docs/operating-the-slice.md` § 7). */
export const LIGHTS_OUT_NOTICE = "Automated sends wait 22:00–07:00.";

export function heldNotice(count: number): string {
  return count === 1 ? "1 message is held." : `${count} messages are held.`;
}

// The list.
export const COLUMN_WHEN = "When";
export const COLUMN_TO = "To";
export const COLUMN_KIND = "Message";
export const COLUMN_CHANNEL = "Channel";
export const COLUMN_FOR = "For";
export const COLUMN_STATUS = "Status";

export const NOT_DELIVERED = "Not delivered";
export const NO_CHANNEL = "Not dispatched — no channel";
export const NO_PERSON = "—";

export function sendsAtLabel(when: string): string {
  return `Sends ${when}`;
}

export function nextAttemptLabel(when: string, attempts: number): string {
  return `Attempt ${attempts} · next ${when}`;
}

export function rangeLabel(page: number, pageSize: number, shown: number, total: number): string {
  if (total === 0) return "0 messages";
  const first = (page - 1) * pageSize + 1;
  return `${first}–${first + shown - 1} of ${total}`;
}

export const EMPTY_WINDOW = "No messages in this window.";
export const PREVIOUS_PAGE = "Previous";
export const NEXT_PAGE = "Next";
