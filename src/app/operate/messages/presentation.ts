// LAN-514 — the Messages area's words. Labels, values and states only.
import type { ClubMessageProgress, Unreachable } from "@/lib/services/club-messages";

export const MESSAGES_PATH = "/operate/messages";
export const NEW_MESSAGE_PATH = "/operate/messages/new";

export const PAGE_HEADING = "Messages";
export const NEW_MESSAGE = "New message";
export const BACK_TO_MESSAGES = "Back to messages";

export const NO_MESSAGES = "No messages yet.";

export const COLUMN_SUBJECT = "Subject";
export const COLUMN_AUDIENCE = "Audience";
export const COLUMN_PEOPLE = "People";
export const COLUMN_WHEN = "Sends";
export const COLUMN_SENT_BY = "Sent by";
export const COLUMN_STATUS = "Status";

export const PROGRESS_LABELS: Readonly<Record<ClubMessageProgress, string>> = Object.freeze({
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
});

/** The delivery chip's colour for each progress — the queue's own states. */
export const PROGRESS_CHIP_STATUS: Readonly<Record<ClubMessageProgress, string>> = Object.freeze({
  scheduled: "queued",
  sending: "attempted",
  sent: "delivered",
});

export const STEP_AUDIENCE = "Audience";
export const STEP_EMAIL = "Email";
export const STEP_SEND = "Send";

export const SUBJECT_LABEL = "Subject";
export const BODY_LABEL = "Message";
export const ATTACH_FILES = "Attach files";
export const REMOVE_FILE = "Remove";
export const UPLOADING = "Uploading";
export const UPLOAD_FAILED = "Upload failed";

export const SEND_NOW = "Send now";
export const SCHEDULE = "Schedule";
export const SEND_AT_DATE = "Date";
export const SEND_AT_TIME = "Time";

export const RECIPIENTS_HEADING = "Recipients";
export const NOT_REACHABLE_HEADING = "Not reachable";
export const ATTACHMENTS_HEADING = "Attachments";
export const AUDIENCE_GROUPS_LABEL = "Groups";
export const HAND_PICKED = "Chosen by name";
export const SENT_BY_LABEL = "Sent by";
export const SENDS_LABEL = "Sends";
export const SENT_LABEL = "Sent";

export const UNREACHABLE_LABELS: Readonly<Record<Unreachable, string>> = Object.freeze({
  no_email: "No email",
  no_consent: "No consent",
});

export function peopleCount(count: number): string {
  return `${count} ${count === 1 ? "person" : "people"}`;
}

/** LAN-514, Brian's walk on 31 October: the limit as a plain label, not a running total. */
export function maxAttachmentSize(bytes: number): string {
  return `Max attachment size: ${Math.round(bytes / 1_000_000)} MB`;
}

export function sendButtonLabel(people: number, scheduled: boolean): string {
  return `${scheduled ? "Schedule for" : "Send to"} ${peopleCount(people)}`;
}

export function sentNotice(queued: number, scheduled: boolean): string {
  return scheduled ? `Scheduled for ${peopleCount(queued)}.` : `Queued for ${peopleCount(queued)}.`;
}
