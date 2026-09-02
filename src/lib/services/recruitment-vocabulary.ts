import type { SeasonMessagingConsentState } from "./messaging-consent";

/**
 * The recruitment mission's own fixed vocabulary — types, labels, and the
 * ladder's order — shared by the server-only read/write modules
 * (`recruitment-board.ts`, `recruitment-prospect.ts`) and by client
 * components (`../../app/operate/recruitment/**`) alike.
 *
 * ## Why this file carries no `"server-only"`
 *
 * `recruitment-board.ts` and `messaging-consent.ts` both open with
 * `import "server-only"`, so a client component that imports a **value**
 * (not merely a type) from either fails at build time — Next.js forbids a
 * client bundle from ever reaching a module tagged that way, the same
 * boundary `../roster/presentation.ts` already exists to respect for the
 * roster board's own labels. This module holds no database access and no
 * secret, so it carries none of that restriction, and both sides import the
 * one copy rather than each keeping a wording of its own that could drift.
 */

export type ProspectStatus =
  "identified" | "engaged" | "committed" | "joined" | "declined" | "disengaged" | "void";

/** Ladder order — `W1`'s default sort, and what sinks the three exits to the bottom. */
export const PROSPECT_STATUS_ORDER: readonly ProspectStatus[] = Object.freeze([
  "identified",
  "engaged",
  "committed",
  "joined",
  "declined",
  "disengaged",
  "void",
]);

export const PROSPECT_STATUS_LABELS: Readonly<Record<ProspectStatus, string>> = Object.freeze({
  identified: "Identified",
  engaged: "Engaged",
  committed: "Committed",
  joined: "Joined",
  declined: "Declined",
  disengaged: "Disengaged",
  void: "Void",
});

/** The three exits, `W13`. `joined` is the fourth way off the ladder and is `W14`'s alone. */
export const EXIT_STATUSES: readonly ProspectStatus[] = Object.freeze([
  "declined",
  "disengaged",
  "void",
]);

export const CONSENT_LABELS: Readonly<Record<SeasonMessagingConsentState, string>> = Object.freeze({
  never_asked: "Never asked",
  asked: "Asked",
  granted: "Granted",
  refused: "Refused",
  withdrawn: "Withdrawn",
});

export type RsvpValue = "yes" | "no";
export type AttendanceValue = "present" | "late" | "excused" | "absent";

export const RSVP_LABEL: Readonly<Record<RsvpValue, string>> = Object.freeze({
  yes: "Yes",
  no: "No",
});

export const ATTENDANCE_LABEL: Readonly<Record<AttendanceValue, string>> = Object.freeze({
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
});

/**
 * The six Questionnaire B columns, and the codebook this package had to
 * choose — see `recruitment-board.ts`'s own module comment for the full
 * reasoning. `B1`–`B5` are `recruitment-cycle.ts`'s own
 * `QUESTIONNAIRE_B_COMPLETING_CODES`; `B6` is the free-text "anything else"
 * that never completes anything, in both places.
 */
export const QUESTIONNAIRE_B_CODE = Object.freeze({
  playedBefore: "B1",
  watchedBefore: "B2",
  positionInterest: "B3",
  gearOwned: "B4",
  howTheyHeard: "B5",
  anythingElse: "B6",
} as const);
