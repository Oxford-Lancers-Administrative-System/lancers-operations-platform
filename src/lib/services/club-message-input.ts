// LAN-514 — the Messages rules a browser can check too: sizes, the subject and
// body bounds, and when a scheduled send may be. Pure; `club-messages.ts`
// reaches the database and re-checks every one of these on the server.

/**
 * Resend's ceiling: 40 MB per email **after** base64 encoding (its API
 * reference, "Send Email", attachments; Brian and Stewart, 29 October 2026).
 * Read as decimal megabytes, the stricter reading.
 */
export const RESEND_ENCODED_EMAIL_LIMIT_BYTES = 40_000_000;

/**
 * What the subject, body and envelope may take of that, kept back so the files
 * can be measured alone. Generous: a 20,000-character body is ~80 KB as text
 * plus HTML.
 */
const NON_ATTACHMENT_ALLOWANCE_BYTES = 200_000;

/** Base64 turns every three bytes into four characters, padded to a multiple of four. */
function base64EncodedSize(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

/**
 * The most file bytes one message may carry: whatever encodes inside Resend's
 * limit once the body's allowance is taken off. About 29.85 MB.
 */
export const MAX_ATTACHMENT_BYTES = Math.floor(
  ((RESEND_ENCODED_EMAIL_LIMIT_BYTES - NON_ATTACHMENT_ALLOWANCE_BYTES) / 4) * 3,
);

/** The per-file ceiling the database also holds (`club_message_attachments_size_bounded`). */
export const MAX_SINGLE_FILE_BYTES = 31_457_280;

/**
 * One upload request's largest chunk. The proxy buffers a request body to
 * 10 MB (Next's `proxyClientMaxBodySize`) and Cloud Run refuses one over
 * 32 MiB, so files go up in pieces well under both.
 */
export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

export const MAX_ATTACHMENTS = 10;
export const SUBJECT_MAX_LENGTH = 200;
export const BODY_MAX_LENGTH = 20_000;

/** Whether files of these sizes fit one email, encoded, beside the body. */
export function attachmentsFit(sizes: readonly number[]): boolean {
  const encoded = sizes.reduce((total, size) => total + base64EncodedSize(size), 0);
  return encoded + NON_ATTACHMENT_ALLOWANCE_BYTES <= RESEND_ENCODED_EMAIL_LIMIT_BYTES;
}

/** "12.4 MB" — decimal, one place, as the limit is stated. */
export function formatMegabytes(bytes: number): string {
  const megabytes = bytes / 1_000_000;
  if (megabytes > 0 && megabytes < 0.1) return "0.1 MB";
  return `${megabytes.toFixed(1)} MB`;
}

const ATTACHMENTS_TOO_LARGE_MESSAGE =
  `The attachments are too large to send by email. One email can carry ` +
  `${formatMegabytes(MAX_ATTACHMENT_BYTES)} of files.`;

export interface ClubMessageDraft {
  readonly subject: string;
  readonly body: string;
  readonly attachmentSizes: readonly number[];
  /** `null` is Send now. */
  readonly scheduledFor: Date | null;
}

export type DraftProblem =
  | "subject_missing"
  | "subject_too_long"
  | "body_missing"
  | "body_too_long"
  | "too_many_attachments"
  | "attachments_too_large"
  | "schedule_in_past";

export const DRAFT_PROBLEM_MESSAGES: Readonly<Record<DraftProblem, string>> = Object.freeze({
  subject_missing: "Write a subject.",
  subject_too_long: `Keep the subject to ${SUBJECT_MAX_LENGTH} characters.`,
  body_missing: "Write the message.",
  body_too_long: `Keep the message to ${BODY_MAX_LENGTH.toLocaleString("en-GB")} characters.`,
  too_many_attachments: `Attach at most ${MAX_ATTACHMENTS} files.`,
  attachments_too_large: ATTACHMENTS_TOO_LARGE_MESSAGE,
  schedule_in_past: "Choose a time in the future, or send it now.",
});

/** Every problem with a draft, in the order the form shows its fields. Empty means it may be sent. */
export function draftProblems(draft: ClubMessageDraft, now: Date = new Date()): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const subject = draft.subject.trim();
  if (subject === "") problems.push("subject_missing");
  else if (subject.length > SUBJECT_MAX_LENGTH) problems.push("subject_too_long");
  const body = draft.body.trim();
  if (body === "") problems.push("body_missing");
  else if (body.length > BODY_MAX_LENGTH) problems.push("body_too_long");
  if (draft.attachmentSizes.length > MAX_ATTACHMENTS) problems.push("too_many_attachments");
  if (!attachmentsFit(draft.attachmentSizes)) problems.push("attachments_too_large");
  if (draft.scheduledFor !== null && draft.scheduledFor.getTime() <= now.getTime()) {
    problems.push("schedule_in_past");
  }
  return problems;
}

/** The body as the email's paragraphs: one per non-blank line, as written. */
export function clubMessageParagraphs(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");
}
